import { useEffect, useState } from "react";
import {
  MAX_COMMENT_LENGTH,
  MAX_MISSION_MINUTES,
  MAX_MISSION_SCORE,
  MAX_MISSION_TITLE_LENGTH,
  MIN_MISSION_MINUTES,
  MISSION_KINDS,
  isModerator,
  normalizeComment,
  normalizeMissionTitle,
  type ClientMessage,
  type Mission,
  type MissionKind,
  type Participant,
  type RoomState,
} from "../shared/types";
import { formatTime } from "./format";
import { TeamName } from "./TeamBadge";

export const MISSION_KIND_LABEL: Record<MissionKind, string> = { speed: "速さ", quantity: "量", quality: "質" };

const KIND_HINT: Record<MissionKind, string> = {
  speed: "最初に認められたチームが勝ち",
  quantity: "制限時間内に何件でも提出。時間切れ後に数を比べる",
  quality: "1チーム1件。時間切れ後に1位を決める",
};

const MINUTE_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60].filter((m) => m >= MIN_MISSION_MINUTES && m <= MAX_MISSION_MINUTES);

type Send = (message: ClientMessage) => boolean;

// 1秒ごとに現在時刻を更新する（残り時間の表示用）
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// 共有カードの特別ミッション。GM / 操作主は発生・判定、プレイヤーは提出・投票を行う
export function MissionPanel({ room, you, send }: { room: RoomState; you: Participant; send: Send }) {
  const now = useNow();
  const active = room.missions.filter((m) => m.status !== "done");
  const done = room.missions.filter((m) => m.status === "done").reverse();

  return (
    <section>
      <h2>特別ミッション</h2>
      {isModerator(you) && <StartMissionForm room={room} send={send} />}
      {active.length === 0 ? (
        <p className="hint">実施中の特別ミッションはありません</p>
      ) : (
        active.map((m) => <MissionCard key={m.id} room={room} you={you} mission={m} now={now} send={send} />)
      )}
      {done.length > 0 && (
        <details>
          <summary>終わった特別ミッション（{done.length}件）</summary>
          {done.map((m) => (
            <MissionCard key={m.id} room={room} you={you} mission={m} now={now} send={send} />
          ))}
        </details>
      )}
    </section>
  );
}

