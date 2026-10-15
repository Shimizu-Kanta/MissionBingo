import { Hono } from "hono";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  parseCreateRoomRequest,
  type CreateRoomResponse,
} from "../shared/types";
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

function generateRoomCode(): string {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export default app;
