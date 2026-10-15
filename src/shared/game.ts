// ビンゴ判定と順位。RoomDO（終了判定）とクライアント（表示）で同じ計算を使う
import type { Cell, Claim, Team } from "./types";

export type Standing = {
  teamId: number;
  bingos: number;
  cells: number; // 取得マス数（FREE は全チーム共通なので数えない）
  rank: number; // 同率は同じ順位（1, 1, 3 …）
};

// 横・縦・斜め2本のライン（マス位置の配列）
export function bingoLines(size: number): number[][] {
  const range = Array.from({ length: size }, (_, i) => i);
  return [
    ...range.map((r) => range.map((c) => r * size + c)),
    ...range.map((c) => range.map((r) => r * size + c)),
    range.map((i) => i * size + i),
    range.map((i) => i * size + (size - 1 - i)),
  ];
}

// FREE を含めた、そのチームが開けているマス
export function openedPositions(card: Cell[], claims: Claim[], teamId: number): Set<number> {
  const opened = new Set(card.filter((c) => c.free).map((c) => c.position));
  for (const claim of claims) if (claim.teamId === teamId) opened.add(claim.position);
  return opened;
}

export function countBingos(size: number, opened: Set<number>): number {
  return bingoLines(size).filter((line) => line.every((p) => opened.has(p))).length;
}

// ビンゴ数が多い順 → 取得マス数が多い順。それも同じなら同率
export function computeStandings(size: number, card: Cell[], claims: Claim[], teams: Team[]): Standing[] {
  const rows = teams.map((team) => ({
    teamId: team.id,
    bingos: countBingos(size, openedPositions(card, claims, team.id)),
    cells: claims.filter((c) => c.teamId === team.id).length,
  }));
  rows.sort((a, b) => b.bingos - a.bingos || b.cells - a.cells || a.teamId - b.teamId);
  return rows.map((row) => ({
    ...row,
    rank: 1 + rows.filter((other) => other.bingos > row.bingos || (other.bingos === row.bingos && other.cells > row.cells)).length,
  }));
}
