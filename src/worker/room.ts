import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, type ChatMessage, type ServerMessage } from "../shared/types";

const SNAPSHOT_LIMIT = 100;

// 1ルーム = 1 RoomDO。ゲーム状態を変える処理はすべてここで行う。
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        sent_at INTEGER NOT NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket の接続が必要です", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    // Hibernation API：接続を DO に預け、待機中は DO を休止させる
    this.ctx.acceptWebSocket(server);
    this.send(server, { type: "snapshot", messages: this.recentMessages() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === "string" ? parseClientMessage(raw) : null;
    if (!message) {
      this.send(ws, { type: "error", reason: "不正なメッセージです" });
      return;
    }
    switch (message.type) {
      case "chat": {
        const sentAt = Date.now();
        const row = this.ctx.storage.sql
          .exec<{ id: number }>("INSERT INTO messages (text, sent_at) VALUES (?, ?) RETURNING id", message.text, sentAt)
          .one();
        this.broadcast({ type: "chat", message: { id: row.id, text: message.text, sentAt } });
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private recentMessages(): ChatMessage[] {
    return this.ctx.storage.sql
      .exec<{ id: number; text: string; sent_at: number }>(
        "SELECT id, text, sent_at FROM messages ORDER BY id DESC LIMIT ?",
        SNAPSHOT_LIMIT,
      )
      .toArray()
      .reverse()
      .map((r) => ({ id: r.id, text: r.text, sentAt: r.sent_at }));
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // 切断済みのソケットは webSocketClose で片付く
      }
    }
  }
}
