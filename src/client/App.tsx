import { useEffect, useState } from "react";
import { ROOM_CODE_PATTERN } from "../shared/types";
import { CreateRoomPage } from "./CreateRoomPage";
import { RoomPage } from "./RoomPage";
import { TopPage } from "./TopPage";

function roomCodeFromPath(pathname: string): string | null {
  const match = /^\/room\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const code = decodeURIComponent(match[1]).toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function App() {
  const [pathname, setPathname] = useState(location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  if (pathname === "/create") return <CreateRoomPage />;
  const code = roomCodeFromPath(pathname);
  return code ? <RoomPage key={code} code={code} /> : <TopPage />;
}
