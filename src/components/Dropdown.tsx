"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * v1 menu / popover: 1px line border, radius-md, the one allowed menu shadow.
 * Closes on outside click, Escape, and item activation.
 */
export function Dropdown({
  trigger,
  children,
  align = "left",
  placement = "down",
  className = "",
  menuClassName = "",
  label,
}: {
  trigger: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "stretch";
  placement?: "down" | "up";
  className?: string;
  menuClassName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div ref={ref} className={`relative ${className}`}>
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={`menu ${menuClassName}`}
          data-align={align}
          data-placement={placement}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu-label">{children}</div>;
}

export function MenuSep() {
  return <div className="menu-sep" role="separator" />;
}

export function MenuItem({
  children,
  onSelect,
  href,
  disabled,
  meta,
  checked,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  meta?: ReactNode;
  checked?: boolean;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta != null && <span className="menu-meta">{meta}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} role="menuitem" className="menu-item" onClick={onSelect}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      className="menu-item"
      disabled={disabled}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}
