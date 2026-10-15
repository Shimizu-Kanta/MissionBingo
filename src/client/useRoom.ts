import { useEffect, useRef, useState } from "react";
import {
  CLOSE_ROOM_NOT_FOUND,
  parseServerMessage,
  type ClientMessage,
  type Participant,
  type RoomState,
} from "../shared/types";
import { getDeviceToken } from "./token";

export type ConnectionStatus = "connecting" | "open" | "closed" | "notFound";

const RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 10000;

// ルームの WebSocket に接続して状態を受け取る。切断されたら自動で再接続する
export function useRoom(code: string) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [you, setYou] = useState<Participant | null>(null);
  // 同じ理由のエラーが続いても毎回トーストを出せるよう、受け取るたびに新しいオブジェクトにする
  const [error, setError] = useState<{ reason: string; at: number } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retryDelay = RECONNECT_DELAY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${encodeURIComponent(code)}/ws`);
      socketRef.current = ws;
      setStatus("connecting");

      ws.addEventListener("open", () => {
        retryDelay = RECONNECT_DELAY_MS;
        setStatus("open");
        // トークンは URL に載せず、接続後の最初のメッセージで送る
        ws.send(JSON.stringify({ type: "hello", token: getDeviceToken() } satisfies ClientMessage));
      });
      ws.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const message = parseServerMessage(event.data);
        if (!message) return;
        switch (message.type) {
          case "state":
            setRoom(message.room);
            setYou(message.you);
            break;
          case "error":
            setError({ reason: message.reason, at: Date.now() });
            break;
        }
      });
      ws.addEventListener("close", (event) => {
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        if (event.code === CLOSE_ROOM_NOT_FOUND) {
          setStatus("notFound");
          return;
        }
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
  }, [code]);

  const send = (message: ClientMessage): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  };

  return { status, room, you, error, send };
}
