import { DEFAULT_ROOM_NAME, ROOM_CODE_PATTERN, type RoomSettings } from "../shared/types";

// リンクのプレビュー用。参加していない人に見せてもよい情報だけ
export type RoomPreview = { settings: RoomSettings; phase: "lobby" | "playing" | "ended" };

type Meta = { title: string; description: string };

const PHASE_TEXT: Record<RoomPreview["phase"], string> = {
  lobby: "参加者を募集中です。",
  playing: "ゲーム中です。",
  ended: "ゲームは終了しました。",
};

// クライアントのルーティング（/room/:code、/room/:code/card、/room/:code/export）と同じ読み方
export function roomCodeFromPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)(?:\/(?:card|export))?\/?$/.exec(pathname);
  if (!match) return null;
  try {
    const code = decodeURIComponent(match[1]).replace(/-/g, "").toUpperCase();
    return ROOM_CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

export function roomMeta(code: string, { settings, phase }: RoomPreview): Meta {
  const displayCode = `${code.slice(0, 3)}-${code.slice(3)}`;
  const cardMode = settings.cardMode === "shared" ? "共有カード" : "個別カード";
  const rules = `${cardMode} ${settings.cardSize}×${settings.cardSize}・${settings.teamCount}チーム・${settings.targetBingo}ビンゴで勝ち`;
  return {
    title: settings.roomName === DEFAULT_ROOM_NAME ? `ミッションビンゴ（${displayCode}）` : `${settings.roomName}｜ミッションビンゴ`,
    description: `${PHASE_TEXT[phase]}招待コード ${displayCode}（${rules}）`,
  };
}

// index.html の OGP を書き換える。og:image と og:url はクローラーのために絶対 URL にする
export function withOgp(html: Response, url: URL, meta: Meta | null): Response {
  const rewriter = new HTMLRewriter()
    .on('meta[property="og:image"]', { element: (e) => void e.setAttribute("content", `${url.origin}/ogp.png`) })
    .on('meta[property="og:url"]', { element: (e) => void e.setAttribute("content", `${url.origin}${url.pathname}`) });
  if (meta) {
    // setAttribute は " しかエスケープしないので、& は先にエスケープしておく（ルーム名は自由入力）
    const title = meta.title.replaceAll("&", "&amp;");
    const description = meta.description.replaceAll("&", "&amp;");
    rewriter
      .on('meta[property="og:title"]', { element: (e) => void e.setAttribute("content", title) })
      .on('meta[property="og:description"], meta[name="description"]', {
        element: (e) => void e.setAttribute("content", description),
      });
  }
  const response = rewriter.transform(html);
  // パスごとに中身が変わるので、index.html の ETag は使わない
  const headers = new Headers(response.headers);
  headers.delete("ETag");
  return new Response(response.body, { status: response.status, headers });
}
