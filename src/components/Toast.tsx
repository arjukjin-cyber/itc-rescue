"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

export interface ToastMsg {
  text: string;
  action?: { label: string; href: string };
}

/** Small transient toast state (auto-dismiss). */
export function useToast(timeoutMs = 5000) {
  const [toast, setToast] = useState<ToastMsg | null>(null);
  const timer = useRef<number | null>(null);

  const show = useCallback(
    (msg: ToastMsg) => {
      if (timer.current) window.clearTimeout(timer.current);
      setToast(msg);
      timer.current = window.setTimeout(() => setToast(null), timeoutMs);
    },
    [timeoutMs]
  );
  const dismiss = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  return { toast, show, dismiss };
}

/** v1 toast: bottom-right, ink bg; errors carry a risk dot (no red fill). */
export function Toast({ toast, onDismiss }: { toast: ToastMsg | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className="toast-float" role="alert" aria-live="assertive">
      <span className="dot dot-risk" aria-hidden />
      <span className="min-w-0">{toast.text}</span>
      {toast.action && (
        <Link href={toast.action.href} className="shrink-0">
          {toast.action.label}
        </Link>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100">
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
