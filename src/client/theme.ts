// デザインモック（Mission Bingo Mock v2）の配色トークン
import type { Role, Team } from "../shared/types";

export const INK = "oklch(0.22 0.012 250)";
export const MUTED = "oklch(0.5 0.012 250)";
export const LINE = "oklch(0.9 0.005 250)";
export const SOFT = "oklch(0.96 0.004 250)";
export const DANGER = "oklch(0.5 0.15 25)";
export const DISABLED = "oklch(0.82 0.005 250)";

// チームカラー：C1 ベタ / C2 淡色 / C3 濃色文字 / CL ボーダー
export const c1 = (hue: number) => `oklch(0.6 0.15 ${hue})`;
export const c2 = (hue: number) => `oklch(0.945 0.035 ${hue})`;
export const c3 = (hue: number) => `oklch(0.4 0.11 ${hue})`;
export const cl = (hue: number) => `oklch(0.85 0.06 ${hue})`;

export function teamShort(team: Team): string {
  return team.name.replace("チーム", "");
}

export const ROLE_LABEL: Record<Role, string> = { gm: "GM", operator: "操作主", player: "プレイヤー" };

// 招待コードは3文字ずつ区切って見せる（入力はハイフンなしでも可）
export function formatCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatClock(epochMs: number, withSeconds = true): string {
  const d = new Date(epochMs);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return withSeconds ? `${hm}:${pad2(d.getSeconds())}` : hm;
}
