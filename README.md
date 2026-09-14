# ITC Rescue

**Unblock your GSTR-3B ITC claims** — SaaS MVP for Indian MSMEs (₹50L–₹5cr turnover).

Upload purchase register + GSTR-2B → reconcile → chase vendors on WhatsApp (English + Hindi) → track status.

## Product overview

From April 2026, claimed ITC that exceeds GSTR-2B can hard-block GSTR-3B filing. The unpaid work is chasing vendors to fix GSTR-1. ITC Rescue automates the reconciliation and chase workflow — no GST portal / government API required.

### Features

1. **Landing** — India-first marketing (problem, how it works, pricing)
2. **Demo auth** — email + any password (session cookie)
3. **Reconcile** — Excel/CSV upload, invoice# normalization, GSTIN + invoice + date (±1 day) matching
4. **Categories** — matched · ITC at risk (books only) · unclaimed (2B only) · value mismatch
5. **Vendor chase** — copyable WhatsApp / email templates (EN + HI)
6. **Status board** — pending / fixed / still blocked
7. **Settings** — company GSTIN, plan (Starter ₹999 / Growth ₹2,499), Razorpay placeholder
8. **Soft paywall** — free trial: 1 reconciliation or 50 invoices

### Pricing

| Plan    | Price     | Limits                          |
|---------|-----------|---------------------------------|
| Trial   | Free      | 1 recon or 50 invoices          |
| Starter | ₹999/mo   | Unlimited recon, 500 inv/mo     |
| Growth  | ₹2,499/mo | Unlimited invoices              |

## Quick start

```bash
cd itc-rescue
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production build
npm start       # serve production build
```

### Demo walkthrough

1. Click **Start free trial** or **Log in** (prefilled `demo@itcrescue.in` / any password)
2. Go to **Reconcile** → **Load sample files**
3. Review ITC-at-risk rows → **Chase vendors** → copy WhatsApp (EN/HI)
4. Move items on **Status board**
5. Optionally upgrade plan under **Settings** (demo mode, no real Razorpay charge)

Sample files live in `/public/samples/`:

- `purchase-register.csv`
- `gstr-2b.csv`

## Tech stack

- Next.js App Router + TypeScript + Tailwind CSS v4
- `xlsx` for Excel/CSV parsing
- Demo JWT session cookie (`jose`) + `localStorage` for recon/chase/settings persistence
- No external database required for MVP

## Key routes

| Route         | Description                |
|---------------|----------------------------|
| `/`           | Marketing landing          |
| `/login`      | Demo login                 |
| `/signup`     | Demo signup                |
| `/dashboard`  | App home + stats           |
| `/reconcile`  | Upload & match             |
| `/chase`      | Vendor WhatsApp/email list |
| `/status`     | Kanban status board        |
| `/settings`   | Company + plan             |

## Matching rules

- Normalize invoice numbers (strip spaces, dashes, slashes; uppercase)
- Match on **GSTIN + normalized invoice# + date within ±1 day**
- Tax difference &gt; ₹1 → **value mismatch**
- In books only → **ITC at risk**
- In 2B only → **unclaimed**

## Environment

Optional:

```bash
AUTH_SECRET=your-long-random-string
```

Defaults to a demo secret suitable for local use only.

## Project layout

```
src/
  app/           # App Router pages + API auth
  components/    # UI shell, badges, stats
  lib/           # reconcile, auth, storage, templates
public/samples/  # Offline demo CSVs
```

## License

Proprietary MVP — built as a solopreneur product prototype.
