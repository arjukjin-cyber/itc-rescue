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
  RotateCw,
  X,
  type LucideIcon,
} from "lucide-react";
import { clearLocalUser, getLocalUser, getTrialUsage, setTrialFromServer, syncProfileFromServer } from "@/lib/storage";
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
  /**
   * #34: company and plan come only from GET /api/auth/me (synced via syncProfileFromServer),
   * never from a local fallback. null = /me hasn't answered: skeleton / hidden, never stale data.
   */
  const [company, setCompany] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  /** Switcher list: GET /api/gstins (#33) once /me confirms who is signed in. */
  const [owner, setOwner] = useState<string | null>(null);
  const gstins = useGstins(owner);
  const [reconUsed, setReconUsed] = useState(0);
  const [pending, setPending] = useState<number | null>(null);
  /** null = no recon yet (or not loaded): ITC counts and the period picker are hidden. */
  const [recon, setRecon] = useState<ReconSnap | null>(null);
  const [reconTick, setReconTick] = useState(0);
  /** Deployed commit from GET /api/version (CPO DoD checks); shown as 7 chars in the sidebar foot. */
  const [sha, setSha] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sha?: string } | null) => {
        if (!cancelled && d?.sha) setSha(d.sha);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = getLocalUser();
      if (!local) {
        router.replace("/login");
        return;
      }
      setEmail(local.email);
      setName(local.name || "");
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
            syncProfileFromServer(user);
            setEmail(user.email);
            setName(user.name || "");
            setPlan(user.plan || "trial");
            setCompany(user.companyName || user.name || "");
            setOwner(user.email);
            if (data.persistence === "postgres") setTrialFromServer(user.reconCount ?? 0);
            const used = data.persistence === "postgres" ? user.reconCount ?? 0 : getTrialUsage().reconCount;
            // Never step back: a /me request started before a run can land after the POST
            // response already moved the meter (recon_count only grows).
            setReconUsed((n) => Math.max(n, used));
            return;
          }
        }
      } catch {
        // Fall through; API calls surface auth errors
      }
      if (cancelled) return;
      // /me failed (not 401): no local fallback for company / GSTIN / plan (#34). Trial meter
      // stays hidden; the company and GSTIN slots keep their neutral placeholder.
      setReconUsed((n) => Math.max(n, getTrialUsage().reconCount));
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
    // F-9: the event carries trial.reconCount from the POST /api/recon response → meter moves at once.
    const onTrial = (e: Event) => {
      const n = (e as CustomEvent<number | undefined>).detail;
      setReconUsed(typeof n === "number" ? n : getTrialUsage().reconCount);
    };
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

  const period = recon && recon.due.kind !== "none" ? recon.due.period : null;

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full min-h-0 flex-col">
      <Switcher company={company} gstins={gstins} />
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
      <div className="v3-foot">
        <TrialMeter plan={plan} reconUsed={reconUsed} />
        <VersionTag sha={sha} />
      </div>
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
          <Suspense fallback={<Crumb company={company} pathname={pathname} view={null} period={period} />}>
            <CrumbWithParams company={company} pathname={pathname} period={period} />
          </Suspense>
          <div className="flex-1" />
          {/* F-9 / R-7: trial meter stays visible on mobile without opening the menu */}
          <TrialMeter plan={plan} reconUsed={reconUsed} compact />
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

/** Row shape of GET /api/gstins → { gstins: DbGstin[] } (#33). */
interface GstinRow {
  id: string;
  gstin: string;
  label: string;
  stateCode: string;
  isPrimary: boolean;
}
type GstinList = (
  | { status: "loading" }
  | { status: "ready"; items: GstinRow[] }
  | { status: "error"; error: string }
) & { retry: () => void };

/**
 * GSTIN list for the switcher, from GET /api/gstins only: no local storage and no fallback to
 * /me's GSTIN. `owner` = the /me email (null until /me answers); a new owner starts from
 * "loading", so one account's GSTINs never render under another.
 */
