import type { RoomState } from "../shared/types";

// 見ているチームから見たマスの状態
export type CellStatus =
  | { kind: "free" }
  | { kind: "open" } // 未達成
  | { kind: "pending" } // 自チームが申請中
  | { kind: "claimed"; teamId: number }; // 取得済み（共有カードでは他チームのこともある）

export function cellStatus(room: RoomState, position: number, viewTeamId: number | null): CellStatus {
  const cell = room.card[position];
  if (!cell || cell.free) return { kind: "free" };
  const shared = room.settings.cardMode === "shared";
  const claim = room.claims.find((c) => c.position === position && (shared || c.teamId === viewTeamId));
  if (claim) return { kind: "claimed", teamId: claim.teamId };
  if (viewTeamId !== null && room.applications.some((a) => a.position === position && a.teamId === viewTeamId)) {
    return { kind: "pending" };
  }
  return { kind: "open" };
}
