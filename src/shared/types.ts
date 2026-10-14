// クライアントと RoomDO で共有する型。WebSocket メッセージは `type` で判別する union 型として定義し、
// 受信側では必ず parse* 関数でバリデーションしてから使う。

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const MAX_CHAT_LENGTH = 500;

export type ChatMessage = {
  id: number;
  text: string;
  sentAt: number; // epoch ms
};

// クライアント → RoomDO
export type ClientMessage = { type: "chat"; text: string };

// RoomDO → クライアント
export type ServerMessage =
  | { type: "snapshot"; messages: ChatMessage[] }
  | { type: "chat"; message: ChatMessage }
  | { type: "error"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function parseChatMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const { id, text, sentAt } = value;
  if (typeof id !== "number" || typeof text !== "string" || typeof sentAt !== "number") return null;
  return { id, text, sentAt };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "chat": {
      if (typeof data.text !== "string") return null;
      const text = data.text.trim();
      if (text.length === 0 || text.length > MAX_CHAT_LENGTH) return null;
      return { type: "chat", text };
    }
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "snapshot": {
      if (!Array.isArray(data.messages)) return null;
      const messages: ChatMessage[] = [];
      for (const m of data.messages) {
        const parsed = parseChatMessage(m);
        if (!parsed) return null;
        messages.push(parsed);
      }
      return { type: "snapshot", messages };
    }
    case "chat": {
      const message = parseChatMessage(data.message);
      return message ? { type: "chat", message } : null;
    }
    case "error":
      return typeof data.reason === "string" ? { type: "error", reason: data.reason } : null;
    default:
      return null;
  }
}
