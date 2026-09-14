"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Menu, X } from "lucide-react";

const SECTIONS = [
  { id: "problem", label: "Problem" },
  { id: "how", label: "How it works" },
  { id: "pricing", label: "Pricing" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el
    );
    if (!els.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const linkClass = (id: string) =>
    `rounded-full px-3 py-1.5 transition ${
      active === id ? "font-semibold" : "font-medium hover:bg-[var(--color-bg-subtle)]"
    }`;

  const linkStyle = (id: string) =>
    active === id
      ? {
          backgroundColor: "var(--color-accent-soft)",
          color: "var(--color-accent)",
        }
      : { color: "var(--color-text-secondary)" };

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{
        borderBottom: "1px solid color-mix(in srgb, var(--color-border) 80%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-bg) 90%, transparent)",
      }}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 text-sm md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={linkClass(s.id)}
              style={linkStyle(s.id)}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium hover:text-[var(--color-accent)]"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="btn-accent px-4 py-2 text-sm font-semibold shadow-sm"
          >
            Start free trial
          </Link>
        </div>
        <button
          className="rounded-[var(--radius-md)] p-2 md:hidden"
          style={{ color: "var(--color-text)" }}
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div
          className="px-4 py-4 md:hidden"
          style={{
            borderTop: "1px solid var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div className="flex flex-col gap-1 text-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setOpen(false)}
                className={`rounded-full px-3 py-2.5 ${
                  active === s.id ? "font-semibold" : "font-medium"
                }`}
                style={linkStyle(s.id)}
              >
                {s.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-full px-3 py-2.5 font-medium hover:bg-[var(--color-bg-subtle)]"
              style={{ color: "var(--color-text)" }}
              onClick={() => setOpen(false)}
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="btn-accent mt-1 px-4 py-2.5 text-center font-semibold"
              onClick={() => setOpen(false)}
            >
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
