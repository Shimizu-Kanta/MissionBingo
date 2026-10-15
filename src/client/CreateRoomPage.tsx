import { useState } from "react";
import {
  CARD_SIZES,
  DEFAULT_CARD_SIZE,
  DEFAULT_ROOM_NAME,
  DEFAULT_TARGET_BINGO,
  DEFAULT_TEAMS,
  MAX_DETAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  MAX_TASKS,
  MAX_TEAMS,
  MAX_TITLE_LENGTH,
  MIN_TEAMS,
  TITLE_WARN_LENGTH,
  charLength,
  maxLines,
  normalizeName,
  normalizeRoomName,
  parseCreateRoomResponse,
  parseTaskInput,
  requiredTaskCount,
  teamsFor,
  type CardMode,
  type CardSize,
  type CreateRoomRequest,
  type QualityJudge,
  type TaskInput,
} from "../shared/types";
import { navigate } from "./navigation";
import { downloadText, exportCsv, exportJson, importTasksText } from "./tasksIO";
import { getDeviceToken } from "./token";
import { CloseButton, Modal, Segment, Stepper, Switch, useToast } from "./ui";

export function CreateRoomPage() {
  const toast = useToast();
  const [roomName, setRoomName] = useState("");
  const [name, setName] = useState("");
  const [hasGm, setHasGm] = useState(true);
  const [cardMode, setCardMode] = useState<CardMode>("shared");
  const [cardSize, setCardSize] = useState<CardSize>(DEFAULT_CARD_SIZE);
  const [free, setFree] = useState(true);
  const [teamCount, setTeamCount] = useState(DEFAULT_TEAMS);
  const [targetBingo, setTargetBingo] = useState(DEFAULT_TARGET_BINGO);
  const [autoEnd, setAutoEnd] = useState(false);
  const [qualityJudge, setQualityJudge] = useState<QualityJudge>("operator");
  const [myTeamId, setMyTeamId] = useState(0);
  const [tasks, setTasks] = useState<TaskInput[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const shared = cardMode === "shared";
  const lineCount = maxLines(cardSize);
  const target = Math.min(targetBingo, lineCount);
  const team = Math.min(myTeamId, teamCount - 1);
  const need = requiredTaskCount(cardSize, free);
  const remain = Math.max(0, need - tasks.length);
  const normalizedName = normalizeName(name);
  const normalizedRoomName = normalizeRoomName(roomName);
  const titleLength = charLength(newTitle.trim());

  const problem =
    remain > 0
      ? `お題があと${remain}個必要です`
      : tasks.length > MAX_TASKS
        ? `お題は${MAX_TASKS}個までです`
        : !normalizedName
          ? "あなたの表示名を入力してください"
          : !normalizedRoomName
            ? `ルーム名は${MAX_ROOM_NAME_LENGTH}文字までです`
            : null;

  const addTask = () => {
    const task = parseTaskInput({ title: newTitle, detail: newDetail, imageRequired: false });
    if (!newTitle.trim()) {
      toast.show("タイトルは必須です");
      return;
    }
    if (!task) {
      toast.show(`タイトルは${MAX_TITLE_LENGTH}文字、詳細は${MAX_DETAIL_LENGTH}文字までです`);
      return;
    }
    if (tasks.some((t) => t.title === task.title)) {
      toast.show("同じタイトルのお題があります");
      return;
    }
    setTasks((prev) => [...prev, task]);
    setNewTitle("");
    setNewDetail("");
    toast.show("お題を追加しました");
  };

  const submit = async () => {
    if (problem || !normalizedName) {
      toast.show(problem ?? "入力を確認してください");
      return;
    }
    setSubmitting(true);
    const body: CreateRoomRequest = {
      token: getDeviceToken(),
      name: normalizedName,
      settings: {
        hasGm,
        cardMode,
        cardSize,
        free,
        teamCount,
        targetBingo: target,
        autoEnd: shared && autoEnd,
        qualityJudge: shared && !hasGm ? qualityJudge : "operator",
        roomName: normalizedRoomName ?? DEFAULT_ROOM_NAME,
      },
      teamId: hasGm ? null : team,
      tasks,
    };
    try {
      const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const created = res.ok ? parseCreateRoomResponse(await res.json()) : null;
      if (!created) throw new Error("invalid response");
      navigate(`/room/${created.code}`);
    } catch {
      toast.show("ルームを作成できませんでした。もう一度お試しください");
      setSubmitting(false);
    }
  };

  return (
    <div className="screen">
      <header className="app-header">
        <div className="left">
          <button type="button" className="back-btn" onClick={() => navigate("/")}>
            ← 戻る
          </button>
          <span className="title">ルーム作成</span>
        </div>
      </header>

      <div className="page create-page">
        <div className="field">
          <span className="label">ルーム名</span>
          <input
            className="input"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={MAX_ROOM_NAME_LENGTH}
            placeholder={`例：渋谷さんぽビンゴ（空なら「${DEFAULT_ROOM_NAME}」）`}
            aria-label="ルーム名"
          />
        </div>
        <div className="field">
          <span className="label">あなたの表示名</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            placeholder="タイムラインに表示される名前"
            aria-label="あなたの表示名"
          />
        </div>

        <div className="field">
          <span className="label">GM</span>
          <RadioCards
            value={hasGm}
            onChange={setHasGm}
            options={[
              { value: true, label: "GMあり", desc: "プレイヤーが申請し、GMが確認・承認するとマスを取得" },
              { value: false, label: "GMなし", desc: "申請した時点で即取得。進行判断は操作主（ルーム作成者）" },
            ]}
          />
        </div>
        <div className="field">
          <span className="label">カード形式</span>
          <RadioCards
            value={cardMode}
            onChange={setCardMode}
            options={[
              { value: "individual", label: "個別カード", desc: "チームごとに自分のカードを持つ" },
              { value: "shared", label: "共有カード", desc: "全チームで1枚を奪い合う。特別ミッションで奪取あり" },
            ]}
          />
        </div>

        <div className="field">
          <span className="label">カード設定</span>
          <div className="setting-grid">
            <div className="setting">
              <div className="head">
                <b>カードサイズ</b>
                <span>デフォルトは5×5</span>
              </div>
              <Segment mono options={CARD_SIZES.map((s) => ({ value: s, label: `${s}×${s}` }))} value={cardSize} onChange={setCardSize} />
            </div>
            <div className="setting">
              <div className="head">
                <b>FREEマス</b>
                <span>ありの場合は中央に配置</span>
              </div>
              <Segment
                options={[
                  { value: true, label: "あり" },
                  { value: false, label: "なし" },
                ]}
                value={free}
                onChange={setFree}
              />
            </div>
            <div className="setting row">
              <div className="head">
                <b>チーム数</b>
                <span>最大{MAX_TEAMS}チーム</span>
              </div>
              <Stepper
                value={teamCount}
                label="チーム"
                onDec={() => setTeamCount((n) => Math.max(MIN_TEAMS, n - 1))}
                onInc={() => setTeamCount((n) => Math.min(MAX_TEAMS, n + 1))}
              />
            </div>
            <div className="setting row">
              <div className="head">
                <b>勝利条件</b>
                <span>先に揃えたチームの勝ち</span>
              </div>
              <Stepper
                value={target}
                label="ライン"
                onDec={() => setTargetBingo(Math.max(1, target - 1))}
                onInc={() => setTargetBingo(Math.min(lineCount, target + 1))}
              />
            </div>
            {shared && (
              <button type="button" className="setting row" onClick={() => setAutoEnd((v) => !v)}>
                <span className="head">
                  <b>全マス埋まりで自動終了</b>
                  <span>共有カードのみ · {autoEnd ? "ON：最後のマスが埋まった時点で終了" : "OFF：GM/操作主が終了するまで続行"}</span>
                </span>
                <Switch on={autoEnd} />
              </button>
            )}
            {!hasGm && (
              <div className="setting">
                <div className="head">
                  <b>あなたのチーム</b>
                  <span>操作主もチームに入ってプレイします（変更不可）</span>
                </div>
                <Segment options={teamsFor(teamCount).map((t) => ({ value: t.id, label: t.name.replace("チーム", "") }))} value={team} onChange={setMyTeamId} />
              </div>
            )}
          </div>
        </div>

        {shared && !hasGm && (
          <div className="field">
            <span className="label">「質」の特別ミッションの判定方法</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(
                [
                  ["operator", "操作主が決める"],
                  ["vote", "全員投票"],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" className={`chip-btn${qualityJudge === value ? " on" : ""}`} onClick={() => setQualityJudge(value)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="hint">GMなし・共有カードのときのみ。全員投票では自チームへの投票はできません。</span>
          </div>
        )}

        <div className="field" style={{ gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="label">お題</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className="btn outline sm" onClick={() => setImporting(true)}>
                CSV / JSONで一括入力
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  downloadText("tasks.csv", exportCsv(tasks), "text/csv");
                  toast.show(`tasks.csv（${tasks.length}件）を書き出しました`);
                }}
              >
                CSV出力
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  downloadText("tasks.json", exportJson(tasks), "application/json");
                  toast.show(`tasks.json（${tasks.length}件）を書き出しました`);
                }}
              >
                JSON出力
              </button>
            </div>
          </div>

          <div className={`need-banner ${remain > 0 ? "short" : "ok"}`}>
            <b>{remain > 0 ? `あと${remain}個必要` : "必要数を満たしています"}</b>
            <span className="count">
              必要 {need} / 登録 {tasks.length}
            </span>
            <span className="sub">
              {remain > 0
                ? `${cardSize}×${cardSize}${free ? "（FREEあり）" : ""}には${need}個のお題が必要です。必要数以上登録すると、その中から抽選します。`
                : `作成時に登録済みの${tasks.length}件から${need}件を抽選して配置します。`}
            </span>
          </div>

          <form
            className="add-row"
            onSubmit={(e) => {
              e.preventDefault();
              addTask();
            }}
          >
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={MAX_TITLE_LENGTH} placeholder="タイトル（必須・短く）" aria-label="タイトル" />
            <input value={newDetail} onChange={(e) => setNewDetail(e.target.value)} maxLength={MAX_DETAIL_LENGTH} placeholder="詳細（任意）" aria-label="詳細" />
            <button type="submit">追加</button>
          </form>
          {titleLength > TITLE_WARN_LENGTH && (
            <span className="warn-text">
              タイトルが{TITLE_WARN_LENGTH}文字を超えています（{titleLength}文字）。マスに収まらないことがあります
            </span>
          )}
          <span className="hint">申請はチャットが標準。画像必須 {tasks.filter((t) => t.imageRequired).length}件</span>

          <div className="task-list">
            {tasks.map((t, i) => (
              <div key={t.title} className="task-row">
                <span className="num">{String(i + 1).padStart(2, "0")}</span>
                <span className="body">
                  <span className="title">{t.title}</span>
                  {t.detail && <span className="detail">{t.detail}</span>}
                </span>
                <button
                  type="button"
                  className="toggle"
                  onClick={() => setTasks((prev) => prev.map((x, j) => (j === i ? { ...x, imageRequired: !x.imageRequired } : x)))}
                  aria-label={`${t.title}の画像必須を切り替え`}
                >
                  {t.imageRequired ? "画像必須" : "チャット可"}
                  <Switch on={t.imageRequired} size="sm" />
                </button>
                <button type="button" className="del" onClick={() => setTasks((prev) => prev.filter((_, j) => j !== i))} aria-label={`${t.title}を削除`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky-footer">
        <span style={{ fontSize: 13, fontWeight: 700, color: remain > 0 ? "oklch(0.5 0.13 50)" : "oklch(0.42 0.1 150)" }}>
          {remain > 0 ? `お題 あと${remain}個必要` : `あと0個 · ${tasks.length}件から${need}件を抽選`}
        </span>
        <button
          type="button"
          className={`btn primary${problem ? " off" : ""}`}
          style={{ height: 46, padding: "0 28px", width: "min(100%, 280px)", fontSize: 15 }}
          disabled={submitting}
          onClick={() => void submit()}
        >
          {submitting ? "作成中…" : "ルームを作成する"}
        </button>
      </div>

      {importing && (
        <ImportModal
          existing={tasks}
          onImport={(next, message) => {
            setTasks(next);
            setImporting(false);
            toast.show(message);
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function RadioCards<T extends string | boolean>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; desc: string }[];
}) {
  return (
    <div className="radio-cards" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={`radio-card${o.value === value ? " on" : ""}`} onClick={() => onChange(o.value)}>
          <span className="radio-dot">
            <span />
          </span>
          <span className="text">
            <b>{o.label}</b>
            <span>{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// モックのサンプル（色×もの 50件）
const SAMPLE_TASKS: TaskInput[] = ["赤い", "青い", "黄色い", "白い", "緑の"].flatMap((c) =>
  ["傘", "自転車", "ドア", "旗", "バッグ", "ベンチ", "花", "看板", "屋根", "服"].map((o) => ({ title: c + o, detail: null, imageRequired: false })),
);
SAMPLE_TASKS[0] = { ...SAMPLE_TASKS[0], detail: "開いた状態で撮影" };

function ImportModal({
  existing,
  onImport,
  onClose,
}: {
  existing: TaskInput[];
  onImport: (tasks: TaskInput[], message: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [error, setError] = useState<string | null>(null);

  const doImport = () => {
    if (!text.trim()) {
      setError("テキストを貼り付けるか、ファイルを選択してください");
      return;
    }
    const result = importTasksText(text);
    const base = mode === "replace" ? [] : existing;
    const seen = new Set(base.map((t) => t.title));
    let dup = 0;
    const added: TaskInput[] = [];
    for (const t of result.tasks) {
      if (seen.has(t.title)) {
        dup++;
        continue;
      }
      seen.add(t.title);
      added.push(t);
    }
    if (added.length === 0) {
      setError(result.errors[0] ?? `読み込めるお題がありません（重複 ${dup}件）`);
      return;
    }
    const skipped = [result.errors.length ? `読み込めない行${result.errors.length}件` : "", dup ? `重複${dup}件` : ""].filter(Boolean).join("・");
    onImport([...base, ...added], `${added.length}件を読み込みました${skipped ? `（${skipped}をスキップ）` : ""}`);
  };

  const csvSample = "title,detail,imageRequired\n" + SAMPLE_TASKS.map((t) => `${t.title},${t.detail ?? ""},false`).join("\n");
  const jsonSample = JSON.stringify(SAMPLE_TASKS.slice(0, 10).map((t) => (t.detail ? { title: t.title, detail: t.detail } : { title: t.title })), null, 2);

  return (
    <Modal onClose={onClose} label="お題を一括入力">
      <div className="modal-head">
        <div className="stack">
          <span className="modal-title">お題を一括入力</span>
          <span className="hint" style={{ fontSize: 12.5 }}>
            CSV または JSON。title は必須、detail・imageRequired は任意
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="samples">
        <div className="sample-box">
          <b>CSV</b>
          <span>title,detail,imageRequired</span>
          <span>赤いポスト,,true</span>
          <span>猫,後ろ姿でも可,false</span>
        </div>
        <div className="sample-box">
          <b>JSON</b>
          <span>[{'{"title":"赤いポスト","imageRequired":true}'},</span>
          <span> {'{"title":"猫","detail":"後ろ姿でも可"}'}]</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <label className="file-btn">
          ファイルを選択
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                setText(await file.text());
                setError(null);
              }
            }}
          />
        </label>
        <button type="button" className="btn sm" style={{ height: 32 }} onClick={() => (setText(csvSample), setError(null))}>
          CSVサンプル（50件）
        </button>
        <button type="button" className="btn sm" style={{ height: 32 }} onClick={() => (setText(jsonSample), setError(null))}>
          JSONサンプル
        </button>
      </div>
      <textarea
        className="textarea import-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder="ここに貼り付け"
        aria-label="お題のテキスト"
      />
      <Segment
        className="tall"
        options={[
          { value: "append" as const, label: "既存に追加" },
          { value: "replace" as const, label: "置き換え" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {error && <div style={{ fontSize: 12.5, color: "oklch(0.5 0.15 25)" }}>{error}</div>}
      <button type="button" className="btn primary lg" onClick={doImport}>
        読み込む
      </button>
    </Modal>
  );
}
