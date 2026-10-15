import { computeStandings } from "../shared/game";
import type { RoomState } from "../shared/types";
import { TeamName } from "./TeamBadge";

export function Standings({ room, myTeamId }: { room: RoomState; myTeamId: number | null }) {
  const standings = computeStandings(room.settings.cardSize, room.card, room.claims, room.teams);
  return (
    <section>
      <h2>順位（目標 {room.settings.targetBingo} ビンゴ）</h2>
      <table className="standings">
        <thead>
          <tr>
            <th>順位</th>
            <th>チーム</th>
            <th>ビンゴ</th>
            <th>マス</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.teamId} className={s.teamId === myTeamId ? "mine" : undefined}>
              <td>{s.rank}位</td>
              <td>
                <TeamName team={room.teams[s.teamId]} />
              </td>
              <td>{s.bingos}</td>
              <td>{s.cells}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
