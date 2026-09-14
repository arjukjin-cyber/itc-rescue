"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { Menu, X } from "lucide-react";

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
          <a href="#problem" className="hover:text-teal-700">Problem</a>
          <a href="#how" className="hover:text-teal-700">How it works</a>
          <a href="#pricing" className="hover:text-teal-700">Pricing</a>
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-teal-700">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
          >
            Start free trial
          </Link>
        </div>
        <button
          className="md:hidden rounded-lg p-2 text-slate-700"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium">
            <a href="#problem" onClick={() => setOpen(false)}>Problem</a>
            <a href="#how" onClick={() => setOpen(false)}>How it works</a>
            <a href="#pricing" onClick={() => setOpen(false)}>Pricing</a>
            <Link href="/login" className="pt-2">Log in</Link>
            <Link
              href="/signup"
              className="rounded-lg bg-teal-700 px-4 py-2 text-center font-semibold text-white"
            >
              Start free trial
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
