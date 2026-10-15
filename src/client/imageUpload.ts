import { IMAGE_JPEG_QUALITY, IMAGE_MAX_EDGE, MAX_ORIGINAL_IMAGE_BYTES } from "../shared/types";
import { getDeviceToken } from "./token";

// 長辺 IMAGE_MAX_EDGE px・JPEG に縮小する。元画像が大きすぎるものは受け付けない
export async function compressImage(file: File): Promise<Blob> {
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) throw new Error("画像が大きすぎます（20MBまで）");
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選んでください");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("この画像は読み込めませんでした");
  }
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を処理できませんでした");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", IMAGE_JPEG_QUALITY));
  if (!blob) throw new Error("画像を処理できませんでした");
  return blob;
}

// 縮小した画像をアップロードして画像 ID を受け取る。トークンは URL ではなくヘッダーで送る
export async function uploadImage(roomCode: string, blob: Blob): Promise<string> {
  const res = await fetch(`/api/rooms/${roomCode}/images`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${getDeviceToken()}` },
    body: blob,
  });
  const data: unknown = await res.json().catch(() => null);
  if (res.ok && typeof data === "object" && data !== null && "imageId" in data && typeof data.imageId === "string") {
    return data.imageId;
  }
  const reason = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : null;
  throw new Error(reason ?? "画像を送れませんでした");
}
