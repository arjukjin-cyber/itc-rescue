"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { Menu, X } from "lucide-react";

const SECTIONS = [
  { id: "problem", label: "Problem" },
  { id: "how", label: "How it works" },
  { id: "pricing", label: "Pricing" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50"
      style={{ borderBottom: "1px solid var(--color-line)", backgroundColor: "var(--color-surface)" }}
    >
      <div className="mx-auto flex h-[52px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 md:flex" aria-label="Sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-[13px] font-medium" style={{ color: "var(--color-text-2)" }}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-1.5 md:flex">
          <Link href="/login" className="btn btn-quiet">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-pri">
            Start free
          </Link>
        </div>
        <button
          type="button"
          className="btn btn-quiet btn-icon md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-2 md:hidden" style={{ borderTop: "1px solid var(--color-line)" }}>
          <div className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-[13px] font-medium"
                style={{ color: "var(--color-text-2)" }}
              >
                {s.label}
              </a>
            ))}
            <Link href="/login" className="btn btn-quiet justify-start" onClick={() => setOpen(false)}>
              Log in
            </Link>
            <Link href="/signup" className="btn btn-pri mt-1" onClick={() => setOpen(false)}>
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
