// クライアントと RoomDO で共有する型。WebSocket メッセージは `type` で判別する union 型として定義し、
// 受信側では必ず parse* 関数でバリデーションしてから使う。

// 紛らわしい文字（0/O, 1/I/L）を除いた6文字
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

export const MIN_TEAMS = 2;
export const MAX_TEAMS = 6;
export const DEFAULT_TEAMS = 3;
export const MAX_NAME_LENGTH = 20;

export const CARD_SIZES = [5, 7, 9] as const;
export type CardSize = (typeof CARD_SIZES)[number];
export const DEFAULT_CARD_SIZE: CardSize = 5;
export const DEFAULT_TARGET_BINGO = 2;

export const TITLE_WARN_LENGTH = 10;
export const MAX_TITLE_LENGTH = 25;
export const MAX_DETAIL_LENGTH = 500;
export const MAX_TASKS = 300;
export const MAX_COMMENT_LENGTH = 200;

// 見分けやすい色。チームID = 配列の添字
export const TEAM_PRESETS = [
  { name: "赤チーム", color: "#e53935" },
  { name: "青チーム", color: "#1e88e5" },
  { name: "緑チーム", color: "#43a047" },
  { name: "黄チーム", color: "#fdd835" },
  { name: "紫チーム", color: "#8e24aa" },
  { name: "橙チーム", color: "#fb8c00" },
] as const;

// GMあり：作成者は GM（チームに属さない）。GMなし：作成者は操作主（チームに属する）
export type Role = "gm" | "operator" | "player";

export type Team = { id: number; name: string; color: string };

export type CardMode = "individual" | "shared";

export type RoomSettings = {
  hasGm: boolean;
  cardMode: CardMode;
  cardSize: CardSize;
  free: boolean;
  teamCount: number;
  targetBingo: number; // 1〜maxLines(cardSize)
  autoEnd: boolean; // 共有カードのみ。個別カードでは常に false
};

// お題の候補（CSV / JSON の1行）
export type TaskInput = {
  title: string;
  detail: string | null;
  imageRequired: boolean;
};

// カード上の1マス。position は左上から行優先で 0 始まり
export type Cell =
  | { position: number; free: true }
  | { position: number; free: false; title: string; detail: string | null; imageRequired: boolean };

export type Participant = {
  id: string;
  name: string;
  teamId: number | null; // GM のみ null
  role: Role;
};

// マスの取得。個別カードではチームごと、共有カードでは1マスにつき1チーム
export type Claim = { teamId: number; position: number; claimedAt: number };

// 申請中の申請（GMありのときだけ発生する）
export type Application = {
  id: number;
  position: number;
  teamId: number;
  participantName: string;
  comment: string;
  createdAt: number;
};

// タイムラインの出来事。名前とタイトルは記録時点のものを持つ
export type TimelineEvent =
  | { kind: "applied"; teamId: number; participantName: string; position: number; title: string; comment: string }
  | { kind: "approved"; teamId: number; position: number; title: string; byName: string }
  | { kind: "rejected"; teamId: number; position: number; title: string; comment: string; auto: boolean }
  | { kind: "claimed"; teamId: number; participantName: string; position: number; title: string; comment: string }
  | { kind: "revoked"; teamId: number; position: number; title: string; reason: string; byName: string }
  | { kind: "ended"; reason: "manual"; byName: string } // GM / 操作主が終了
  | { kind: "ended"; reason: "target"; teamId: number } // 目標ビンゴ数に到達
  | { kind: "ended"; reason: "full" }; // 全マスが埋まった（共有カード・自動終了ON）
export type TimelineEntry = { id: number; at: number; event: TimelineEvent };

export type RoomState = {
  code: string;
  settings: RoomSettings;
  teams: Team[];
  participants: Participant[];
  card: Cell[]; // 個別カードでも全チーム同じ並び
  claims: Claim[];
  applications: Application[]; // 申請中のみ。古い順
  timeline: TimelineEntry[]; // 古い順
  endedAt: number | null; // 終了済みなら終了時刻
};

// POST /api/rooms
export type CreateRoomRequest = {
  token: string;
  name: string;
  settings: RoomSettings;
  teamId: number | null; // GMなしのときの操作主のチーム。GMありなら null
  tasks: TaskInput[]; // 必要数以上。RoomDO がこの中から抽選する
};
export type CreateRoomResponse = { code: string };

// クライアント → RoomDO
export type ClientMessage =
  | { type: "hello"; token: string }
  | { type: "join"; name: string; teamId: number }
  | { type: "apply"; position: number; comment: string }
  | { type: "approve"; applicationId: number }
  | { type: "reject"; applicationId: number; comment: string }
  | { type: "revoke"; teamId: number; position: number; reason: string }
  | { type: "end" };

// RoomDO → クライアント
export type ServerMessage =
  | { type: "state"; room: RoomState; you: Participant | null }
  | { type: "error"; reason: string };

