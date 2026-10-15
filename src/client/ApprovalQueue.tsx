import { useState } from "react";
import { MAX_COMMENT_LENGTH, normalizeComment, type Application, type RoomState } from "../shared/types";
import { formatTime } from "./format";
import { TeamName } from "./TeamBadge";

// GM の承認画面。申請時刻の古い順に、許可 / 却下（コメント必須）だけを置く
export function ApprovalQueue({
  room,
  onApprove,
  onReject,
}: {
  room: RoomState;
  onApprove: (applicationId: number) => void;
  onReject: (applicationId: number, comment: string) => void;
}) {
  return (
    <section>
      <h2>確認待ちの申請（{room.applications.length}件）</h2>
      {room.applications.length === 0 ? (
        <p className="hint">申請はありません</p>
      ) : (
        <ol className="queue">
          {room.applications.map((app) => (
            <ApprovalItem key={app.id} room={room} app={app} onApprove={onApprove} onReject={onReject} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ApprovalItem({
  room,
  app,
  onApprove,
  onReject,
}: {
  room: RoomState;
  app: Application;
  onApprove: (applicationId: number) => void;
  onReject: (applicationId: number, comment: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const normalized = normalizeComment(comment);
  const cell = room.card[app.position];

  return (
    <li className="queue-item">
      <p className="queue-head">
        <time>{formatTime(app.createdAt)}</time> <TeamName team={room.teams[app.teamId]} /> {app.participantName}
      </p>
      <p className="queue-cell">「{cell && !cell.free ? cell.title : "?"}」</p>
      <p className="queue-comment">{app.comment}</p>
      {rejecting ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (normalized) onReject(app.id, normalized);
          }}
        >
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="却下の理由（必須）"
            aria-label="却下の理由"
            autoFocus
          />
          <div className="row-actions">
            <button type="submit" className="danger" disabled={!normalized}>
              却下する
            </button>
            <button type="button" onClick={() => setRejecting(false)}>
              やめる
            </button>
          </div>
        </form>
      ) : (
        <div className="row-actions">
          <button type="button" className="primary" onClick={() => onApprove(app.id)}>
            許可
          </button>
          <button type="button" onClick={() => setRejecting(true)}>
            却下
          </button>
        </div>
      )}
    </li>
  );
}
