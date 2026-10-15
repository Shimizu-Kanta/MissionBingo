// 画面に出す値を RoomState から計算する（表示専用。状態を変えるのは RoomDO だけ）
import { bingoLines, computeStandings, openedPositions, type Standing } from "../shared/game";
import type { Application, Cell, MissionKind, Participant, RoomState, Team, TimelineEntry, TimelineEvent } from "../shared/types";
import { INK, SOFT, c1, formatClock } from "./theme";

export function standingsOf(room: RoomState): Standing[] {
  return computeStandings(room.settings.cardSize, room.card, room.claims, room.teams);
}

export function bingosOf(room: RoomState, teamId: number): number {
  return standingsOf(room).find((s) => s.teamId === teamId)?.bingos ?? 0;
}

// そのチームのビンゴ成立ライン上にあるマス
export function lineCells(room: RoomState, teamId: number): Set<number> {
  const opened = openedPositions(room.card, room.claims, teamId);
  const set = new Set<number>();
  for (const line of bingoLines(room.settings.cardSize)) {
    if (line.every((p) => opened.has(p))) for (const p of line) set.add(p);
  }
  return set;
}

// 見ているカードで、そのマスを持っているチーム（共有カードは誰が持っていても表示）
export function ownerAt(room: RoomState, position: number, viewTeamId: number | null): number | null {
  const shared = room.settings.cardMode === "shared";
  const claim = room.claims.find((c) => c.position === position && (shared || c.teamId === viewTeamId));
  return claim ? claim.teamId : null;
}

export function pendingAt(room: RoomState, position: number, viewTeamId: number | null): Application[] {
  const shared = room.settings.cardMode === "shared";
  return room.applications.filter((a) => a.position === position && (shared || a.teamId === viewTeamId));
}

// 取り消された後まだ取り直されていないマスなら、その理由
export function revokeReason(room: RoomState, position: number, teamId: number | null): string | null {
  for (let i = room.timeline.length - 1; i >= 0; i--) {
    const e = room.timeline[i].event;
    if (!("position" in e) || e.position !== position) continue;
    if (teamId !== null && room.settings.cardMode === "individual" && "teamId" in e && e.teamId !== teamId) continue;
    if (e.kind === "approved" || e.kind === "claimed" || e.kind === "stolen") return null;
    if (e.kind === "revoked") return e.reason;
  }
  return null;
}

export function cellLabel(cell: Cell): string {
  return cell.free ? "FREE" : cell.title;
}

export function rowCol(room: RoomState, position: number): string {
  const n = room.settings.cardSize;
  return `${Math.floor(position / n) + 1}行${(position % n) + 1}列`;
}

export function masterLabel(room: RoomState): string {
  return room.settings.hasGm ? "GM" : "操作主";
}

export function modeLabel(room: RoomState): string {
  const s = room.settings;
  return `${s.hasGm ? "GMあり" : "GMなし"} · ${s.cardMode === "shared" ? "共有" : "個別"} · ${s.cardSize}×${s.cardSize} · ${s.targetBingo}ライン先取`;
}

export function settingChips(room: RoomState): string[] {
  const s = room.settings;
  const chips = [
    s.hasGm ? "GMあり" : "GMなし",
    s.cardMode === "shared" ? "共有カード" : "個別カード",
    `${s.cardSize}×${s.cardSize}`,
    s.free ? "FREEあり" : "FREEなし",
    `${s.teamCount}チーム`,
    `${s.targetBingo}ライン先取`,
  ];
  if (s.cardMode === "shared") chips.push(s.autoEnd ? "全マスで自動終了" : "自動終了なし");
  if (s.cardMode === "shared" && !s.hasGm) chips.push(s.qualityJudge === "vote" ? "「質」は全員投票" : "「質」は操作主が判定");
  return chips;
}

export function teamNames(room: RoomState, ids: number[]): string {
  return ids.map((id) => room.teams[id]?.name ?? "?").join("・");
}

// ---- 特別ミッション ----
export const MISSION_INFO: Record<MissionKind, { label: string; ex: string; placeholder: string }> = {
  speed: { label: "速さ", ex: "一番早く〇〇", placeholder: "一番早く「赤い自販機」を撮影" },
  quantity: { label: "量", ex: "一番多く〇〇", placeholder: "「黄色いもの」を一番多く撮影" },
  quality: { label: "質", ex: "一番綺麗な〇〇", placeholder: "一番綺麗な「空」の写真" },
};

