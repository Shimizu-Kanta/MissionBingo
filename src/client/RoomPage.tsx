import { useCallback, useState } from "react";
import {
  MAX_NAME_LENGTH,
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
import { navigate } from "./navigation";
import { Standings } from "./Standings";
import { TeamBadge, TeamName } from "./TeamBadge";
import { Timeline } from "./Timeline";
import { useRoom } from "./useRoom";

const ROLE_LABEL: Record<Role, string> = { gm: "GM", operator: "操作主", player: "プレイヤー" };

export function RoomPage({ code }: { code: string }) {
  const { status, room, you, error, send } = useRoom(code);

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
        (you ? (
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

      {you.role === "gm" && (
        <ApprovalQueue
          room={room}
          onApprove={(applicationId) => send({ type: "approve", applicationId })}
          onReject={(applicationId, comment) => send({ type: "reject", applicationId, comment })}
        />
      )}

      <section>
        <h2>{myTeam ? `${myTeam.name}のカード` : room.settings.cardMode === "shared" ? "共有カード" : "カード"}</h2>
        <Board room={room} viewTeamId={you.teamId} onSelect={setSelected} />
      </section>

      <Timeline room={room} />

      <details>
        <summary>参加者（{room.participants.length}人）</summary>
        <Members room={room} you={you} />
      </details>

      {selected !== null && (
        <CellSheet
          room={room}
          position={selected}
          viewTeamId={you.teamId}
          canApply={you.teamId !== null}
          onApply={(comment) => {
            if (send({ type: "apply", position: selected, comment })) closeSheet();
          }}
          onClose={closeSheet}
        />
      )}
    </>
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
