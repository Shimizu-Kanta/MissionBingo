import type { CSSProperties } from "react";
import type { RoomState, Team } from "../shared/types";
import { bingosOf, cellLabel, lineCells, ownerAt, pendingAt } from "./derive";
import { INK, LINE, c1, c2, c3, cl } from "./theme";

// ビンゴグリッド。マスにはタイトルだけを出し、タップで詳細を開く
export function Board({
  room,
  viewTeamId,
  stealTeamId = null,
  showPending = true,
  onSelect,
}: {
  room: RoomState;
  viewTeamId: number | null;
  stealTeamId?: number | null; // 奪取中のチーム（他チームのマスを点線で示す）
  showPending?: boolean;
  onSelect: (position: number) => void;
}) {
  const n = room.settings.cardSize;
  const lines = new Map(room.teams.map((t) => [t.id, lineCells(room, t.id)]));
  const stealTeam = stealTeamId !== null ? room.teams[stealTeamId] : undefined;

  return (
    <div className={`grid n${n}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      {room.card.map((cell) => {
        const owner = cell.free ? null : ownerAt(room, cell.position, viewTeamId);
        const team = owner !== null ? room.teams[owner] : undefined;
        const inLine = team !== undefined && (lines.get(team.id)?.has(cell.position) ?? false);
        const pending = showPending && !cell.free && owner === null && pendingAt(room, cell.position, viewTeamId).length > 0;
        const stealable = stealTeam !== undefined && team !== undefined && team.id !== stealTeam.id;

        const style: CSSProperties = cell.free
          ? { background: INK, color: "#fff", fontWeight: 700, border: "1px solid transparent" }
          : inLine && team
            ? { background: c1(team.hue), color: "#fff", fontWeight: 500, border: "1px solid transparent" }
            : team
              ? { background: c2(team.hue), color: c3(team.hue), fontWeight: 500, border: `1px solid ${cl(team.hue)}` }
              : { background: "#fff", color: INK, fontWeight: 500, border: `1px solid ${LINE}` };
        if (pending) style.border = "1.5px dashed oklch(0.55 0.012 250)";
        if (stealable && stealTeam) style.border = `2px dashed ${c1(stealTeam.hue)}`;

        const status = cell.free ? "FREE" : team ? `${team.name}が取得済み` : pending ? "申請中" : "未取得";
        return (
          <button
            key={cell.position}
            type="button"
            className="cell"
            style={style}
            onClick={() => onSelect(cell.position)}
            aria-label={`${cellLabel(cell)}（${status}）`}
          >
            <span>{cellLabel(cell)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Legend({ team }: { team: Team | undefined }) {
  const hue = team?.hue ?? 250;
  return (
    <div className="legend">
      <span>
        <i style={{ background: c2(hue), border: `1px solid ${cl(hue)}` }} />
        取得済み
      </span>
      <span>
        <i style={{ background: c1(hue) }} />
        ビンゴライン
      </span>
      <span>
        <i style={{ border: "1.5px dashed oklch(0.55 0.012 250)" }} />
        申請中
      </span>
      <span>タップで詳細</span>
    </div>
  );
}

export function TeamTabs({ room, selected, onSelect }: { room: RoomState; selected: number; onSelect: (teamId: number) => void }) {
  return (
    <div className="team-tabs" role="tablist">
      {room.teams.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === selected} className={t.id === selected ? "on" : undefined} onClick={() => onSelect(t.id)}>
          <span className="team-dot" style={{ width: 8, height: 8, background: c1(t.hue) }} />
          {t.name}
          <span className="mono">{bingosOf(room, t.id)}L</span>
        </button>
      ))}
    </div>
  );
}

const MINI_DOT: Record<number, number> = { 5: 9, 7: 7, 9: 5 };

// 他チームの進捗（取得マスの色分けとライン数・マス数だけ）
export function MiniCards({ room, exceptTeamId }: { room: RoomState; exceptTeamId: number | null }) {
  const n = room.settings.cardSize;
  const dot = MINI_DOT[n] ?? 7;
  return (
    <div className="minis">
      <b>他チームの進捗</b>
      <div className="list">
        {room.teams
          .filter((t) => t.id !== exceptTeamId)
          .map((t) => {
            const owned = new Set(room.claims.filter((c) => c.teamId === t.id).map((c) => c.position));
            const line = lineCells(room, t.id);
            return (
              <div key={t.id} className="mini">
                <div className="dots" style={{ gridTemplateColumns: `repeat(${n}, ${dot}px)` }} aria-hidden>
                  {room.card.map((cell) => (
                    <span
                      key={cell.position}
                      style={{
                        width: dot,
                        height: dot,
                        background: cell.free ? INK : owned.has(cell.position) ? (line.has(cell.position) ? c3(t.hue) : c1(t.hue)) : "oklch(0.92 0.005 250)",
                      }}
                    />
                  ))}
                </div>
                <div className="names">
                  <b>{t.name}</b>
                  <span>
                    {bingosOf(room, t.id)}ライン · {owned.size}マス
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// 結果画面の最終カード（小さな色分けのみ）
export function MiniFinal({ room, viewTeamId }: { room: RoomState; viewTeamId: number | null }) {
  const n = room.settings.cardSize;
  const lines = new Map(room.teams.map((t) => [t.id, lineCells(room, t.id)]));
  const gap = n === 5 ? 4 : n === 7 ? 3 : 2;
  return (
    <div className="mini-final" style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, gap }} aria-hidden>
      {room.card.map((cell) => {
        const owner = cell.free ? null : ownerAt(room, cell.position, viewTeamId);
        const team = owner !== null ? room.teams[owner] : undefined;
        const inLine = team !== undefined && (lines.get(team.id)?.has(cell.position) ?? false);
        return (
          <span
            key={cell.position}
            style={{
              background: cell.free ? INK : team ? (inLine ? c1(team.hue) : c2(team.hue)) : "#fff",
              border: cell.free || team ? "1px solid transparent" : `1px solid ${LINE}`,
            }}
          />
        );
      })}
    </div>
  );
}
