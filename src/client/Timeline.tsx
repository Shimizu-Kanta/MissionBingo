import { imageUrl, type RoomState } from "../shared/types";
import { KIND_STYLE, describeEvent } from "./derive";
import { c1, formatClock } from "./theme";

// 全員に公開するタイムライン。新しいものを上に出す
export function Timeline({ room, maxHeight }: { room: RoomState; maxHeight?: string }) {
  const entries = [...room.timeline].reverse();
  const deleted = room.imagesDeletedAt !== null;
  return (
    <section className="side-panel" aria-label="タイムライン">
      <div className="head">
        <b>タイムライン</b>
        <span className="note">全員に公開</span>
      </div>
      <div className="timeline" style={{ maxHeight }}>
        {entries.length === 0 && <p className="empty">まだ出来事はありません</p>}
        {entries.map((entry) => {
          const v = describeEvent(room, entry.event);
          const kind = KIND_STYLE[v.kind];
          const team = v.teamId !== null ? room.teams[v.teamId] : undefined;
          return (
            <div key={entry.id} className="tl-item">
              <time>{formatClock(entry.at)}</time>
              <div className="body">
                <div className="kind">
                  <span className="label" style={{ background: kind.bg, color: kind.fg }}>
                    {kind.label}
                  </span>
                  {team && <span className="team-dot" style={{ width: 8, height: 8, background: c1(team.hue) }} />}
                </div>
                <div className="text">{v.text}</div>
                {v.note && (
                  <div
                    className="note"
                    style={
                      v.note.tone === "reason"
                        ? { background: "oklch(0.95 0.04 70)", color: "oklch(0.4 0.09 70)" }
                        : { background: "oklch(0.96 0.02 25)", color: "oklch(0.4 0.1 25)" }
                    }
                  >
                    {v.note.label}
                    {v.note.text}
                  </div>
                )}
                {v.chat && (
                  <div className="note" style={{ background: "oklch(0.96 0.004 250)" }}>
                    {v.chat}
                  </div>
                )}
                {v.imageIds.length > 0 &&
                  (deleted ? (
                    <span className="photo-gone">画像は保存期間を過ぎたため削除されました</span>
                  ) : (
                    <div className="photos">
                      {v.imageIds.map((id) => (
                        <a key={id} href={imageUrl(room.code, id)} target="_blank" rel="noreferrer">
                          <img src={imageUrl(room.code, id)} alt="申請の写真" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
