import { useRef, useState } from "react";
import {
  CARD_SIZES,
  DEFAULT_CARD_SIZE,
  DEFAULT_TARGET_BINGO,
  DEFAULT_TEAMS,
  MAX_DETAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TASKS,
  MAX_TEAMS,
  MAX_TITLE_LENGTH,
  MIN_TEAMS,
  TITLE_WARN_LENGTH,
  charLength,
  maxLines,
  normalizeName,
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
import { downloadText, exportCsv, exportJson, importTasks } from "./tasksIO";
import { getDeviceToken } from "./token";

const TEAM_COUNT_OPTIONS = Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => MIN_TEAMS + i);

type TaskRow = { key: number; title: string; detail: string; imageRequired: boolean };

type RowStatus = { kind: "empty" } | { kind: "invalid"; reason: string } | { kind: "valid"; task: TaskInput };

function rowStatus(row: TaskRow): RowStatus {
  if (row.title.trim() === "" && row.detail.trim() === "") return { kind: "empty" };
  const task = parseTaskInput({ title: row.title, detail: row.detail, imageRequired: row.imageRequired });
  if (task) return { kind: "valid", task };
  if (row.title.trim() === "") return { kind: "invalid", reason: "タイトルを入力してください" };
  return { kind: "invalid", reason: `タイトルは${MAX_TITLE_LENGTH}文字、詳細は${MAX_DETAIL_LENGTH}文字までです` };
}

let nextRowKey = 0;
const newRow = (task?: TaskInput): TaskRow => ({
  key: nextRowKey++,
  title: task?.title ?? "",
  detail: task?.detail ?? "",
  imageRequired: task?.imageRequired ?? false,
});

