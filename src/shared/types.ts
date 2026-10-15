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

export const MISSION_KINDS = ["speed", "quantity", "quality"] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
export const MAX_MISSION_TITLE_LENGTH = 50;
export const MIN_MISSION_MINUTES = 1;
export const MAX_MISSION_MINUTES = 60;
export const MAX_MISSION_SCORE = 999;

// 画像：送信前にブラウザで縮小する。保存はゲーム終了から24時間
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_JPEG_QUALITY = 0.8;
export const MAX_ORIGINAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 縮小後の上限（サーバー側で確認）
export const MAX_QUANTITY_IMAGES = 5; // 特別ミッションの量タイプだけ1回に複数枚
export const IMAGE_RETENTION_MS = 24 * 60 * 60 * 1000;
export const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 見分けやすい色。チームID = 配列の添字
export const TEAM_PRESETS = [
  { name: "赤チーム", hue: 25 },
  { name: "青チーム", hue: 250 },
  { name: "緑チーム", hue: 150 },
  { name: "黄チーム", hue: 85 },
  { name: "紫チーム", hue: 305 },
  { name: "橙チーム", hue: 55 },
] as const;

// GMあり：作成者は GM（チームに属さない）。GMなし：作成者は操作主（チームに属する）
export type Role = "gm" | "operator" | "player";

// color はチームのベタ色（oklch）。淡色・濃色はクライアントで hue から作る
export type Team = { id: number; name: string; color: string; hue: number };

export const DEFAULT_ROOM_NAME = "ミッションビンゴ";
export const MAX_ROOM_NAME_LENGTH = 30;

export type CardMode = "individual" | "shared";

export type RoomSettings = {
  hasGm: boolean;
  cardMode: CardMode;
  cardSize: CardSize;
  free: boolean;
  teamCount: number;
  targetBingo: number; // 1〜maxLines(cardSize)
  autoEnd: boolean; // 共有カードのみ。個別カードでは常に false
  qualityJudge: QualityJudge; // 質タイプの判定方法。GMなし・共有カードのときだけ意味を持つ
  roomName: string;
};

export type QualityJudge = "operator" | "vote";

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
  comment: string; // 画像付きなら空のこともある
  imageIds: string[];
  createdAt: number;
};

// タイムラインの出来事。名前とタイトルは記録時点のものを持つ
export type TimelineEvent =
  | { kind: "applied"; teamId: number; participantName: string; position: number; title: string; comment: string; imageIds: string[] }
  | { kind: "approved"; teamId: number; position: number; title: string; byName: string; participantName: string }
  | {
      kind: "rejected";
      teamId: number;
      position: number;
      title: string;
      comment: string;
      auto: boolean;
      participantName: string;
    }
  | { kind: "started"; byName: string }
  | { kind: "claimed"; teamId: number; participantName: string; position: number; title: string; comment: string; imageIds: string[] }
  | { kind: "revoked"; teamId: number; position: number; title: string; reason: string; byName: string }
  | { kind: "ended"; reason: "manual"; byName: string } // GM / 操作主が終了
  | { kind: "ended"; reason: "target"; teamId: number } // 目標ビンゴ数に到達
  | { kind: "ended"; reason: "full" } // 全マスが埋まった（共有カード・自動終了ON）
  | { kind: "missionStarted"; missionId: number; missionKind: MissionKind; title: string; minutes: number; byName: string }
  | {
      kind: "missionSubmitted";
      missionId: number;
      title: string;
      teamId: number;
      participantName: string;
      comment: string;
      imageIds: string[];
    }
  | { kind: "missionRejected"; missionId: number; title: string; teamId: number; comment: string; auto: boolean }
  | { kind: "missionResult"; missionId: number; title: string; winnerTeamIds: number[] } // 勝者なしなら空
  | { kind: "stolen"; teamId: number; fromTeamId: number; position: number; title: string };
export type TimelineEntry = { id: number; at: number; event: TimelineEvent };

// ---- 特別ミッション（共有カードのみ） ----

// open：提出受付中（速さは時間切れ後も、時間内の提出の判定待ちなら open のまま）
// judging：時間切れ後、GM / 操作主の判定待ち（量・質）
// voting：時間切れ後、全員投票の受付中（GMなし・質・全員投票）
export type MissionStatus = "open" | "judging" | "voting" | "done";

export type MissionSubmission = {
  id: number;
  teamId: number;
  participantName: string;
  comment: string;
  imageIds: string[];
  // pending / approved / rejected は速さ（GMあり）の判定。量・質は提出したら accepted
  status: "pending" | "approved" | "rejected" | "accepted";
  rejectComment: string | null;
  createdAt: number;
};

