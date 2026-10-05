import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy · ITC Rescue" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16" style={{ color: "var(--color-text)" }}>
      <Link href="/" className="text-sm underline" style={{ color: "var(--color-accent)" }}>
        ITC Rescue
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
        <section>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Your files</h2>
          <p className="mt-2">
            Your purchase register and GSTR-2B files are read in your browser. The files themselves are
            not uploaded to our servers.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>What we save</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your account: name, email, a hashed password, company name and GSTIN.</li>
            <li>
              Match results from each reconciliation: vendor GSTIN, vendor name, invoice number, invoice date,
              tax amounts and the match status.
            </li>
            <li>The chase status you set for each vendor invoice.</li>
          </ul>
          <p className="mt-2">Sample-data runs are never saved.</p>
        </section>
        <section>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Where it&apos;s stored</h2>
          <p className="mt-2">
            The app runs on Vercel and the data is stored in a Neon Postgres database. We don&apos;t sell
            your data or share it with advertisers.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>Messages to vendors</h2>
          <p className="mt-2">
            ITC Rescue never messages your vendors. WhatsApp and email chases open on your own device, and
            you choose whether to send them.
          </p>
        </section>
      </div>
    </main>
  );
}
