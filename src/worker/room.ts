import { DurableObject } from "cloudflare:workers";
import {
  CLOSE_ROOM_NOT_FOUND,
  IMAGE_RETENTION_MS,
  isModerator,
  maxImagesFor,
  parseImageIds,
  parseClientMessage,
  parseSettings,
  parseTimelineEntry,
  requiredTaskCount,
  teamsFor,
  type Application,
  type Cell,
  type Claim,
  type ClientMessage,
  type Participant,
  type Role,
  type RoomSettings,
  type RoomState,
  type ServerMessage,
  type TaskInput,
  type TimelineEntry,
  type TimelineEvent,
} from "../shared/types";
import { computeStandings } from "../shared/game";
import {
  IMAGES_SCHEMA,
  deleteRoomImages,
  loadImagesDeletedAt,
  loadResultImages,
  markApproved,
  pickResultImages,
  reserveUpload,
  unmarkCell,
  useUploads,
} from "./images";
import { MISSIONS_SCHEMA, Missions } from "./missions";
import { shuffle } from "./random";

// WebSocket に保存する情報（休止から復帰しても残る）
type Attachment = { token: string };

type Creator = { token: string; name: string; teamId: number | null };

type ParticipantRow = { id: string; token: string; name: string; team_id: number | null; role: string };

type CellRow = { position: number; free: number; title: string | null; detail: string | null; image_required: number };

type ApplicationRow = {
  id: number;
  position: number;
  team_id: number;
  participant_name: string;
  comment: string;
  images: string;
  created_at: number;
};

const AUTO_REJECT_COMMENT = "他のチームが先に承認されました";

