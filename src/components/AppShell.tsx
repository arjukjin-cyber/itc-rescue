"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard,
  GitCompareArrows,
  History,
  TriangleAlert,
  Diff,
  Inbox,
  Building2,
  Send,
  MessageSquareText,
  CalendarDays,
  FileText,
  Landmark,
  Users,
  CreditCard,
  Settings,
  SquareKanban,
  CircleCheck,
  Search,
  ChevronsUpDown,
  ChevronDown,
  Calendar,
  CircleHelp,
  Check,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { clearLocalUser, getLocalUser, getSettings, getTrialUsage, setLocalUser, setTrialFromServer } from "@/lib/storage";
import { fetchChaseItems, fetchReconState } from "@/lib/api-data";
import { CHASE_COUNT_EVENT, RECON_EVENT, TRIAL_EVENT } from "@/lib/ui-events";
import { getGstr3bDue, type Gstr3bDue } from "@/lib/filing";
import { viewCounts, viewFromSlug, viewHref, type ItcView } from "@/lib/views";
import { getSampleRun, isReconScreen } from "@/lib/sample-run";
import { Dropdown } from "./Dropdown";
import { CommandPalette, type PalettePage } from "./CommandPalette";
import type { MatchResult, UserSession } from "@/lib/types";

/*
 * v3 app shell (approved frames /workspace/itc-redesign/v3; routes nav-ia-v1.md; Drop 1).
 * Sidebar 240: workspace/GSTIN switcher · "Search or jump to" ⌘K · nav · trial meter.
 * Top bar 52: breadcrumb (company / section / page) · Return period · help · avatar menu.
 * Drop 1 shows only rows whose screen is on v3 (or an existing screen that works in the shell);
 * every other IA row stays in NAV with `on: false` and never renders. No dead links.
 */

const MATCH_RULE = "Invoices match on GSTIN + invoice number + invoice date (±1 day), then tax is compared.";

/** Billing stays hidden until pricing visibility is decided (CTO). */
const NAV_FLAGS = { billing: false } as const;

type CountKey = ItcView | "pending";
interface NavRow {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  count?: CountKey;
  /** ?view= on /reconcile, for the ITC rows */
  view?: ItcView;
  /** Rendered in Drop 1. false = IA row whose screen isn't rebuilt yet (Drop 2) — never rendered. */
  on: boolean;
}
interface NavSection {
  title: string;
  /** Breadcrumb section; Overview pages show only company / page (v3 frames). */
  crumb: string | null;
  rows: NavRow[];
}

const NAV: NavSection[] = [
  { title: "Overview", crumb: null, rows: [{ id: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, on: true }] },
  {
    title: "Reconcile",
    crumb: "Reconcile",
    rows: [
      { id: "runs", label: "Runs", href: "/reconcile", icon: GitCompareArrows, on: true },
      { id: "history", label: "History", href: "/reconcile/history", icon: History, on: false },
    ],
  },
  {
    title: "ITC",
    crumb: "ITC",
    rows: [
      { id: "at_risk", label: "At risk", href: viewHref("at_risk"), view: "at_risk", icon: TriangleAlert, count: "at_risk", on: true },
      { id: "mismatch", label: "Mismatches", href: viewHref("mismatch"), view: "mismatch", icon: Diff, count: "mismatch", on: true },
      { id: "unclaimed", label: "Unclaimed", href: viewHref("unclaimed"), view: "unclaimed", icon: Inbox, count: "unclaimed", on: true },
      // Not a v3 sidebar row; reached from the Runs "Matched" tab.
      { id: "matched", label: "Matched", href: viewHref("matched"), view: "matched", icon: CircleCheck, on: false },
    ],
  },
  {
    title: "Vendors",
    crumb: "Vendors",
    rows: [
      { id: "directory", label: "Directory", href: "/vendors", icon: Building2, on: false },
      { id: "chase", label: "Chase queue", href: "/chase", icon: Send, count: "pending", on: true },
      { id: "templates", label: "Templates", href: "/vendors/templates", icon: MessageSquareText, on: false },
      // Existing screen, not in the v3 IA: kept routable (⌘K), not in the sidebar.
      { id: "status", label: "Status board", href: "/status", icon: SquareKanban, on: false },
    ],
  },
  {
    title: "Filing",
    crumb: "Filing",
    rows: [
      { id: "calendar", label: "GSTR-3B calendar", href: "/filing/calendar", icon: CalendarDays, on: false },
      { id: "reports", label: "Reports", href: "/filing/reports", icon: FileText, on: false },
    ],
  },
  {
    title: "Company",
    crumb: "Company",
    rows: [
      { id: "gstins", label: "GSTINs", href: "/company/gstins", icon: Landmark, on: false },
      { id: "team", label: "Team", href: "/company/team", icon: Users, on: false },
      { id: "billing", label: "Billing", href: "/company/billing", icon: CreditCard, on: NAV_FLAGS.billing },
      { id: "settings", label: "Settings", href: "/settings", icon: Settings, on: true },
    ],
  },
];

