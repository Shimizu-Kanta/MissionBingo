import type { ReactNode } from "react";
import type { RoomState, TimelineEvent } from "../shared/types";
import { formatTime } from "./format";
import { MISSION_KIND_LABEL } from "./MissionPanel";
import { TeamName } from "./TeamBadge";

// 全員が見られる出来事の一覧。新しいものを上に出す
export function Timeline({ room }: { room: RoomState }) {
  const entries = [...room.timeline].reverse();
  return (
    <section>
      <h2>タイムライン</h2>
      {entries.length === 0 ? (
        <p className="hint">まだ出来事はありません</p>
      ) : (
        <ol className="timeline">
          {entries.map((entry) => (
            <li key={entry.id} className={`timeline-item ${entry.event.kind}`}>
              <time>{formatTime(entry.at)}</time>
              <span>{describe(room, entry.event)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function describeEnding(room: RoomState, event: Extract<TimelineEvent, { kind: "ended" }>): ReactNode {
  switch (event.reason) {
    case "manual":
      return <>{event.byName} がゲームを終了しました</>;
    case "target":
      return (
        <>
          <TeamName team={room.teams[event.teamId]} /> が目標の {room.settings.targetBingo} ビンゴに到達し、ゲームが終了しました
        </>
      );
    case "full":
      return <>全マスが埋まったため、ゲームが終了しました</>;
  }
}

function describe(room: RoomState, event: TimelineEvent): ReactNode {
  switch (event.kind) {
    case "ended":
      return describeEnding(room, event);
    case "missionStarted":
      return (
        <>
          特別ミッション（{MISSION_KIND_LABEL[event.missionKind]}・{event.minutes}分）発生：「{event.title}」
        </>
      );
    case "missionSubmitted":
      return (
        <>
          <TeamName team={room.teams[event.teamId]} /> {event.participantName} が特別ミッション「{event.title}」に提出：{event.comment}
        </>
      );
    case "missionRejected":
      return (
        <>
          <TeamName team={room.teams[event.teamId]} /> の特別ミッション「{event.title}」への提出が却下{event.auto ? "（自動）" : ""}：{event.comment}
        </>
      );
    case "missionResult":
      return event.winnerTeamIds.length === 0 ? (
        <>特別ミッション「{event.title}」は1位なしで終了</>
      ) : (
        <>
          特別ミッション「{event.title}」の1位：
          {event.winnerTeamIds.map((id, i) => (
            <span key={id}>
              {i > 0 && "・"}
              <TeamName team={room.teams[id]} />
            </span>
          ))}
          （マスを1つ奪えます）
        </>
      );
    case "stolen":
      return (
        <>
          <TeamName team={room.teams[event.teamId]} /> が <TeamName team={room.teams[event.fromTeamId]} /> から「{event.title}」を奪取
        </>
      );
  }
  const team = <TeamName team={room.teams[event.teamId]} />;
  switch (event.kind) {
    case "revoked":
      return (
        <>
          {team} の「{event.title}」を {event.byName} が取り消し：{event.reason}
        </>
      );
    case "applied":
      return (
        <>
          {team} {event.participantName} が「{event.title}」をチャットで申請：{event.comment}
        </>
      );
    case "claimed":
      return (
        <>
          {team} {event.participantName} が「{event.title}」を達成：{event.comment}
        </>
      );
    case "approved":
      return (
        <>
          {team} の「{event.title}」を {event.byName} が許可
        </>
      );
    case "rejected":
      return (
        <>
          {team} の「{event.title}」が却下{event.auto ? "（自動）" : ""}：{event.comment}
        </>
      );
  }
}
