import { useEffect, useState } from "react";
import { ROOM_CODE_PATTERN } from "../shared/types";
import { CreateRoomPage } from "./CreateRoomPage";
import { RoomPage, type RoomView } from "./RoomPage";
import { TopPage } from "./TopPage";
import { ToastProvider } from "./ui";

// /room/:code はロビー・プレイ・結果、/room/:code/card は閲覧専用カード、/room/:code/export は結果画像の出力
function roomRouteFromPath(pathname: string): { code: string; view: RoomView } | null {
  const match = /^\/room\/([^/]+)(?:\/(card|export))?\/?$/.exec(pathname);
  if (!match) return null;
  const code = decodeURIComponent(match[1]).replace(/-/g, "").toUpperCase();
  if (!ROOM_CODE_PATTERN.test(code)) return null;
  return { code, view: match[2] === "card" ? "card" : match[2] === "export" ? "export" : "main" };
}

export function App() {
  const [pathname, setPathname] = useState(location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(location.pathname);
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);

  // 画面が変わったら先頭から見せる
  useEffect(() => {
    scrollTo(0, 0);
  }, [pathname]);

  const route = roomRouteFromPath(pathname);
  return (
    <ToastProvider>
      {pathname === "/create" ? (
        <CreateRoomPage />
      ) : route ? (
        // key をルームコードにして、結果画面と閲覧カードの行き来では接続を張り直さない
        <RoomPage key={route.code} code={route.code} view={route.view} />
      ) : (
        <TopPage />
      )}
    </ToastProvider>
  );
}
