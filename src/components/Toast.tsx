"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, X } from "lucide-react";

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

export function Toast({ toast, onDismiss }: { toast: ToastMsg | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className="toast-float" role="alert" aria-live="assertive">
      <AlertCircle size={16} className="shrink-0" aria-hidden />
      <span className="min-w-0">{toast.text}</span>
      {toast.action && (
        <Link href={toast.action.href} className="link-accent shrink-0">
          {toast.action.label}
        </Link>
      )}
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