function useGstins(owner: string | null): GstinList {
  type St = { owner: string | null } & ({ status: "loading" } | { status: "ready"; items: GstinRow[] } | { status: "error"; error: string });
  const [st, setSt] = useState<St>({ owner: null, status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    setSt({ owner, status: "loading" });
    fetch("/api/gstins", { credentials: "include", cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (cancelled) return;
        if (!res.ok) {
          setSt({ owner, status: "error", error: (data?.error as string) || `Could not load GSTINs (${res.status})` });
          return;
        }
        setSt({ owner, status: "ready", items: Array.isArray(data?.gstins) ? (data.gstins as GstinRow[]) : [] });
      })
      .catch((e: unknown) => {
        if (!cancelled) setSt({ owner, status: "error", error: e instanceof Error ? e.message : "Network error" });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, tick]);
  const retry = () => setTick((t) => t + 1);
  if (!owner || st.owner !== owner) return { status: "loading", retry };
  return st.status === "ready"
    ? { status: "ready", items: st.items, retry }
    : st.status === "error"
      ? { status: "error", error: st.error, retry }
      : { status: "loading", retry };
}

/** Neutral placeholder bar (v1.1 greys, subtle pulse, off under reduced motion via .skel). */
function Skel({ w, h = 10 }: { w: number | string; h?: number }) {
  return <span className="skel align-middle" style={{ width: w, height: h, display: "inline-block" }} aria-hidden />;
}

/**
 * Workspace / GSTIN switcher (switcher.html). One workspace in v1: no "Create workspace".
 * Company name comes from /api/auth/me (#34); the GSTIN line and the menu list come from
 * GET /api/gstins only (primary first). Empty list = "No GSTIN yet", with no fallback to /me.
 * "Add GSTIN" / "Manage GSTINs" stay out until the GSTINs screen exists (no dead links).
 */
function Switcher({ company, gstins }: { company: string | null; gstins: GstinList }) {
  const loading = company === null;
  const primary =
    gstins.status === "ready" ? gstins.items.find((g) => g.isPrimary) ?? gstins.items[0] ?? null : null;
  const gstinLine =
    gstins.status === "loading" ? (
      <Skel w={130} h={9} />
    ) : gstins.status === "error" ? (
      "GSTIN unavailable"
    ) : primary ? (
      primary.gstin
    ) : (
      "No GSTIN yet"
    );
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
          aria-busy={loading || gstins.status === "loading" || undefined}
          data-testid="switcher"
        >
          <span className="v3-mark" aria-hidden>
            {loading ? "" : initials(company || "?")}
          </span>
          <span className="min-w-0 flex-1">
            <span className="v3-sw-name" data-testid="switcher-company">
              {loading ? <Skel w={110} h={11} /> : company}
            </span>
            <span className="v3-sw-gstin" data-testid="switcher-gstin">
              {gstinLine}
            </span>
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
              {loading ? "" : initials(company || "?")}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium" style={{ color: "var(--color-ink)" }}>
              {loading ? <Skel w={120} /> : company}
            </span>
            <Check aria-hidden style={{ color: "var(--color-ink)" }} />
          </button>
          <div className="v3-hr" />
          <div className="v3-mh">GSTIN</div>
          <GstinMenuList gstins={gstins} active={primary?.gstin ?? ""} close={close} />
        </div>
      )}
    </Dropdown>
  );
}

function GstinMenuList({ gstins, active, close }: { gstins: GstinList; active: string; close: () => void }) {
  if (gstins.status === "loading") {
    return (
      <div className="flex flex-col gap-2 px-2.5 py-2" aria-busy="true" aria-label="Loading GSTINs" data-testid="gstins-loading">
        <Skel w={150} />
        <Skel w={120} />
      </div>
    );
  }
  if (gstins.status === "error") {
    return (
      <div className="px-2.5 pb-2 pt-1 text-[13px]" style={{ color: "var(--color-text-2)" }} role="alert" data-testid="gstins-error">
        <p>Couldn&apos;t load your GSTINs.</p>
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium"
          style={{ color: "var(--color-accent)" }}
          onClick={gstins.retry}
        >
          <RotateCw aria-hidden style={{ width: 13, height: 13 }} /> Try again
        </button>
      </div>
    );
  }
  if (!gstins.items.length) {
    return (
      <div className="px-2.5 pb-2 pt-1 text-[13px]" style={{ color: "var(--color-text-3)" }} data-testid="gstins-empty">
        No GSTIN yet
      </div>
    );
  }
  return (
    <div data-testid="gstins-list">
      {gstins.items.map((g) => {
        const on = g.gstin === active;
        const state = GST_STATES[g.stateCode || g.gstin.slice(0, 2)];
        return (
          <button
            key={g.id}
            type="button"
            role="menuitemradio"
            aria-checked={on}
            className="v3-mi"
            data-on={on ? "true" : undefined}
            onClick={close}
            title={g.label || undefined}
          >
            <span className="v3-mono" style={{ color: "var(--color-ink)" }}>
              {g.gstin}
            </span>
            {state && (
              <span className="truncate" style={{ color: "var(--color-text-3)" }}>
                {state}
              </span>
            )}
            <span className="flex-1" />
            {on && <Check aria-hidden style={{ color: "var(--color-ink)" }} />}
          </button>
        );
      })}
    </div>
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

/**
 * F-9 / v3 foot: "Free trial · N of 1 recon used" + 4px ink meter (sidebar + mobile drawer).
 * `compact` = the same meter in the mobile top bar (hidden on lg, where the sidebar shows it).
 */
function TrialMeter({ plan, reconUsed, compact = false }: { plan: string | null; reconUsed: number; compact?: boolean }) {
  if (plan !== "trial") return null;
  const used = Math.min(reconUsed, 1);
  const bar = (
    <div
      className="v3-bar"
      role="progressbar"
      aria-label="Free recons used"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={used}
      data-trial-used={used >= 1 ? "true" : "false"}
    >
      <i style={{ width: `${used * 100}%` }} />
    </div>
  );
  if (compact) {
    return (
      <div className="v3-trial-compact lg:hidden" title={`Free trial · ${used} of 1 recon used`}>
        <span>{used} of 1 free recon</span>
        {bar}
      </div>
    );
  }
  return (
    <div className="v3-trial">
      <div className="flex items-center justify-between gap-2">
        <span>Free trial</span>
        <span>{used} of 1 recon used</span>
      </div>
      {bar}
    </div>
  );
}

/** Build stamp for DoD checks: short sha from GET /api/version ("dev" locally). */
function VersionTag({ sha }: { sha: string | null }) {
  if (!sha) return null;
  const short = sha === "dev" ? "dev" : sha.slice(0, 7);
  return (
    <div className="v3-ver" title={sha === "dev" ? "Local build" : `Build ${sha}`}>
      Build <span className="v3-mono">{short}</span>
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
  /** null while /me loads: a neutral placeholder, never a stale or guessed company name. */
  company: string | null;
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
      {company === null && (
        <span className="hidden items-center gap-1.5 sm:flex" aria-hidden>
          <Skel w={96} />
          <span>/</span>
        </span>
      )}
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

