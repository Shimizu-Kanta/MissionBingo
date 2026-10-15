import type { CSSProperties } from "react";
import type { RoomState } from "../shared/types";
import { cellStatus } from "./cellStatus";

// マスにはタイトルだけを表示する。タップで詳細シートを開く
export function Board({
  room,
  viewTeamId,
  onSelect,
}: {
  room: RoomState;
  viewTeamId: number | null;
  onSelect: (position: number) => void;
}) {
  const size = room.settings.cardSize;
  return (
    <div className={`card-grid size-${size}`} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {room.card.map((cell) => {
        const status = cellStatus(room, cell.position, viewTeamId);
        const team = status.kind === "claimed" ? room.teams[status.teamId] : undefined;
        const style: CSSProperties | undefined = team ? { "--team-color": team.color } as CSSProperties : undefined;
        const label = cell.free ? "FREE" : cell.title;
        return (
          <button
            key={cell.position}
            type="button"
            className={`cell ${status.kind}`}
            style={style}
            onClick={() => onSelect(cell.position)}
            aria-label={`${label}（${STATUS_LABEL[status.kind]}${team ? `・${team.name}` : ""}）`}
          >
            {label}
            {status.kind === "pending" && <span className="cell-tag">申請中</span>}
          </button>
        );
      })}
    </div>
  );
}

const STATUS_LABEL = { free: "FREE", open: "未達成", pending: "申請中", claimed: "達成済み" } as const;
