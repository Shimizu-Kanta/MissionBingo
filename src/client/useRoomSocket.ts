import { useEffect, useRef, useState } from "react";
import { parseServerMessage, type ChatMessage, type ClientMessage } from "../shared/types";

export type ConnectionStatus = "connecting" | "open" | "closed";

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;

// ルームの WebSocket に接続し、切断されたら自動で再接続する
export function useRoomSocket(roomId: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retryDelay = RECONNECT_DELAY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${encodeURIComponent(roomId)}/ws`);
      socketRef.current = ws;
      setStatus("connecting");

      ws.addEventListener("open", () => {
        retryDelay = RECONNECT_DELAY_MS;
        setStatus("open");
      });
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const message = parseServerMessage(event.data);
        if (!message) return;
        switch (message.type) {
          case "snapshot":
            setMessages(message.messages);
            break;
          case "chat":
            setMessages((prev) => [...prev, message.message]);
            break;
          case "error":
            setError(message.reason);
            break;
        }
      });
      ws.addEventListener("close", () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        setStatus("closed");
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RECONNECT_DELAY_MS);
      });
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = (message: ClientMessage): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  };

  return { status, messages, error, send };
}
