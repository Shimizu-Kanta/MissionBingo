// 特別ミッション（共有カードのみ）。状態の変更はすべて RoomDO のトランザクション内から呼ぶ
import {
  isModerator,
  parseTeamScores,
  type Mission,
  type MissionKind,
  type MissionStatus,
  type MissionSubmission,
  type Participant,
  type RoomState,
  type StealRight,
  type TeamScore,
  type TimelineEvent,
} from "../shared/types";

export const MISSIONS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    winners TEXT NOT NULL DEFAULT '[]',
    scores TEXT
  );
  CREATE TABLE IF NOT EXISTS mission_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    participant_id TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    comment TEXT NOT NULL,
    status TEXT NOT NULL,
    reject_comment TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mission_votes (
    mission_id INTEGER NOT NULL,
    participant_id TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    PRIMARY KEY (mission_id, participant_id)
  );
  CREATE TABLE IF NOT EXISTS steal_rights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    used_at INTEGER,
    position INTEGER
  );
`;

const AUTO_REJECT_COMMENT = "他のチームが先に許可されました";

type MissionRow = {
  id: number;
  kind: string;
  title: string;
  started_at: number;
  ends_at: number;
  status: string;
  winners: string;
  scores: string | null;
};

type SubmissionRow = {
  id: number;
  mission_id: number;
  team_id: number;
  participant_name: string;
  comment: string;
  status: string;
  reject_comment: string | null;
  created_at: number;
};

export class Missions {
  constructor(
    private readonly sql: SqlStorage,
    private readonly addTimeline: (at: number, event: TimelineEvent) => void,
  ) {}

  load(): Mission[] {
    const submissions = this.sql
      .exec<SubmissionRow>(
        "SELECT id, mission_id, team_id, participant_name, comment, status, reject_comment, created_at FROM mission_submissions ORDER BY id",
      )
      .toArray();
    const votes = this.sql.exec<{ mission_id: number; participant_id: string }>("SELECT mission_id, participant_id FROM mission_votes").toArray();

    return this.sql
      .exec<MissionRow>("SELECT id, kind, title, started_at, ends_at, status, winners, scores FROM missions ORDER BY id")
      .toArray()
      .map((r) => {
        const status = toStatus(r.status);
        const winnersJson: unknown = JSON.parse(r.winners);
        const scoresJson: unknown = r.scores === null ? null : JSON.parse(r.scores);
        return {
          id: r.id,
          kind: toKind(r.kind),
          title: r.title,
          startedAt: r.started_at,
          endsAt: r.ends_at,
          status,
          submissions: submissions.filter((s) => s.mission_id === r.id).map(toSubmission),
          voterIds: votes.filter((v) => v.mission_id === r.id).map((v) => v.participant_id),
          winnerTeamIds: Array.isArray(winnersJson) ? winnersJson.filter((v): v is number => typeof v === "number") : [],
          // 得票数・入力した数は結果が出てから公開する
          scores: status === "done" ? parseTeamScores(scoresJson) : null,
        };
      });
  }

  loadStealRights(): StealRight[] {
    return this.sql
      .exec<{ id: number; mission_id: number; team_id: number; used_at: number | null; position: number | null }>(
        "SELECT id, mission_id, team_id, used_at, position FROM steal_rights ORDER BY id",
      )
      .toArray()
      .map((r) => ({ id: r.id, missionId: r.mission_id, teamId: r.team_id, usedAt: r.used_at, position: r.position }));
  }

  // 次に時間切れになる受付中のミッションの締切（アラーム用）
  nextDeadline(now: number): number | null {
    const row = this.sql
      .exec<{ next: number | null }>("SELECT MIN(ends_at) AS next FROM missions WHERE status = 'open' AND ends_at > ?", now)
      .toArray()[0];
    return row?.next ?? null;
  }

  // 時間切れになったミッションを次の段階へ進める。変化があれば true
  advance(room: RoomState, now: number): boolean {
    if (room.endedAt !== null) return false;
    let changed = false;
    for (const m of room.missions) {
      if (m.status !== "open" || m.endsAt > now) continue;
      const accepted = m.submissions.filter((s) => s.status === "accepted");
      switch (m.kind) {
        case "speed":
          // 時間内に届いた提出が判定待ちなら、GM が判定し終えるまで待つ
          if (m.submissions.some((s) => s.status === "pending")) continue;
          this.finish(m, [], null, now);
          break;
        case "quantity":
          if (accepted.length === 0) this.finish(m, [], null, now);
          else this.setStatus(m.id, "judging");
          break;
        case "quality":
          if (accepted.length === 0) this.finish(m, [], null, now);
          else this.setStatus(m.id, room.settings.hasGm || room.settings.qualityJudge === "operator" ? "judging" : "voting");
          break;
      }
      changed = true;
    }
    return changed;
  }

  start(you: Participant, room: RoomState, kind: MissionKind, title: string, minutes: number, now: number): string | null {
    if (!isModerator(you)) return "特別ミッションを出せるのは GM（GMなしのときは操作主）だけです";
    if (room.settings.cardMode !== "shared") return "特別ミッションは共有カードのときだけ使えます";
    if (room.missions.some((m) => m.kind === kind && m.status !== "done")) return "このタイプの特別ミッションはすでに実施中です";
    const id = this.sql
      .exec<{ id: number }>(
        "INSERT INTO missions (kind, title, started_at, ends_at, status) VALUES (?, ?, ?, ?, 'open') RETURNING id",
        kind,
        title,
        now,
        now + minutes * 60_000,
      )
      .one().id;
    this.addTimeline(now, { kind: "missionStarted", missionId: id, missionKind: kind, title, minutes, byName: you.name });
    return null;
  }

  submit(you: Participant, room: RoomState, missionId: number, comment: string, now: number): string | null {
    const teamId = you.teamId;
    if (teamId === null) return "GM は提出できません";
    const m = room.missions.find((x) => x.id === missionId);
    if (!m) return "その特別ミッションはありません";
    if (m.status !== "open" || now >= m.endsAt) return "このミッションの提出は締め切られています";
    const mine = m.submissions.filter((s) => s.teamId === teamId);
    if (m.kind === "speed" && mine.some((s) => s.status === "pending")) return "確認待ちの提出があります";
    if (m.kind === "quality" && mine.length > 0) return "このミッションにはすでに提出しています";

    // 速さ：GMあり は判定待ち、GMなし は通常のマスと同じく提出した時点で勝ち。量・質は受け付けるだけ
    const status = m.kind === "speed" ? (room.settings.hasGm ? "pending" : "approved") : "accepted";
    this.sql.exec(
      `INSERT INTO mission_submissions (mission_id, team_id, participant_id, participant_name, comment, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      teamId,
      you.id,
      you.name,
      comment,
      status,
      now,
    );
    this.addTimeline(now, { kind: "missionSubmitted", missionId: m.id, title: m.title, teamId, participantName: you.name, comment });
    if (status === "approved") this.finish(m, [teamId], null, now);
    return null;
  }

  approve(you: Participant, room: RoomState, submissionId: number, now: number): string | null {
    if (you.role !== "gm") return "許可できるのは GM だけです";
    const found = findSubmission(room, submissionId);
    if (!found || found.submission.status !== "pending" || found.mission.status !== "open") return "提出が見つからないか、すでに処理されています";
    const { mission, submission } = found;
    this.setSubmission(submission.id, "approved", null);
    // 最初に許可された提出で決まり。他の判定待ちは却下扱い
    for (const other of mission.submissions) {
      if (other.id === submission.id || other.status !== "pending") continue;
      this.setSubmission(other.id, "rejected", AUTO_REJECT_COMMENT);
      this.addTimeline(now, {
        kind: "missionRejected",
        missionId: mission.id,
        title: mission.title,
        teamId: other.teamId,
        comment: AUTO_REJECT_COMMENT,
        auto: true,
      });
    }
    this.finish(mission, [submission.teamId], null, now);
    return null;
  }

  reject(you: Participant, room: RoomState, submissionId: number, comment: string, now: number): string | null {
    if (you.role !== "gm") return "却下できるのは GM だけです";
    const found = findSubmission(room, submissionId);
    if (!found || found.submission.status !== "pending" || found.mission.status !== "open") return "提出が見つからないか、すでに処理されています";
    const { mission, submission } = found;
    this.setSubmission(submission.id, "rejected", comment);
    this.addTimeline(now, { kind: "missionRejected", missionId: mission.id, title: mission.title, teamId: submission.teamId, comment, auto: false });
    // 時間切れ後に最後の判定待ちが却下されたら、勝者なしで終わる
    const stillPending = mission.submissions.some((s) => s.id !== submission.id && s.status === "pending");
    if (now >= mission.endsAt && !stillPending) this.finish(mission, [], null, now);
    return null;
  }

  // 量：各チームの数を入力し、最も多いチームが勝ち（0 しかいなければ勝者なし）
  score(you: Participant, room: RoomState, missionId: number, scores: TeamScore[], now: number): string | null {
    if (!isModerator(you)) return "判定できるのは GM（GMなしのときは操作主）だけです";
    const m = room.missions.find((x) => x.id === missionId);
    if (!m || m.kind !== "quantity" || m.status !== "judging") return "判定できる状態ではありません";
    const ids = scores.map((s) => s.teamId).sort((a, b) => a - b);
    if (ids.length !== room.teams.length || ids.some((id, i) => id !== room.teams[i]?.id)) return "全チームの数を1つずつ入力してください";
    this.finish(m, topTeams(scores), scores, now);
    return null;
  }

  // 質（GM / 操作主が決める）：提出したチームの中から1位を選ぶ（複数選べば同率）
  pickWinners(you: Participant, room: RoomState, missionId: number, teamIds: number[], now: number): string | null {
    if (!isModerator(you)) return "判定できるのは GM（GMなしのときは操作主）だけです";
    const m = room.missions.find((x) => x.id === missionId);
    if (!m || m.kind !== "quality" || m.status !== "judging") return "判定できる状態ではありません";
    const submitted = new Set(m.submissions.map((s) => s.teamId));
    if (!teamIds.every((id) => submitted.has(id))) return "提出していないチームは選べません";
    this.finish(m, teamIds, null, now);
    return null;
  }

  // 質（全員投票）：1人1票、自チームには入れられない。時間切れ後に受け付ける
  vote(you: Participant, room: RoomState, missionId: number, teamId: number): string | null {
    if (you.teamId === null) return "GM は投票できません";
    const m = room.missions.find((x) => x.id === missionId);
    if (!m || m.kind !== "quality" || m.status !== "voting") return "投票を受け付けていません";
    if (m.voterIds.includes(you.id)) return "すでに投票しています";
    if (teamId === you.teamId) return "自チームには投票できません";
    if (!m.submissions.some((s) => s.teamId === teamId)) return "提出していないチームには投票できません";
    this.sql.exec("INSERT INTO mission_votes (mission_id, participant_id, team_id) VALUES (?, ?, ?)", m.id, you.id, teamId);
    return null;
  }

  closeVoting(you: Participant, room: RoomState, missionId: number, now: number): string | null {
    if (!isModerator(you)) return "投票を締め切れるのは操作主だけです";
    const m = room.missions.find((x) => x.id === missionId);
    if (!m || m.status !== "voting") return "投票を受け付けていません";
    const tally = this.sql
      .exec<{ team_id: number; votes: number }>("SELECT team_id, COUNT(*) AS votes FROM mission_votes WHERE mission_id = ? GROUP BY team_id", m.id)
      .toArray();
    const submitted = [...new Set(m.submissions.map((s) => s.teamId))].sort((a, b) => a - b);
    const scores = submitted.map((teamId) => ({ teamId, value: tally.find((t) => t.team_id === teamId)?.votes ?? 0 }));
    this.finish(m, topTeams(scores), scores, now);
    return null;
  }

  // 他チームが持っているマスを1つ奪う。空きマスは奪えない
  steal(you: Participant, room: RoomState, rightId: number, position: number, title: string, now: number): string | null {
    const teamId = you.teamId;
    if (teamId === null) return "GM は奪取できません";
    const right = room.stealRights.find((r) => r.id === rightId);
    if (!right || right.teamId !== teamId) return "あなたのチームの奪取権ではありません";
    if (right.usedAt !== null) return "この奪取権はすでに使っています";
    const claim = room.claims.find((c) => c.position === position);
    if (!claim) return "空いているマスは奪えません";
    if (claim.teamId === teamId) return "自チームのマスは奪えません";
    this.sql.exec("UPDATE claims SET team_id = ?, claimed_at = ? WHERE position = ? AND team_id = ?", teamId, now, position, claim.teamId);
    this.sql.exec("UPDATE steal_rights SET used_at = ?, position = ? WHERE id = ?", now, position, right.id);
    this.addTimeline(now, { kind: "stolen", teamId, fromTeamId: claim.teamId, position, title });
    return null;
  }

  // 結果を確定し、1位のチームすべてに奪取権を1つずつ渡す
  private finish(m: Mission, winnerTeamIds: number[], scores: TeamScore[] | null, now: number): void {
    this.sql.exec(
      "UPDATE missions SET status = 'done', winners = ?, scores = ? WHERE id = ?",
      JSON.stringify(winnerTeamIds),
      scores === null ? null : JSON.stringify(scores),
      m.id,
    );
    for (const teamId of winnerTeamIds) {
      this.sql.exec("INSERT INTO steal_rights (mission_id, team_id) VALUES (?, ?)", m.id, teamId);
    }
    this.addTimeline(now, { kind: "missionResult", missionId: m.id, title: m.title, winnerTeamIds });
  }

  private setStatus(id: number, status: MissionStatus): void {
    this.sql.exec("UPDATE missions SET status = ? WHERE id = ?", status, id);
  }

  private setSubmission(id: number, status: "approved" | "rejected", rejectComment: string | null): void {
    this.sql.exec("UPDATE mission_submissions SET status = ?, reject_comment = ? WHERE id = ?", status, rejectComment, id);
  }
}

function findSubmission(room: RoomState, submissionId: number): { mission: Mission; submission: MissionSubmission } | null {
  for (const mission of room.missions) {
    const submission = mission.submissions.find((s) => s.id === submissionId);
    if (submission) return { mission, submission };
  }
  return null;
}

// 最大値を持つチームすべて（同票なら複数）。最大が 0 なら勝者なし
function topTeams(scores: TeamScore[]): number[] {
  const max = Math.max(0, ...scores.map((s) => s.value));
  return max === 0 ? [] : scores.filter((s) => s.value === max).map((s) => s.teamId);
}

function toKind(value: string): MissionKind {
  return value === "quantity" || value === "quality" ? value : "speed";
}

function toStatus(value: string): MissionStatus {
  return value === "judging" || value === "voting" || value === "done" ? value : "open";
}

function toSubmission(r: SubmissionRow): MissionSubmission {
  const status = r.status === "pending" || r.status === "approved" || r.status === "rejected" ? r.status : "accepted";
  return {
    id: r.id,
    teamId: r.team_id,
    participantName: r.participant_name,
    comment: r.comment,
    status,
    rejectComment: r.reject_comment,
    createdAt: r.created_at,
  };
}
