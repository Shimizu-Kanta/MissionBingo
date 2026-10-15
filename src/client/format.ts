export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
