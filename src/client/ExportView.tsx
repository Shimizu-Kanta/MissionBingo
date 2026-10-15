import { useEffect, useRef, useState } from "react";
import type { Participant, RoomState } from "../shared/types";
import { downloadCanvas, renderResultImage, type ExportFormat, type ExportInclude } from "./resultImage";
import { copyText, useToast } from "./ui";

const INCLUDE_ROWS: { key: keyof ExportInclude; label: string }[] = [
  { key: "card", label: "最終カード" },
  { key: "rank", label: "順位" },
  { key: "photos", label: "写真ハイライト" },
  { key: "tl", label: "タイムライン抜粋" },
];

// 結果画像の出力。形式と載せる内容を選んで PNG をダウンロードする
export function ExportView({ room, you, onBack }: { room: RoomState; you: Participant | null; onBack: () => void }) {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<ExportFormat>("square");
  const [include, setInclude] = useState<ExportInclude>({ card: true, rank: true, photos: true, tl: false });
  const viewTeamId = room.settings.cardMode === "shared" ? null : (you?.teamId ?? 0);

  useEffect(() => {
    if (canvas.current) void renderResultImage(canvas.current, room, format, include, viewTeamId);
  }, [room, format, include, viewTeamId]);

  return (
    <div className="screen">
      <header className="app-header">
        <div className="left">
          <button type="button" className="back-btn" onClick={onBack}>
            ← 結果
          </button>
          <span className="title">結果画像を出力</span>
        </div>
      </header>
      <div className="page export-page">
        <div className="export-preview">
          <div style={{ width: "100%", maxWidth: format === "square" ? 560 : 360 }}>
            <canvas ref={canvas} aria-label="結果画像のプレビュー" />
          </div>
        </div>
        <div className="export-side">
          <div className="field">
            <span className="label">形式</span>
            <div className="fmt-buttons">
              {(
                [
                  ["square", "正方形 1:1"],
                  ["story", "縦長 9:16"],
                ] as const
              ).map(([key, label]) => (
                <button key={key} type="button" className={format === key ? "on" : undefined} onClick={() => setFormat(key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">載せる内容</span>
            <div className="check-rows">
              {INCLUDE_ROWS.map((row) => (
                <button key={row.key} type="button" className="check-row" onClick={() => setInclude((prev) => ({ ...prev, [row.key]: !prev[row.key] }))}>
                  <span className={`box${include[row.key] ? " on" : ""}`}>{include[row.key] ? "✓" : ""}</span>
                  {row.label}
                </button>
              ))}
            </div>
            {room.imagesDeletedAt !== null && <span className="hint">写真は保存期間を過ぎたため載せられません</span>}
          </div>
          <div className="field">
            <button
              type="button"
              className="btn primary"
              style={{ height: 46 }}
              onClick={async () => {
                if (canvas.current && (await downloadCanvas(canvas.current, `mission-bingo-${room.code}.png`))) toast.show("結果画像を書き出しました");
                else toast.show("画像を書き出せませんでした");
              }}
            >
              画像をダウンロード
            </button>
            <button
              type="button"
              className="btn"
              style={{ height: 42, fontSize: 13 }}
              onClick={async () => {
                const url = `${location.origin}/room/${room.code}`;
                toast.show((await copyText(url)) ? "結果ページのリンクをコピーしました" : `結果ページ：${url}`);
              }}
            >
              共有リンクをコピー
            </button>
            <span className="hint" style={{ textAlign: "center" }}>
              写真の保存期限：ゲーム終了から24時間
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