export function missionRule(kind: MissionKind, hasGm: boolean): string {
  switch (kind) {
    case "speed":
      return hasGm ? "最初に許可された申請が勝ち" : "最初に提出したチームが勝ち";
    case "quantity":
      return "制限時間内の数を比較";
    case "quality":
      return "画像必須";
  }
}

export function missionJudge(room: RoomState, kind: MissionKind): string {
  if (room.settings.hasGm) return "GM";
  if (kind === "quality" && room.settings.qualityJudge === "vote") return "全員投票（自チームへの投票は不可）";
  return "操作主";
}

// ---- タイムライン ----
export type TimelineKind = "start" | "apply" | "ok" | "get" | "ng" | "cancel" | "special" | "steal" | "bingo" | "end";

export const KIND_STYLE: Record<TimelineKind, { label: string; bg: string; fg: string }> = {
  start: { label: "開始", bg: SOFT, fg: INK },
  apply: { label: "申請", bg: SOFT, fg: INK },
  ok: { label: "許可", bg: "oklch(0.94 0.04 150)", fg: "oklch(0.38 0.1 150)" },
  get: { label: "取得", bg: "oklch(0.94 0.04 150)", fg: "oklch(0.38 0.1 150)" },
  ng: { label: "却下", bg: "oklch(0.94 0.04 25)", fg: "oklch(0.45 0.14 25)" },
  cancel: { label: "取り消し", bg: "oklch(0.95 0.04 70)", fg: "oklch(0.42 0.09 70)" },
  special: { label: "特別ミッション", bg: INK, fg: "#fff" },
  steal: { label: "奪取", bg: INK, fg: "#fff" },
  bingo: { label: "ビンゴ", bg: "oklch(0.9 0.08 85)", fg: "oklch(0.38 0.09 70)" },
  end: { label: "終了", bg: INK, fg: "#fff" },
};

export type TimelineView = {
  kind: TimelineKind;
  teamId: number | null;
  text: string;
  note: { label: string; text: string; tone: "gm" | "reason" } | null;
  chat: string | null;
  imageIds: string[];
};

export function describeEvent(room: RoomState, event: TimelineEvent): TimelineView {
  const master = masterLabel(room);
  const team = (id: number) => room.teams[id]?.name ?? "?";
  const base = { note: null, chat: null, imageIds: [] as string[] };
  switch (event.kind) {
    case "started":
      return {
        ...base,
        kind: "start",
        teamId: null,
        text: `ゲーム開始（${room.settings.hasGm ? "GMあり" : "GMなし"}・${room.settings.cardMode === "shared" ? "共有カード" : "個別カード"}・${room.settings.cardSize}×${room.settings.cardSize}）`,
      };
    case "applied":
      return {
        ...base,
        kind: "apply",
        teamId: event.teamId,
        text: `${event.participantName}が「${event.title}」を${event.imageIds.length > 0 ? "画像" : "チャット"}で申請`,
        chat: event.comment || null,
        imageIds: event.imageIds,
      };
    case "claimed":
      return {
        ...base,
        kind: "get",
        teamId: event.teamId,
        text: `${event.participantName}が「${event.title}」を取得`,
        chat: event.comment || null,
        imageIds: event.imageIds,
      };
    case "approved":
      return {
        ...base,
        kind: "ok",
        teamId: event.teamId,
        text: `${master}が${event.participantName || team(event.teamId)}の「${event.title}」を許可`,
      };
    case "rejected":
      return {
        ...base,
        kind: "ng",
        teamId: event.teamId,
        text: `${event.auto ? "" : master + "が"}${event.participantName || team(event.teamId)}の「${event.title}」を${event.auto ? "締め切り" : "却下"}`,
        note: { label: event.auto ? "" : `${master}：`, text: event.comment, tone: "gm" },
      };
    case "revoked":
      return {
        ...base,
        kind: "cancel",
        teamId: event.teamId,
        text: `${master}が${team(event.teamId)}の「${event.title}」の取得を取り消し（再挑戦可）`,
        note: { label: "理由：", text: event.reason, tone: "reason" },
      };
    case "missionStarted":
      return {
        ...base,
        kind: "special",
        teamId: null,
        text: `特別ミッション発生【${MISSION_INFO[event.missionKind].label}】${event.title}（制限${event.minutes}分）`,
      };
    case "missionSubmitted":
      return {
        ...base,
        kind: "apply",
        teamId: event.teamId,
        text: `${event.participantName}が特別ミッションに${event.imageIds.length > 0 ? "写真を" : ""}提出（${event.title}）`,
        chat: event.comment || null,
        imageIds: event.imageIds,
      };
    case "missionRejected":
      return {
        ...base,
        kind: "ng",
        teamId: event.teamId,
        text: `${team(event.teamId)}の特別ミッションへの提出を${event.auto ? "締め切り" : "却下"}（${event.title}）`,
        note: { label: event.auto ? "" : `${master}：`, text: event.comment, tone: "gm" },
      };
    case "missionResult":
      return {
        ...base,
        kind: "special",
        teamId: event.winnerTeamIds[0] ?? null,
        text:
          event.winnerTeamIds.length === 0
            ? `特別ミッションは1位なしで終了（${event.title}）`
            : `特別ミッション結果：${teamNames(room, event.winnerTeamIds)}が1位${event.winnerTeamIds.length > 1 ? "（同票）" : ""}`,
      };
    case "stolen":
      return {
        ...base,
        kind: "steal",
        teamId: event.teamId,
        text: `${team(event.teamId)}が「${event.title}」を${team(event.fromTeamId)}から奪取`,
      };
    case "ended":
      if (event.reason === "target") {
        return {
          ...base,
          kind: "bingo",
          teamId: event.teamId,
          text: `${team(event.teamId)}が${room.settings.targetBingo}ラインのビンゴを達成！ ゲーム終了`,
        };
      }
      return {
        ...base,
        kind: "end",
        teamId: null,
        text: event.reason === "full" ? "全マスが埋まったためゲーム終了" : `${master}がゲームを終了`,
      };
  }
}

