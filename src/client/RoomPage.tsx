import { useCallback, useEffect, useState } from "react";
import {
  MAX_NAME_LENGTH,
  isModerator,
  normalizeName,
  type ClientMessage,
  type Participant,
  type Role,
  type RoomSettings,
  type RoomState,
} from "../shared/types";
import { ApprovalQueue } from "./ApprovalQueue";
import { Board } from "./Board";
import { CellSheet } from "./CellSheet";
import { MiniCard } from "./MiniCard";
import { MissionPanel } from "./MissionPanel";
import { navigate } from "./navigation";
import { ReadOnlyCards } from "./ReadOnlyCards";
import { ResultView } from "./ResultView";
import { Standings } from "./Standings";
import { TeamBadge, TeamName } from "./TeamBadge";
import { TeamTabs } from "./TeamTabs";
import { Timeline } from "./Timeline";
import { useRoom } from "./useRoom";

const ROLE_LABEL: Record<Role, string> = { gm: "GM", operator: "操作主", player: "プレイヤー" };

export type RoomView = "main" | "card";

function cameFromResult(state: unknown): boolean {
  return typeof state === "object" && state !== null && "fromResult" in state && state.fromResult === true;
}

export function RoomPage({ code, view }: { code: string; view: RoomView }) {
  const { status, room, you, error, send } = useRoom(code);
  const ended = room !== null && room.endedAt !== null;

  // 閲覧専用カードは終了後だけ。プレイ中に開かれたらプレイ画面の URL に戻す
  useEffect(() => {
    if (room && !ended && view === "card") navigate(`/room/${code}`, { replace: true });
  }, [room, ended, view, code]);

  const showCards = () => navigate(`/room/${code}/card`, { state: { fromResult: true } });
  // 結果画面から来たなら履歴を戻る（ブラウザの戻ると同じ動き）。直接開いた場合は結果画面へ置き換える
  const backToResult = () => {
    if (cameFromResult(history.state)) history.back();
    else navigate(`/room/${code}`, { replace: true });
  };

  if (status === "notFound") {
    return (
      <main>
        <h1>ルームが見つかりません</h1>
        <p>ルームコード {code} のルームはありません。</p>
        <button onClick={() => navigate("/")}>トップへ戻る</button>
      </main>
    );
  }

  return (
    <main>
      <h1>ルーム {code}</h1>
      {status !== "open" && <p className="hint">{status === "connecting" ? "接続中…" : "切断されました。再接続しています…"}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {room &&
        (ended ? (
          view === "card" ? (
            <ReadOnlyCards room={room} you={you} onBack={backToResult} />
          ) : (
            <ResultView room={room} you={you} onShowCards={showCards} />
          )
        ) : you ? (
          <PlayView room={room} you={you} send={send} />
        ) : (
          <JoinForm room={room} onJoin={(name, teamId) => send({ type: "join", name, teamId })} />
        ))}
    </main>
  );
}

function JoinForm({ room, onJoin }: { room: RoomState; onJoin: (name: string, teamId: number) => void }) {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const normalized = normalizeName(name);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized && teamId !== null) onJoin(normalized, teamId);
      }}
    >
      <p className="hint">{describeSettings(room.settings)}</p>
      <label className="field">
        表示名
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} />
      </label>
      <fieldset>
        <legend>チーム（参加後は変更できません）</legend>
        {room.teams.map((team) => {
          const members = room.participants.filter((p) => p.teamId === team.id);
          return (
            <label key={team.id}>
              <input type="radio" name="team" checked={teamId === team.id} onChange={() => setTeamId(team.id)} />
              <TeamBadge color={team.color} /> {team.name}（{members.length}人）
            </label>
          );
        })}
      </fieldset>
      <button type="submit" className="primary" disabled={!normalized || teamId === null}>
        参加する
      </button>
    </form>
  );
}

