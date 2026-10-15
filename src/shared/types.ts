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

export type RoomState = {
  code: string;
  settings: RoomSettings;
  teams: Team[];
  participants: Participant[];
  card: Cell[]; // 個別カードでも全チーム同じ並び
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
  | { type: "join"; name: string; teamId: number };

// RoomDO → クライアント
export type ServerMessage =
  | { type: "state"; room: RoomState; you: Participant | null }
  | { type: "error"; reason: string };

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
  if (!settings || !teams || !participants || !card) return null;
  return { code: value.code, settings, teams, participants, card };
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
