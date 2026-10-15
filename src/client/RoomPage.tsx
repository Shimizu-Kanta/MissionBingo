import { useEffect, useRef, useState } from "react";
import { ExportView } from "./ExportView";
import { LobbyView } from "./LobbyView";
import { navigate } from "./navigation";
import { PlayView } from "./PlayView";
import { ReadOnlyCards } from "./ReadOnlyCards";
import { ResultView } from "./ResultView";
import { formatCode } from "./theme";
import { Logo, useToast } from "./ui";
import { useRoom } from "./useRoom";

// /room/:code はロビー・プレイ・結果、/room/:code/card は閲覧専用カード、/room/:code/export は結果画像の出力
export type RoomView = "main" | "card" | "export";

function cameFromResult(state: unknown): boolean {
  return typeof state === "object" && state !== null && "fromResult" in state && state.fromResult === true;
}

export function RoomPage({ code, view }: { code: string; view: RoomView }) {
  const { status, room, you, error, send } = useRoom(code);
  const toast = useToast();
  const ended = room !== null && room.endedAt !== null;
  const sawPlaying = useRef(false);
  const [autoMoved, setAutoMoved] = useState(false);

  // サーバーからのエラーはトーストで出す
  useEffect(() => {
    if (error) toast.show(error.reason);
  }, [error, toast]);

  // プレイ中に終了したら、結果画面へ自動で移ったことを知らせる
  useEffect(() => {
    if (!room) return;
    if (room.startedAt !== null && room.endedAt === null) sawPlaying.current = true;
    if (room.endedAt !== null && sawPlaying.current) {
      sawPlaying.current = false;
      setAutoMoved(true);
      toast.show("ゲーム終了 — 全員を結果画面へ移動しました");
      if (view !== "main") navigate(`/room/${code}`, { replace: true });
    }
  }, [room, toast, view, code]);

  // 閲覧カード・画像出力は終了後だけ。プレイ中に開かれたらルームの URL に戻す
  useEffect(() => {
    if (room && !ended && view !== "main") navigate(`/room/${code}`, { replace: true });
  }, [room, ended, view, code]);

  const openSub = (sub: "card" | "export") => navigate(`/room/${code}/${sub}`, { state: { fromResult: true } });
  // 結果画面から来たなら履歴を戻る（ブラウザの戻ると同じ動き）。直接開いた場合は結果画面へ置き換える
  const backToResult = () => {
    if (cameFromResult(history.state)) history.back();
    else navigate(`/room/${code}`, { replace: true });
  };

  if (status === "notFound") {
    return (
      <div className="screen">
        <header className="app-header">
          <div className="left" style={{ gap: 10 }}>
            <Logo />
            <span className="title">ミッションビンゴ</span>
          </div>
        </header>
        <div className="page not-found">
          <h1 style={{ margin: 0, fontSize: 24 }}>ルームが見つかりません</h1>
          <p className="hint" style={{ fontSize: 14 }}>
            招待コード {formatCode(code)} のルームはありません。コードを確認してください。
          </p>
          <button type="button" className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => navigate("/")}>
            トップへ戻る
          </button>
        </div>
      </div>
    );
  }

  const connection = status !== "open" && (
    <div className="conn-note" role="status">
      {status === "connecting" ? "接続中…" : "切断されました。再接続しています…"}
    </div>
  );

  if (!room) {
    return (
      <div className="screen">
        {connection}
        <div className="page not-found">
          <p className="hint">ルームに接続しています…</p>
        </div>
      </div>
    );
  }

  let body;
  if (ended) {
    if (view === "card") body = <ReadOnlyCards room={room} you={you} onBack={backToResult} />;
    else if (view === "export") body = <ExportView room={room} you={you} onBack={backToResult} />;
    else
      body = (
        <ResultView
          room={room}
          you={you}
          autoMoved={autoMoved}
          onDismissMoved={() => setAutoMoved(false)}
          onShowCards={() => openSub("card")}
          onExport={() => openSub("export")}
          onTop={() => navigate("/")}
        />
      );
  } else if (room.startedAt !== null && you) {
    body = <PlayView room={room} you={you} send={send} />;
  } else {
    body = <LobbyView room={room} you={you} send={send} />;
  }

  return (
    <>
      {connection}
      {body}
    </>
  );
}
