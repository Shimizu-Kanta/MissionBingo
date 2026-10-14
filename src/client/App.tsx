import { useEffect, useState } from "react";
import { ROOM_ID_PATTERN } from "../shared/types";
import { RoomPage } from "./RoomPage";

function roomIdFromPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const roomId = decodeURIComponent(match[1]);
  return ROOM_ID_PATTERN.test(roomId) ? roomId : null;
}

function navigate(path: string) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [pathname, setPathname] = useState(location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  const roomId = roomIdFromPath(pathname);
  if (roomId) return <RoomPage roomId={roomId} />;
  return <TopPage onEnter={(id) => navigate(`/room/${encodeURIComponent(id)}`)} />;
}

function TopPage({ onEnter }: { onEnter: (roomId: string) => void }) {
  const [roomId, setRoomId] = useState("");
  const valid = ROOM_ID_PATTERN.test(roomId);

  return (
    <main>
      <h1>ミッションビンゴ</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onEnter(roomId);
        }}
      >
        <label>
          ルームID
          <input value={roomId} onChange={(e) => setRoomId(e.target.value.trim())} placeholder="英数字・-・_（32文字まで）" />
        </label>
        <button type="submit" disabled={!valid}>
          入室
        </button>
      </form>
    </main>
  );
}
