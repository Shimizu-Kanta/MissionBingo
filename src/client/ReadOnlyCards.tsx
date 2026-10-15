import { useCallback, useState } from "react";
import type { Participant, RoomState } from "../shared/types";
import { Board } from "./Board";
import { CellSheet } from "./CellSheet";
import { TeamTabs } from "./TeamTabs";

// 終了後の閲覧専用カード。詳細は見られるが、申請・取り消しはできない。
// 個別カードでも、終了後は全員が全チームのカードを見られる
export function ReadOnlyCards({ room, you, onBack }: { room: RoomState; you: Participant | null; onBack: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const closeSheet = useCallback(() => setSelected(null), []);
  const individual = room.settings.cardMode === "individual";
  const [tabTeamId, setTabTeamId] = useState(you?.teamId ?? 0);
  const viewTeamId = individual ? tabTeamId : (you?.teamId ?? null);

  return (
    <div className="readonly">
      <p className="banner readonly-banner" role="status">
        ゲーム終了・閲覧モード
      </p>
      <h2>{individual ? "各チームのカード" : "共有カード"}</h2>
      {individual && <TeamTabs teams={room.teams} selected={tabTeamId} myTeamId={you?.teamId ?? null} onSelect={setTabTeamId} />}
      <Board room={room} viewTeamId={viewTeamId} onSelect={setSelected} />

      <div className="readonly-footer">
        <button type="button" className="primary" onClick={onBack}>
          結果に戻る
        </button>
      </div>

      {selected !== null && (
        <CellSheet
          room={room}
          position={selected}
          viewTeamId={viewTeamId}
          canApply={false}
          canRevoke={false}
          onApply={() => undefined}
          onRevoke={() => undefined}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
