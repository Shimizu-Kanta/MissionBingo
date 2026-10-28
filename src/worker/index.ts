import { Hono, type Context } from "hono";
import {
  IMAGE_ID_PATTERN,
  MAX_UPLOAD_BYTES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  TOKEN_PATTERN,
  parseCreateRoomRequest,
  type CreateRoomResponse,
} from "../shared/types";
import { r2Key } from "./images";
import { roomCodeFromPath, roomMeta, withOgp } from "./ogp";
import { randomInt } from "./random";

export { RoomDO } from "./room";

const MAX_CODE_ATTEMPTS = 5;

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/rooms", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const req = parseCreateRoomRequest(body);
  if (!req) return c.json({ error: "入力内容が不正です" }, 400);

  // コードが既存ルームと衝突したら作り直す
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const code = generateRoomCode();
    const created = await c.env.ROOM.getByName(code).initialize(
      code,
      req.settings,
      { token: req.token, name: req.name, teamId: req.teamId },
      req.tasks,
    );
    if (created) return c.json<CreateRoomResponse>({ code }, 201);
  }
  return c.json({ error: "ルームを作成できませんでした。もう一度お試しください" }, 503);
});

// 申請画像のアップロード。ブラウザで縮小した JPEG を本文で受け取る。トークンは URL に載せずヘッダーで送る
app.post("/api/rooms/:code/images", async (c) => {
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_UPLOAD_BYTES) {
    await c.req.raw.body?.cancel().catch(() => undefined);
    return c.json({ error: "画像が大きすぎます" }, 413);
  }
  // 本文を読み切らずに返すと開発サーバーで接続が切れることがあるため、先に読む（上限 5MB）
  const body = await c.req.arrayBuffer();
  const code = c.req.param("code");
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!ROOM_CODE_PATTERN.test(code)) return c.json({ error: "ルームコードが不正です" }, 400);
  if (!TOKEN_PATTERN.test(token)) return c.json({ error: "参加者を確認できません" }, 401);
  if (c.req.header("Content-Type") !== "image/jpeg") return c.json({ error: "JPEG 画像を送ってください" }, 415);
  if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: "画像が大きすぎるか、空です" }, 413);
  // JPEG の先頭（FF D8 FF）を確かめる
  const head = new Uint8Array(body, 0, Math.min(3, body.byteLength));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) return c.json({ error: "JPEG 画像を送ってください" }, 415);

  const reserved = await c.env.ROOM.getByName(code).reserveUpload(token);
  if ("error" in reserved) return c.json({ error: reserved.error }, 403);
  await c.env.IMAGES.put(r2Key(code, reserved.imageId), body, { httpMetadata: { contentType: "image/jpeg" } });
  return c.json({ imageId: reserved.imageId }, 201);
});

// 画像の配信。ID は推測できない UUID
app.get("/api/rooms/:code/images/:imageId", async (c) => {
  const code = c.req.param("code");
  const imageId = c.req.param("imageId");
  if (!ROOM_CODE_PATTERN.test(code) || !IMAGE_ID_PATTERN.test(imageId)) return c.notFound();
  const object = await c.env.IMAGES.get(r2Key(code, imageId));
  if (!object) return c.json({ error: "画像が見つかりません（保存期間が過ぎた可能性があります）" }, 404);
  return new Response(object.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", ETag: object.httpEtag },
  });
});

// WebSocket をルームコードごとの RoomDO へ振り分ける
app.get("/api/rooms/:code/ws", async (c) => {
  const code = c.req.param("code");
  if (!ROOM_CODE_PATTERN.test(code)) {
    return c.json({ error: "ルームコードが不正です" }, 400);
  }
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "WebSocket の接続が必要です" }, 426);
  }
  return c.env.ROOM.getByName(code).fetch(c.req.raw);
});

// 画面の HTML。リンクのプレビュー（OGP）を書き換えて返す。ルームの URL ならルームごとの内容にする
const serveHtml = async (c: Context<{ Bindings: Env }>) => {
  const url = new URL(c.req.url);
  // 条件付きリクエストのヘッダーは渡さず、いつも本文を受け取る
  const html = await c.env.ASSETS.fetch(new Request(url));
  if (!html.ok || !html.headers.get("Content-Type")?.startsWith("text/html")) return html;
  const code = roomCodeFromPath(url.pathname);
  const preview = code ? await c.env.ROOM.getByName(code).preview() : null;
  return withOgp(html, url, code && preview ? roomMeta(code, preview) : null);
};
app.get("/", serveHtml);
app.get("/create", serveHtml);
app.get("/room/*", serveHtml);

function generateRoomCode(): string {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export default app;
