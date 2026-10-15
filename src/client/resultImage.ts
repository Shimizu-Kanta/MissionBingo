// 結果画像（PNG）を canvas に描く。プレビューとダウンロードで同じ描画を使う
import { imageUrl, type RoomState } from "../shared/types";
import { heroOf, imageCaption, keyEvents, lineCells, ownerAt, standingsOf } from "./derive";
import { INK, LINE, c1, c2, pad2 } from "./theme";

export type ExportFormat = "square" | "story";
export type ExportInclude = { card: boolean; rank: boolean; photos: boolean; tl: boolean };

const WIDTH = 1080;
const SANS = '"Noto Sans JP", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, monospace';

export function exportSize(format: ExportFormat): { width: number; height: number } {
  return { width: WIDTH, height: format === "square" ? WIDTH : Math.round((WIDTH * 16) / 9) };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 日本語は単語の区切りがないので、1文字ずつ詰めて折り返す
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of [...text]) {
    if (ctx.measureText(current + ch).width > maxWidth && current) {
      lines.push(current);
      current = ch;
      if (lines.length === maxLines) break;
    } else {
      current += ch;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && lines.join("").length < text.length) lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

export async function renderResultImage(
  canvas: HTMLCanvasElement,
  room: RoomState,
  format: ExportFormat,
  include: ExportInclude,
  viewTeamId: number | null,
): Promise<void> {
  await Promise.all([
    document.fonts.load(`700 80px ${SANS}`),
    document.fonts.load(`400 30px ${SANS}`),
    document.fonts.load(`500 28px ${MONO}`),
  ]).catch(() => undefined);

  const { width: W, height: H } = exportSize(format);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cq = W / 100;
  const hero = heroOf(room);

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // ---- 上部（勝者の色） ----
  const pad = 6 * cq;
  ctx.font = `700 ${8 * cq}px ${SANS}`;
  const titleLines = wrap(ctx, hero.title, W - pad * 2, 2);
  const headerH = 6 * cq + 2.6 * cq + 1.6 * cq + 3.2 * cq * 1.3 + 1.6 * cq + titleLines.length * 8 * cq * 1.15 + 5 * cq;
  ctx.fillStyle = hero.color;
  ctx.fillRect(0, 0, W, headerH);

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textBaseline = "top";
  ctx.font = `500 ${2.6 * cq}px ${MONO}`;
  ctx.fillText("MISSION BINGO", pad, 6 * cq);
  const ended = new Date(room.endedAt ?? Date.now());
  const date = `${ended.getFullYear()}.${pad2(ended.getMonth() + 1)}.${pad2(ended.getDate())}`;
  ctx.textAlign = "right";
  ctx.fillText(date, W - pad, 6 * cq);
  ctx.textAlign = "left";

  let y = 6 * cq + 2.6 * cq + 1.6 * cq;
  ctx.font = `400 ${3.2 * cq}px ${SANS}`;
  ctx.fillText(room.settings.roomName, pad, y);
  y += 3.2 * cq * 1.3 + 1.6 * cq;
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${8 * cq}px ${SANS}`;
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += 8 * cq * 1.15;
  }

  // ---- 本文 ----
  y = headerH + 5 * cq;
  const gap = 4 * cq;

  if (include.card || include.rank) {
    let rowBottom = y;
    let x = pad;
    if (include.card) {
      const n = room.settings.cardSize;
      const size = 34 * cq;
      const g = 0.5 * cq;
      const cellSize = (size - g * (n - 1)) / n;
      const lines = new Map(room.teams.map((t) => [t.id, lineCells(room, t.id)]));
      for (const cell of room.card) {
        const cx = x + (cell.position % n) * (cellSize + g);
        const cy = y + Math.floor(cell.position / n) * (cellSize + g);
        const owner = cell.free ? null : ownerAt(room, cell.position, viewTeamId);
        const team = owner !== null ? room.teams[owner] : undefined;
        const inLine = team !== undefined && (lines.get(team.id)?.has(cell.position) ?? false);
        roundRect(ctx, cx, cy, cellSize, cellSize, 0.6 * cq);
        ctx.fillStyle = cell.free ? INK : team ? (inLine ? c1(team.hue) : c2(team.hue)) : "#fff";
        ctx.fill();
        if (!cell.free && !team) {
          ctx.strokeStyle = LINE;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      rowBottom = Math.max(rowBottom, y + size);
      x += size + 5 * cq;
    }
    if (include.rank) {
      let ry = y;
      for (const s of standingsOf(room)) {
        const t = room.teams[s.teamId];
        if (!t) continue;
        ctx.fillStyle = INK;
        ctx.font = `600 ${3.4 * cq}px ${MONO}`;
        ctx.fillText(String(s.rank), x, ry);
        roundRect(ctx, x + 4 * cq + 2 * cq, ry + 0.5 * cq, 2.4 * cq, 2.4 * cq, 0.6 * cq);
        ctx.fillStyle = c1(t.hue);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `700 ${3.2 * cq}px ${SANS}`;
        ctx.fillText(t.name, x + 4 * cq + 2 * cq + 2.4 * cq + 2 * cq, ry);
        ctx.font = `500 ${2.8 * cq}px ${MONO}`;
        ctx.textAlign = "right";
        ctx.fillText(`${s.bingos}ライン`, W - pad, ry + 0.3 * cq);
        ctx.textAlign = "left";
        ry += 3.4 * cq + 2 * cq;
      }
      rowBottom = Math.max(rowBottom, ry);
    }
    y = rowBottom + gap;
  }

  if (include.photos && room.resultImages.length > 0 && room.imagesDeletedAt === null) {
    const g = 1.6 * cq;
    const tileW = (W - pad * 2 - g * 2) / 3;
    const tileH = (tileW * 3) / 4;
    const photos = room.resultImages.slice(0, 3);
    const images = await Promise.all(photos.map((p) => loadImage(imageUrl(room.code, p.imageId))));
    photos.forEach((p, i) => {
      const x = pad + i * (tileW + g);
      ctx.save();
      roundRect(ctx, x, y, tileW, tileH, 1.2 * cq);
      ctx.clip();
      ctx.fillStyle = "oklch(0.93 0.005 250)";
      ctx.fillRect(x, y, tileW, tileH);
      const img = images[i];
      if (img) drawCover(ctx, img, x, y, tileW, tileH);
      // 見出しは写真の下端に白い帯で載せる
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(x, y + tileH - 4.4 * cq, tileW, 4.4 * cq);
      ctx.fillStyle = "oklch(0.3 0.012 250)";
      ctx.font = `500 ${2.4 * cq}px ${SANS}`;
      const caption = wrap(ctx, imageCaption(room, p.imageId), tileW - 2.8 * cq, 1)[0] ?? "";
      ctx.fillText(caption, x + 1.4 * cq, y + tileH - 3.4 * cq);
      ctx.restore();
    });
    y += tileH + gap;
  }

  if (include.tl) {
    for (const e of keyEvents(room)) {
      ctx.fillStyle = "oklch(0.5 0.012 250)";
      ctx.font = `400 ${2.6 * cq}px ${MONO}`;
      ctx.fillText(e.time, pad, y);
      ctx.fillStyle = INK;
      ctx.font = `400 ${2.6 * cq}px ${SANS}`;
      const textX = pad + 2.6 * cq * 3.2;
      const lines = wrap(ctx, e.text, W - pad - textX, 2);
      for (const line of lines) {
        ctx.fillText(line, textX, y);
        y += 2.6 * cq * 1.4;
      }
      y += 1.4 * cq;
    }
  }
}

export function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      resolve(true);
    }, "image/png");
  });
}
