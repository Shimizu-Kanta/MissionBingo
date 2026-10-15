import { useState } from "react";
import { MAX_NAME_LENGTH, isModerator, normalizeName, type ClientMessage, type Participant, type RoomState } from "../shared/types";
import { membersOf, settingChips } from "./derive";
import { c1, c2, c3, formatCode } from "./theme";
import { copyText, useToast } from "./ui";

// ロビー（待機中）。開始後に未参加の人が開いたときは途中参加の画面として使う
export function LobbyView({
  room,
  you,
  send,
}: {
  room: RoomState;
  you: Participant | null;
  send: (message: ClientMessage) => boolean;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const normalized = normalizeName(name);
  const started = room.startedAt !== null;
  const master = room.participants.find((p) => p.role === "gm" || p.role === "operator");
  const players = room.participants.filter((p) => p.teamId !== null).length;
  const inviteUrl = `${location.origin}/room/${room.code}`;

  const join = (teamId: number) => {
    if (!normalized) {
      toast.show("先に表示名を入力してください");
      return;
    }
    if (!send({ type: "join", name: normalized, teamId })) toast.show("接続が切れています。再接続を待ってください");
  };

  return (
    <div className="screen">
      <header className="app-header">
        <span className="title">{room.settings.roomName}</span>
        <span className="sub">{started ? "ゲーム中 · 途中参加" : "待機中"}</span>
      </header>

      <div className="page lobby-page">
        <div className="panel invite">
          <div className="stack">
            <span className="hint">招待コード</span>
            <span className="code">{formatCode(room.code)}</span>
          </div>
          <button
            type="button"
            className="btn"
            style={{ height: 40, fontSize: 13 }}
            onClick={async () => toast.show((await copyText(inviteUrl)) ? "招待リンクをコピーしました" : `招待リンク：${inviteUrl}`)}
          >
            招待リンクをコピー
          </button>
        </div>

        <div className="chips">
          {settingChips(room).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>

        {master && (
          <div className="master-row">
            <span className="role-badge">{master.role === "gm" ? "GM" : "操作主"}</span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {master.name}
              {master.id === you?.id ? "（あなた）" : ""}
            </span>
            <span className="desc">{master.role === "gm" ? "申請の承認・取り消し、特別ミッション、ゲーム終了" : "進行判断・特別ミッション・ゲーム終了"}</span>
          </div>
        )}

        {!you && (
          <div className="field">
            <span className="label">表示名</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="タイムラインに表示される名前"
              aria-label="表示名"
            />
            <span className="hint">表示名を入れてからチームを選んでください。参加後はチームを変更できません。</span>
          </div>
        )}

        <div className="field" style={{ gap: 10 }}>
          <span className="label">チーム分け</span>
          <div className="team-cards">
            {room.teams.map((t) => {
              const members = membersOf(room, t);
              const mine = you?.teamId === t.id;
              return (
                <div key={t.id} className="team-card" style={{ border: mine ? `2px solid ${c1(t.hue)}` : undefined }}>
                  <div className="head">
                    <span className="team-dot" style={{ width: 12, height: 12, borderRadius: 3, background: c1(t.hue) }} />
                    <b>{t.name}</b>
                    <span className="count">{members.length}人</span>
                  </div>
                  <div className="members">
                    {members.map((p) => (
                      <div key={p.id} className="member">
                        <span className="avatar" style={{ background: c2(t.hue), color: c3(t.hue) }}>
                          {[...p.name][0]}
                        </span>
                        <span>{p.name}</span>
                        {p.id === you?.id && <span className="you">あなた</span>}
                        {p.role === "operator" && <span className="you">操作主</span>}
                      </div>
                    ))}
                    {members.length === 0 && <span className="hint">まだ誰もいません</span>}
                  </div>
                  {mine && (
                    <div className="joined" style={{ background: c2(t.hue), color: c3(t.hue) }}>
                      参加中
                    </div>
                  )}
                  {!you && (
                    <button type="button" className="join" disabled={!normalized} onClick={() => join(t.id)}>
                      このチームに入る
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!started && (
        <div className="sticky-footer">
          <span className="hint">{players}人が参加中</span>
          {you && isModerator(you) ? (
            <button type="button" className="btn primary" style={{ height: 46, padding: "0 28px", fontSize: 15 }} onClick={() => send({ type: "start" })}>
              ゲーム開始
            </button>
          ) : (
            <span className="hint">{room.settings.hasGm ? "GM" : "操作主"}がゲームを開始するのを待っています</span>
          )}
        </div>
      )}
    </div>
  );
}