// 量：GM / 操作主が入力した数。質の全員投票：得票数
export type TeamScore = { teamId: number; value: number };

export type Mission = {
  id: number;
  kind: MissionKind;
  title: string;
  startedAt: number;
  endsAt: number;
  status: MissionStatus;
  submissions: MissionSubmission[];
  voterIds: string[]; // 投票済みの参加者。誰に入れたかは done まで出さない
  winnerTeamIds: number[];
  scores: TeamScore[] | null; // done になってから出す
};

// 特別ミッションの1位が持つ「他チームのマスを1つ奪える」権利
export type StealRight = { id: number; missionId: number; teamId: number; usedAt: number | null; position: number | null };

export type RoomState = {
  code: string;
  settings: RoomSettings;
  teams: Team[];
  participants: Participant[];
  card: Cell[]; // 個別カードでも全チーム同じ並び
  claims: Claim[];
  applications: Application[]; // 申請中のみ。古い順
  timeline: TimelineEntry[]; // 古い順
  startedAt: number | null; // ロビー（待機中）なら null
  endedAt: number | null; // 終了済みなら終了時刻
  missions: Mission[]; // 古い順
  stealRights: StealRight[];
  resultImages: ResultImage[]; // 終了時に各チーム1枚をランダムで選んだもの
  imagesDeletedAt: number | null; // 終了から24時間後に画像を削除した時刻
};

export type ResultImage = { teamId: number; imageId: string };

export function imageUrl(roomCode: string, imageId: string): string {
  return `/api/rooms/${roomCode}/images/${imageId}`;
}

// 1回の申請・提出で送れる画像の枚数
export function maxImagesFor(target: "cell" | MissionKind): number {
  return target === "quantity" ? MAX_QUANTITY_IMAGES : 1;
}

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
  | { type: "apply"; position: number; comment: string; imageIds: string[] } // 画像付きならコメントは空でもよい
  | { type: "approve"; applicationId: number }
  | { type: "reject"; applicationId: number; comment: string }
  | { type: "revoke"; teamId: number; position: number; reason: string }
  | { type: "end" }
  | { type: "start" }
  | { type: "closeMission"; missionId: number } // 制限時間より前に締め切る
  | { type: "startMission"; kind: MissionKind; title: string; minutes: number }
  | { type: "submitMission"; missionId: number; comment: string; imageIds: string[] }
  | { type: "approveMission"; submissionId: number }
  | { type: "rejectMission"; submissionId: number; comment: string }
  | { type: "scoreMission"; missionId: number; scores: TeamScore[] } // 量：各チームの数を入力
  | { type: "pickWinners"; missionId: number; teamIds: number[] } // 質：GM / 操作主が1位を決める
  | { type: "vote"; missionId: number; teamId: number }
  | { type: "closeVoting"; missionId: number }
  | { type: "steal"; rightId: number; position: number };

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
  return TEAM_PRESETS.slice(0, teamCount).map((t, id) => ({ id, name: t.name, hue: t.hue, color: `oklch(0.6 0.15 ${t.hue})` }));
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
  const qualityJudge = value.qualityJudge ?? "operator";
  if (qualityJudge !== "operator" && qualityJudge !== "vote") return null;
  const roomName = value.roomName === undefined ? DEFAULT_ROOM_NAME : normalizeRoomName(value.roomName);
  if (roomName === null) return null;
  return { hasGm, cardMode, cardSize, free, teamCount, targetBingo, autoEnd, qualityJudge, roomName };
}

// 空なら既定の名前。長すぎるものは null
export function normalizeRoomName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name.length === 0) return DEFAULT_ROOM_NAME;
  return charLength(name) <= MAX_ROOM_NAME_LENGTH ? name : null;
}

export function normalizeMissionTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title.length > 0 && charLength(title) <= MAX_MISSION_TITLE_LENGTH ? title : null;
}

function parseMissionKind(value: unknown): MissionKind | null {
  return MISSION_KINDS.find((k) => k === value) ?? null;
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

export function parseImageIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_QUANTITY_IMAGES) return null;
  const ids = value.filter((v): v is string => typeof v === "string" && IMAGE_ID_PATTERN.test(v));
  return ids.length === value.length && new Set(ids).size === ids.length ? ids : null;
}

