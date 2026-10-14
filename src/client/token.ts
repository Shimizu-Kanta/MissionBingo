const TOKEN_KEY = "mission-bingo:token";

let memoryToken: string | null = null;

// 端末ごとの参加者トークン。localStorage が使えない環境ではタブを閉じるまでの一時トークンになる
export function getDeviceToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
    const token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    memoryToken ??= crypto.randomUUID();
    return memoryToken;
  }
}
