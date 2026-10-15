import { useState } from "react";
import {
  MAX_MISSION_SCORE,
  MAX_MISSION_TITLE_LENGTH,
  MISSION_KINDS,
  imageUrl,
  isModerator,
  normalizeMissionTitle,
  type ClientMessage,
  type Mission,
  type MissionKind,
  type Participant,
  type RoomState,
} from "../shared/types";
import { MISSION_INFO, missionJudge, missionRule, teamNames } from "./derive";
import { DISABLED, INK, LINE, SOFT, c1, c2, c3, pad2 } from "./theme";
import { CloseButton, Modal } from "./ui";

type Send = (message: ClientMessage) => boolean;

const LIMITS = [3, 5, 10];

// 実施中の特別ミッションのバナー（カード上部の濃色）。1つのミッションにつき1本
export function MissionBanner({
  room,
  you,
  mission: m,
  now,
  send,
  onSubmit,
  onJudge,
}: {
  room: RoomState;
  you: Participant;
  mission: Mission;
  now: number;
  send: Send;
  onSubmit: () => void;
  onJudge: () => void;
}) {
  const remaining = Math.max(0, m.endsAt - now);
  const open = m.status === "open" && remaining > 0;
  const mine = m.submissions.filter((s) => s.teamId === you.teamId);
  const isPlayer = you.teamId !== null;
  const moderator = isModerator(you);
  const sec = Math.ceil(remaining / 1000);

  let remainText = `残り ${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
  if (!open) remainText = m.status === "voting" ? "投票受付中" : "時間切れ · 判定待ち";

  const canSubmit = isPlayer && open && !(m.kind === "speed" && mine.some((s) => s.status === "pending")) && !(m.kind === "quality" && mine.length > 0);
  const submitted = isPlayer && open && !canSubmit;
  const voted = m.voterIds.includes(you.id);

  return (
    <div className="banner-dark">
      <div className="info">
        <div className="line">
          <span className="sp-label">特別ミッション · {MISSION_INFO[m.kind].label}</span>
          <span className="remain">{remainText}</span>
        </div>
        <div className="title">{m.title}</div>
        <div className="rule">{missionRule(m.kind, room.settings.hasGm)} · 1位のチームは他チームのマスを1つ奪えます</div>
      </div>
      <div className="actions">
        {canSubmit && (
          <button type="button" className="light-btn" onClick={onSubmit}>
            {m.kind === "speed" ? "提出する" : "写真を提出"}
          </button>
        )}
        {submitted && <span className="done-text">{m.kind === "speed" ? "確認待ち" : "提出済み"}</span>}
        {m.status === "voting" && isPlayer && !voted && (
          <button type="button" className="light-btn" onClick={onJudge}>
            投票する
          </button>
        )}
        {m.status === "voting" && voted && <span className="done-text">投票済み</span>}
        {moderator && open && (
          <button type="button" className="ghost-btn" onClick={() => send({ type: "closeMission", missionId: m.id })}>
            締め切って判定
          </button>
        )}
        {moderator && m.status === "judging" && (
          <button type="button" className="light-btn" onClick={onJudge}>
            判定する
          </button>
        )}
        {moderator && m.status === "voting" && (
          <button type="button" className="ghost-btn" onClick={() => send({ type: "closeVoting", missionId: m.id })}>
            投票を締め切る
          </button>
        )}
        {moderator && m.kind === "speed" && m.status === "open" && !open && <span className="done-text">承認待ちで確認してください</span>}
      </div>
    </div>
  );
}

// 1位のチームが奪うマスを選んでいる間のバナー（チームカラー）
export function StealBanner({ room, teamId, count, mine }: { room: RoomState; teamId: number; count: number; mine: boolean }) {
  const team = room.teams[teamId];
  if (!team) return null;
  return (
    <div className="steal-banner" style={{ background: c1(team.hue) }}>
      <b>{team.name}が奪うマスを選択中</b>
      <span>
        {mine ? "点線のマスをタップ。ビンゴ成立ラインのマスも奪えます。" : "1位のチームが他チームのマスを1つ奪います。"}
        {count > 1 ? `（あと${count}マス）` : ""}
      </span>
    </div>
  );
}

export function MissionSetupModal({ room, send, onClose }: { room: RoomState; send: Send; onClose: () => void }) {
  const busy = new Set(room.missions.filter((m) => m.status !== "done").map((m) => m.kind));
  const [kind, setKind] = useState<MissionKind>(MISSION_KINDS.find((k) => !busy.has(k)) ?? "speed");
  const [title, setTitle] = useState("");
  const [limit, setLimit] = useState(5);
  const normalized = normalizeMissionTitle(title);
  const ok = normalized !== null && !busy.has(kind);

  return (
    <Modal onClose={onClose} label="特別ミッションを発生させる">
      <div className="modal-head">
        <div className="stack">
          <span className="modal-title">特別ミッションを発生させる</span>
          <span className="hint">1位のチームが他チームのマスを1つ奪えます</span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="type-cards">
        {MISSION_KINDS.map((k) => (
          <button key={k} type="button" className={kind === k ? "on" : undefined} disabled={busy.has(k)} onClick={() => setKind(k)}>
            <b>{MISSION_INFO[k].label}</b>
            <span>{busy.has(k) ? "実施中" : MISSION_INFO[k].ex}</span>
          </button>
        ))}
      </div>
      <div className="field">
        <span className="label" style={{ fontSize: 12 }}>
          お題
        </span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_MISSION_TITLE_LENGTH}
          placeholder={`例：${MISSION_INFO[kind].placeholder}`}
          aria-label="特別ミッションのお題"
        />
        <span className="hint">判定：{missionRule(kind, room.settings.hasGm)}</span>
      </div>
      <div className="field">
        <span className="label" style={{ fontSize: 12 }}>
          制限時間
        </span>
        <div className="limit-pills">
          {LIMITS.map((m) => (
            <button key={m} type="button" className={limit === m ? "on" : undefined} onClick={() => setLimit(m)}>
              {m}分
            </button>
          ))}
        </div>
      </div>
      <div className="judge-by">判定者：{missionJudge(room, kind)}</div>
      <button
        type="button"
        className={`btn primary lg${ok ? "" : " off"}`}
        onClick={() => {
          if (ok && normalized && send({ type: "startMission", kind, title: normalized, minutes: limit })) onClose();
        }}
      >
        全員に発生させる
      </button>
    </Modal>
  );
}

// 判定（量：数を入力 / 質：1位を選ぶ）と、全員投票
export function MissionJudgeModal({
  room,
  you,
  mission: m,
  send,
  onClose,
}: {
  room: RoomState;
  you: Participant;
  mission: Mission;
  send: Send;
  onClose: () => void;
}) {
  const voting = m.status === "voting";
  const submittedTeams = [...new Set(m.submissions.map((s) => s.teamId))].sort((a, b) => a - b);
  const rows = m.kind === "quantity" ? room.teams.map((t) => t.id) : submittedTeams;
  const firstImage = (teamId: number) => m.submissions.find((s) => s.teamId === teamId && s.imageIds.length > 0)?.imageIds[0];
  const imageCount = (teamId: number) => m.submissions.filter((s) => s.teamId === teamId).reduce((n, s) => n + Math.max(1, s.imageIds.length), 0);
  const whoOf = (teamId: number) => [...new Set(m.submissions.filter((s) => s.teamId === teamId).map((s) => s.participantName))].join("・") || "提出なし";

  const [counts, setCounts] = useState<Record<number, string>>(() => Object.fromEntries(room.teams.map((t) => [t.id, String(imageCount(t.id))])));
  const [picked, setPicked] = useState<number[]>([]);
  const [vote, setVote] = useState<number | null>(null);

  const scores = room.teams.map((t) => ({ teamId: t.id, value: Number(counts[t.id]) }));
  const scoresValid = scores.every((s) => Number.isInteger(s.value) && s.value >= 0 && s.value <= MAX_MISSION_SCORE);
  const max = Math.max(0, ...scores.map((s) => (Number.isFinite(s.value) ? s.value : 0)));
  const quantityWinners = max > 0 ? scores.filter((s) => s.value === max).map((s) => s.teamId) : [];

  let winners: number[] = [];
  let confirmLabel = "";
  let onConfirm: (() => void) | null = null;
  if (voting) {
    confirmLabel = vote === null ? "投票してください" : `${room.teams[vote]?.name}に投票する`;
    if (vote !== null) onConfirm = () => send({ type: "vote", missionId: m.id, teamId: vote }) && onClose();
  } else if (m.kind === "quantity") {
    winners = quantityWinners;
    confirmLabel = winners.length ? `${teamNames(room, winners)}を1位で確定` : "1位なしで確定";
    if (scoresValid) onConfirm = () => send({ type: "scoreMission", missionId: m.id, scores }) && onClose();
  } else {
    winners = picked;
    confirmLabel = picked.length ? `${teamNames(room, picked)}を1位で確定` : "1位を選んでください";
    if (picked.length) onConfirm = () => send({ type: "pickWinners", missionId: m.id, teamIds: picked }) && onClose();
  }

  const judgeBy = voting ? "全員投票（自チームは不可）" : room.settings.hasGm ? "GMが判定" : "操作主が判定";

  return (
    <Modal onClose={onClose} label="特別ミッションの判定">
      <div className="modal-head">
        <div className="stack">
          <span className="sp-label">特別ミッション · {MISSION_INFO[m.kind].label}</span>
          <span className="modal-title" style={{ fontSize: 18 }}>
            {m.title}
          </span>
          <span className="hint">
            {judgeBy} · {missionRule(m.kind, room.settings.hasGm)}
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {voting && (
        <div className="hint">
          投票済み {m.voterIds.length} / {room.participants.filter((p) => p.teamId !== null).length} 人
        </div>
      )}
      <div className="judge-rows">
        {rows.map((teamId) => {
          const team = room.teams[teamId];
          if (!team) return null;
          const own = teamId === you.teamId;
          const selected = voting ? vote === teamId : m.kind === "quantity" ? quantityWinners.includes(teamId) : picked.includes(teamId);
          const img = firstImage(teamId);
          const style = {
            border: selected ? `2px solid ${c1(team.hue)}` : `1px solid ${LINE}`,
            background: selected ? c2(team.hue) : voting && own ? SOFT : "#fff",
          };
          const content = (
            <>
              {m.kind !== "speed" && (img ? <img src={imageUrl(room.code, img)} alt="提出写真" /> : <span className="noimg" />)}
              <span className="team-dot" style={{ width: 10, height: 10, borderRadius: 3, background: c1(team.hue) }} />
              <span className="names">
                <b>{team.name}</b>
                <span>{whoOf(teamId)}</span>
              </span>
            </>
          );
          if (m.kind === "quantity" && !voting) {
            return (
              <label key={teamId} className="judge-row" style={style}>
                {content}
                <input
                  type="number"
                  min={0}
                  max={MAX_MISSION_SCORE}
                  value={counts[teamId] ?? "0"}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [teamId]: e.target.value }))}
                  aria-label={`${team.name}の数`}
                />
                <span className="tag" style={{ color: c3(team.hue) }}>
                  {selected ? "1位" : ""}
                </span>
              </label>
            );
          }
          const tag = voting ? (own ? "自チーム" : selected ? "投票" : "") : selected ? "1位" : "";
          return (
            <button
              key={teamId}
              type="button"
              className="judge-row"
              style={style}
              disabled={voting && own}
              onClick={() => {
                if (voting) setVote(teamId);
                else setPicked((prev) => (prev.includes(teamId) ? prev.filter((x) => x !== teamId) : [...prev, teamId]));
              }}
            >
              {content}
              <span className="tag" style={{ color: voting && own ? "oklch(0.5 0.012 250)" : c3(team.hue) }}>
                {tag}
              </span>
            </button>
          );
        })}
        {rows.length === 0 && <div className="hint">提出したチームがありません</div>}
      </div>
      {winners.length > 1 && <div className="tie-note">同率：1位のチームすべてが1マスずつ奪えます</div>}
      {!voting && m.kind === "quality" && <div className="hint">複数選ぶと同率1位になります</div>}
      <button
        type="button"
        className="btn primary lg"
        style={{ background: onConfirm ? INK : DISABLED }}
        onClick={() => onConfirm?.()}
      >
        {confirmLabel}
      </button>
      {voting && isModerator(you) && (
        <button type="button" className="btn" onClick={() => send({ type: "closeVoting", missionId: m.id }) && onClose()}>
          投票を締め切って結果を出す
        </button>
      )}
    </Modal>
  );
}