/** Routable screens that aren't sidebar rows in v3 but work in the shell (palette + breadcrumb). */
const EXTRA_PAGES: { section: string; row: NavRow }[] = [
  { section: "Vendors", row: NAV[3].rows.find((r) => r.id === "status")! },
  { section: "ITC", row: NAV[2].rows.find((r) => r.id === "matched")! },
];

const PALETTE_PAGES: PalettePage[] = [
  ...NAV.flatMap((s) => s.rows.filter((r) => r.on).map((r) => ({ label: r.label, href: r.href, icon: r.icon, section: s.title }))),
  ...EXTRA_PAGES.map(({ section, row }) => ({ label: row.label, href: row.href, icon: row.icon, section })),
];

/** GST state codes → names (switcher shows the state next to the GSTIN, per switcher.html). */
const GST_STATES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman and Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
};

function initials(name: string): string {
  const w = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "I") + (w[1]?.[0] ?? w[0]?.[1] ?? "R")).toUpperCase();
}

interface ReconSnap {
  counts: Record<ItcView, number>;
  due: Gstr3bDue;
}
const snapOf = (results: MatchResult[]): ReconSnap => ({ counts: viewCounts(results), due: getGstr3bDue(results) });

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [gstin, setGstin] = useState("");
  const [plan, setPlan] = useState("trial");
  const [reconUsed, setReconUsed] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  /** null = no recon yet (or not loaded): ITC counts and the period picker are hidden. */
  const [recon, setRecon] = useState<ReconSnap | null>(null);
  const [reconTick, setReconTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getLocalUser();
      if (!local) {
        router.replace("/login");
        return;
      }
      const s = getSettings();
      setEmail(local.email);
      setName(local.name || "");
      setCompany(s.companyName || local.companyName || local.name || "");
      setGstin(s.gstin || local.gstin || "");
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.status === 401) {
          clearLocalUser();
          router.replace("/login");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          const user = data.user as UserSession | null;
          if (user) {
            setLocalUser(user);
            setEmail(user.email);
            setName(user.name || "");
            setPlan(user.plan);
            if (user.companyName) setCompany(user.companyName);
            if (user.gstin) setGstin(user.gstin);
            if (data.persistence === "postgres") setTrialFromServer(user.reconCount ?? 0);
            setReconUsed(data.persistence === "postgres" ? user.reconCount ?? 0 : getTrialUsage().reconCount);
            return;
          }
        }
      } catch {
        // Fall through; API calls surface auth errors
      }
      if (cancelled) return;
      setPlan(getSettings().plan);
      setReconUsed(getTrialUsage().reconCount);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  // Chase queue pending count: load on navigation, then follow in-page updates.
  useEffect(() => {
    let cancelled = false;
    void fetchChaseItems().then(({ items, authError }) => {
      if (cancelled || authError) return;
      setPending(items.filter((c) => c.status === "pending").length);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // ITC counts + return period from the latest recon (existing GET /api/recon).
  useEffect(() => {
    let cancelled = false;
    // On /reconcile an unsaved sample run (memory only, #29) is what's on screen.
    const sample = isReconScreen(pathname) ? getSampleRun() : null;
    if (sample) {
      setRecon(snapOf(sample.results));
      return;
    }
    void fetchReconState().then((st) => {
      if (cancelled || st.authError) return;
      setRecon(st.summary && st.results.length ? snapOf(st.results) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, reconTick]);

  useEffect(() => {
    const onCount = (e: Event) => setPending((e as CustomEvent<number>).detail);
    const onTrial = () => setReconUsed(getTrialUsage().reconCount);
    const onRecon = () => setReconTick((t) => t + 1);
    window.addEventListener(CHASE_COUNT_EVENT, onCount);
    window.addEventListener(TRIAL_EVENT, onTrial);
    window.addEventListener(RECON_EVENT, onRecon);
    return () => {
      window.removeEventListener(CHASE_COUNT_EVENT, onCount);
      window.removeEventListener(TRIAL_EVENT, onTrial);
      window.removeEventListener(RECON_EVENT, onRecon);
    };
  }, []);

  // ⌘K / Ctrl+K opens the palette anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(false);
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Mobile drawer: close on navigation / Escape, lock page scroll while open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalUser();
    router.push("/");
  }

  const companyName = company || "ITC Rescue";
  const period = recon && recon.due.kind !== "none" ? recon.due.period : null;

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col">
      <Switcher company={companyName} gstin={gstin} />
      <SearchButton
        onOpen={() => {
          onNavigate?.();
          setPaletteOpen(true);
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Suspense fallback={<SideNav pathname={pathname} view={null} recon={recon} pending={pending} onNavigate={onNavigate} />}>
          <SideNavWithParams pathname={pathname} recon={recon} pending={pending} onNavigate={onNavigate} />
        </Suspense>
      </div>
      <TrialMeter plan={plan} reconUsed={reconUsed} />
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-surface)" }}>
      <aside className="v3-aside hidden shrink-0 lg:block" aria-label="Sidebar">
        <div className="sticky top-0 h-screen">{sidebar()}</div>
      </aside>

      {/* Mobile / tablet: the same sidebar (incl. the trial meter) as an off-canvas drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default"
            style={{ backgroundColor: "rgba(9,9,11,.32)" }}
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="v3-aside absolute inset-y-0 left-0 max-w-[85vw]">
            {sidebar(() => setOpen(false))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="v3-ib absolute top-2 z-10"
            style={{ left: "min(248px, calc(85vw + 8px))", backgroundColor: "#fff" }}
            aria-label="Close menu"
          >
            <X aria-hidden />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="v3-top">
          {/* wrapper carries lg:hidden: .v3-ib sets display and would override the utility */}
          <span className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="v3-ib"
              aria-label="Open menu"
              aria-expanded={open}
            >
              <Menu aria-hidden />
            </button>
          </span>
          <Suspense fallback={<Crumb company={companyName} pathname={pathname} view={null} period={period} />}>
            <CrumbWithParams company={companyName} pathname={pathname} period={period} />
          </Suspense>
          <div className="flex-1" />
          {period && <PeriodPicker period={period} />}
          {period && <div className="v3-vr hidden sm:block" aria-hidden />}
          {/* Notifications bell: no backend in v1 (IA Q7), so it's hidden rather than a dead control. */}
          <HelpMenu />
          <UserMenu email={email} name={name} onLogout={logout} />
        </header>

        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={PALETTE_PAGES} canUpload />
    </div>
  );
}

/* ── Sidebar pieces ─────────────────────────────────────────────────────── */

/**
 * Workspace / GSTIN switcher (switcher.html). One workspace in v1: no "Create workspace".
 * "Add GSTIN" / "Manage GSTINs" are left out: there is no GSTINs screen or API to open (CTO rule:
 * no dead link, no new API in this PR).
 */
function Switcher({ company, gstin }: { company: string; gstin: string }) {
  const state = gstin ? GST_STATES[gstin.slice(0, 2)] : undefined;
  return (
    <Dropdown
      label="Workspace and GSTIN"
      menuClassName="v3-pop v3-sw-pop w-[280px]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className="v3-sw"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
          title="Workspace and GSTIN"
        >
          <span className="v3-mark" aria-hidden>
            {initials(company)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="v3-sw-name">{company}</span>
            <span className="v3-sw-gstin">{gstin || "GSTIN not set"}</span>
          </span>
          <ChevronsUpDown aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div style={{ position: "relative" }}>
          <div className="v3-mh">Workspace</div>
          <button type="button" role="menuitemradio" aria-checked="true" className="v3-mi" data-on="true" onClick={close}>
            <span className="v3-mark" data-size="sm" aria-hidden>
              {initials(company)}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>
              {company}
            </span>
            <Check aria-hidden style={{ color: "var(--color-ink)" }} />
          </button>
          <div className="v3-hr" />
          <div className="v3-mh">GSTIN</div>
          {gstin ? (
            <button type="button" role="menuitemradio" aria-checked="true" className="v3-mi" data-on="true" onClick={close}>
              <span className="v3-mono" style={{ color: "var(--color-ink)" }}>
                {gstin}
              </span>
              {state && <span style={{ color: "var(--color-text-3)" }}>{state}</span>}
              <span className="flex-1" />
              <Check aria-hidden style={{ color: "var(--color-ink)" }} />
            </button>
          ) : (
            <div className="v3-mi" style={{ color: "var(--color-text-3)" }}>
              No GSTIN on this account
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}

function SearchButton({ onOpen }: { onOpen: () => void }) {
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return (
    <button type="button" className="v3-srch" onClick={onOpen} aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}>
      <Search aria-hidden />
      Search or jump to
      <span className="v3-kbd" aria-hidden>
        {mac ? "⌘K" : "Ctrl K"}
      </span>
    </button>
  );
}

function SideNavWithParams(props: Omit<Parameters<typeof SideNav>[0], "view">) {
  const sp = useSearchParams();
  return <SideNav {...props} view={props.pathname === "/reconcile" ? viewFromSlug(sp.get("view")) : null} />;
}

function SideNav({
  pathname,
  view,
  recon,
  pending,
  onNavigate,
}: {
  pathname: string;
  view: ItcView | null;
  recon: ReconSnap | null;
  pending: number | null;
  onNavigate?: () => void;
}) {
  const countFor = (k?: CountKey) => {
    if (!k) return undefined;
    if (k === "pending") return pending !== null && pending > 0 ? pending : undefined;
    return recon ? recon.counts[k] : undefined;
  };
  const isActive = (r: NavRow) => {
    if (r.view) return pathname === "/reconcile" && view === r.view;
    if (r.href === "/reconcile") return pathname === "/reconcile" && !view;
    return pathname === r.href;
  };

  return (
    <nav className="v3-nav" aria-label="Main">
      {NAV.map((sec) => {
        const rows = sec.rows.filter((r) => r.on);
        if (!rows.length) return null;
        return (
          <div key={sec.title} className="flex flex-col">
            <div className="v3-lbl">{sec.title}</div>
            {rows.map((r) => {
              const Icon = r.icon;
              const ct = countFor(r.count);
              return (
                <Link key={r.id} href={r.href} aria-current={isActive(r) ? "page" : undefined} onClick={onNavigate}>
                  <Icon aria-hidden />
                  <span className="min-w-0 truncate">{r.label}</span>
                  {ct !== undefined && (
                    <span className="v3-ct" data-risk={r.count === "at_risk" && ct > 0 ? "true" : undefined}>
                      {ct}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** F-9 / v3 foot: "Free trial · N of 1 recon used" + 4px ink meter; same in the mobile drawer. */
function TrialMeter({ plan, reconUsed }: { plan: string; reconUsed: number }) {
  if (plan !== "trial") return null;
  const used = Math.min(reconUsed, 1);
  return (
    <div className="v3-foot">
      <div className="flex items-center justify-between gap-2">
        <span>Free trial</span>
        <span>{used} of 1 recon used</span>
      </div>
      <div
        className="v3-bar"
        role="progressbar"
        aria-label="Free recons used"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={used}
      >
        <i style={{ width: `${used * 100}%` }} />
      </div>
    </div>
  );
}

/* ── Top bar pieces ─────────────────────────────────────────────────────── */

function CrumbWithParams(props: Omit<Parameters<typeof Crumb>[0], "view">) {
  const sp = useSearchParams();
  return <Crumb {...props} view={props.pathname === "/reconcile" ? viewFromSlug(sp.get("view")) : null} />;
}

function Crumb({
  company,
  pathname,
  view,
  period,
}: {
  company: string;
  pathname: string;
  view: ItcView | null;
  period: string | null;
}) {
  let section: string | null = null;
  let page = "";
  const all = [
    ...NAV.flatMap((s) => s.rows.map((r) => ({ crumb: s.crumb, r }))),
    ...EXTRA_PAGES.map(({ section: sec, row }) => ({ crumb: sec, r: row })),
  ];
  const hit =
    pathname === "/reconcile"
      ? all.find((x) => (view ? x.r.view === view : x.r.id === "runs"))
      : all.find((x) => x.r.href === pathname);
  if (hit) {
    section = hit.crumb;
    page = hit.r.id === "runs" && period ? `${period} run` : hit.r.label;
  }
  const parts = [company, section].filter(Boolean) as string[];
  return (
    <nav className="v3-crumb" aria-label="Breadcrumb">
      {parts.map((p, i) => (
        <span key={i} className={`items-center gap-1.5 ${i === 0 ? "hidden sm:flex" : "hidden md:flex"}`}>
          <span className="truncate">{p}</span>
          <span aria-hidden>/</span>
        </span>
      ))}
      <b aria-current="page">{page}</b>
    </nav>
  );
}

/** Return period: the period of the latest recon (the only run the API returns today). */
function PeriodPicker({ period }: { period: string }) {
  return (
    <Dropdown
      label="Return period"
      align="right"
      menuClassName="v3-pop w-[240px]"
      className="hidden sm:block"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className="btn v3-sel"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
        >
          <Calendar aria-hidden />
          Return period <b>{period}</b>
          <ChevronDown aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="v3-mh">Return period</div>
          <button type="button" role="menuitemradio" aria-checked="true" className="v3-mi" data-on="true" onClick={close}>
            <span className="flex-1 font-medium" style={{ color: "var(--color-ink)" }}>
              {period}
            </span>
            <Check aria-hidden style={{ color: "var(--color-ink)" }} />
          </button>
          <p className="px-2.5 pb-1.5 pt-1 text-[12px]" style={{ color: "var(--color-text-3)" }}>
            Periods come from your recon runs.
          </p>
        </>
      )}
    </Dropdown>
  );
}

function HelpMenu() {
  return (
    <Dropdown
      label="Help"
      align="right"
      menuClassName="v3-pop w-[280px]"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className="v3-ib"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
          aria-label="Help"
          title="Help"
        >
          <CircleHelp aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div id="shell-help">
          <div className="v3-mh">How matching works</div>
          <p className="px-2.5 pb-2 text-[13px] leading-[1.45]" style={{ color: "var(--color-text-2)" }}>
            {MATCH_RULE}
          </p>
          <div className="v3-hr" />
          <Link href="/#how" className="v3-mi" onClick={close}>
            <FileText aria-hidden /> How ITC Rescue works
          </Link>
        </div>
      )}
    </Dropdown>
  );
}

function UserMenu({ email, name, onLogout }: { email: string; name: string; onLogout: () => void }) {
  const label = name || email || "?";
  return (
    <Dropdown
      label="Account"
      align="right"
      menuClassName="v3-pop w-[240px]"
      className="ml-1.5"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          className="v3-av"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={toggle}
          aria-label="Account menu"
          title={email}
        >
          {initials(label)}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="v3-mh truncate">{email}</div>
          <Link href="/settings" className="v3-mi" onClick={close}>
            <Settings aria-hidden /> Settings
          </Link>
          <div className="v3-hr" />
          <button
            type="button"
            className="v3-mi"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <LogOut aria-hidden /> Log out
          </button>
        </>
      )}
    </Dropdown>
  );
}

