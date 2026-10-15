import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_ROOM_NOT_FOUND,
  parseClientMessage,
  parseSettings,
  requiredTaskCount,
  teamsFor,
  type Cell,
  type Participant,
  type Role,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
  type TaskInput,
} from "../shared/types";
import { shuffle } from "./random";

// WebSocket に保存する情報（休止から復帰しても残る）
type Attachment = { token: string };

type Creator = { token: string; name: string; teamId: number | null };

type ParticipantRow = { id: string; token: string; name: string; team_id: number | null; role: string };

type CellRow = { position: number; free: number; title: string | null; detail: string | null; image_required: number };

// 1ルーム = 1 RoomDO。ゲーム状態を変える処理はすべてここで行う。
export class RoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        code TEXT NOT NULL,
        settings TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cells (
        position INTEGER PRIMARY KEY,
        free INTEGER NOT NULL,
        title TEXT,
        detail TEXT,
        image_required INTEGER NOT NULL
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

  // Worker から RPC で呼ぶ。すでに作成済みのルームなら false（コードの衝突）。
  // 抽選はここで1回だけ行い、結果のカードを保存する
  initialize(code: string, settings: RoomSettings, creator: Creator, tasks: TaskInput[]): boolean {
    if (this.loadRoom()) return false;
    const role: Role = settings.hasGm ? "gm" : "operator";
    const now = Date.now();
    const card = drawCard(settings, tasks);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO room (id, code, settings, created_at) VALUES (1, ?, ?, ?)",
        code,
        JSON.stringify(settings),
        now,
      );
      for (const cell of card) {
        this.ctx.storage.sql.exec(
          "INSERT INTO cells (position, free, title, detail, image_required) VALUES (?, ?, ?, ?, ?)",
          cell.position,
          cell.free ? 1 : 0,
          cell.free ? null : cell.title,
          cell.free ? null : cell.detail,
          !cell.free && cell.imageRequired ? 1 : 0,
        );
      }
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
    const row = this.ctx.storage.sql
      .exec<{ code: string; settings: string }>("SELECT code, settings FROM room WHERE id = 1")
      .toArray()[0];
    if (!row) return null;
    const stored: unknown = JSON.parse(row.settings);
    const settings = parseSettings(stored);
    if (!settings) throw new Error(`broken room settings: ${row.settings}`);
    return {
      code: row.code,
      settings,
      teams: teamsFor(settings.teamCount),
      participants: this.participantRows().map(toParticipant),
      card: this.loadCard(),
    };
  }

  private loadCard(): Cell[] {
    return this.ctx.storage.sql
      .exec<CellRow>("SELECT position, free, title, detail, image_required FROM cells ORDER BY position")
      .toArray()
      .map((r): Cell =>
        r.free === 1
          ? { position: r.position, free: true }
          : { position: r.position, free: false, title: r.title ?? "", detail: r.detail, imageRequired: r.image_required === 1 },
      );
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

// 候補から必要数を抽選して並べる。FREE ありなら中央が FREE
function drawCard(settings: RoomSettings, tasks: TaskInput[]): Cell[] {
  const cellCount = settings.cardSize * settings.cardSize;
  const center = (cellCount - 1) / 2;
  const picked = shuffle(tasks).slice(0, requiredTaskCount(settings.cardSize, settings.free));
  if (picked.length !== requiredTaskCount(settings.cardSize, settings.free)) throw new Error("not enough tasks");
  let next = 0;
  return Array.from({ length: cellCount }, (_, position): Cell => {
    if (settings.free && position === center) return { position, free: true };
    return { position, free: false, ...picked[next++] };
  });
}

// token は他の参加者に見せないので、ここで落とす
function toParticipant(row: ParticipantRow): Participant {
  const role: Role = row.role === "gm" || row.role === "operator" ? row.role : "player";
  return { id: row.id, name: row.name, teamId: row.team_id, role };
}
