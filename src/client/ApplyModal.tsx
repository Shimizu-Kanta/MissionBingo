import { useRef, useState } from "react";
import { MAX_COMMENT_LENGTH, imageUrl, normalizeComment } from "../shared/types";
import { compressImage, uploadImage } from "./imageUpload";
import { CloseButton, Modal, Segment } from "./ui";

type Uploaded = { id: string; size: number };

// 申請モーダル（通常マス・特別ミッション共通）。チャットはコメント必須、画像は写真が必須（コメントなし）
export function ApplyModal({
  roomCode,
  kicker,
  title,
  imageRequired,
  allowChat = true,
  maxImages,
  submitLabel,
  note,
  onSubmit,
  onClose,
}: {
  roomCode: string;
  kicker: string;
  title: string;
  imageRequired: boolean;
  allowChat?: boolean;
  maxImages: number;
  submitLabel: string;
  note: string;
  onSubmit: (comment: string, imageIds: string[]) => boolean;
  onClose: () => void;
}) {
  const chatOk = allowChat && !imageRequired;
  const [method, setMethod] = useState<"chat" | "image">(chatOk ? "chat" : "image");
  const [text, setText] = useState("");
  const [images, setImages] = useState<Uploaded[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const comment = normalizeComment(text);
  const valid = method === "chat" ? comment !== null : images.length > 0 && uploading === 0;

  const onFiles = async (files: File[], replace: boolean) => {
    setError(null);
    const room = replace ? maxImages : maxImages - images.length;
    if (files.length > room) setError(`画像は${maxImages}枚までです`);
    const picked = files.slice(0, Math.max(0, room));
    setUploading((n) => n + picked.length);
    const added: Uploaded[] = [];
    for (const file of picked) {
      try {
        const blob = await compressImage(file);
        added.push({ id: await uploadImage(roomCode, blob), size: blob.size });
      } catch (e) {
        setError(e instanceof Error ? e.message : "画像を送れませんでした");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length > 0) setImages((prev) => (replace ? added : [...prev, ...added]).slice(0, maxImages));
  };

  const pick = () => input.current?.click();
  const single = maxImages === 1;

  return (
    <Modal onClose={onClose} label="申請">
      <div className="modal-head">
        <div className="stack">
          <span className="modal-kicker">{kicker}</span>
          <span className="modal-title">{title}</span>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <Segment
        className="tall"
        options={[
          { value: "chat" as const, label: "チャット", disabled: !chatOk },
          { value: "image" as const, label: "画像" },
        ]}
        value={method}
        onChange={setMethod}
      />
      {imageRequired && <div className="warn-text">このお題は画像必須です</div>}

      {method === "chat" ? (
        <textarea
          className="textarea"
          style={{ height: 96 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="どこで、どう達成したかを一言"
          aria-label="コメント"
        />
      ) : single ? (
        images.length === 0 ? (
          <button type="button" className="dropzone" onClick={pick} disabled={uploading > 0}>
            <b>{uploading > 0 ? "圧縮して送信中…" : "写真を撮影 / 選択"}</b>
            <span>タップしてカメラまたはアルバムから</span>
          </button>
        ) : (
          <div className="preview">
            <img src={imageUrl(roomCode, images[0].id)} alt="選んだ写真" />
            <div className="preview-meta">
              <span>{formatSize(images[0].size)}（自動で圧縮）</span>
              <button type="button" onClick={pick} disabled={uploading > 0}>
                {uploading > 0 ? "送信中…" : "撮り直す"}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="preview-grid">
          {images.map((img) => (
            <div key={img.id} className="tile">
              <img src={imageUrl(roomCode, img.id)} alt="選んだ写真" />
              <button type="button" onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))} aria-label="この写真を外す">
                ×
              </button>
            </div>
          ))}
          {images.length + uploading < maxImages && (
            <button type="button" className="add" onClick={pick}>
              ＋ 写真を追加
            </button>
          )}
          {uploading > 0 && <span className="hint">送信中…</span>}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple={!single}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length > 0) void onFiles(files, single);
        }}
      />
      {!single && method === "image" && <div className="hint">写真は{maxImages}枚まで（自動で圧縮）</div>}
      {error && <div className="warn-text">{error}</div>}

      <div className="hint">{note}</div>
      <button
        type="button"
        className={`btn primary lg${valid ? "" : " off"}`}
        onClick={() => {
          if (!valid) return;
          if (onSubmit(method === "chat" ? (comment ?? "") : "", method === "image" ? images.map((i) => i.id) : [])) onClose();
        }}
      >
        {submitLabel}
      </button>
    </Modal>
  );
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
