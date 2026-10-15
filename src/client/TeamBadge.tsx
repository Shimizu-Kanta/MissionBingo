import type { Team } from "../shared/types";

export function TeamBadge({ color }: { color: string }) {
  return <span aria-hidden className="team-badge" style={{ background: color }} />;
}

export function TeamName({ team }: { team: Team | undefined }) {
  if (!team) return <>不明なチーム</>;
  return (
    <span className="team-name">
      <TeamBadge color={team.color} />
      {team.name}
    </span>
  );
}