// GM、または GMなしのときの操作主。取り消し・終了・全チームのカード閲覧ができる
export function isModerator(participant: Participant): boolean {
  return participant.role === "gm" || participant.role === "operator";
}

// ルームが存在しないときに RoomDO が WebSocket を閉じるコード
export const CLOSE_ROOM_NOT_FOUND = 4404;

export function teamsFor(teamCount: number): Team[] {
  return TEAM_PRESETS.slice(0, teamCount).map((t, id) => ({ id, ...t }));
}

// 縦・横・斜め2本
export function maxLines(cardSize: CardSize): number {
  return cardSize * 2 + 2;
}

export function requiredTaskCount(cardSize: CardSize, free: boolean): number {
  return cardSize * cardSize - (free ? 1 : 0);
}

// サロゲートペアを1文字として数える
export function charLength(value: string): number {
  return [...value].length;
}

// ---- バリデーション ----

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

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}

function parseCardSize(value: unknown): CardSize | null {
  return CARD_SIZES.find((size) => size === value) ?? null;
}

export function parseSettings(value: unknown): RoomSettings | null {
  if (!isRecord(value)) return null;
  const { hasGm, cardMode, free, teamCount, targetBingo, autoEnd } = value;
  const cardSize = parseCardSize(value.cardSize);
  if (typeof hasGm !== "boolean" || typeof free !== "boolean" || typeof autoEnd !== "boolean" || !cardSize) return null;
  if (cardMode !== "individual" && cardMode !== "shared") return null;
  if (!isInt(teamCount, MIN_TEAMS, MAX_TEAMS) || !isInt(targetBingo, 1, maxLines(cardSize))) return null;
  if (cardMode === "individual" && autoEnd) return null;
  return { hasGm, cardMode, cardSize, free, teamCount, targetBingo, autoEnd };
}

export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length > 0 && charLength(title) <= MAX_TITLE_LENGTH ? title : null;
}

// 空文字の詳細は null として扱う
export function normalizeDetail(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const detail = value.trim();
  if (detail.length === 0) return null;
  return charLength(detail) <= MAX_DETAIL_LENGTH ? detail : undefined;
}

export function parseTaskInput(value: unknown): TaskInput | null {
  if (!isRecord(value)) return null;
  const title = normalizeTitle(value.title);
  const detail = normalizeDetail(value.detail);
  const imageRequired = value.imageRequired ?? false;
  if (!title || detail === undefined || typeof imageRequired !== "boolean") return null;
  return { title, detail, imageRequired };
}

function parseCell(value: unknown): Cell | null {
  if (!isRecord(value) || !isInt(value.position, 0, 80)) return null;
  if (value.free === true) return { position: value.position, free: true };
  const task = parseTaskInput(value);
  if (value.free !== false || !task) return null;
  return { position: value.position, free: false, ...task };
}

export function normalizeComment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const comment = value.trim();
  return comment.length > 0 && charLength(comment) <= MAX_COMMENT_LENGTH ? comment : null;
}

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const isTeamId = (value: unknown): value is number => isInt(value, 0, MAX_TEAMS - 1);
const isPosition = (value: unknown): value is number => isInt(value, 0, 80);
const isId = (value: unknown): value is number => isInt(value, 1, Number.MAX_SAFE_INTEGER);

function parseClaim(value: unknown): Claim | null {
  if (!isRecord(value) || !isTeamId(value.teamId) || !isPosition(value.position) || !isTime(value.claimedAt)) return null;
  return { teamId: value.teamId, position: value.position, claimedAt: value.claimedAt };
}

function parseApplication(value: unknown): Application | null {
  if (!isRecord(value)) return null;
  const { id, position, teamId, participantName, comment, createdAt } = value;
  if (!isId(id) || !isPosition(position) || !isTeamId(teamId) || !isTime(createdAt)) return null;
  if (typeof participantName !== "string" || typeof comment !== "string") return null;
  return { id, position, teamId, participantName, comment, createdAt };
}

function parseTimelineEvent(value: unknown): TimelineEvent | null {
  if (!isRecord(value)) return null;
  if (value.kind === "ended") {
    if (value.reason === "target") return isTeamId(value.teamId) ? { kind: "ended", reason: "target", teamId: value.teamId } : null;
    if (value.reason === "full") return { kind: "ended", reason: "full" };
    return value.reason === "manual" && typeof value.byName === "string" ? { kind: "ended", reason: "manual", byName: value.byName } : null;
  }

  const { teamId, position, title } = value;
  if (!isTeamId(teamId) || !isPosition(position) || typeof title !== "string") return null;
  switch (value.kind) {
    case "applied":
    case "claimed": {
      const { participantName, comment } = value;
      if (typeof participantName !== "string" || typeof comment !== "string") return null;
      return { kind: value.kind, teamId, participantName, position, title, comment };
    }
    case "approved":
      return typeof value.byName === "string" ? { kind: "approved", teamId, position, title, byName: value.byName } : null;
    case "rejected":
      if (typeof value.comment !== "string" || typeof value.auto !== "boolean") return null;
      return { kind: "rejected", teamId, position, title, comment: value.comment, auto: value.auto };
    case "revoked":
      if (typeof value.reason !== "string" || typeof value.byName !== "string") return null;
      return { kind: "revoked", teamId, position, title, reason: value.reason, byName: value.byName };
    default:
      return null;
  }
}

