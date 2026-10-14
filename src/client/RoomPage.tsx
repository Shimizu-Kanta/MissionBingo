import { useState } from "react";
import { MAX_NAME_LENGTH, normalizeName, type Participant, type Role, type RoomState } from "../shared/types";
import { navigate } from "./navigation";
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
      {status !== "open" && <p>{status === "connecting" ? "接続中…" : "切断されました。再接続しています…"}</p>}
      {error && <p role="alert">{error}</p>}
      {room &&
        (you ? (
          <Lobby room={room} you={you} />
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
      <label>
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
      <button type="submit" disabled={!normalized || teamId === null}>
        参加する
      </button>
    </form>
  );
}

function Lobby({ room, you }: { room: RoomState; you: Participant }) {
  const myTeam = room.teams.find((t) => t.id === you.teamId);
  const gm = room.participants.find((p) => p.role === "gm");

  return (
    <>
      <p>
        ルームコード <strong>{room.code}</strong> を伝えると参加できます。
      </p>
      <p>
        あなた：{you.name}（{ROLE_LABEL[you.role]}
        {myTeam && ` / ${myTeam.name}`}）
      </p>
      {gm && <p>GM：{gm.name}</p>}
      <ul>
        {room.teams.map((team) => (
          <li key={team.id}>
            <TeamBadge color={team.color} /> {team.name}
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

function TeamBadge({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{ display: "inline-block", width: "0.8em", height: "0.8em", borderRadius: "50%", background: color }}
    />
  );
}
