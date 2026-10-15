import { useEffect, useState } from "react";
import { MAX_COMMENT_LENGTH, maxImagesFor, normalizeComment, type RoomState } from "../shared/types";
import { cellStatus } from "./cellStatus";
import { ImagePicker } from "./Images";
import { TeamName } from "./TeamBadge";

// マスの詳細シート：タイトル・詳細・状態・達成申請（GM / 操作主には取り消しも出す）
export function CellSheet({
  room,
  position,
  viewTeamId,
  canApply,
  canRevoke,
  canSteal = false,
  onApply,
  onRevoke,
  onSteal,
  onClose,
}: {
  room: RoomState;
  position: number;
  viewTeamId: number | null; // どのチームのカードとして見ているか
  canApply: boolean; // 自チームのカードを見ているプレイヤーだけ true
  canRevoke: boolean; // GM / 操作主だけ true
  canSteal?: boolean; // 自チームに未使用の奪取権があるとき true
  onApply: (comment: string, imageIds: string[]) => void;
  onRevoke: (teamId: number, reason: string) => void;
  onSteal?: () => void;
  onClose: () => void;
}) {
  const cell = room.card[position];
  const status = cellStatus(room, position, viewTeamId);

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
          {status.kind === "claimed" && (
            <>
              達成済み（<TeamName team={room.teams[status.teamId]} />）
            </>
          )}
        </p>

        {canApply && status.kind === "open" && !cell.free && (
          <ApplyForm
            roomCode={room.code}
            imageRequired={cell.imageRequired}
            submitLabel={room.settings.hasGm ? "達成申請" : "達成申請（すぐに取得）"}
            onSubmit={onApply}
          />
        )}
        {canSteal && onSteal && status.kind === "claimed" && status.teamId !== viewTeamId && (
          <p>
            <button type="button" className="primary" onClick={onSteal}>
              このマスを奪う
            </button>
          </p>
        )}
        {canRevoke && status.kind === "claimed" && (
          <CommentForm
            label="取り消しの理由（必須）"
            placeholder="取り消す理由を書いてください"
            submitLabel="このマスを取り消す"
            danger
            onSubmit={(reason) => onRevoke(status.teamId, reason)}
          />
        )}
      </section>
    </div>
  );
}

// 申請フォーム。コメントは必須、ただし画像を付けたら任意
export function ApplyForm({
  roomCode,
  imageRequired,
  maxImages = maxImagesFor("cell"),
  submitLabel,
  onSubmit,
}: {
  roomCode: string;
  imageRequired: boolean;
  maxImages?: number;
  submitLabel: string;
  onSubmit: (comment: string, imageIds: string[]) => void;
}) {
  const [comment, setComment] = useState("");
  const [imageIds, setImageIds] = useState<string[]>([]);
  const normalized = normalizeComment(comment);
  const hasImage = imageIds.length > 0;
  const commentOk = normalized !== null || (hasImage && comment.trim() === "");
  const canSubmit = commentOk && (!imageRequired || hasImage);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(normalized ?? "", imageIds);
      }}
    >
      <ImagePicker roomCode={roomCode} max={maxImages} required={imageRequired} value={imageIds} onChange={setImageIds} />
      <label className="field">
        コメント（{hasImage ? "任意" : "必須"}）
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          rows={2}
          placeholder="何をしたか書いてください"
        />
      </label>
      <button type="submit" className="primary" disabled={!canSubmit}>
        {submitLabel}
      </button>
    </form>
  );
}

function CommentForm({
  label,
  placeholder,
  submitLabel,
  danger = false,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  submitLabel: string;
  danger?: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const normalized = normalizeComment(text);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized) onSubmit(normalized);
      }}
    >
      <label className="field">
        {label}
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_COMMENT_LENGTH} rows={3} placeholder={placeholder} />
      </label>
      <button type="submit" className={danger ? "danger" : "primary"} disabled={!normalized}>
        {submitLabel}
      </button>
    </form>
  );
}
