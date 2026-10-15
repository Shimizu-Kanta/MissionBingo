import { useState } from "react";
import { MAX_COMMENT_LENGTH, normalizeComment, type RoomState } from "../shared/types";
import { cellLabel, lineCells, ownerAt, pendingAt, revokeReason, rowCol } from "./derive";
import { INK, MUTED, SOFT, c2, c3 } from "./theme";
import { CloseButton, Modal } from "./ui";

const QUICK_CANCEL = ["写真がお題と違っていました", "誤って許可しました", "ルール違反がありました"];

// operator は GMなしの操作主（プレイヤーとして申請でき、取り消しもできる）
export type SheetMode = "player" | "moderator" | "operator" | "readonly";

// マスの詳細シート：タイトル・状態・詳細と、申請 / 取り消しの入口
export function CellSheet({
  room,
  position,
  viewTeamId,
  myTeamId,
  mode,
  onApply,
  onRevoke,
  onClose,
}: {
  room: RoomState;
  position: number;
  viewTeamId: number | null;
  myTeamId: number | null;
  mode: SheetMode;
  onApply: () => void;
  onRevoke: (teamId: number, reason: string) => void;
  onClose: () => void;
}) {
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState("");
  const cell = room.card[position];
  if (!cell) return null;

  const shared = room.settings.cardMode === "shared";
  const owner = cell.free ? null : ownerAt(room, position, viewTeamId);
  const ownerTeam = owner !== null ? room.teams[owner] : undefined;
  const inLine = owner !== null && lineCells(room, owner).has(position);
  const plays = mode === "player" || mode === "operator";
  const moderates = mode === "moderator" || mode === "operator";
  const pending = mode === "readonly" || cell.free ? [] : pendingAt(room, position, viewTeamId);
  const myPending = plays && pending.some((a) => a.teamId === myTeamId);
  const cancelNote = owner === null && !cell.free ? revokeReason(room, position, viewTeamId) : null;
  const viewTeam = viewTeamId !== null ? room.teams[viewTeamId] : undefined;

  let status: string;
  let pill: { bg: string; fg: string };
  if (cell.free) {
    status = "FREE · 最初から開いています";
    pill = { bg: INK, fg: "#fff" };
  } else if (ownerTeam) {
    status = `${ownerTeam.name}が取得済み${inLine ? " · ビンゴライン" : ""}`;
    pill = { bg: c2(ownerTeam.hue), fg: c3(ownerTeam.hue) };
  } else if (pending.length > 0) {
    status = pending.length > 1 ? `申請中 ×${pending.length}` : "申請中";
    pill = { bg: SOFT, fg: INK };
  } else {
    status = "未取得";
    pill = { bg: SOFT, fg: MUTED };
  }

  let note = "";
  if (plays && shared && ownerTeam && owner !== myTeamId) note = "他チームが取得済みです。特別ミッションで1位になると奪えます";
  if (mode === "moderator" && room.settings.hasGm && !ownerTeam && !cell.free) note = "GMはマスを申請できません。取得済みのマスは取り消しできます";

  const canApply = plays && !cell.free && !ownerTeam && !myPending && (shared || viewTeamId === myTeamId);
  const canCancel = moderates && ownerTeam !== undefined;
  const normalizedReason = normalizeComment(reason);

  return (
    <Modal onClose={onClose} label="マスの詳細">
      <div className="modal-head">
        <div className="stack">
          <span className="modal-kicker">
            {shared ? "共有カード" : `${viewTeam?.name ?? ""}のカード`} · {rowCol(room, position)}
          </span>
          <span className="modal-title lg">{cellLabel(cell)}</span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="status-pills">
        <span className="status-pill" style={{ background: pill.bg, color: pill.fg }}>
          {status}
        </span>
        {!cell.free && cell.imageRequired && <span className="status-pill outline">画像必須</span>}
      </div>
      {!cell.free && cell.detail && <div className="detail-box">{cell.detail}</div>}
      {cancelNote && (
        <div className="cancel-note">
          {room.settings.hasGm ? "GM" : "操作主"}が取得を取り消しました：{cancelNote}（再挑戦できます）
        </div>
      )}
      {note && <div className="sheet-note">{note}</div>}

      {canApply && (
        <button type="button" className="btn primary lg" onClick={onApply}>
          申請する
        </button>
      )}
      {myPending && <div className="waiting-box">GMの確認待ち</div>}

      {canCancel &&
        ownerTeam &&
        (canceling ? (
          <div className="cancel-form">
            <div className="label" style={{ fontSize: 12 }}>
              取り消し理由（必須・プレイヤーに表示されます）
            </div>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_COMMENT_LENGTH}
              placeholder="例：写真がお題と違っていました"
              aria-label="取り消し理由"
            />
            <div className="quick">
              {QUICK_CANCEL.map((q) => (
                <button key={q} type="button" onClick={() => setReason(q)}>
                  {q}
                </button>
              ))}
            </div>
            <div className="hint">取り消し後、このマスは未取得に戻り再挑戦できます。</div>
            <div className="two-buttons lg">
              <button type="button" className="btn" onClick={() => setCanceling(false)}>
                やめる
              </button>
              <button
                type="button"
                className={`btn danger${normalizedReason ? "" : " off"}`}
                onClick={() => normalizedReason && onRevoke(ownerTeam.id, normalizedReason)}
              >
                取り消す
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn danger-outline" style={{ height: 46, borderRadius: 11 }} onClick={() => setCanceling(true)}>
            このマスの取得を取り消す
          </button>
        ))}
    </Modal>
  );
}