// 1ルーム = 1 RoomDO。ゲーム状態を変える処理はすべてここで行う。
export class RoomDO extends DurableObject<Env> {
  private readonly missions: Missions;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.missions = new Missions(this.ctx.storage.sql, (at, event) => this.addTimeline(at, event));
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
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        participant_id TEXT NOT NULL,
        participant_name TEXT NOT NULL,
        comment TEXT NOT NULL,
        images TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL, -- pending / approved / rejected
        reject_comment TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS claims (
        team_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        claimed_at INTEGER NOT NULL,
        PRIMARY KEY (team_id, position)
      );
      CREATE TABLE IF NOT EXISTS game_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ended_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        event TEXT NOT NULL
      );
    `);
    this.ctx.storage.sql.exec(MISSIONS_SCHEMA);
    this.ctx.storage.sql.exec(IMAGES_SCHEMA);
  }

  // Worker から RPC で呼ぶ。参加者を確かめて画像のアップロード枠（画像 ID）を払い出す
  reserveUpload(token: string): { imageId: string } | { error: string } {
    const room = this.loadRoom();
    if (!room) return { error: "ルームが見つかりません" };
    if (room.endedAt !== null) return { error: "ゲームは終了しています" };
    const you = this.findParticipantByToken(token);
    if (!you) return { error: "ルームに参加していません" };
    if (you.teamId === null) return { error: "GM は画像を送れません" };
    const imageId = reserveUpload(this.ctx.storage.sql, you.id, Date.now());
    return imageId ? { imageId } : { error: "送れる画像の枚数の上限に達しました" };
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
    if (!this.loadRoom()) {
      this.send(ws, { type: "error", reason: "ルームが見つかりません" });
      ws.close(CLOSE_ROOM_NOT_FOUND, "room not found");
      return;
    }
    // アラームの遅れに備えて、操作の前にも時間切れの特別ミッションを進めておく
    const advanced = this.advanceMissions();
    const room = this.loadRoom();
    if (!room) return;

    if (message.type === "hello") {
      if (advanced) this.broadcastState();
      const attachment: Attachment = { token: message.token };
      ws.serializeAttachment(attachment);
      this.sendState(ws, room);
      return;
    }

    const token = this.tokenOf(ws);
    if (!token) {
      this.send(ws, { type: "error", reason: "接続の準備ができていません。再読み込みしてください" });
      return;
    }
    // 状態を変える操作。失敗したら理由を本人にだけ返し、成功したら全員に配信する
    const error = this.ctx.storage.transactionSync(() => {
      const failure = this.handleAction(token, room, message);
      if (!failure) this.endIfFinished();
      return failure;
    });
    if (error) {
      this.send(ws, { type: "error", reason: error });
      if (advanced) this.broadcastState();
      return;
    }
    this.broadcastState();
    await this.scheduleAlarm();
  }

  // 特別ミッションの制限時間、またはゲーム終了から24時間後の画像削除のときに起きる
  async alarm(): Promise<void> {
    this.advanceMissions();
    const room = this.loadRoom();
    if (room && room.endedAt !== null && room.imagesDeletedAt === null && Date.now() >= room.endedAt + this.retentionMs()) {
      await deleteRoomImages(this.env.IMAGES, room.code);
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO image_cleanup (id, deleted_at) VALUES (1, ?)", Date.now());
    }
    await this.scheduleAlarm();
    this.broadcastState();
  }

  // 画像の保存期間。開発時の動作確認だけ .dev.vars の IMAGE_RETENTION_MS で短くできる（本番では設定しない）
  private retentionMs(): number {
    const override = Number(Reflect.get(this.env, "IMAGE_RETENTION_MS"));
    return Number.isFinite(override) && override > 0 ? override : IMAGE_RETENTION_MS;
  }

  private advanceMissions(): boolean {
    return this.ctx.storage.transactionSync(() => {
      const room = this.loadRoom();
      return room ? this.missions.advance(room, Date.now()) : false;
    });
  }

  // アラームは1つしか持てないので、終了後は画像の削除、プレイ中は次の特別ミッションの締切に合わせる
  private async scheduleAlarm(): Promise<void> {
    const room = this.loadRoom();
    let next: number | null = null;
    if (room && room.endedAt !== null) {
      if (room.imagesDeletedAt === null) next = room.endedAt + this.retentionMs();
    } else {
      next = this.missions.nextDeadline(Date.now());
    }
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }

  private handleAction(token: string, room: RoomState, message: Exclude<ClientMessage, { type: "hello" }>): string | null {
    const you = this.findParticipantByToken(token);
    if (message.type === "join") return this.join(token, you, room, message.name, message.teamId);
    if (!you) return "ルームに参加していません";
    // 終了後はゲーム状態を変える操作を一切受け付けない
    if (room.endedAt !== null) return "ゲームは終了しています";
    switch (message.type) {
      case "apply":
        return this.apply(you, room, message.position, message.comment, message.imageIds);
      case "approve":
        return this.approve(you, room, message.applicationId);
      case "reject":
        return this.reject(you, room, message.applicationId, message.comment);
      case "revoke":
        return this.revoke(you, room, message.teamId, message.position, message.reason);
      case "end":
        return this.end(you);
      case "startMission":
        return this.missions.start(you, room, message.kind, message.title, message.minutes, Date.now());
      case "submitMission":
        return this.missions.submit(you, room, message.missionId, message.comment, message.imageIds, Date.now());
      case "approveMission":
        return this.missions.approve(you, room, message.submissionId, Date.now());
      case "rejectMission":
        return this.missions.reject(you, room, message.submissionId, message.comment, Date.now());
      case "scoreMission":
        return this.missions.score(you, room, message.missionId, message.scores, Date.now());
      case "pickWinners":
        return this.missions.pickWinners(you, room, message.missionId, message.teamIds, Date.now());
      case "vote":
        return this.missions.vote(you, room, message.missionId, message.teamId);
      case "closeVoting":
        return this.missions.closeVoting(you, room, message.missionId, Date.now());
      case "steal":
        return this.missions.steal(you, room, message.rightId, message.position, titleAt(room, message.position), Date.now());
    }
  }

  private join(token: string, you: Participant | null, room: RoomState, name: string, teamId: number): string | null {
    if (you) return "すでに参加しています。チームは変更できません";
    if (teamId >= room.settings.teamCount) return "そのチームはありません";
    if (room.participants.some((p) => p.name === name)) return "その表示名はすでに使われています";
    this.insertParticipant(token, name, teamId, "player", Date.now());
    return null;
  }

  private apply(you: Participant, room: RoomState, position: number, comment: string, imageIds: string[]): string | null {
    const teamId = you.teamId;
    if (teamId === null) return "GM は申請できません";
    const cell = room.card[position];
    if (!cell) return "そのマスはありません";
    if (cell.free) return "FREE マスは申請できません";

    const shared = room.settings.cardMode === "shared";
    const owner = room.claims.find((c) => c.position === position && (shared || c.teamId === teamId));
    if (owner) return owner.teamId === teamId ? "このマスはすでに取得済みです" : "他のチームが取得済みのマスには申請できません";
    if (room.applications.some((a) => a.position === position && a.teamId === teamId)) return "このマスはすでに申請中です";
    if (cell.imageRequired && imageIds.length === 0) return "このお題は画像が必須です";
    if (imageIds.length > maxImagesFor("cell")) return "画像は1枚までです";

    const now = Date.now();
    const imageError = useUploads(this.ctx.storage.sql, you.id, imageIds, now);
    if (imageError) return imageError;
    if (room.settings.hasGm) {
      this.ctx.storage.sql.exec(
        `INSERT INTO applications (position, team_id, participant_id, participant_name, comment, images, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        position,
        teamId,
        you.id,
        you.name,
        comment,
        JSON.stringify(imageIds),
        now,
      );
      this.addTimeline(now, { kind: "applied", teamId, participantName: you.name, position, title: cell.title, comment, imageIds });
    } else {
      // GMなし：申請と同時に取得（画像は承認済みとして扱う）
      this.insertClaim(teamId, position, now);
      markApproved(this.ctx.storage.sql, teamId, imageIds, position);
      this.addTimeline(now, { kind: "claimed", teamId, participantName: you.name, position, title: cell.title, comment, imageIds });
    }
    return null;
  }

  private approve(you: Participant, room: RoomState, applicationId: number): string | null {
    if (you.role !== "gm") return "承認できるのは GM だけです";
    const app = room.applications.find((a) => a.id === applicationId);
    if (!app) return "申請が見つからないか、すでに処理されています";
    const title = titleAt(room, app.position);
    const shared = room.settings.cardMode === "shared";
    if (room.claims.some((c) => c.position === app.position && (shared || c.teamId === app.teamId))) {
      return "このマスはすでに取得されています";
    }

    const now = Date.now();
    this.resolveApplication(app.id, "approved", null, now);
    this.insertClaim(app.teamId, app.position, now);
    markApproved(this.ctx.storage.sql, app.teamId, app.imageIds, app.position);
    this.addTimeline(now, { kind: "approved", teamId: app.teamId, position: app.position, title, byName: you.name });

    // 共有カードでは、同じマスへの他チームの申請は却下扱いにする
    if (shared) {
      for (const other of room.applications) {
        if (other.id === app.id || other.position !== app.position) continue;
        this.resolveApplication(other.id, "rejected", AUTO_REJECT_COMMENT, now);
        this.addTimeline(now, {
          kind: "rejected",
          teamId: other.teamId,
          position: other.position,
          title,
          comment: AUTO_REJECT_COMMENT,
          auto: true,
        });
      }
    }
    return null;
  }

  private reject(you: Participant, room: RoomState, applicationId: number, comment: string): string | null {
    if (you.role !== "gm") return "却下できるのは GM だけです";
    const app = room.applications.find((a) => a.id === applicationId);
    if (!app) return "申請が見つからないか、すでに処理されています";
    const now = Date.now();
    this.resolveApplication(app.id, "rejected", comment, now);
    this.addTimeline(now, {
      kind: "rejected",
      teamId: app.teamId,
      position: app.position,
      title: titleAt(room, app.position),
      comment,
      auto: false,
    });
    return null;
  }

  // 取り消しはビンゴ成立に関係なく行う。取り消したマスには再挑戦できる
  private revoke(you: Participant, room: RoomState, teamId: number, position: number, reason: string): string | null {
    if (!isModerator(you)) return "取り消しできるのは GM（GMなしのときは操作主）だけです";
    if (!room.claims.some((c) => c.teamId === teamId && c.position === position)) return "そのチームはこのマスを取得していません";
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM claims WHERE team_id = ? AND position = ?", teamId, position);
    unmarkCell(this.ctx.storage.sql, teamId, position);
    this.addTimeline(now, { kind: "revoked", teamId, position, title: titleAt(room, position), reason, byName: you.name });
    return null;
  }

  private end(you: Participant): string | null {
    if (!isModerator(you)) return "ゲームを終了できるのは GM（GMなしのときは操作主）だけです";
    this.markEnded({ kind: "ended", reason: "manual", byName: you.name });
    return null;
  }

  // 操作のたびに呼ぶ。目標ビンゴ数に届いたチームがいる、または（共有カード・自動終了ONで）全マスが埋まったら終了する
  private endIfFinished(): void {
    const room = this.loadRoom();
    if (!room || room.endedAt !== null) return;
    const { settings, card, claims, teams } = room;
    const leader = computeStandings(settings.cardSize, card, claims, teams).find((s) => s.bingos >= settings.targetBingo);
    if (leader) {
      this.markEnded({ kind: "ended", reason: "target", teamId: leader.teamId });
      return;
    }
    if (settings.cardMode === "shared" && settings.autoEnd) {
      const claimed = new Set(claims.map((c) => c.position));
      if (card.every((cell) => cell.free || claimed.has(cell.position))) this.markEnded({ kind: "ended", reason: "full" });
    }
  }

  private markEnded(event: Extract<TimelineEvent, { kind: "ended" }>): void {
    const now = Date.now();
    this.ctx.storage.sql.exec("INSERT INTO game_status (id, ended_at) VALUES (1, ?)", now);
    pickResultImages(this.ctx.storage.sql);
    this.addTimeline(now, event);
  }

  private insertClaim(teamId: number, position: number, at: number): void {
    this.ctx.storage.sql.exec("INSERT INTO claims (team_id, position, claimed_at) VALUES (?, ?, ?)", teamId, position, at);
  }

  private resolveApplication(id: number, status: "approved" | "rejected", rejectComment: string | null, at: number): void {
    this.ctx.storage.sql.exec(
      "UPDATE applications SET status = ?, reject_comment = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
      status,
      rejectComment,
      at,
      id,
    );
  }

  private addTimeline(at: number, event: TimelineEvent): void {
    this.ctx.storage.sql.exec("INSERT INTO timeline (at, event) VALUES (?, ?)", at, JSON.stringify(event));
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
      claims: this.loadClaims(),
      applications: this.loadPendingApplications(),
      timeline: this.loadTimeline(),
      endedAt: this.loadEndedAt(),
      missions: this.missions.load(),
      stealRights: this.missions.loadStealRights(),
      resultImages: loadResultImages(this.ctx.storage.sql),
      imagesDeletedAt: loadImagesDeletedAt(this.ctx.storage.sql),
    };
  }

  private loadEndedAt(): number | null {
    const row = this.ctx.storage.sql.exec<{ ended_at: number }>("SELECT ended_at FROM game_status WHERE id = 1").toArray()[0];
    return row ? row.ended_at : null;
  }

  private loadClaims(): Claim[] {
    return this.ctx.storage.sql
      .exec<{ team_id: number; position: number; claimed_at: number }>(
        "SELECT team_id, position, claimed_at FROM claims ORDER BY claimed_at, position",
      )
      .toArray()
      .map((r) => ({ teamId: r.team_id, position: r.position, claimedAt: r.claimed_at }));
  }

  // id は申請順に増えるので、id 順 = 申請時刻順
  private loadPendingApplications(): Application[] {
    return this.ctx.storage.sql
      .exec<ApplicationRow>(
        "SELECT id, position, team_id, participant_name, comment, images, created_at FROM applications WHERE status = 'pending' ORDER BY id",
      )
      .toArray()
      .map((r) => ({
        id: r.id,
        position: r.position,
        teamId: r.team_id,
        participantName: r.participant_name,
        comment: r.comment,
        imageIds: storedImageIds(r.images),
        createdAt: r.created_at,
      }));
  }

  private loadTimeline(): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    const rows = this.ctx.storage.sql.exec<{ id: number; at: number; event: string }>("SELECT id, at, event FROM timeline ORDER BY id");
    for (const r of rows) {
      const event: unknown = JSON.parse(r.event);
      const entry = parseTimelineEntry({ id: r.id, at: r.at, event });
      if (entry) entries.push(entry);
    }
    return entries;
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

export function storedImageIds(json: string): string[] {
  const value: unknown = JSON.parse(json);
  return parseImageIds(value) ?? [];
}

function titleAt(room: RoomState, position: number): string {
  const cell = room.card[position];
  return cell && !cell.free ? cell.title : "FREE";
}

// token は他の参加者に見せないので、ここで落とす
function toParticipant(row: ParticipantRow): Participant {
  const role: Role = row.role === "gm" || row.role === "operator" ? row.role : "player";
  return { id: row.id, name: row.name, teamId: row.team_id, role };
}
