"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [open, setOpen] = useState(false);
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
        <nav
          className="hidden items-center gap-8 text-sm font-medium md:flex"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <a href="#problem" className="hover:text-[var(--color-accent)]">
            Problem
          </a>
          <a href="#how" className="hover:text-[var(--color-accent)]">
            How it works
          </a>
          <a href="#pricing" className="hover:text-[var(--color-accent)]">
            Pricing
          </a>
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
          <div
            className="flex flex-col gap-1 text-sm font-medium"
            style={{ color: "var(--color-text)" }}
          >
            <a
              href="#problem"
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-[var(--color-bg-subtle)]"
            >
              Problem
            </a>
            <a
              href="#how"
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-[var(--color-bg-subtle)]"
            >
              How it works
            </a>
            <a
              href="#pricing"
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-[var(--color-bg-subtle)]"
            >
              Pricing
            </a>
            <Link
              href="/login"
              className="rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-[var(--color-bg-subtle)]"
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
