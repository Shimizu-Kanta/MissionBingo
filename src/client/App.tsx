import { useEffect, useState } from "react";
import { ROOM_CODE_PATTERN } from "../shared/types";
import { CreateRoomPage } from "./CreateRoomPage";
import { RoomPage, type RoomView } from "./RoomPage";
import { TopPage } from "./TopPage";

// /room/:code はプレイ画面または結果画面、/room/:code/card は終了後の閲覧専用カード
function roomRouteFromPath(pathname: string): { code: string; view: RoomView } | null {
  const match = /^\/room\/([^/]+)(\/card)?\/?$/.exec(pathname);
  if (!match) return null;
  const code = decodeURIComponent(match[1]).toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? { code, view: match[2] ? "card" : "main" } : null;
}

export function App() {
  const [pathname, setPathname] = useState(location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  if (pathname === "/create") return <CreateRoomPage />;
  const route = roomRouteFromPath(pathname);
  // key をルームコードにして、結果画面と閲覧カードの行き来では接続を張り直さない
  return route ? <RoomPage key={route.code} code={route.code} view={route.view} /> : <TopPage />;
}
