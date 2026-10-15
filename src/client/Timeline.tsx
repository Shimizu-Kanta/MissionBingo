import type { ReactNode } from "react";
import type { RoomState, TimelineEvent } from "../shared/types";
import { formatTime } from "./format";
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
  if (event.kind === "ended") return describeEnding(room, event);
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