function StartMissionForm({ room, send }: { room: RoomState; send: Send }) {
  const busy = new Set(room.missions.filter((m) => m.status !== "done").map((m) => m.kind));
  const available = MISSION_KINDS.filter((k) => !busy.has(k));
  const [kind, setKind] = useState<MissionKind>("speed");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(5);
  const selected = available.includes(kind) ? kind : available[0];
  const normalized = normalizeMissionTitle(title);

  if (!selected) return <p className="hint">3タイプとも実施中です</p>;
  return (
    <form
      className="mission-start"
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized && send({ type: "startMission", kind: selected, title: normalized, minutes })) setTitle("");
      }}
    >
      <div className="row-actions">
        <label>
          タイプ{" "}
          <select value={selected} onChange={(e) => setKind(MISSION_KINDS.find((k) => k === e.target.value) ?? "speed")}>
            {available.map((k) => (
              <option key={k} value={k}>
                {MISSION_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          制限時間{" "}
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">{KIND_HINT[selected]}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={MAX_MISSION_TITLE_LENGTH}
        placeholder="お題（例：一番早く赤い車を撮る）"
        aria-label="特別ミッションのお題"
      />
      <button type="submit" className="primary" disabled={!normalized}>
        特別ミッションを発生させる
      </button>
    </form>
  );
}

function MissionCard({ room, you, mission: m, now, send }: { room: RoomState; you: Participant; mission: Mission; now: number; send: Send }) {
  const remaining = Math.max(0, m.endsAt - now);
  const mySubs = m.submissions.filter((s) => s.teamId === you.teamId);
  const canSubmit =
    you.teamId !== null &&
    m.status === "open" &&
    remaining > 0 &&
    !(m.kind === "speed" && mySubs.some((s) => s.status === "pending")) &&
    !(m.kind === "quality" && mySubs.length > 0);

  return (
    <article className={`mission ${m.status}`}>
      <p className="mission-head">
        <span className="tag">{MISSION_KIND_LABEL[m.kind]}</span> <strong>{m.title}</strong>
      </p>
      <p className="hint">{statusText(m, remaining, room.settings.hasGm)}</p>

      {m.status === "done" && <MissionResultView room={room} mission={m} />}

      {m.submissions.length > 0 && (
        <ul className="mission-subs">
          {m.submissions.map((s) => (
            <li key={s.id}>
              <time>{formatTime(s.createdAt)}</time> <TeamName team={room.teams[s.teamId]} /> {s.participantName}：{s.comment}
              {s.status === "pending" && <span className="tag">確認待ち</span>}
              {s.status === "rejected" && <span className="error">（却下：{s.rejectComment}）</span>}
              {s.status === "approved" && <strong>（許可）</strong>}
              {you.role === "gm" && s.status === "pending" && <JudgeSubmission submissionId={s.id} send={send} />}
            </li>
          ))}
        </ul>
      )}

      {canSubmit && <SubmitForm missionId={m.id} send={send} />}
      {isModerator(you) && m.status === "judging" && m.kind === "quantity" && <ScoreForm room={room} mission={m} send={send} />}
      {isModerator(you) && m.status === "judging" && m.kind === "quality" && <PickWinnersForm room={room} mission={m} send={send} />}
      {m.status === "voting" && <VoteForm room={room} you={you} mission={m} send={send} />}
    </article>
  );
}

function statusText(m: Mission, remaining: number, hasGm: boolean): string {
  switch (m.status) {
    case "open": {
      if (remaining > 0) {
        const sec = Math.ceil(remaining / 1000);
        return `残り ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      }
      return hasGm ? "時間切れ（時間内の提出を GM が確認中）" : "時間切れ";
    }
    case "judging":
      return "時間切れ。判定待ちです";
    case "voting":
      return "時間切れ。投票を受け付けています";
    case "done":
      return "終了";
  }
}

function MissionResultView({ room, mission: m }: { room: RoomState; mission: Mission }) {
  return (
    <>
      <p>
        1位：
        {m.winnerTeamIds.length === 0
          ? "なし"
          : m.winnerTeamIds.map((id, i) => (
              <span key={id}>
                {i > 0 && "・"}
                <TeamName team={room.teams[id]} />
              </span>
            ))}
      </p>
      {m.scores && (
        <p className="hint">
          {m.kind === "quality" ? "得票" : "数"}：
          {m.scores.map((s) => `${room.teams[s.teamId]?.name ?? "?"} ${s.value}`).join(" / ")}
        </p>
      )}
    </>
  );
}

function SubmitForm({ missionId, send }: { missionId: number; send: Send }) {
  const [comment, setComment] = useState("");
  const normalized = normalizeComment(comment);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized && send({ type: "submitMission", missionId, comment: normalized })) setComment("");
      }}
    >
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="提出するコメント（必須）"
        aria-label="提出するコメント"
      />
      <button type="submit" className="primary" disabled={!normalized}>
        提出する
      </button>
    </form>
  );
}

function JudgeSubmission({ submissionId, send }: { submissionId: number; send: Send }) {
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const normalized = normalizeComment(comment);
  if (!rejecting) {
    return (
      <span className="row-actions inline">
        <button type="button" className="primary" onClick={() => send({ type: "approveMission", submissionId })}>
          許可
        </button>
        <button type="button" onClick={() => setRejecting(true)}>
          却下
        </button>
      </span>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized) send({ type: "rejectMission", submissionId, comment: normalized });
      }}
    >
      <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={MAX_COMMENT_LENGTH} placeholder="却下の理由（必須）" aria-label="却下の理由" />
      <div className="row-actions">
        <button type="submit" className="danger" disabled={!normalized}>
          却下する
        </button>
        <button type="button" onClick={() => setRejecting(false)}>
          やめる
        </button>
      </div>
    </form>
  );
}

// 量：提出を見て各チームの数を入力する。初期値は提出件数
function ScoreForm({ room, mission: m, send }: { room: RoomState; mission: Mission; send: Send }) {
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(room.teams.map((t) => [t.id, String(m.submissions.filter((s) => s.teamId === t.id).length)])),
  );
  const scores = room.teams.map((t) => ({ teamId: t.id, value: Number(values[t.id]) }));
  const valid = scores.every((s) => Number.isInteger(s.value) && s.value >= 0 && s.value <= MAX_MISSION_SCORE);
  return (
    <form
      className="judge"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) send({ type: "scoreMission", missionId: m.id, scores });
      }}
    >
      <p>各チームの数を入力してください（初期値は提出件数）</p>
      {room.teams.map((t) => (
        <label key={t.id} className="score-row">
          <TeamName team={t} />
          <input
            type="number"
            min={0}
            max={MAX_MISSION_SCORE}
            value={values[t.id] ?? "0"}
            onChange={(e) => setValues((prev) => ({ ...prev, [t.id]: e.target.value }))}
          />
        </label>
      ))}
      <button type="submit" className="primary" disabled={!valid}>
        この数で判定する
      </button>
    </form>
  );
}

// 質：提出したチームから1位を選ぶ（複数選ぶと同率1位）
function PickWinnersForm({ room, mission: m, send }: { room: RoomState; mission: Mission; send: Send }) {
  const [picked, setPicked] = useState<number[]>([]);
  const teams = [...new Set(m.submissions.map((s) => s.teamId))];
  return (
    <form
      className="judge"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked.length > 0) send({ type: "pickWinners", missionId: m.id, teamIds: picked });
      }}
    >
      <p>1位のチームを選んでください（複数選ぶと同率1位）</p>
      {teams.map((id) => (
        <label key={id} className="check">
          <input
            type="checkbox"
            checked={picked.includes(id)}
            onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, id] : prev.filter((x) => x !== id)))}
          />
          <TeamName team={room.teams[id]} />
        </label>
      ))}
      <button type="submit" className="primary" disabled={picked.length === 0}>
        1位を決める
      </button>
    </form>
  );
}

// 質（全員投票）：1人1票、自チームには入れられない
function VoteForm({ room, you, mission: m, send }: { room: RoomState; you: Participant; mission: Mission; send: Send }) {
  const [choice, setChoice] = useState<number | null>(null);
  const voted = m.voterIds.includes(you.id);
  const voters = room.participants.filter((p) => p.teamId !== null).length;
  const candidates = [...new Set(m.submissions.map((s) => s.teamId))].filter((id) => id !== you.teamId);

  return (
    <div className="judge">
      <p>
        投票済み {m.voterIds.length} / {voters} 人
      </p>
      {voted ? (
        <p>投票しました</p>
      ) : you.teamId === null ? null : candidates.length === 0 ? (
        <p className="hint">投票できるチームがありません</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (choice !== null) send({ type: "vote", missionId: m.id, teamId: choice });
          }}
        >
          {candidates.map((id) => (
            <label key={id} className="check">
              <input type="radio" name={`vote-${m.id}`} checked={choice === id} onChange={() => setChoice(id)} />
              <TeamName team={room.teams[id]} />
            </label>
          ))}
          <button type="submit" className="primary" disabled={choice === null}>
            投票する
          </button>
        </form>
      )}
      {isModerator(you) && (
        <button type="button" onClick={() => send({ type: "closeVoting", missionId: m.id })}>
          投票を締め切る
        </button>
      )}
    </div>
  );
}
