import { MAX_DETAIL_LENGTH, MAX_TITLE_LENGTH, parseTaskInput, type TaskInput } from "../shared/types";

export type ImportResult = { tasks: TaskInput[]; errors: string[] };

const FIELD_HINT = `タイトルは必須・${MAX_TITLE_LENGTH}文字以内、詳細は${MAX_DETAIL_LENGTH}文字以内です`;

export function importTasks(fileName: string, text: string): ImportResult {
  const body = text.replace(/^﻿/, "");
  if (/\.json$/i.test(fileName)) return importJson(body);
  if (/\.csv$/i.test(fileName)) return importCsv(body);
  return { tasks: [], errors: ["CSV（.csv）か JSON（.json）のファイルを選んでください"] };
}

function importJson(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { tasks: [], errors: ["JSON として読み込めませんでした"] };
  }
  // 配列そのもの、または { "tasks": [...] } を受け付ける
  const list = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && "tasks" in data && Array.isArray(data.tasks)
      ? data.tasks
      : null;
  if (!list) return { tasks: [], errors: ["お題の配列が見つかりませんでした"] };

  const tasks: TaskInput[] = [];
  const errors: string[] = [];
  list.forEach((item: unknown, i: number) => {
    const task = parseTaskInput(item);
    if (task) tasks.push(task);
    else errors.push(`${i + 1}件目：読み込めませんでした（${FIELD_HINT}）`);
  });
  return { tasks, errors };
}

function importCsv(text: string): ImportResult {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return { tasks: [], errors: ["お題が1件もありませんでした"] };

  // 1行目に title 列があればヘッダーとして列名で対応付ける。なければ title, detail, imageRequired の順
  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.includes("title");
  const col = (name: string, fallback: number) => (hasHeader ? header.indexOf(name.toLowerCase()) : fallback);
  const titleCol = col("title", 0);
  const detailCol = col("detail", 1);
  const imageCol = col("imageRequired", 2);

  const tasks: TaskInput[] = [];
  const errors: string[] = [];
  rows.slice(hasHeader ? 1 : 0).forEach((row, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const imageRequired = parseBool(imageCol >= 0 ? (row[imageCol] ?? "") : "");
    if (imageRequired === null) {
      errors.push(`${line}行目：imageRequired は true / false で指定してください`);
      return;
    }
    const task = parseTaskInput({
      title: row[titleCol] ?? "",
      detail: detailCol >= 0 ? (row[detailCol] ?? null) : null,
      imageRequired,
    });
    if (task) tasks.push(task);
    else errors.push(`${line}行目：読み込めませんでした（${FIELD_HINT}）`);
  });
  return { tasks, errors };
}

function parseBool(value: string): boolean | null {
  const v = value.trim().toLowerCase();
  if (["", "false", "0", "no", "いいえ"].includes(v)) return false;
  if (["true", "1", "yes", "はい"].includes(v)) return true;
  return null;
}

// RFC 4180 形式（ダブルクォート内のカンマ・改行・"" を扱う）
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportCsv(tasks: TaskInput[]): string {
  const lines = ["title,detail,imageRequired"];
  for (const t of tasks) lines.push([csvField(t.title), csvField(t.detail ?? ""), String(t.imageRequired)].join(","));
  // Excel で文字化けしないよう BOM を付ける
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function exportJson(tasks: TaskInput[]): string {
  return JSON.stringify(tasks, null, 2) + "\n";
}

export function downloadText(fileName: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