// ---- 結果 ----
export type Hero = { label: string; title: string; sub: string; color: string; winnerIds: number[] };

export function heroOf(room: RoomState): Hero {
  const standings = standingsOf(room);
  const ending = [...room.timeline].reverse().find((e) => e.event.kind === "ended")?.event;
  const top = standings.filter((s) => s.rank === 1).map((s) => s.teamId);
  const span = `${room.startedAt ? formatClock(room.startedAt, false) : "--:--"} – ${room.endedAt ? formatClock(room.endedAt, false) : "--:--"}`;
  if (ending?.kind === "ended" && ending.reason === "target") {
    const t = room.teams[ending.teamId];
    return {
      label: "WINNER",
      title: `${t?.name ?? "?"}の勝利`,
      sub: `${room.settings.targetBingo}ライン先取 · ${span}`,
      color: t ? c1(t.hue) : INK,
      winnerIds: [ending.teamId],
    };
  }
  const first = room.teams[top[0] ?? 0];
  const title = `${teamNames(room, top)}が1位`;
  if (ending?.kind === "ended" && ending.reason === "full") {
    return { label: "ALL CLEAR", title, sub: `全マスが埋まり自動終了 · ${span}`, color: first ? c1(first.hue) : INK, winnerIds: top };
  }
  return { label: "GAME OVER", title, sub: `${masterLabel(room)}がゲームを終了 · ${span}`, color: first ? c1(first.hue) : INK, winnerIds: top };
}

export function resultStats(room: RoomState): { label: string; value: number }[] {
  const count = (kinds: TimelineEvent["kind"][]) => room.timeline.filter((e) => kinds.includes(e.event.kind)).length;
  return [
    { label: "申請", value: count(["applied", "claimed"]) },
    { label: "却下", value: room.timeline.filter((e) => e.event.kind === "rejected" && !e.event.auto).length },
    { label: "取り消し", value: count(["revoked"]) },
  ];
}

// 画像がどのお題のものか（写真ハイライトの見出し）
export function imageCaption(room: RoomState, imageId: string): string {
  for (const entry of room.timeline) {
    const e = entry.event;
    if ("imageIds" in e && e.imageIds.includes(imageId)) return e.title;
  }
  return "特別ミッション";
}

// 結果画像に載せるタイムライン抜粋（新しい順に3件）
export function keyEvents(room: RoomState): { time: string; text: string }[] {
  const keep: TimelineEvent["kind"][] = ["ended", "stolen", "missionResult", "approved", "claimed", "missionStarted"];
  return [...room.timeline]
    .reverse()
    .filter((e: TimelineEntry) => keep.includes(e.event.kind))
    .slice(0, 3)
    .map((e) => ({ time: formatClock(e.at, false), text: describeEvent(room, e.event).text }));
}

export function membersOf(room: RoomState, team: Team): Participant[] {
  return room.participants.filter((p) => p.teamId === team.id);
}
