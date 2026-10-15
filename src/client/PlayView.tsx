import { useEffect, useState } from "react";
import { isModerator, maxImagesFor, type ClientMessage, type Participant, type RoomState } from "../shared/types";
import { ApplyModal } from "./ApplyModal";
import { ApprovalQueue } from "./ApprovalQueue";
import { Board, Legend, MiniCards, TeamTabs } from "./Board";
import { CellSheet, type SheetMode } from "./CellSheet";
import { MISSION_INFO, bingosOf, cellLabel, modeLabel, ownerAt, standingsOf } from "./derive";
import { MissionBanner, MissionJudgeModal, MissionSetupModal, StealBanner } from "./MissionPanel";
import { LINE, SOFT, c1, c2, teamShort } from "./theme";
import { Timeline } from "./Timeline";
import { CloseButton, Logo, Modal, useNarrow, useNow, useToast } from "./ui";

type ModalState =
  | { kind: "cell"; position: number }
  | { kind: "apply"; position: number }
  | { kind: "submit"; missionId: number }
  | { kind: "judge"; missionId: number }
  | { kind: "setup" }
  | { kind: "end" }
  | null;

type Tab = "card" | "tl" | "gm";

export function PlayView({ room, you, send }: { room: RoomState; you: Participant; send: (message: ClientMessage) => boolean }) {
  const narrow = useNarrow();
  const now = useNow();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("card");
  const [modal, setModal] = useState<ModalState>(null);
  const [tabTeam, setTabTeam] = useState(you.teamId ?? 0);

  const moderator = isModerator(you);
  const isGm = you.role === "gm";
  const shared = room.settings.cardMode === "shared";
  const myTeam = you.teamId !== null ? room.teams[you.teamId] : undefined;
  const viewTeamId = shared ? you.teamId : moderator ? tabTeam : you.teamId;
  const viewTeam = viewTeamId !== null ? room.teams[viewTeamId] : undefined;
  const sheetMode: SheetMode = isGm ? "moderator" : you.role === "operator" ? "operator" : "player";

  // 送れなかった（切断中）ときはトーストで知らせる
  const act = (message: ClientMessage): boolean => {
    const ok = send(message);
    if (!ok) toast.show("接続が切れています。再接続を待ってからもう一度お試しください");
    return ok;
  };

  // スマホでは下部タブの上にトーストを出す
  useEffect(() => {
    document.documentElement.classList.toggle("has-tabbar", narrow);
    return () => document.documentElement.classList.remove("has-tabbar");
  }, [narrow]);

  const activeMissions = shared ? room.missions.filter((m) => m.status !== "done") : [];
  const unusedRights = room.stealRights.filter((r) => r.usedAt === null);
  const myRights = unusedRights.filter((r) => r.teamId === you.teamId);
  const stealTeams = [...new Set(unusedRights.map((r) => r.teamId))];
  const stealing = myRights.length > 0 && you.teamId !== null;

  const onSelect = (position: number) => {
    // 奪取中は、他チームのマスをタップしたらそのまま奪う（モックどおり）
    if (stealing && you.teamId !== null) {
      const owner = ownerAt(room, position, viewTeamId);
      const cell = room.card[position];
      if (cell && !cell.free && owner !== null && owner !== you.teamId) {
        if (act({ type: "steal", rightId: myRights[0].id, position })) toast.show(`「${cellLabel(cell)}」を奪いました`);
        return;
      }
    }
    setModal({ kind: "cell", position });
  };

  const queueCount = room.applications.length + room.missions.reduce((n, m) => n + m.submissions.filter((s) => s.status === "pending").length, 0);
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "card", label: "カード" },
    { key: "tl", label: "タイムライン" },
    ...(isGm ? [{ key: "gm" as const, label: "承認", badge: queueCount }] : []),
  ];
  const showCard = !narrow || tab === "card";
  const showSide = !narrow || tab !== "card";

  const cardTitle = shared ? "共有カード" : moderator && viewTeam ? `${viewTeam.name}のカード` : `あなたのカード · ${myTeam?.name ?? ""}`;
  let cardHint: string;
  if (stealing) cardHint = "奪うマスをタップしてください";
  else if (isGm) cardHint = shared ? "取得済みのマスはタップして取り消せます。申請は承認パネルで確認" : "タブでチームを切り替え。取得済みのマスはタップして取り消せます";
  else if (room.settings.hasGm) cardHint = "マスをタップして詳細を確認 → 申請。GMが許可すると取得";
  else cardHint = `マスをタップして詳細を確認 → 申請すると即取得${moderator ? "。取得済みのマスは取り消せます" : ""}`;

  const submitMission = modal?.kind === "submit" ? room.missions.find((m) => m.id === modal.missionId) : undefined;
  const judgeMission = modal?.kind === "judge" ? room.missions.find((m) => m.id === modal.missionId) : undefined;
  const applyCell = modal?.kind === "apply" ? room.card[modal.position] : undefined;

  return (
    <div className="screen">
      <header className="play-header">
        <div className="room">
          <Logo />
          <div className="names">
            <b>{room.settings.roomName}</b>
            <span>{modeLabel(room)}</span>
          </div>
          {isGm && <span className="gm-badge">GM</span>}
          {you.role === "operator" && <span className="gm-badge">操作主</span>}
        </div>
        <div className="pills">
          {room.teams.map((t) => (
            <div key={t.id} className="score-pill" style={{ border: t.id === you.teamId ? `1.5px solid ${c1(t.hue)}` : `1px solid ${LINE}` }}>
              <span className="team-dot" style={{ width: 8, height: 8, background: c1(t.hue) }} />
              <b>{teamShort(t)}</b>
              <span className="mono">
                {bingosOf(room, t.id)}/{room.settings.targetBingo}
              </span>
            </div>
          ))}
          {moderator && (
            <button type="button" className="end-btn" onClick={() => setModal({ kind: "end" })}>
              ゲーム終了
            </button>
          )}
        </div>
      </header>

      {activeMissions.map((m) => (
        <MissionBanner
          key={m.id}
          room={room}
          you={you}
          mission={m}
          now={now}
          send={act}
          onSubmit={() => setModal({ kind: "submit", missionId: m.id })}
          onJudge={() => setModal({ kind: "judge", missionId: m.id })}
        />
      ))}
      {stealTeams.map((teamId) => (
        <StealBanner
          key={teamId}
          room={room}
          teamId={teamId}
          count={unusedRights.filter((r) => r.teamId === teamId).length}
          mine={teamId === you.teamId}
        />
      ))}

      <div className="play-body">
        {showCard && (
          <div className="card-col">
            <div className="card-head">
              <div className="stack">
                <b>{cardTitle}</b>
                <span>{cardHint}</span>
              </div>
              {shared && moderator && activeMissions.length < 3 && (
                <button type="button" className="btn outline sm" onClick={() => setModal({ kind: "setup" })}>
                  特別ミッションを発生
                </button>
              )}
            </div>
            {!shared && moderator && <TeamTabs room={room} selected={tabTeam} onSelect={setTabTeam} />}
            <Board room={room} viewTeamId={viewTeamId} stealTeamId={stealing ? you.teamId : null} onSelect={onSelect} />
            <Legend team={viewTeam ?? myTeam ?? room.teams[0]} />
            {!shared && !moderator && <MiniCards room={room} exceptTeamId={you.teamId} />}
          </div>
        )}
        {showSide && (
          <div className="side-col">
            {isGm && (!narrow || tab === "gm") && <ApprovalQueue room={room} send={act} />}
            {(!narrow || tab === "tl") && <Timeline room={room} maxHeight={narrow ? undefined : "520px"} />}
          </div>
        )}
      </div>

      {narrow && (
        <nav className="tabbar">
          {tabs.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? "on" : undefined} onClick={() => setTab(t.key)}>
              {t.label}
              {t.badge ? <span className="badge">{t.badge}</span> : null}
            </button>
          ))}
        </nav>
      )}

      {modal?.kind === "cell" && (
        <CellSheet
          room={room}
          position={modal.position}
          viewTeamId={viewTeamId}
          myTeamId={you.teamId}
          mode={sheetMode}
          onApply={() => setModal({ kind: "apply", position: modal.position })}
          onRevoke={(teamId, reason) => {
            if (act({ type: "revoke", teamId, position: modal.position, reason })) {
              setModal(null);
              toast.show("取り消しました。このマスは再挑戦できます");
            }
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "apply" && applyCell && !applyCell.free && (
        <ApplyModal
          roomCode={room.code}
          kicker="申請"
          title={applyCell.title}
          imageRequired={applyCell.imageRequired}
          maxImages={maxImagesFor("cell")}
          submitLabel={room.settings.hasGm ? "GMに申請する" : "申請して取得する"}
          note={
            room.settings.hasGm
              ? "GMが確認して許可するとマスを取得します。申請が重なった場合は申請時刻順に確認され、最初に許可された申請でマスが確定します。"
              : "GMなしのルームなので申請と同時に取得します。画像はタイムラインに証拠として残ります。"
          }
          onSubmit={(comment, imageIds) => {
            const ok = act({ type: "apply", position: modal.position, comment, imageIds });
            if (ok) toast.show(room.settings.hasGm ? "申請しました。GMの確認待ちです" : "マスを取得しました");
            return ok;
          }}
          onClose={() => setModal(null)}
        />
      )}
      {submitMission && (
        <ApplyModal
          roomCode={room.code}
          kicker={`特別ミッション · ${MISSION_INFO[submitMission.kind].label}`}
          title={submitMission.title}
          imageRequired={submitMission.kind === "quality"}
          allowChat={submitMission.kind !== "quality"}
          maxImages={maxImagesFor(submitMission.kind)}
          submitLabel="提出する"
          note={
            submitMission.kind === "speed"
              ? room.settings.hasGm
                ? "GMが確認して最初に許可されたチームが1位になります。"
                : "最初に提出したチームが1位になります。"
              : submitMission.kind === "quantity"
                ? "制限時間内なら何回でも提出できます（1回に写真5枚まで）。時間切れの後に数を比べます。"
                : "1チーム1件まで。時間切れの後に1位を決めます。"
          }
          onSubmit={(comment, imageIds) => {
            const ok = act({ type: "submitMission", missionId: submitMission.id, comment, imageIds });
            if (ok) toast.show("提出しました");
            return ok;
          }}
          onClose={() => setModal(null)}
        />
      )}
      {judgeMission && <MissionJudgeModal room={room} you={you} mission={judgeMission} send={act} onClose={() => setModal(null)} />}
      {modal?.kind === "setup" && <MissionSetupModal room={room} send={act} onClose={() => setModal(null)} />}
      {modal?.kind === "end" && <EndModal room={room} onEnd={() => act({ type: "end" })} onClose={() => setModal(null)} />}
    </div>
  );
}

function EndModal({ room, onEnd, onClose }: { room: RoomState; onEnd: () => void; onClose: () => void }) {
  const standings = standingsOf(room);
  return (
    <Modal onClose={onClose} label="ゲーム終了の確認">
      <div className="modal-head">
        <div className="stack">
          <span className="modal-title">ゲームを終了しますか？</span>
          <span className="hint" style={{ fontSize: 12.5 }}>
            終了すると参加者全員が自動で結果画面へ移動します。現在の状況で順位が確定します。
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="rank-list">
        {standings.map((s) => {
          const t = room.teams[s.teamId];
          if (!t) return null;
          return (
            <div key={s.teamId} className="rank-row" style={{ background: s.rank === 1 ? c2(t.hue) : SOFT }}>
              <span className="pos">{s.rank}</span>
              <span className="team-dot" style={{ width: 10, height: 10, borderRadius: 3, background: c1(t.hue) }} />
              <b>{t.name}</b>
              <span className="mono">
                {s.bingos}ライン · {s.cells}マス
              </span>
            </div>
          );
        })}
      </div>
      <div className="two-buttons lg">
        <button type="button" className="btn" onClick={onClose}>
          続ける
        </button>
        <button type="button" className="btn danger" onClick={onEnd}>
          終了して結果へ
        </button>
      </div>
    </Modal>
  );
}
