import { useEffect, useState } from "react";
import type { Participant, RoomState } from "../shared/types";
import { Board, Legend, TeamTabs } from "./Board";
import { CellSheet } from "./CellSheet";
import { heroOf } from "./derive";
import { Timeline } from "./Timeline";
import { useNarrow } from "./ui";

// 終了後の閲覧専用カード。詳細は見られるが、申請・取り消しはできない。
// 個別カードでも、終了後は全員が全チームのカードを見られる
export function ReadOnlyCards({ room, you, onBack }: { room: RoomState; you: Participant | null; onBack: () => void }) {
  const narrow = useNarrow();
  const [selected, setSelected] = useState<number | null>(null);
  const shared = room.settings.cardMode === "shared";
  const [tabTeam, setTabTeam] = useState(you?.teamId ?? 0);
  const viewTeamId = shared ? (you?.teamId ?? null) : tabTeam;
  const viewTeam = viewTeamId !== null ? room.teams[viewTeamId] : undefined;

  useEffect(() => {
    document.documentElement.classList.add("has-bottom-bar");
    return () => document.documentElement.classList.remove("has-bottom-bar");
  }, []);

  return (
    <div className="screen">
      <div className="view-banner" role="status">
        <b>ゲーム終了・閲覧モード</b>
        <span>
          {room.settings.roomName} · {heroOf(room).title} · マスの詳細のみ確認できます
        </span>
      </div>
      <div className="play-body">
        <div className="card-col">
          <div className="card-head">
            <div className="stack">
              <b>{shared ? "共有カード" : `${viewTeam?.name ?? ""}のカード`}</b>
              <span>マスをタップすると詳細を確認できます（閲覧のみ）</span>
            </div>
          </div>
          {!shared && <TeamTabs room={room} selected={tabTeam} onSelect={setTabTeam} />}
          <Board room={room} viewTeamId={viewTeamId} showPending={false} onSelect={setSelected} />
          <Legend team={viewTeam ?? room.teams[0]} />
        </div>
        {!narrow && (
          <div className="side-col">
            <Timeline room={room} maxHeight="520px" />
          </div>
        )}
      </div>
      <div className="view-footer">
        <button type="button" className="btn primary" onClick={onBack}>
          結果に戻る
        </button>
      </div>
      {selected !== null && (
        <CellSheet
          room={room}
          position={selected}
          viewTeamId={viewTeamId}
          myTeamId={you?.teamId ?? null}
          mode="readonly"
          onApply={() => undefined}
          onRevoke={() => undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
