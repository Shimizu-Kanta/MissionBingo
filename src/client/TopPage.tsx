import { useState } from "react";
import {
  DEFAULT_TEAMS,
  MAX_NAME_LENGTH,
  MAX_TEAMS,
  MIN_TEAMS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  normalizeName,
  parseCreateRoomResponse,
  teamsFor,
  type CreateRoomRequest,
} from "../shared/types";
import { navigate } from "./navigation";
import { getDeviceToken } from "./token";

const TEAM_COUNT_OPTIONS = Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => MIN_TEAMS + i);
const ROOM_CODE_CHARS = new Set(ROOM_CODE_ALPHABET);

export function TopPage() {
  return (
    <main>
      <h1>ミッションビンゴ</h1>
      <JoinRoomForm />
      <CreateRoomForm />
    </main>
  );
}

function JoinRoomForm() {
  const [code, setCode] = useState("");
  const valid = ROOM_CODE_PATTERN.test(code);

  return (
    <section>
      <h2>ルームに参加</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) navigate(`/room/${code}`);
        }}
      >
        <label>
          ルームコード
          <input
            value={code}
            onChange={(e) => {
              const chars = [...e.target.value.toUpperCase()].filter((ch) => ROOM_CODE_CHARS.has(ch));
              setCode(chars.join("").slice(0, ROOM_CODE_LENGTH));
            }}
            placeholder="6文字"
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={!valid}>
          参加する
        </button>
      </form>
    </section>
  );
}

function CreateRoomForm() {
  const [name, setName] = useState("");
  const [hasGm, setHasGm] = useState(true);
  const [teamCount, setTeamCount] = useState(DEFAULT_TEAMS);
  const [teamId, setTeamId] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeName(name);
  const teams = teamsFor(teamCount);
  const myTeamId = Math.min(teamId, teamCount - 1);

  const submit = async () => {
    if (!normalized) return;
    setSubmitting(true);
    setError(null);
    const body: CreateRoomRequest = {
      token: getDeviceToken(),
      name: normalized,
      settings: { hasGm, teamCount },
      teamId: hasGm ? null : myTeamId,
    };
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const created = res.ok ? parseCreateRoomResponse(await res.json()) : null;
      if (!created) throw new Error("invalid response");
      navigate(`/room/${created.code}`);
    } catch {
      setError("ルームを作成できませんでした。もう一度お試しください");
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h2>ルームを作る</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} />
        </label>
        <fieldset>
          <legend>GM</legend>
          <label>
            <input type="radio" name="gm" checked={hasGm} onChange={() => setHasGm(true)} />
            あり（あなたが GM になり、どのチームにも入りません）
          </label>
          <label>
            <input type="radio" name="gm" checked={!hasGm} onChange={() => setHasGm(false)} />
            なし（あなたが操作主になり、チームに入ってプレイします）
          </label>
        </fieldset>
        <label>
          チーム数
          <select value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))}>
            {TEAM_COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {!hasGm && (
          <label>
            あなたのチーム（あとから変更できません）
            <select value={myTeamId} onChange={(e) => setTeamId(Number(e.target.value))}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={!normalized || submitting}>
          作成する
        </button>
      </form>
    </section>
  );
}
