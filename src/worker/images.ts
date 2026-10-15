// 申請画像の記録（本体は R2）。状態の変更はすべて RoomDO のトランザクション内から呼ぶ
import type { ResultImage } from "../shared/types";
import { randomInt } from "./random";

export const IMAGES_SCHEMA = `
  -- アップロード枠。申請・提出に使うと used_at が入る
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    participant_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER
  );
  -- 承認された画像（結果画面の抽選対象）。通常マスの画像は position を持ち、取り消されたら消す
  CREATE TABLE IF NOT EXISTS approved_images (
    image_id TEXT PRIMARY KEY,
    team_id INTEGER NOT NULL,
    position INTEGER
  );
  CREATE TABLE IF NOT EXISTS result_images (
    team_id INTEGER PRIMARY KEY,
    image_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS image_cleanup (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    deleted_at INTEGER NOT NULL
  );
`;

// 1人がアップロードできる枚数の上限（いたずら対策）
const MAX_UPLOADS_PER_PARTICIPANT = 300;

export function r2Key(roomCode: string, imageId: string): string {
  return `rooms/${roomCode}/${imageId}.jpg`;
}

export function reserveUpload(sql: SqlStorage, participantId: string, now: number): string | null {
  const count = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM uploads WHERE participant_id = ?", participantId).one().n;
  if (count >= MAX_UPLOADS_PER_PARTICIPANT) return null;
  const id = crypto.randomUUID();
  sql.exec("INSERT INTO uploads (id, participant_id, created_at) VALUES (?, ?, ?)", id, participantId, now);
  return id;
}

// 本人がアップロードした未使用の画像かを確かめて、使用済みにする
export function useUploads(sql: SqlStorage, participantId: string, imageIds: string[], now: number): string | null {
  for (const id of imageIds) {
    const row = sql.exec<{ participant_id: string; used_at: number | null }>("SELECT participant_id, used_at FROM uploads WHERE id = ?", id).toArray()[0];
    if (!row || row.participant_id !== participantId) return "画像が見つかりません。もう一度選び直してください";
    if (row.used_at !== null) return "この画像はすでに使われています";
  }
  for (const id of imageIds) sql.exec("UPDATE uploads SET used_at = ? WHERE id = ?", now, id);
  return null;
}

export function markApproved(sql: SqlStorage, teamId: number, imageIds: string[], position: number | null): void {
  for (const id of imageIds) {
    sql.exec("INSERT OR IGNORE INTO approved_images (image_id, team_id, position) VALUES (?, ?, ?)", id, teamId, position);
  }
}

// マスが取り消されたら、そのマスの画像は承認済みとして扱わない
export function unmarkCell(sql: SqlStorage, teamId: number, position: number): void {
  sql.exec("DELETE FROM approved_images WHERE team_id = ? AND position = ?", teamId, position);
}

// ゲーム終了時に1回だけ、各チームの承認済み画像からランダムで1枚を選ぶ
export function pickResultImages(sql: SqlStorage): void {
  const rows = sql.exec<{ image_id: string; team_id: number }>("SELECT image_id, team_id FROM approved_images ORDER BY image_id").toArray();
  const byTeam = new Map<number, string[]>();
  for (const r of rows) byTeam.set(r.team_id, [...(byTeam.get(r.team_id) ?? []), r.image_id]);
  for (const [teamId, ids] of byTeam) {
    sql.exec("INSERT OR IGNORE INTO result_images (team_id, image_id) VALUES (?, ?)", teamId, ids[randomInt(ids.length)]);
  }
}

export function loadResultImages(sql: SqlStorage): ResultImage[] {
  return sql
    .exec<{ team_id: number; image_id: string }>("SELECT team_id, image_id FROM result_images ORDER BY team_id")
    .toArray()
    .map((r) => ({ teamId: r.team_id, imageId: r.image_id }));
}

export function loadImagesDeletedAt(sql: SqlStorage): number | null {
  return sql.exec<{ deleted_at: number }>("SELECT deleted_at FROM image_cleanup WHERE id = 1").toArray()[0]?.deleted_at ?? null;
}

// ルームの画像を R2 からすべて消す（プレフィックスごと）
export async function deleteRoomImages(bucket: R2Bucket, roomCode: string): Promise<number> {
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const list = await bucket.list({ prefix: `rooms/${roomCode}/`, cursor });
    const keys = list.objects.map((o) => o.key);
    if (keys.length > 0) await bucket.delete(keys);
    deleted += keys.length;
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return deleted;
}
