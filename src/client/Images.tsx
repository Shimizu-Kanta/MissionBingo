import { useRef, useState } from "react";
import { imageUrl } from "../shared/types";
import { compressImage, uploadImage } from "./imageUpload";

// 申請・提出に添える画像を選ぶ。選んだ時点で縮小してアップロードし、画像 ID を返す
export function ImagePicker({
  roomCode,
  max,
  required,
  value,
  onChange,
}: {
  roomCode: string;
  max: number;
  required: boolean;
  value: string[];
  onChange: (imageIds: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onFiles = async (files: File[]) => {
    setError(null);
    const room = max - value.length;
    if (files.length > room) setError(`画像は${max}枚までです`);
    const picked = files.slice(0, room);
    setUploading((n) => n + picked.length);
    const ids: string[] = [];
    for (const file of picked) {
      try {
        ids.push(await uploadImage(roomCode, await compressImage(file)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "画像を送れませんでした");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (ids.length > 0) onChange([...value, ...ids].slice(0, max));
  };

  return (
    <div className="image-picker">
      <p className="field-label">
        画像（{required ? "必須" : "任意"}・{max}枚まで）
      </p>
      <div className="thumbs">
        {value.map((id) => (
          <span key={id} className="thumb-edit">
            <img src={imageUrl(roomCode, id)} alt="選んだ画像" />
            <button type="button" className="link" onClick={() => onChange(value.filter((x) => x !== id))} aria-label="この画像を外す">
              ✕
            </button>
          </span>
        ))}
      </div>
      {value.length + uploading < max && (
        <button type="button" onClick={() => input.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? "送信中…" : "画像を選ぶ"}
        </button>
      )}
      {uploading > 0 && value.length + uploading >= max && <p className="hint">送信中…</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={max > 1}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void onFiles(files);
        }}
      />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// 申請・提出に付いた画像のサムネイル。タップで原寸を別タブで開く
export function Thumbs({ roomCode, imageIds, deleted }: { roomCode: string; imageIds: string[]; deleted: boolean }) {
  if (imageIds.length === 0) return null;
  if (deleted) return <span className="hint">（画像は保存期間を過ぎたため削除されました）</span>;
  return (
    <span className="thumbs">
      {imageIds.map((id) => (
        <a key={id} href={imageUrl(roomCode, id)} target="_blank" rel="noreferrer">
          <img src={imageUrl(roomCode, id)} alt="申請の画像" loading="lazy" />
        </a>
      ))}
    </span>
  );
}
