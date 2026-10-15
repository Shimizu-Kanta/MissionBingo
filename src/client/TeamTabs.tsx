import type { Team } from "../shared/types";
import { TeamName } from "./TeamBadge";

// 個別カードでチームのカードを切り替えるタブ
export function TeamTabs({
  teams,
  selected,
  myTeamId,
  onSelect,
}: {
  teams: Team[];
  selected: number;
  myTeamId: number | null;
  onSelect: (teamId: number) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {teams.map((team) => (
        <button
          key={team.id}
          type="button"
          role="tab"
          aria-selected={team.id === selected}
          className={team.id === selected ? "tab active" : "tab"}
          onClick={() => onSelect(team.id)}
        >
          <TeamName team={team} />
          {team.id === myTeamId && "（自チーム）"}
        </button>
      ))}
    </div>
  );
}
