import { computeStandings } from "../shared/game";
import { imageUrl, type Participant, type RoomState } from "../shared/types";
import { Standings } from "./Standings";
import { TeamName } from "./TeamBadge";
import { Timeline, describeEnding } from "./Timeline";

// 結果画面。終了のきっかけに関係なく、終了したら全員がここへ移る
export function ResultView({ room, you, onShowCards }: { room: RoomState; you: Participant | null; onShowCards: () => void }) {
  const ending = [...room.timeline].reverse().find((entry) => entry.event.kind === "ended")?.event;
  const winners = computeStandings(room.settings.cardSize, room.card, room.claims, room.teams).filter((s) => s.rank === 1);

  return (
    <>
      <h2>結果</h2>
      {ending?.kind === "ended" && <p>{describeEnding(room, ending)}</p>}
      <p className="winner">
        1位：
        {winners.map((w, i) => (
          <span key={w.teamId}>
            {i > 0 && "・"}
            <TeamName team={room.teams[w.teamId]} />
          </span>
        ))}
        {winners.length > 1 && "（同率）"}
      </p>

      <Standings room={room} myTeamId={you?.teamId ?? null} />

      {room.resultImages.length > 0 && (
        <section>
          <h2>各チームの1枚</h2>
          {room.imagesDeletedAt !== null ? (
            <p className="hint">画像は保存期間（ゲーム終了から24時間）を過ぎたため削除されました</p>
          ) : (
            <div className="result-images">
              {room.resultImages.map((r) => (
                <figure key={r.teamId}>
                  <a href={imageUrl(room.code, r.imageId)} target="_blank" rel="noreferrer">
                    <img src={imageUrl(room.code, r.imageId)} alt={`${room.teams[r.teamId]?.name ?? ""}の画像`} />
                  </a>
                  <figcaption>
                    <TeamName team={room.teams[r.teamId]} />
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      <p>
        <button type="button" className="primary" onClick={onShowCards}>
          カードを見る
        </button>
      </p>

      <Timeline room={room} />
    </>
  );
}