export function parseTimelineEntry(value: unknown): TimelineEntry | null {
  if (!isRecord(value) || !isId(value.id) || !isTime(value.at)) return null;
  const event = parseTimelineEvent(value.event);
  return event ? { id: value.id, at: value.at, event } : null;
}

function parseRole(value: unknown): Role | null {
  return value === "gm" || value === "operator" || value === "player" ? value : null;
}

function parseParticipant(value: unknown): Participant | null {
  if (!isRecord(value)) return null;
  const role = parseRole(value.role);
  if (typeof value.id !== "string" || typeof value.name !== "string" || !role) return null;
  if (value.teamId !== null && !isInt(value.teamId, 0, MAX_TEAMS - 1)) return null;
  return { id: value.id, name: value.name, teamId: value.teamId, role };
}

function parseTeam(value: unknown): Team | null {
  if (!isRecord(value)) return null;
  if (!isInt(value.id, 0, MAX_TEAMS - 1) || typeof value.name !== "string" || typeof value.color !== "string") return null;
  return { id: value.id, name: value.name, color: value.color };
}

function parseList<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  for (const item of value) {
    const parsed = parseItem(item);
    if (parsed === null) return null;
    result.push(parsed);
  }
  return result;
}

function parseRoomState(value: unknown): RoomState | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  const settings = parseSettings(value.settings);
  const teams = parseList(value.teams, parseTeam);
  const participants = parseList(value.participants, parseParticipant);
  const card = parseList(value.card, parseCell);
  const claims = parseList(value.claims, parseClaim);
  const applications = parseList(value.applications, parseApplication);
  const timeline = parseList(value.timeline, parseTimelineEntry);
  if (!settings || !teams || !participants || !card || !claims || !applications || !timeline) return null;
  if (value.endedAt !== null && !isTime(value.endedAt)) return null;
  return { code: value.code, settings, teams, participants, card, claims, applications, timeline, endedAt: value.endedAt };
}

export function parseCreateRoomRequest(value: unknown): CreateRoomRequest | null {
  if (!isRecord(value)) return null;
  const name = normalizeName(value.name);
  const settings = parseSettings(value.settings);
  if (typeof value.token !== "string" || !TOKEN_PATTERN.test(value.token) || !name || !settings) return null;
  const tasks = parseList(value.tasks, parseTaskInput);
  if (!tasks || tasks.length < requiredTaskCount(settings.cardSize, settings.free) || tasks.length > MAX_TASKS) return null;
  if (settings.hasGm) {
    if (value.teamId !== null) return null;
    return { token: value.token, name, settings, teamId: null, tasks };
  }
  if (!isInt(value.teamId, 0, settings.teamCount - 1)) return null;
  return { token: value.token, name, settings, teamId: value.teamId, tasks };
}

export function parseCreateRoomResponse(value: unknown): CreateRoomResponse | null {
  if (!isRecord(value) || typeof value.code !== "string" || !ROOM_CODE_PATTERN.test(value.code)) return null;
  return { code: value.code };
}

export function parseClientMessage(raw: string): ClientMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "hello":
      return typeof data.token === "string" && TOKEN_PATTERN.test(data.token) ? { type: "hello", token: data.token } : null;
    case "join": {
      const name = normalizeName(data.name);
      // チーム数の上限チェックはルーム設定を知っている RoomDO 側で行う
      if (!name || !isInt(data.teamId, 0, MAX_TEAMS - 1)) return null;
      return { type: "join", name, teamId: data.teamId };
    }
    case "apply": {
      const comment = normalizeComment(data.comment);
      if (!isPosition(data.position) || !comment) return null;
      return { type: "apply", position: data.position, comment };
    }
    case "approve":
      return isId(data.applicationId) ? { type: "approve", applicationId: data.applicationId } : null;
    case "reject": {
      const comment = normalizeComment(data.comment);
      if (!isId(data.applicationId) || !comment) return null;
      return { type: "reject", applicationId: data.applicationId, comment };
    }
    case "revoke": {
      const reason = normalizeComment(data.reason);
      if (!isTeamId(data.teamId) || !isPosition(data.position) || !reason) return null;
      return { type: "revoke", teamId: data.teamId, position: data.position, reason };
    }
    case "end":
      return { type: "end" };
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  const data = parseJson(raw);
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "state": {
      const room = parseRoomState(data.room);
      if (!room) return null;
      if (data.you === null) return { type: "state", room, you: null };
      const you = parseParticipant(data.you);
      return you ? { type: "state", room, you } : null;
    }
    case "error":
      return typeof data.reason === "string" ? { type: "error", reason: data.reason } : null;
    default:
      return null;
  }
}
