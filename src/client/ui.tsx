import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Team } from "../shared/types";
import { c1 } from "./theme";

// ---- ロゴ（3×3 のドット） ----
export function Logo() {
  return (
    <span className="logo" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={i % 2 === 1 ? "dim" : undefined} />
      ))}
    </span>
  );
}

export function TeamDot({ team, size = 8 }: { team: Team | undefined; size?: number }) {
  return <span className="team-dot" style={{ width: size, height: size, background: team ? c1(team.hue) : "transparent" }} aria-hidden />;
}

// ---- モーダル（PC は中央、スマホはボトムシート） ----
export function Modal({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="close-btn" onClick={onClick} aria-label="閉じる">
      ×
    </button>
  );
}

// ---- セグメント・ステッパー・トグル ----
export function Segment<T extends string | number | boolean>({
  options,
  value,
  onChange,
  mono = false,
  className = "",
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`segment ${className}`} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`${o.value === value ? "on" : ""}${mono ? " mono" : ""}`}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, label, onDec, onInc }: { value: number; label: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className="stepper">
      <button type="button" onClick={onDec} aria-label="減らす">
        −
      </button>
      <span className="mono">
        {value}
        {label}
      </span>
      <button type="button" onClick={onInc} aria-label="増やす">
        ＋
      </button>
    </div>
  );
}

export function Switch({ on, size = "md" }: { on: boolean; size?: "md" | "sm" }) {
  return (
    <span className={`switch ${size}${on ? " on" : ""}`} aria-hidden>
      <span />
    </span>
  );
}

// ---- トースト ----
type ToastApi = { show: (message: string) => void };
const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast({ message, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2800);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div key={toast.id} className="toast" role="status">
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

// スマホ幅かどうか（プレイ画面の下部タブ・ボトムシートの切り替え）
export function useNarrow(): boolean {
  const query = "(max-width: 760px)";
  const [narrow, setNarrow] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

// 1秒ごとに現在時刻を更新する（残り時間の表示用）
export function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
