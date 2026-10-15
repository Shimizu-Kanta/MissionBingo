import { imageUrl, type Participant, type RoomState } from "../shared/types";
import { MiniFinal } from "./Board";
import { heroOf, imageCaption, resultStats, standingsOf } from "./derive";
import { SOFT, c1, c2 } from "./theme";

// 結果画面。終了のきっかけに関係なく、終了したら全員がここへ移る
export function ResultView({
  room,
  you,
  autoMoved,
  onDismissMoved,
  onShowCards,
  onExport,
  onTop,
}: {
  room: RoomState;
  you: Participant | null;
  autoMoved: boolean;
  onDismissMoved: () => void;
  onShowCards: () => void;
  onExport: () => void;
  onTop: () => void;
}) {
  const hero = heroOf(room);
  const standings = standingsOf(room);
  const shared = room.settings.cardMode === "shared";
  const finalTeamId = shared ? null : (you?.teamId ?? 0);
  const deleted = room.imagesDeletedAt !== null;

  return (
    <div className="screen">
      <header className="app-header">
        <span className="title">{room.settings.roomName}</span>
        <span className="sub">ゲーム終了</span>
      </header>
      <div className="page result-page">
        {autoMoved && (
          <div className="moved-note">
            <i />
            <span>ゲームが終了したため、参加者全員を結果画面へ自動で移動しました。</span>
            <button type="button" onClick={onDismissMoved} aria-label="閉じる">
              ×
            </button>
          </div>
        )}

        <div className="hero" style={{ background: hero.color }}>
          <span className="label">{hero.label}</span>
          <span className="title">{hero.title}</span>
          <span className="sub">{hero.sub}</span>
        </div>

        <div className="result-grid">
          <div className="panel result-card">
            <b>順位</b>
            {standings.map((s) => {
              const t = room.teams[s.teamId];
              if (!t) return null;
              return (
                <div key={s.teamId} className="result-rank" style={{ background: s.rank === 1 ? c2(t.hue) : SOFT }}>
                  <span className="pos">{s.rank}</span>
                  <span className="team-dot" style={{ width: 10, height: 10, borderRadius: 3, background: c1(t.hue) }} />
                  <b>{t.name}</b>
                  <span className="lines">{s.bingos}ライン</span>
                  <span className="cells">{s.cells}マス</span>
                </div>
              );
            })}
            <div className="stats">
              {resultStats(room).map((st) => (
                <div key={st.label}>
                  <span>{st.label}</span>
                  <b>{st.value}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="panel result-card gap12">
            <b>{shared ? "最終カード（共有）" : `最終カード（${room.teams[finalTeamId ?? 0]?.name ?? ""}）`}</b>
            <MiniFinal room={room} viewTeamId={finalTeamId} />
            <button type="button" className="btn outline" style={{ height: 42 }} onClick={onShowCards}>
              カードを見る
            </button>
          </div>
        </div>

        <div className="panel result-card gap12">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>写真ハイライト</b>
            <span className="hint">画像はゲーム終了から24時間保存されます</span>
          </div>
          {deleted ? (
            <p className="hint">画像は保存期間を過ぎたため削除されました</p>
          ) : room.resultImages.length === 0 ? (
            <p className="hint">承認された写真はありません</p>
          ) : (
            <div className="photo-grid">
              {room.resultImages.map((r) => {
                const t = room.teams[r.teamId];
                return (
                  <figure key={r.teamId}>
                    <a href={imageUrl(room.code, r.imageId)} target="_blank" rel="noreferrer">
                      <img src={imageUrl(room.code, r.imageId)} alt={`${t?.name ?? ""}の写真`} />
                    </a>
                    <figcaption>
                      <span className="team-dot" style={{ width: 7, height: 7, background: t ? c1(t.hue) : "transparent" }} />
                      {imageCaption(room, r.imageId)}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        <div className="result-actions">
          <button type="button" className="btn" onClick={onTop}>
            トップへ
          </button>
          <button type="button" className="btn primary" style={{ padding: "0 22px" }} onClick={onExport}>
            結果画像を出力
          </button>
        </div>
      </div>
    </div>
  );
}
