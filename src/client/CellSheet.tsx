import { useEffect, useState } from "react";
import { MAX_COMMENT_LENGTH, normalizeComment, type RoomState } from "../shared/types";
import { cellStatus } from "./cellStatus";
import { TeamName } from "./TeamBadge";

// マスの詳細シート：タイトル・詳細・状態・達成申請
export function CellSheet({
  room,
  position,
  viewTeamId,
  canApply,
  onApply,
  onClose,
}: {
  room: RoomState;
  position: number;
  viewTeamId: number | null;
  canApply: boolean; // GM・閲覧専用のときは false
  onApply: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");
  const cell = room.card[position];
  const status = cellStatus(room, position, viewTeamId);
  const normalized = normalizeComment(comment);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!cell) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="sheet-close link" onClick={onClose} aria-label="閉じる">
          ✕
        </button>
        <h2 id="sheet-title">{cell.free ? "FREE" : cell.title}</h2>
        {!cell.free && cell.detail !== null && <p className="sheet-detail">{cell.detail}</p>}
        {!cell.free && cell.imageRequired && <p className="tag">画像必須</p>}

        <p className="sheet-status">
          状態：
          {status.kind === "free" && "全チーム共通の達成済みマス"}
          {status.kind === "open" && "未達成"}
          {status.kind === "pending" && "申請中（GM の確認待ち）"}
          {status.kind === "claimed" &&
            (status.teamId === viewTeamId || room.settings.cardMode === "individual" ? (
              "達成済み"
            ) : (
              <>
                達成済み（<TeamName team={room.teams[status.teamId]} />）
              </>
            ))}
        </p>

        {canApply && status.kind === "open" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (normalized) onApply(normalized);
            }}
          >
            <label className="field">
              コメント（必須）
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                rows={3}
                placeholder="何をしたか書いてください"
              />
            </label>
            <button type="submit" className="primary" disabled={!normalized}>
              {room.settings.hasGm ? "達成申請" : "達成申請（すぐに取得）"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
