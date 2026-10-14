import { useState } from "react";
import { MAX_CHAT_LENGTH } from "../shared/types";
import { useRoomSocket, type ConnectionStatus } from "./useRoomSocket";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "接続中…",
  open: "接続済み",
  closed: "切断（再接続します）",
};

// ステップ1の動作確認用：同じルームの全員にメッセージを配信する
export function RoomPage({ roomId }: { roomId: string }) {
  const { status, messages, error, send } = useRoomSocket(roomId);
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSend = status === "open" && trimmed.length > 0 && trimmed.length <= MAX_CHAT_LENGTH;

  return (
    <main>
      <h1>ルーム {roomId}</h1>
      <p>状態：{STATUS_LABEL[status]}</p>
      {error && <p role="alert">エラー：{error}</p>}
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            <time>{new Date(m.sentAt).toLocaleTimeString("ja-JP")}</time> {m.text}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend && send({ type: "chat", text: trimmed })) setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_CHAT_LENGTH} placeholder="メッセージ" />
        <button type="submit" disabled={!canSend}>
          送信
        </button>
      </form>
    </main>
  );
}