// コメントは必須。ただし画像が付いていれば空でもよい
function parseCommentWithImages(comment: unknown, images: unknown): { comment: string; imageIds: string[] } | null {
  const imageIds = parseImageIds(images);
  if (!imageIds) return null;
  if (imageIds.length > 0 && (comment === undefined || (typeof comment === "string" && comment.trim() === ""))) {
    return { comment: "", imageIds };
  }
  const normalized = normalizeComment(comment);
  return normalized ? { comment: normalized, imageIds } : null;
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
  const imageIds = parseImageIds(value.imageIds);
  if (!isId(id) || !isPosition(position) || !isTeamId(teamId) || !isTime(createdAt) || !imageIds) return null;
  if (typeof participantName !== "string" || typeof comment !== "string") return null;
  return { id, position, teamId, participantName, comment, imageIds, createdAt };
}

function parseMissionEvent(value: Record<string, unknown>): TimelineEvent | null {
  const { missionId, title } = value;
  if (!isId(missionId) || typeof title !== "string") return null;
  switch (value.kind) {
    case "missionStarted": {
      const missionKind = parseMissionKind(value.missionKind);
      if (!missionKind || !isInt(value.minutes, MIN_MISSION_MINUTES, MAX_MISSION_MINUTES) || typeof value.byName !== "string") return null;
      return { kind: "missionStarted", missionId, missionKind, title, minutes: value.minutes, byName: value.byName };
    }
    case "missionSubmitted": {
      const imageIds = parseImageIds(value.imageIds);
      if (!isTeamId(value.teamId) || typeof value.participantName !== "string" || typeof value.comment !== "string" || !imageIds) return null;
      return {
        kind: "missionSubmitted",
        missionId,
        title,
        teamId: value.teamId,
        participantName: value.participantName,
        comment: value.comment,
        imageIds,
      };
    }
    case "missionRejected":
      if (!isTeamId(value.teamId) || typeof value.comment !== "string" || typeof value.auto !== "boolean") return null;
      return { kind: "missionRejected", missionId, title, teamId: value.teamId, comment: value.comment, auto: value.auto };
    case "missionResult": {
      const winners = parseList(value.winnerTeamIds, (v) => (isTeamId(v) ? v : null));
      return winners ? { kind: "missionResult", missionId, title, winnerTeamIds: winners } : null;
    }
    default:
      return null;
  }
}

function parseTimelineEvent(value: unknown): TimelineEvent | null {
  if (!isRecord(value)) return null;
  if (typeof value.kind === "string" && value.kind.startsWith("mission")) return parseMissionEvent(value);
  if (value.kind === "started") return typeof value.byName === "string" ? { kind: "started", byName: value.byName } : null;
  if (value.kind === "stolen") {
    const { teamId, fromTeamId, position, title } = value;
    if (!isTeamId(teamId) || !isTeamId(fromTeamId) || !isPosition(position) || typeof title !== "string") return null;
    return { kind: "stolen", teamId, fromTeamId, position, title };
  }
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
      const imageIds = parseImageIds(value.imageIds);
      if (typeof participantName !== "string" || typeof comment !== "string" || !imageIds) return null;
      return { kind: value.kind, teamId, participantName, position, title, comment, imageIds };
    }
    case "approved": {
      const participantName = typeof value.participantName === "string" ? value.participantName : "";
      return typeof value.byName === "string" ? { kind: "approved", teamId, position, title, byName: value.byName, participantName } : null;
    }
    case "rejected":
      if (typeof value.comment !== "string" || typeof value.auto !== "boolean") return null;
      return {
        kind: "rejected",
        teamId,
        position,
        title,
        comment: value.comment,
        auto: value.auto,
        participantName: typeof value.participantName === "string" ? value.participantName : "",
      };
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

function parseTeamScore(value: unknown): TeamScore | null {
  if (!isRecord(value) || !isTeamId(value.teamId) || !isInt(value.value, 0, Number.MAX_SAFE_INTEGER)) return null;
  return { teamId: value.teamId, value: value.value };
}

export function parseTeamScores(value: unknown): TeamScore[] | null {
  return parseList(value, parseTeamScore);
}

function parseMissionSubmission(value: unknown): MissionSubmission | null {
  if (!isRecord(value)) return null;
  const { id, teamId, participantName, comment, status, rejectComment, createdAt } = value;
  if (!isId(id) || !isTeamId(teamId) || typeof participantName !== "string" || typeof comment !== "string" || !isTime(createdAt)) return null;
  if (status !== "pending" && status !== "approved" && status !== "rejected" && status !== "accepted") return null;
  if (rejectComment !== null && typeof rejectComment !== "string") return null;
  const imageIds = parseImageIds(value.imageIds);
  if (!imageIds) return null;
  return { id, teamId, participantName, comment, imageIds, status, rejectComment, createdAt };
}

