import type { CSSProperties } from "react";
import { countBingos, openedPositions } from "../shared/game";
import type { RoomState, Team } from "../shared/types";
import { TeamName } from "./TeamBadge";

// 他チームの進捗を見るための簡易カード。取得マスの色分けとライン数・マス数だけを出す
export function MiniCard({ room, team }: { room: RoomState; team: Team }) {
  const size = room.settings.cardSize;
  const claimed = new Set(room.claims.filter((c) => c.teamId === team.id).map((c) => c.position));
  const bingos = countBingos(size, openedPositions(room.card, room.claims, team.id));

  return (
    <div className="mini-card" style={{ "--team-color": team.color } as CSSProperties}>
      <div className="mini-grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }} aria-hidden>
        {room.card.map((cell) => (
          <span key={cell.position} className={cell.free ? "free" : claimed.has(cell.position) ? "claimed" : undefined} />
        ))}
      </div>
      <div>
        <p className="mini-name">
          <TeamName team={team} />
        </p>
        <p className="hint">
          {bingos}ライン ・ {claimed.size}マス
        </p>
      </div>
    </div>
  );
}