export function CreateRoomPage() {
  const [name, setName] = useState("");
  const [hasGm, setHasGm] = useState(true);
  const [cardMode, setCardMode] = useState<CardMode>("individual");
  const [cardSize, setCardSize] = useState<CardSize>(DEFAULT_CARD_SIZE);
  const [free, setFree] = useState(true);
  const [teamCount, setTeamCount] = useState(DEFAULT_TEAMS);
  const [targetBingo, setTargetBingo] = useState(DEFAULT_TARGET_BINGO);
  const [autoEnd, setAutoEnd] = useState(false);
  const [qualityJudge, setQualityJudge] = useState<QualityJudge>("operator");
  const [teamId, setTeamId] = useState(0);
  const [rows, setRows] = useState<TaskRow[]>(() => [newRow()]);
  const [importMessages, setImportMessages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const normalizedName = normalizeName(name);
  const myTeamId = Math.min(teamId, teamCount - 1);
  const lineCount = maxLines(cardSize);
  const target = Math.min(targetBingo, lineCount);
  const required = requiredTaskCount(cardSize, free);

  const statuses = rows.map(rowStatus);
  const tasks = statuses.flatMap((s) => (s.kind === "valid" ? [s.task] : []));
  const invalidCount = statuses.filter((s) => s.kind === "invalid").length;
  const remaining = Math.max(0, required - tasks.length);
  const tooMany = tasks.length > MAX_TASKS;
  const canCreate = !!normalizedName && remaining === 0 && invalidCount === 0 && !tooMany && !submitting;

  const updateRow = (key: number, patch: Partial<TaskRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onImport = async (file: File) => {
    const result = importTasks(file.name, await file.text());
    if (result.tasks.length > 0) {
      // 末尾の空行を置き換える形で追加する
      setRows((prev) => [...prev.filter((r) => rowStatus(r).kind !== "empty"), ...result.tasks.map(newRow), newRow()]);
    }
    setImportMessages([`${result.tasks.length}件のお題を追加しました`, ...result.errors]);
  };

  const submit = async () => {
    if (!normalizedName || !canCreate) return;
    setSubmitting(true);
    setError(null);
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
        autoEnd: cardMode === "shared" && autoEnd,
        qualityJudge: cardMode === "shared" && !hasGm ? qualityJudge : "operator",
      },
      teamId: hasGm ? null : myTeamId,
      tasks,
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
    <main className="create-page">
      <button type="button" className="link" onClick={() => navigate("/")}>
        ← トップへ戻る
      </button>
      <h1>ルームを作る</h1>

      <section>
        <h2>設定</h2>
        <label className="field">
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

        <fieldset>
          <legend>カード形式</legend>
          <label>
            <input type="radio" name="mode" checked={cardMode === "individual"} onChange={() => setCardMode("individual")} />
            個別カード（チームごとに自分のカードを持つ）
          </label>
          <label>
            <input type="radio" name="mode" checked={cardMode === "shared"} onChange={() => setCardMode("shared")} />
            共有カード（全チームで1枚を奪い合う）
          </label>
        </fieldset>

        <label className="field">
          カードサイズ
          <select value={cardSize} onChange={(e) => setCardSize(CARD_SIZES.find((s) => s === Number(e.target.value)) ?? DEFAULT_CARD_SIZE)}>
            {CARD_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </label>

        <label className="check">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
          中央を FREE にする
        </label>

        <label className="field">
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
          <label className="field">
            あなたのチーム（あとから変更できません）
            <select value={myTeamId} onChange={(e) => setTeamId(Number(e.target.value))}>
              {teamsFor(teamCount).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          目標ビンゴ数
          <select value={target} onChange={(e) => setTargetBingo(Number(e.target.value))}>
            {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {cardMode === "shared" && (
          <label className="check">
            <input type="checkbox" checked={autoEnd} onChange={(e) => setAutoEnd(e.target.checked)} />
            目標に届かず全マスが埋まったら自動で終了する
          </label>
        )}

        {cardMode === "shared" && !hasGm && (
          <fieldset>
            <legend>特別ミッション「質」の判定方法</legend>
            <label>
              <input type="radio" name="quality" checked={qualityJudge === "operator"} onChange={() => setQualityJudge("operator")} />
              操作主が決める
            </label>
            <label>
              <input type="radio" name="quality" checked={qualityJudge === "vote"} onChange={() => setQualityJudge("vote")} />
              全員投票（1人1票・自チームには投票できない）
            </label>
          </fieldset>
        )}
      </section>

      <section>
        <h2>お題</h2>
        <p className="hint">
          {cardSize}×{cardSize}
          {free ? "（FREE あり）" : ""}には {required} 個のお題が必要です。多めに入れると、その中から抽選します。
        </p>
        <div className="row-actions">
          <button type="button" onClick={() => fileInput.current?.click()}>
            CSV / JSON を読み込む
          </button>
          <button type="button" disabled={tasks.length === 0} onClick={() => downloadText("mission-bingo-tasks.csv", exportCsv(tasks), "text/csv")}>
            CSV で保存
          </button>
          <button
            type="button"
            disabled={tasks.length === 0}
            onClick={() => downloadText("mission-bingo-tasks.json", exportJson(tasks), "application/json")}
          >
            JSON で保存
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onImport(file);
            }}
          />
        </div>
        {importMessages.length > 0 && (
          <ul className="import-messages">
            {importMessages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}

        <ol className="task-list">
          {rows.map((row, i) => {
            const status = statuses[i];
            const titleLength = charLength(row.title.trim());
            return (
              <li key={row.key} className="task-row">
                <input
                  value={row.title}
                  onChange={(e) => updateRow(row.key, { title: e.target.value })}
                  maxLength={MAX_TITLE_LENGTH}
                  placeholder="タイトル（必須）"
                  aria-label={`${i + 1}番目のタイトル`}
                />
                <textarea
                  value={row.detail}
                  onChange={(e) => updateRow(row.key, { detail: e.target.value })}
                  maxLength={MAX_DETAIL_LENGTH}
                  placeholder="詳細（任意）"
                  rows={1}
                  aria-label={`${i + 1}番目の詳細`}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={row.imageRequired}
                    onChange={(e) => updateRow(row.key, { imageRequired: e.target.checked })}
                  />
                  画像必須
                </label>
                <button
                  type="button"
                  className="link"
                  onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : [newRow()]))}
                >
                  削除
                </button>
                {titleLength > TITLE_WARN_LENGTH && (
                  <p className="warn">
                    タイトルが{TITLE_WARN_LENGTH}文字を超えています（{titleLength}文字）。マスに収まらないことがあります
                  </p>
                )}
                {status.kind === "invalid" && <p className="error">{status.reason}</p>}
              </li>
            );
          })}
        </ol>
        <button type="button" onClick={() => setRows((prev) => [...prev, newRow()])}>
          お題を追加
        </button>
      </section>

      <footer className="create-footer">
        <p>
          {remaining > 0 ? (
            <>
              あと <strong>{remaining}</strong> 個必要（{tasks.length} / {required}）
            </>
          ) : (
            <>
              必要数に達しました（候補 {tasks.length} 個から {required} 個を抽選）
            </>
          )}
        </p>
        {invalidCount > 0 && <p className="error">入力に誤りのあるお題が {invalidCount} 件あります</p>}
        {tooMany && <p className="error">お題は {MAX_TASKS} 個までです</p>}
        {!normalizedName && <p className="hint">表示名を入力してください</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="primary" disabled={!canCreate} onClick={() => void submit()}>
          {submitting ? "作成中…" : "ルームを作成する"}
        </button>
      </footer>
    </main>
  );
}
