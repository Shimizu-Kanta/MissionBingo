import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_ROOM_NOT_FOUND,
  parseClientMessage,
  teamsFor,
  type Participant,
  type Role,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
} from "../shared/types";

// WebSocket に保存する情報（休止から復帰しても残る）
type Attachment = { token: string };

type Creator = { token: string; name: string; teamId: number | null };

type ParticipantRow = { id: string; token: string; name: string; team_id: number | null; role: string };

// 1ルーム = 1 RoomDO。ゲーム状態を変える処理はすべてここで行う。
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        code TEXT NOT NULL,
        has_gm INTEGER NOT NULL,
        team_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        team_id INTEGER,
        role TEXT NOT NULL,
        joined_at INTEGER NOT NULL
      );
    `);
  }

  // Worker から RPC で呼ぶ。すでに作成済みのルームなら false（コードの衝突）
  initialize(code: string, settings: RoomSettings, creator: Creator): boolean {
    if (this.loadRoom()) return false;
    const role: Role = settings.hasGm ? "gm" : "operator";
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO room (id, code, has_gm, team_count, created_at) VALUES (1, ?, ?, ?, ?)",
        code,
        settings.hasGm ? 1 : 0,
        settings.teamCount,
        now,
      );
      this.insertParticipant(creator.token, creator.name, settings.hasGm ? null : creator.teamId, role, now);
    });
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket の接続が必要です", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    if (!this.loadRoom()) {
      // 理由を伝えてすぐ閉じるだけなので、Hibernation には預けない
      server.accept();
      this.send(server, { type: "error", reason: "ルームが見つかりません" });
      server.close(CLOSE_ROOM_NOT_FOUND, "room not found");
      return new Response(null, { status: 101, webSocket: client });
    }
    // Hibernation API：接続を DO に預け、待機中は DO を休止させる
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const message = typeof raw === "string" ? parseClientMessage(raw) : null;
    if (!message) {
      this.send(ws, { type: "error", reason: "不正なメッセージです" });
      return;
    }
    const room = this.loadRoom();
    if (!room) {
      this.send(ws, { type: "error", reason: "ルームが見つかりません" });
      ws.close(CLOSE_ROOM_NOT_FOUND, "room not found");
      return;
    }

    switch (message.type) {
      case "hello": {
        const attachment: Attachment = { token: message.token };
        ws.serializeAttachment(attachment);
        this.sendState(ws, room);
        break;
      }
      case "join": {
        const token = this.tokenOf(ws);
        if (!token) {
          this.send(ws, { type: "error", reason: "接続の準備ができていません。再読み込みしてください" });
          return;
        }
        if (this.findParticipantByToken(token)) {
          this.send(ws, { type: "error", reason: "すでに参加しています。チームは変更できません" });
          return;
        }
        if (message.teamId >= room.settings.teamCount) {
          this.send(ws, { type: "error", reason: "そのチームはありません" });
          return;
        }
        if (room.participants.some((p) => p.name === message.name)) {
          this.send(ws, { type: "error", reason: "その表示名はすでに使われています" });
          return;
        }
        this.insertParticipant(token, message.name, message.teamId, "player", Date.now());
        this.broadcastState();
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private insertParticipant(token: string, name: string, teamId: number | null, role: Role, joinedAt: number): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO participants (id, token, name, team_id, role, joined_at) VALUES (?, ?, ?, ?, ?, ?)",
      crypto.randomUUID(),
      token,
      name,
      teamId,
      role,
      joinedAt,
    );
  }

  private loadRoom(): RoomState | null {
    const rows = this.ctx.storage.sql
      .exec<{ code: string; has_gm: number; team_count: number }>("SELECT code, has_gm, team_count FROM room WHERE id = 1")
      .toArray();
    const row = rows[0];
    if (!row) return null;
    return {
      code: row.code,
      settings: { hasGm: row.has_gm === 1, teamCount: row.team_count },
      teams: teamsFor(row.team_count),
      participants: this.participantRows().map(toParticipant),
    };
  }

  private participantRows(): ParticipantRow[] {
    return this.ctx.storage.sql
      .exec<ParticipantRow>("SELECT id, token, name, team_id, role FROM participants ORDER BY joined_at, id")
      .toArray();
  }

  private findParticipantByToken(token: string): Participant | null {
    const row = this.ctx.storage.sql
      .exec<ParticipantRow>("SELECT id, token, name, team_id, role FROM participants WHERE token = ?", token)
      .toArray()[0];
    return row ? toParticipant(row) : null;
  }

  private tokenOf(ws: WebSocket): string | null {
    const attachment: unknown = ws.deserializeAttachment();
    if (typeof attachment !== "object" || attachment === null || !("token" in attachment)) return null;
    return typeof attachment.token === "string" ? attachment.token : null;
  }

  private sendState(ws: WebSocket, room: RoomState): void {
    const token = this.tokenOf(ws);
    const you = token ? this.findParticipantByToken(token) : null;
    this.send(ws, { type: "state", room, you });
  }

  // 参加者ごとに `you` が違うので、ソケットごとに送る
  private broadcastState(): void {
    const room = this.loadRoom();
    if (!room) return;
    const byToken = new Map(this.participantRows().map((r) => [r.token, toParticipant(r)]));
    for (const ws of this.ctx.getWebSockets()) {
      const token = this.tokenOf(ws);
      if (!token) continue; // hello 前の接続には送らない
      try {
        this.send(ws, { type: "state", room, you: byToken.get(token) ?? null });
      } catch {
        // 切断済みのソケットは webSocketClose で片付く
      }
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    ws.send(JSON.stringify(message));
  }
}

// token は他の参加者に見せないので、ここで落とす
function toParticipant(row: ParticipantRow): Participant {
  const role: Role = row.role === "gm" || row.role === "operator" ? row.role : "player";
  return { id: row.id, name: row.name, teamId: row.team_id, role };
}