function PlayView({ room, you, send }: { room: RoomState; you: Participant; send: (message: ClientMessage) => boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const closeSheet = useCallback(() => setSelected(null), []);
  const myTeam = you.teamId !== null ? room.teams[you.teamId] : undefined;
  const moderator = isModerator(you);
  const individual = room.settings.cardMode === "individual";

  // 個別カードで GM / 操作主はタブでチームを切り替える。プレイヤーは自チームのカードだけ
  const [tabTeamId, setTabTeamId] = useState(you.teamId ?? 0);
  const viewTeamId = individual ? (moderator ? tabTeamId : you.teamId) : you.teamId;
  const viewTeam = viewTeamId !== null ? room.teams[viewTeamId] : undefined;
  const myRights = room.stealRights.filter((r) => r.teamId === you.teamId && r.usedAt === null);
  const stealRight = myRights[0];

  return (
    <>
      <p>
        あなた：{you.name}（{ROLE_LABEL[you.role]}
        {myTeam && (
          <>
            {" / "}
            <TeamName team={myTeam} />
          </>
        )}
        ）
      </p>
      <p className="hint">
        ルームコード <strong>{room.code}</strong> ・ {describeSettings(room.settings)}
      </p>

      <Standings room={room} myTeamId={you.teamId} />

      {stealRight && (
        <p className="steal-banner" role="status">
          特別ミッションで1位になりました！ 他チームのマスを1つ奪えます（残り {myRights.length} 回）。カードで光っているマスをタップしてください
        </p>
      )}

      {moderator && <EndGameButton onEnd={() => send({ type: "end" })} />}

      {you.role === "gm" && (
        <ApprovalQueue
          room={room}
          onApprove={(applicationId) => send({ type: "approve", applicationId })}
          onReject={(applicationId, comment) => send({ type: "reject", applicationId, comment })}
        />
      )}

      {!individual && <MissionPanel room={room} you={you} send={send} />}

      <section>
        {individual && moderator ? (
          <>
            <h2>各チームのカード</h2>
            <TeamTabs teams={room.teams} selected={tabTeamId} myTeamId={you.teamId} onSelect={setTabTeamId} />
          </>
        ) : (
          <h2>{individual && viewTeam ? `${viewTeam.name}のカード` : "共有カード"}</h2>
        )}
        <Board room={room} viewTeamId={viewTeamId} stealing={!!stealRight} onSelect={setSelected} />
        {moderator && <p className="hint">取得済みのマスをタップすると取り消せます</p>}
      </section>

      {individual && !moderator && (
        <section>
          <h2>他チームの進捗</h2>
          <div className="mini-cards">
            {room.teams
              .filter((team) => team.id !== you.teamId)
              .map((team) => (
                <MiniCard key={team.id} room={room} team={team} />
              ))}
          </div>
        </section>
      )}

      <Timeline room={room} />

      <details>
        <summary>参加者（{room.participants.length}人）</summary>
        <Members room={room} you={you} />
      </details>

      {selected !== null && (
        <CellSheet
          room={room}
          position={selected}
          viewTeamId={viewTeamId}
          canApply={you.teamId !== null && viewTeamId === you.teamId}
          canRevoke={moderator}
          canSteal={!!stealRight}
          onSteal={() => {
            if (stealRight && send({ type: "steal", rightId: stealRight.id, position: selected })) closeSheet();
          }}
          onApply={(comment, imageIds) => {
            if (send({ type: "apply", position: selected, comment, imageIds })) closeSheet();
          }}
          onRevoke={(teamId, reason) => {
            if (send({ type: "revoke", teamId, position: selected, reason })) closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </>
  );
}

// 押し間違いを防ぐため、もう一度確認してから終了する
function EndGameButton({ onEnd }: { onEnd: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <p>
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          ゲーム終了
        </button>
      </p>
    );
  }
  return (
    <div className="confirm" role="alertdialog" aria-label="ゲーム終了の確認">
      <p>ゲームを終了しますか？ 終了すると申請や取り消しはできなくなります。</p>
      <div className="row-actions">
        <button type="button" className="danger" onClick={onEnd}>
          終了する
        </button>
        <button type="button" onClick={() => setConfirming(false)}>
          やめる
        </button>
      </div>
    </div>
  );
}

function Members({ room, you }: { room: RoomState; you: Participant }) {
  const gm = room.participants.find((p) => p.role === "gm");
  return (
    <>
      {gm && <p>GM：{gm.name}</p>}
      <ul>
        {room.teams.map((team) => (
          <li key={team.id}>
            <TeamName team={team} />
            <ul>
              {room.participants
                .filter((p) => p.teamId === team.id)
                .map((p) => (
                  <li key={p.id}>
                    {p.name}
                    {p.role === "operator" && "（操作主）"}
                    {p.id === you.id && "（あなた）"}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function describeSettings(s: RoomSettings): string {
  return [
    s.hasGm ? "GMあり" : "GMなし",
    s.cardMode === "individual" ? "個別カード" : "共有カード",
    `${s.cardSize}×${s.cardSize}`,
    s.free ? "FREEあり" : "FREEなし",
    `目標 ${s.targetBingo} ビンゴ`,
    ...(s.cardMode === "shared" ? [s.autoEnd ? "自動終了する" : "自動終了しない"] : []),
  ].join(" ・ ");
}
