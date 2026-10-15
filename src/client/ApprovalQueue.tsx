import { useState } from "react";
import { MAX_COMMENT_LENGTH, imageUrl, normalizeComment, type ClientMessage, type RoomState } from "../shared/types";
import { cellLabel } from "./derive";
import { c1, formatClock } from "./theme";

const QUICK_REJECT = ["写真がぼやけています", "お題と違うようです", "全員写っていません"];

type QueueItem = {
  key: string;
  teamId: number;
  who: string;
  time: number;
  target: string;
  comment: string;
  imageIds: string[];
  conflictWith: string | null;
  approve: ClientMessage;
  reject: (comment: string) => ClientMessage;
};

// GM の承認待ち。通常マスの申請と、速さミッションの提出を申請時刻の古い順に並べる
export function ApprovalQueue({ room, send }: { room: RoomState; send: (message: ClientMessage) => boolean }) {
  const shared = room.settings.cardMode === "shared";
  const items: QueueItem[] = [
    ...room.applications.map((a) => {
      const cell = room.card[a.position];
      const earlier = shared ? room.applications.find((b) => b.id < a.id && b.position === a.position) : undefined;
      return {
        key: `a${a.id}`,
        teamId: a.teamId,
        who: a.participantName,
        time: a.createdAt,
        target: cell ? cellLabel(cell) : "?",
        comment: a.comment,
        imageIds: a.imageIds,
        conflictWith: earlier ? earlier.participantName : null,
        approve: { type: "approve", applicationId: a.id } satisfies ClientMessage,
        reject: (comment: string): ClientMessage => ({ type: "reject", applicationId: a.id, comment }),
      };
    }),
    ...room.missions.flatMap((m) =>
      m.submissions
        .filter((s) => s.status === "pending")
        .map((s) => ({
          key: `m${s.id}`,
          teamId: s.teamId,
          who: s.participantName,
          time: s.createdAt,
          target: `特別ミッション：${m.title}`,
          comment: s.comment,
          imageIds: s.imageIds,
          conflictWith: null,
          approve: { type: "approveMission", submissionId: s.id } satisfies ClientMessage,
          reject: (comment: string): ClientMessage => ({ type: "rejectMission", submissionId: s.id, comment }),
        })),
    ),
  ].sort((x, y) => x.time - y.time);

  return (
    <section className="side-panel" aria-label="承認待ち">
      <div className="head">
        <b>承認待ち</b>
        <span className="count-badge">{items.length}</span>
      </div>
      <div className="queue">
        {items.length === 0 && <div className="empty">承認待ちの申請はありません</div>}
        {items.map((item) => (
          <QueueCard key={item.key} room={room} item={item} send={send} />
        ))}
      </div>
    </section>
  );
}

function QueueCard({ room, item, send }: { room: RoomState; item: QueueItem; send: (message: ClientMessage) => boolean }) {
  const [rejecting, setRejecting] = useState(false);
  const [text, setText] = useState("");
  const team = room.teams[item.teamId];
  const normalized = normalizeComment(text);
  const isImage = item.imageIds.length > 0;

  return (
    <div className="q-item">
      <div className="who">
        <span>
          <span className="team-dot" style={{ width: 9, height: 9, background: team ? c1(team.hue) : "transparent" }} />
          <b>{item.who}</b>
          <span className="team">{team?.name}</span>
        </span>
        <span className="time">{formatClock(item.time)}</span>
      </div>
      <div className="mission">
        「{item.target}」<span> · {isImage ? "画像申請" : "チャット申請"}</span>
      </div>
      {isImage &&
        (room.imagesDeletedAt !== null ? (
          <span className="photo-gone">画像は削除されました</span>
        ) : (
          item.imageIds.map((id) => (
            <a key={id} href={imageUrl(room.code, id)} target="_blank" rel="noreferrer">
              <img className="photo" src={imageUrl(room.code, id)} alt="申請画像" />
            </a>
          ))
        ))}
      {item.comment && <div className="chat">{item.comment}</div>}
      {item.conflictWith && <div className="conflict">同じマスに先着の申請あり（{item.conflictWith}）。先着から確認します</div>}
      {rejecting ? (
        <div className="reject">
          <textarea
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="却下の理由（プレイヤーに表示されます）"
            aria-label="却下の理由"
          />
          <div className="quick">
            {QUICK_REJECT.map((q) => (
              <button key={q} type="button" onClick={() => setText(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="two-buttons">
            <button type="button" className="btn" onClick={() => setRejecting(false)}>
              キャンセル
            </button>
            <button type="button" className={`btn danger${normalized ? "" : " off"}`} disabled={!normalized} onClick={() => normalized && send(item.reject(normalized))}>
              却下して返す
            </button>
          </div>
        </div>
      ) : (
        <div className="two-buttons">
          <button type="button" className="btn" onClick={() => setRejecting(true)}>
            却下
          </button>
          <button type="button" className="btn primary" onClick={() => send(item.approve)}>
            許可
          </button>
        </div>
      )}
    </div>
  );
}