function parseMission(value: unknown): Mission | null {
  if (!isRecord(value)) return null;
  const { id, title, startedAt, endsAt, status } = value;
  const kind = parseMissionKind(value.kind);
  if (!isId(id) || !kind || typeof title !== "string" || !isTime(startedAt) || !isTime(endsAt)) return null;
  if (status !== "open" && status !== "judging" && status !== "voting" && status !== "done") return null;
  const submissions = parseList(value.submissions, parseMissionSubmission);
  const voterIds = parseList(value.voterIds, (v) => (typeof v === "string" ? v : null));
  const winnerTeamIds = parseList(value.winnerTeamIds, (v) => (isTeamId(v) ? v : null));
  const scores = value.scores === null ? null : parseTeamScores(value.scores);
  if (!submissions || !voterIds || !winnerTeamIds || (value.scores !== null && !scores)) return null;
  return { id, kind, title, startedAt, endsAt, status, submissions, voterIds, winnerTeamIds, scores };
}

function parseStealRight(value: unknown): StealRight | null {
  if (!isRecord(value)) return null;
  const { id, missionId, teamId, usedAt, position } = value;
  if (!isId(id) || !isId(missionId) || !isTeamId(teamId)) return null;
  if ((usedAt !== null && !isTime(usedAt)) || (position !== null && !isPosition(position))) return null;
  return { id, missionId, teamId, usedAt, position };
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
  if (!isInt(value.hue, 0, 360)) return null;
  return { id: value.id, name: value.name, color: value.color, hue: value.hue };
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
  const missions = parseList(value.missions, parseMission);
  const stealRights = parseList(value.stealRights, parseStealRight);
  const resultImages = parseList(value.resultImages, (v) =>
    isRecord(v) && isTeamId(v.teamId) && typeof v.imageId === "string" && IMAGE_ID_PATTERN.test(v.imageId)
      ? { teamId: v.teamId, imageId: v.imageId }
      : null,
  );
  if (!settings || !teams || !participants || !card || !claims || !applications || !timeline || !missions || !stealRights || !resultImages) {
    return null;
  }
  if (value.endedAt !== null && !isTime(value.endedAt)) return null;
  if (value.startedAt !== null && !isTime(value.startedAt)) return null;
  if (value.imagesDeletedAt !== null && !isTime(value.imagesDeletedAt)) return null;
  return {
    code: value.code,
    settings,
    teams,
    participants,
    card,
    claims,
    applications,
    timeline,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
    missions,
    stealRights,
    resultImages,
    imagesDeletedAt: value.imagesDeletedAt,
  };
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
      const body = parseCommentWithImages(data.comment, data.imageIds);
      if (!isPosition(data.position) || !body) return null;
      return { type: "apply", position: data.position, ...body };
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
    case "start":
      return { type: "start" };
    case "closeMission":
      return isId(data.missionId) ? { type: "closeMission", missionId: data.missionId } : null;
    case "startMission": {
      const kind = parseMissionKind(data.kind);
      const title = normalizeMissionTitle(data.title);
      if (!kind || !title || !isInt(data.minutes, MIN_MISSION_MINUTES, MAX_MISSION_MINUTES)) return null;
      return { type: "startMission", kind, title, minutes: data.minutes };
    }
    case "submitMission": {
      const body = parseCommentWithImages(data.comment, data.imageIds);
      if (!isId(data.missionId) || !body) return null;
      return { type: "submitMission", missionId: data.missionId, ...body };
    }
    case "approveMission":
      return isId(data.submissionId) ? { type: "approveMission", submissionId: data.submissionId } : null;
    case "rejectMission": {
      const comment = normalizeComment(data.comment);
      if (!isId(data.submissionId) || !comment) return null;
      return { type: "rejectMission", submissionId: data.submissionId, comment };
    }
    case "scoreMission": {
      const scores = parseTeamScores(data.scores);
      if (!isId(data.missionId) || !scores || scores.some((s) => s.value > MAX_MISSION_SCORE)) return null;
      return { type: "scoreMission", missionId: data.missionId, scores };
    }
    case "pickWinners": {
      const teamIds = parseList(data.teamIds, (v) => (isTeamId(v) ? v : null));
      if (!isId(data.missionId) || !teamIds || teamIds.length === 0 || new Set(teamIds).size !== teamIds.length) return null;
      return { type: "pickWinners", missionId: data.missionId, teamIds };
    }
    case "vote":
      return isId(data.missionId) && isTeamId(data.teamId) ? { type: "vote", missionId: data.missionId, teamId: data.teamId } : null;
    case "closeVoting":
      return isId(data.missionId) ? { type: "closeVoting", missionId: data.missionId } : null;
    case "steal":
      return isId(data.rightId) && isPosition(data.position) ? { type: "steal", rightId: data.rightId, position: data.position } : null;
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
