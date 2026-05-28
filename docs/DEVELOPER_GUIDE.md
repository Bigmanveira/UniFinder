# College Ready — Developer Guide

A single-stop onboarding doc for any developer joining the project. Covers what we've built, how it fits together, and how to operate it day-to-day. Pairs with the existing setup-focused `README.md` at the repo root; this file assumes you've completed that setup.

> **Last comprehensive update:** 2026-05-28. The codebase moves fast — if a claim here disagrees with the code, trust the code.

---

## Table of contents

1. [Product overview](#product-overview)
2. [Repository layout](#repository-layout)
3. [Tech stack](#tech-stack)
4. [Local development](#local-development)
5. [Architecture (end-to-end)](#architecture-end-to-end)
6. [Firestore data model](#firestore-data-model)
7. [Core concepts](#core-concepts)
8. [Key user flows](#key-user-flows)
9. [Cloud Functions reference](#cloud-functions-reference)
10. [Ops portal reference](#ops-portal-reference)
11. [Security & access control](#security--access-control)
12. [Deployment](#deployment)
13. [Common admin operations](#common-admin-operations)
14. [Audit + observability](#audit--observability)
15. [Known limitations & V2 candidates](#known-limitations--v2-candidates)

---

## Product overview

**College Ready** is an AI-powered platform that matches African students to U.S. universities and helps them practise the F-1 visa interview that gates their enrolment.

### What the product does

- **AI school matching.** A guest fills out an intake form (GPA, scores, budget, field of study, level). We rank ~12 verified U.S. schools against the profile and bucket them into reach / target / safety with one-line reasoning.
- **Full match report (paid).** A signed-in user spends 1 credit to unlock a richer report — deeper per-school reasoning, funding paths, what to strengthen.
- **F-1 visa interview practice (paid, our moat).** 15 credits to start a session. A live AI consular officer (named Anna) reads the user's I-20 + DS-160, asks the questions a real officer would, and a scorer grades the responses at the end.

### Who uses it

- **Students** in Africa applying to U.S. universities — primary audience.
- **Founders + invited admins** — operate the platform through the ops portal.

### Revenue model

Pay-as-you-go **credits**. Five packs in [`functions/src/index.ts`](../functions/src/index.ts) `CREDIT_PACKS`:

| Pack | Credits | Charged (GHS) | Displayed (USD) |
|---|---|---|---|
| Try | 6 | ₵24 | $2 |
| Starter | 15 | ₵60 | $5 |
| Plus | 45 | ₵180 | $15 |
| Pro | 120 | ₵480 | $40 |
| Power | 300 | ₵1,200 | $100 |

USD is the displayed currency (anchor familiar to international students); GHS is what Paystack actually charges. Users see both.

---

## Repository layout

Two separate Git repos, two separate Vercel projects:

```
UniFinder/                       ← main app + Cloud Functions (this repo)
├── docs/
│   └── DEVELOPER_GUIDE.md       ← you are here
├── functions/                   ← Cloud Functions (Node.js 20, TypeScript)
│   └── src/
│       ├── index.ts             ← Every callable + Firestore trigger
│       ├── aiMatch.ts           ← Guest preview ranking (Claude Haiku)
│       ├── claudeExplainMatches.ts ← Full match report reasoning (Claude Sonnet)
│       ├── visaInterview.ts     ← Visa officer turns + scoring
│       ├── visaDocExtractor.ts  ← I-20 / DS-160 OCR via Claude
│       ├── liveAvatarSession.ts ← HeyGen session lifecycle
│       ├── avatarTts.ts         ← Google TTS for the avatar's voice
│       ├── paystackPayments.ts  ← Init checkout + webhook handler
│       ├── marketerCodes.ts     ← Admin-issued referral codes
│       ├── opsAdmins.ts         ← Ops portal admin allowlist + roles
│       ├── maintenanceMode.ts   ← Kill-switch helpers
│       ├── errorLogger.ts       ← Shared errorLogs writer
│       ├── rateLimiter.ts       ← In-memory per-IP limiter
│       ├── welcomeEmail.ts      ← Resend templates
│       ├── waitlistEmail.ts
│       ├── launchAnnouncementEmail.ts
│       ├── paymentReceiptEmail.ts
│       ├── opsSignInEmail.ts
│       ├── userSignInEmail.ts
│       ├── bulkEmailChrome.ts   ← Shared HTML wrapper for bulk sends
│       ├── bulkEmailTemplates.ts ← 4 pre-built templates
│       └── cleanupTestPayments.ts ← Post-test-mode data wipe helper
├── src/                         ← Main app (React + Vite + TypeScript)
│   ├── pages/                   ← Route components
│   ├── components/              ← Shared UI
│   ├── hooks/
│   │   └── useAuth.tsx          ← Firebase Auth context + idle-timeout
│   ├── lib/
│   │   ├── firebase.ts          ← Firebase init + region
│   │   ├── referrals.ts         ← Referral code capture + share URLs
│   │   ├── userAudit.ts         ← User-side audit log writer
│   │   └── accountLinking.ts    ← Google ↔ email-link UID merger
│   └── assets/
├── firestore.rules              ← Per-collection access rules
├── firestore.indexes.json       ← Composite indexes
├── firebase.json                ← Functions + Firestore config (no hosting; Vercel does that)
├── vercel.json                  ← Vercel security headers
├── package.json
└── README.md                    ← Setup instructions (read this first)

UniFinder-ops/                   ← Ops portal (separate repo, separate Vercel project)
└── src/
    ├── App.tsx                  ← Router shell + auth state branch
    ├── pages/                   ← One per nav item
    ├── components/
    │   ├── AdminLayout.tsx      ← Sidebar + route gating
    │   ├── MaintenanceCard.tsx
    │   ├── WalletSyncCard.tsx
    │   └── AccessDenied.tsx
    ├── hooks/
    │   ├── useAdminAuth.ts      ← Reads role from custom claim
    │   └── useAllowedPages.ts   ← Subscribes to appConfig/rolePermissions
    └── lib/
        ├── firebase.ts
        ├── audit.ts             ← Ops-side audit log writer
        ├── time.ts              ← Shared local-timezone formatters
        └── opsPages.ts          ← Single source of truth for page list
```

### Why two repos?

Different audiences, different deploy cadences, different security postures. The ops portal mounts only after the admin custom-claim check passes — non-admins never download any of its page-level chunks. Two repos also lets us deploy each independently without coordinating.

Both repos point at the **same** Firebase project. Auth users are shared. Firestore collections are shared.

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| **Frontend (both apps)** | React 19 + Vite + TypeScript | Tailwind v3 (main) / v4 (ops) |
| **Hosting** | Vercel | One project per repo. Auto-deploys on push to `main`. |
| **Backend** | Firebase Cloud Functions v2 (Node 20) | Region: `us-central1` |
| **Database** | Firestore | `nam5` multi-region |
| **Auth** | Firebase Auth | Email-link + Google; custom claims for admin/role |
| **File storage** | Firebase Storage | Per-uid prefix rules; visa docs only |
| **Payments** | Paystack | Hosted checkout; webhook for fulfilment |
| **Email** | Resend | All transactional + bulk; sender `noreply@collegeready.io` |
| **AI** | Anthropic Claude | Sonnet 4.5 (paid) + Haiku 4.5 (guest preview + visa officer) |
| **Avatar** | HeyGen | Live AI consular officer for visa interview |
| **TTS** | Google Cloud Text-to-Speech | Neural2 voice (10× cheaper than Studio) |

### Key config & secrets

Stored as Firebase Function secrets — never checked in:

- `ANTHROPIC_API_KEY` — Claude
- `HEYGEN_API_KEY` — HeyGen (never exposed to client; short-lived session JWT only)
- `PAYSTACK_SECRET_KEY` — Paystack
- `RESEND_API_KEY` — Resend

Set via `firebase functions:secrets:set <NAME>`.

Client-side env (`.env`, also in Vercel): public Firebase config only. No API keys cross to the client.

---

## Local development

See the root `README.md` for first-time setup. Quick reference:

```bash
# Install
npm install
npm --prefix functions install

# Run the main app dev server
npm run dev

# Type-check functions
npm --prefix functions run build

# Deploy a single function
firebase deploy --only "functions:functionName"

# Deploy everything (functions + rules + indexes)
firebase deploy
```

Vercel auto-deploys both apps on push to `main`. Functions need explicit `firebase deploy`.

---

## Architecture (end-to-end)

```
                              ┌─────────────────────┐
                              │ Firebase Auth       │
                              │ (Google + email-    │
                              │  link sign-in)      │
                              └─────────┬───────────┘
                                        │ token w/ claims
                       ┌────────────────┼────────────────┐
                       ▼                                 ▼
              ┌──────────────────┐               ┌──────────────────┐
              │ Main app (Vercel)│               │ Ops portal       │
              │ collegeready.io  │               │ (Vercel, separate│
              │ React + Vite     │               │  project)        │
              └────────┬─────────┘               └────────┬─────────┘
                       │                                  │
                       │ httpsCallable    direct Firestore reads (rules-gated)
                       │ + onSnapshot     + httpsCallable
                       │                                  │
                       └───────────┬──────────────────────┘
                                   ▼
                ┌──────────────────────────────────────────┐
                │ Firebase Cloud Functions (us-central1)   │
                │   • aiMatchSchoolsCallable (Haiku)        │
                │   • unlockMatchReport (Sonnet)            │
                │   • createPaystackCheckout / webhook      │
                │   • visaInterview turns + scorer          │
                │   • createLiveAvatarSession (HeyGen)      │
                │   • generateAvatarSpeech (Google TTS)     │
                │   • applyReferralCode + payout flow       │
                │   • bulk email + receipts (Resend)        │
                │   • ops-portal callables (role-gated)     │
                └──────────────┬───────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   ┌─────────────────┐ ┌──────────────┐ ┌───────────────┐
   │ Firestore       │ │ Anthropic    │ │ Paystack      │
   │ (data + audit)  │ │ Claude       │ │ (payments)    │
   └─────────────────┘ └──────────────┘ └───────────────┘
            │                  │                  │
            │           ┌──────┴──────┐    ┌──────┴──────┐
            │           ▼             ▼    ▼             │
            │      ┌─────────┐  ┌──────────┐  ┌─────────┐│
            │      │ HeyGen  │  │Google TTS│  │ Resend  ││
            │      │(avatar) │  │ (voice)  │  │ (email) ││
            │      └─────────┘  └──────────┘  └─────────┘│
            ▼                                            │
   Firestore Triggers ──────────────────────────────────┘
   (onUserCreated → wallet + welcome email,
    onWaitlistEntry → confirmation email,
    paystackWebhook → wallet credit)
```

### Data flow examples

- **Guest preview**: anonymous user → `aiMatchSchoolsCallable` (Haiku) → returns 12 ranked schools → rendered on `LockedPreviewPage`.
- **Paid unlock**: authenticated user → `unlockMatchReport` (Sonnet) → atomic credit deduct + report write to `/matchReports` → render `FullReportPage`.
- **Purchase**: user clicks Buy → `createPaystackCheckout` returns hosted URL → redirect → user pays on Paystack → Paystack POSTs `charge.success` to `paystackWebhook` → `applyPaystackChargeSuccess` credits wallet atomically.

---

## Firestore data model

### User-facing collections

| Collection | Purpose | Key fields |
|---|---|---|
| `users/{uid}` | User profile (one per Firebase Auth UID) | `email`, `displayName`, `createdAt`, `referredBy?`, `welcomeEmailSentAt?`, `referredByMarketerCode?` |
| `studentProfiles/{uid}` | Match-engine input | GPA, scores, budget, field, level, location preferences |
| `creditWallets/{uid}` | The wallet | `credits: number`, `updatedAt`, `createdAt?`, `source?` |
| `creditTransactions/{auto}` | Append-only ledger | `userId`, `amount`, `type` (`purchase` / `unlock_report` / `referral_reward` / `founder_unlock` / `visa_interview_spend`), `reference?` |
| `matchReports/{auto}` | One per unlocked report | `userId`, `profileSnapshot`, `top10Matches`, `bucketReach/Target/Safety`, `aiExplanation`, `createdAt` |
| `savedSchools/{uid}` | Sub-collection per user — their shortlist | `unitId`, `addedAt` |
| `roadmapProgress/{uid}` | Personalised application roadmap state | step-completion flags |
| `aiRuns/{auto}` | Audit of every AI invocation | `userId`, `provider`, `type`, `model`, `tokenUsage`, `createdAt` |
| `paystackPayments/{reference}` | One doc per successful charge | `userId`, `creditsGranted`, `amountSubunit`, `refundedAt?` |
| `pendingReferrals/{referredUid}` | Deferred referral payout state | `referrerUid`, `code`, `rewardAmount`, `status: pending\|paid_out\|voided`, `triggeringPaymentRef?` |
| `referralCodes/{code}` | Reverse lookup code → uid (or marketer config) | `userId\|type:marketer`, `bonusCreditsForNewUser` |
| `waitlist/{emailKey}` | Pre-launch signups | `email`, `emailSentAt?`, `launchEmailSentAt?` |

### Visa interview collections

| Collection | Purpose |
|---|---|
| `visaInterviewSessions/{sessionId}` | One per started session — `userId`, `creditsCharged`, `status` |
| `visaInterviewMessages/{auto}` | Append-only turn log per session |
| `visaInterviewReports/{sessionId}` | Final score + per-question scoring |
| `visaInterviewDocuments/{auto}` | Uploaded I-20 / DS-160 PDFs (Storage URL + extracted fields) |

### Operations / admin collections

| Collection | Purpose |
|---|---|
| `auditLogs/{auto}` | Admin actions (sign_in, user_viewed, admin_invited, admin_role_changed, role_permissions_updated, test_payments_cleanup, etc.) |
| `userAuditLogs/{auto}` | User actions (user_sign_in, user_sign_out) — visible to admins only |
| `errorLogs/{auto}` | Backend errors with category + severity |
| `bulkCampaigns/{campaignId}` | Bulk email campaign metadata |
| `bulkCampaigns/{campaignId}/recipients/{key}` | Per-recipient send state (idempotent retries) |
| `appConfig/runtime` | Maintenance kill switch + custom message |
| `appConfig/rolePermissions` | Page allow-lists per role (analyst/developer) |

### Marketing collections

| Collection | Purpose |
|---|---|
| `schools/{unitId}` | The U.S. universities catalogue |
| `programs/{auto}` | Per-school program offerings (field × level) used for the eligibility gate |
| `marketers/...` | Admin-issued marketer codes (see `marketerCodes.ts`) |

### Top-level field conventions

- All timestamps are Firestore `Timestamp`. Ops portal converts via `lib/time.ts` for display.
- Money is stored as **subunit** in `amountSubunit` (pesewas for GHS, cents for USD). Display layer divides by 100.
- Append-only collections never receive updates or deletes from clients — Cloud Functions write via Admin SDK. Rules in `firestore.rules` enforce.

---

## Core concepts

### Credits

The product's unit of value. Every paid action costs credits:

- **Match report unlock**: 1 credit (`MATCH_REPORT_CREDIT_COST` in `index.ts`)
- **Visa interview session**: 15 credits (`VISA_INTERVIEW_CREDIT_COST`)

Every account starts with `FREE_CREDITS_ON_SIGNUP = 2`. Materialised eagerly by `onUserCreated` trigger when a `/users/{uid}` doc is created.

#### Wallet lifecycle

1. **Signup** → `onUserCreated` trigger creates `/creditWallets/{uid}` with `credits: 2`, `source: "signup_grant"`.
2. **Spend** → `unlockMatchReport` or `startVisaInterviewSession` atomic transaction: read wallet, check balance, decrement, write `creditTransactions` doc.
3. **Purchase** → Paystack webhook → `applyPaystackChargeSuccess` atomic transaction: add `creditsToGrant` to wallet, write `creditTransactions` doc, write `paystackPayments` doc.
4. **Referral payout** → see [Referrals](#referrals) below.
5. **Refund** → Paystack `refund.processed` webhook → `applyPaystackRefund` reverses the grant (negative balances allowed — intentional anti-fraud).

#### Founders bypass

Two emails in `FOUNDER_EMAILS` (`functions/src/index.ts`) get unlimited credits — they can run every credit-spending callable without their wallet being decremented. Each action still writes a `creditTransactions` row with `type: "founder_unlock"`, `amount: 0` so the audit trail captures the action.

#### Reconciliation panel

`UserDetailPage` in the ops portal includes a credit-reconciliation card that compares the stored wallet balance against `2 + sum(creditTransactions.amount)`. Any drift surfaces as an amber alert — most common cause is a `cleanupTestPayments` run that wiped the signup grant.

### Roles & permissions (RBAC)

Three roles for ops portal admins, stored as a `role` custom claim:

- **Founder** — full access. Can invite/revoke admins, change other admins' roles, edit role permissions. Current admins all start here.
- **Analyst** — customer-support shaped. Default pages: Dashboard, Users, Audit, Reports, Email failures.
- **Developer** — engineering shaped. Default pages: Dashboard, Errors, Health, Audit.

The defaults are **configurable**: founders edit which pages each role sees via the toggle grid on `/admins`. The config lives at `appConfig/rolePermissions`; subscribed via onSnapshot so a permission edit reflects in affected sessions within ~1 second.

Founder is always all-access (locked, can't be customised). Dashboard (`/`) is locked-on for every role so there's always a landing page.

Defence in depth: every sensitive mutation callable (`cleanupTestPayments`, `sendBulkEmail`, `setOpsAdminRoleFn`, etc.) checks `requireFounder()` server-side. Frontend gating prevents accidental exposure; backend gating prevents privilege escalation via DevTools.

See [Security & access control](#security--access-control) for the threat model.

### Referrals

Two distinct flows:

#### User referrals (auto-generated)

Every user gets a 6-character referral code (derived from their UID hash on first request) in `/referralCodes/{code}`. When a friend signs up using the code, the referrer receives 5 credits **only after the friend makes their first paid purchase**.

This deferred-payout design prevents self-referral fraud (the old immediate-payout flow let an attacker net 5 credits per fake account they created).

Lifecycle:
1. New user applies referral code → `applyReferralCode` writes `/pendingReferrals/{refereeUid}` with `status: "pending"`. Referrer's wallet untouched.
2. Referee makes first paid purchase → `applyPaystackChargeSuccess` notices the pending referral, atomically credits the referrer + flips the pending doc to `paid_out`.
3. Edge case: if the referee already had a successful purchase before applying the code (rare), payout fires immediately inside `applyReferralCode`.

Snapshot semantics: the reward amount is stored on the pending doc at apply-time, so future changes to `REFERRAL_REWARD` don't retroactively re-price already-pending referrals.

#### Marketer codes (admin-issued)

Founders issue codes from `/marketing` in the ops portal. These differ from user referrals:

- Credits flow to the **new user** (not the marketer — marketers are paid out-of-band).
- Caps: `maxRedemptions`, `expiresAt`, `enabled` flag.
- Atomic redemption counter prevents over-spending.

Handled by `applyMarketerCode` in `functions/src/marketerCodes.ts`.

### Account linking

Firebase Auth issues a separate UID per sign-in method. Without intervention, the same human signing up via Google AND via the magic-link flow ends up with two separate UIDs, two separate wallets — credits split, support nightmare.

**Prevention** (`src/lib/accountLinking.ts`): when Firebase throws `auth/account-exists-with-different-credential` on sign-in:

1. Stash the method-B credential in sessionStorage (idToken/accessToken for Google, raw link URL for email-link).
2. Route the user through method A's sign-in.
3. After method A succeeds, `tryLinkPendingCredential(user)` rebuilds the method-B credential and calls `linkWithCredential` — Firebase attaches it to the EXISTING UID.
4. End state: one human, one UID, two sign-in methods.

**Requires Firebase Console setting**: Authentication → Settings → User account linking = "One account per email address". Without that setting, Firebase silently creates duplicates and the error we catch never fires.

**Detection** (existing duplicates): the ops portal's UserDetailPage shows a "Linked accounts" panel listing every other `/users` doc with the same email. Each row clickable to jump to the sibling's detail page.

### Currency display

USD is the **anchor** (familiar to international students); GHS is what Paystack actually charges (we're on a Paystack-Ghana merchant account).

Every credit pack carries both `priceUsd` and `priceLocal` (GHS). UI shows USD prominently with a "Charged as ₵X GHS" subline. The user always sees both before clicking Buy.

Why not charge in USD? Paystack-Ghana doesn't support arbitrary currency out of the box — it'd need a separate merchant agreement. V2 candidate: integrate Flutterwave for true multi-currency support (NGN, KES, ZAR, USD natively), but the dual-display works well enough for V1.

### Anti-enumeration on auth endpoints

Email-link sign-in always returns the same response shape regardless of whether the email already exists in Firebase Auth. Prevents an attacker from probing which emails have accounts.

Per-IP rate limit (`rateLimiter.ts`) on every public-facing auth endpoint.

---

## Key user flows

### Sign-up

1. User lands on `/signup`, enters email (or clicks "Continue with Google").
2. **Email-link path**: `sendUserSignInLink` Cloud Function generates a Firebase signin link, Resend delivers a branded email. User clicks the link → `signInWithEmailLink` on `/login`.
3. **Google path**: `signInWithPopup` directly.
4. Either way: client writes `/users/{uid}` doc. `onUserCreated` trigger fires:
   - Materialises `/creditWallets/{uid}` with `credits: 2` (idempotent).
   - Sends welcome email via Resend.
5. If a referral code is captured in localStorage (from `?ref=` query), `applyReferralCode` runs after sign-in → creates `/pendingReferrals/{uid}`.

### Guest matching (free preview)

1. User on `/intake` enters profile (GPA, scores, budget, field, level).
2. Profile stored in localStorage (`unifinder_guest_profile`).
3. Client-side eligibility gate filters schools by field × level via `lib/schools/getSchools.ts` (read from `/schools` and `/programs`).
4. `aiMatchSchoolsCallable` (Haiku 4.5) ranks the filtered set and assigns reach/target/safety buckets.
5. Renders on `/results` (LockedPreviewPage) — first 3 schools visible, rest gated behind signup CTA.

Per-IP rate limit: 50 calls/hour to keep cost bounded if abused (Haiku swap shrank per-call cost ~3x vs Sonnet).

### Paid match unlock

1. Signed-in user on `/results` clicks "Unlock full report".
2. `unlockMatchReport` callable:
   - Pre-flight wallet read (fast-fails if insufficient credits, before any Claude call).
   - Atomic transaction: deduct 1 credit, write `creditTransactions` doc.
   - Calls Claude Sonnet 4.5 via `claudeExplainMatches.ts` for richer per-school reasoning + funding paths.
   - Writes the resulting `/matchReports/{auto}` doc.
3. Client navigates to `/app/reports/{reportId}` (FullReportPage).

Founder bypass: founders skip the balance check and write `creditTransactions` with `amount: 0`, `type: "founder_unlock"`.

### Credit purchase

1. User clicks Buy on `/pricing` or `/app?tab=billing`.
2. `createPaystackCheckout` calls Paystack's `/transaction/initialize` with the pack metadata (userId, packId, creditsToGrant, amountSubunit, returnUrl).
3. Client receives `authorization_url` and redirects.
4. User pays on Paystack's hosted page (cards + mobile money depending on merchant tier).
5. Paystack POSTs `charge.success` to `/paystackWebhook` (HTTPS function).
6. Webhook verifies the HMAC-SHA512 signature with the secret key.
7. `applyPaystackChargeSuccess` atomic transaction:
   - Dedupe on `reference` field (already-processed → short-circuit).
   - Read wallet, add `creditsToGrant`.
   - Write `/paystackPayments/{reference}` doc.
   - Write `/creditTransactions/{auto}` with `type: "purchase"`.
   - If a pending referral exists for this user, **also**: credit the referrer's wallet + flip the pending doc to `paid_out` + write the referrer's `creditTransactions` row. All atomic.
8. Webhook returns 200; receipt email sent fire-and-forget.
9. Browser redirected back to `/pricing?paid=1` → confetti banner.

### Visa interview session

1. User on `/app/visa-interview` uploads I-20 + DS-160 PDFs.
2. `requestVisaDocumentUpload` returns signed upload URLs. Files land in Firebase Storage at `users/{uid}/visa-interviews/{...}`.
3. `recordVisaInterviewDocument` fires `extractVisaDocument` (Claude Sonnet 4.5 vision) to extract structured fields from the PDFs.
4. User clicks "Start interview" → `startVisaInterviewSession`:
   - 15-credit pre-flight + atomic deduction.
   - Creates `/visaInterviewSessions/{sessionId}`.
   - Returns the first officer question (chosen by `pickIntroQuestion`).
5. `createLiveAvatarSession` calls HeyGen for a session JWT (short-lived).
6. Conversation loop in the browser:
   - User speaks → STT (browser) → text answer.
   - Client calls `sendVisaInterviewAnswer` → `generateOfficerTurn` (Haiku) writes the next question to `/visaInterviewMessages`.
   - Client calls `generateAvatarSpeech` (Google TTS Neural2) for the audio.
   - HeyGen renders the avatar lipsync'd to the audio.
7. After N turns: `finishVisaInterviewSession` calls `scoreVisaInterview` (Sonnet) for a per-question rubric + overall score. Result lands in `/visaInterviewReports/{sessionId}`.

Cost shapes: Haiku for the officer-turn loop (cheap, fast), Sonnet for the one-shot extraction + scorer (quality matters).

### Waitlist (legacy)

Currently disabled (`VITE_WAITLIST_MODE` env var on Vercel). The signup form, Cloud Function, and email template are all still in code; the route just redirects when the env var is off. See `WaitlistPage.tsx` and `submitWaitlist`/`onWaitlistEntry` if you ever need to re-enable.

---

## Cloud Functions reference

Every callable lives in `functions/src/index.ts` (with helpers in sibling files). Organised by domain below.

### Auth + sign-in

| Function | Type | Purpose |
|---|---|---|
| `sendUserSignInLink` | callable | Send branded magic-link email to user (anti-enumeration + per-IP rate limit). |
| `sendOpsSignInLink` | callable | Same but for ops portal admins. |
| `onUserCreated` | trigger | On new `/users/{uid}` doc: materialise wallet + send welcome email. |

### Matching + reports

| Function | Type | Purpose |
|---|---|---|
| `aiMatchSchoolsCallable` | callable | Anonymous: guest preview ranker (Haiku). Per-IP rate-limited. |
| `unlockMatchReport` | callable | Auth + 1 credit: full report (Sonnet via `claudeExplainMatches`). |

### Visa interview

| Function | Type | Purpose |
|---|---|---|
| `requestVisaDocumentUpload` | callable | Signed URLs for I-20 / DS-160 upload. |
| `recordVisaInterviewDocument` | callable | Save Storage URL + extracted fields. |
| `startVisaInterviewSession` | callable | Auth + 15 credits: create session. |
| `sendVisaInterviewAnswer` | callable | Next officer turn (Haiku). |
| `finishVisaInterviewSession` | callable | Score the session (Sonnet). |
| `createLiveAvatarSession` | callable | HeyGen session token. Founder-warm via `HEAVY_HOT_OPTS`. |
| `endLiveAvatarSession` | callable | Tear down HeyGen session. |
| `generateAvatarSpeech` | callable | Google TTS for officer turn. Rate-limited per session (60 calls). |
| `markAvatarStatus` | callable | Persist client-reported avatar state for ops visibility. |

### Payments

| Function | Type | Purpose |
|---|---|---|
| `listCreditPacks` | callable | Server-owned catalogue (Try/Starter/Plus/Pro/Power). |
| `createPaystackCheckout` | callable | Init Paystack transaction, return hosted URL. |
| `paystackWebhook` | HTTPS | Receive `charge.success` / `refund.processed`. Verifies HMAC. |

### Referrals + marketing

| Function | Type | Purpose |
|---|---|---|
| `applyReferralCode` | callable | Dispatch: user code → deferred payout; marketer code → apply bonus. |
| `createMarketerReferralCode` | callable | Founder-only: issue a campaign code. |
| `listMarketerReferralCodes` | callable | Read codes for ops `/marketing` page. |
| `setMarketerReferralCodeEnabled` | callable | Toggle a code on/off. |
| `deleteMarketerReferralCode` | callable | Delete a code. |

### Waitlist + launch announcement

| Function | Type | Purpose |
|---|---|---|
| `submitWaitlist` | callable | Public waitlist signup (anti-enumeration + per-IP rate-limit). |
| `onWaitlistEntry` | trigger | Send confirmation email via Resend. |
| `announceLaunch` | callable | Founder-only: bulk "we're live" email to all waitlist entries. Idempotent via per-doc `launchEmailSentAt`. |

### Bulk email + failure retry

| Function | Type | Purpose |
|---|---|---|
| `listBulkEmailTemplates` | callable | Return catalogue of 4 pre-built templates. |
| `sendBulkEmail` | callable | Founder-only: send campaign to chosen audience. Idempotent via `/bulkCampaigns/{id}/recipients/{key}`. |
| `listFailedEmails` | callable | Surface failed welcome / waitlist / launch emails. |
| `retryEmail` | callable | Re-fire one of the three doc-stamped email types. |

### Ops portal admin management

| Function | Type | Purpose |
|---|---|---|
| `listOpsAdminsFn` | callable | Founder-only: list all admins + their roles. |
| `inviteOpsAdminFn` | callable | Founder-only: create user + set role + send sign-in link. |
| `revokeOpsAdminFn` | callable | Founder-only: clear admin claim. |
| `setOpsAdminRoleFn` | callable | Founder-only: change another admin's role. |
| `migrateAdminsToFoundersFn` | callable | One-shot: stamp `role: "founder"` on any pre-RBAC admin. |
| `getRolePermissions` | callable | Read `appConfig/rolePermissions` (any admin). |
| `setRolePermissions` | callable | Founder-only: edit page allow-list per role. |

### Maintenance + cleanup

| Function | Type | Purpose |
|---|---|---|
| `setMaintenanceMode` | callable | Flip kill switch via `appConfig/runtime`. |
| `cleanupTestPayments` | callable | Founder-only: destructive wipe of test-mode payments + transactions. Resets non-live wallets to `FREE_CREDITS_ON_SIGNUP`. |
| `backfillCreditWallets` | callable | Founder-only: create missing wallets for legacy users. |
| `restoreSignupCredits` | callable | Founder-only: bump any sub-grant wallet back to `FREE_CREDITS_ON_SIGNUP`. |

### Audit

| Function | Type | Purpose |
|---|---|---|
| `recordOpsAuditEvent` | callable | Append admin actions to `/auditLogs`. |
| `recordUserAuditEvent` | callable | Append user sign-in/sign-out to `/userAuditLogs`. |

### Instance scale config (in `index.ts`)

- `HEAVY_OPTS`: `maxInstances:150, concurrency:40` for AI/HeyGen/TTS callables.
- `LIGHT_OPTS`: `maxInstances:200` for CRUD-ish callables.
- `HOT_OPTS`: `maxInstances:100, concurrency:40, minInstances:1` for interview-loop functions (always-warm).
- `HEAVY_HOT_OPTS`: `maxInstances:150, concurrency:40, minInstances:2` for first-impression endpoints (`unlockMatchReport`, `aiMatchSchoolsCallable`, `createLiveAvatarSession`).

Min-instance cost: ~$30/month each. Budget alerts configured in GCP Console.

---

## Ops portal reference

URL: separate Vercel domain (see Vercel project). Sign-in: same Firebase Auth as the main app, but `admin: true` custom claim required to load the layout.

### Pages (and which roles see them by default)

| Page | Path | Founder | Analyst | Developer |
|---|---|---|---|---|
| Dashboard | `/` | ✓ (locked-on) | ✓ | ✓ |
| Users (search + detail) | `/users`, `/users/:uid` | ✓ | ✓ | — |
| Errors | `/errors` | ✓ | — | ✓ |
| Audit logs | `/audit` | ✓ | ✓ | ✓ |
| Payments | `/payments` | ✓ | — | — |
| Reports | `/report` | ✓ | ✓ | — |
| Marketing (marketer codes) | `/marketing` | ✓ | — | — |
| Bulk email | `/email/bulk` | ✓ | — | — |
| Email failures | `/email/failures` | ✓ | ✓ | — |
| Admins (+ role mgmt) | `/admins` | ✓ (founder-only, locked) | — | — |
| Health | `/health` | ✓ | — | ✓ |

Defaults are customisable on `/admins` → Role permissions card.

### Dashboard card overview

- **Maintenance card** — green when live, rose when in maintenance. Click to toggle.
- **Wallet sync card** — runs `backfillCreditWallets` + `restoreSignupCredits` in sequence. One-click recovery for credit-display drift.

### UserDetailPage panels (top to bottom)

1. **Profile card** — uid, email, signup date, **live credit balance** via onSnapshot. Missing wallet renders as "—" (literal display, no inference).
2. **Linked accounts** — warning panel if other `/users` docs share this user's email (different Firebase UIDs).
3. **Credit reconciliation** — compares stored wallet against signup grant + ledger sum. Three states: ✓ matches, ⚠ doesn't match, slate (ledger truncated at 50).
4. **Credit transactions** — last 50 transactions.
5. **Payments** — Paystack transactions.
6. **AI runs** — every Claude/HeyGen invocation attributable to this user.
7. **Visa interview sessions** — sessions started.
8. **Match reports** — reports unlocked.

### Bulk email page

- 4 templates: Announcement, Re-engagement, Promo, Custom.
- 5 audiences: all users, paying customers, free users, waitlist, custom list.
- Dry-run shows recipient count + 5 samples.
- Send confirmation requires typing `SEND`.
- Per-campaign UUID makes retries idempotent — already-mailed addresses skipped via `/bulkCampaigns/{id}/recipients/{key}`.

---

## Security & access control

### Auth model

Two Firebase Auth user pools share the same project:

1. **End-users** — sign in via Google or email-link. No special claims. Can read their own data per Firestore Rules.
2. **Ops portal admins** — `admin: true` custom claim. Plus a `role` claim (`founder` / `analyst` / `developer`).

Claims are set via the Admin SDK in Cloud Functions and propagate to the user's ID token within ~1 hour (or immediately on sign-out + sign-in).

### Custom claims hierarchy

```
admin: true              ← required to access ops portal at all
  + role: "founder"      ← can manage roles, invite, revoke, do everything
  + role: "analyst"      ← see pages per /appConfig/rolePermissions.analyst
  + role: "developer"    ← see pages per /appConfig/rolePermissions.developer
```

Legacy admins without a `role` claim are treated as **founder** until the migration callable runs. This is the zero-downtime upgrade path — existing admins keep full access through the rollout.

### Firestore Rules summary (see `firestore.rules`)

- `/users/{uid}` — owner-read, owner-create. Admin reads everything via the ops portal.
- `/creditWallets/{uid}` — owner-read; client writes blocked (Cloud Functions only).
- `/creditTransactions/{auto}` — owner-read (via `where userId == auth.uid`); client writes blocked.
- `/paystackPayments/{ref}` — owner-read; client writes blocked.
- `/matchReports/{id}` — owner-read; client writes blocked.
- `/auditLogs/{id}` — admin-only.
- `/userAuditLogs/{id}` — admin-only (visible on ops portal Audit page → User activity tab).
- `/pendingReferrals/{uid}` — admin-only.
- `/bulkCampaigns/{id}` + subcollection — admin-only.
- `/appConfig/{configId}` — public read (maintenance flag and role permissions need broad readability); writes blocked.
- `/schools/{unitId}` — public read; client writes blocked.
- `/referralCodes/{code}` — auth-required read + owner-create (with own uid).
- `/visaInterview*` — owner-read scoped to per-user storage prefix.

Defence in depth: even when rules permit a read, sensitive Cloud Function callables run their own `requireFounder()` check.

### Threats handled

| Threat | Mitigation |
|---|---|
| **Self-referral fraud** (create N fake accounts, refer to self) | Deferred referral payout — referrer paid only when referee makes first paid purchase. |
| **Anonymous endpoint cost-leak** (spam aiMatchSchoolsCallable) | Per-IP rate limit (50/hour) + maxInstances:150 + Haiku (3× cheaper than Sonnet). |
| **Cross-user file read** | Storage rules pin path to `users/{auth.uid}/visa-interviews/.*`. `loadLatestDocument` re-validates the prefix. |
| **Webhook replay** | `paystackPayments/{reference}` dedup; HMAC signature verification on every event. |
| **Race in referral apply** | `referredBy` guard moved inside the transaction (audit fix 2026-05-15). |
| **Email enumeration** | Auth callables return identical response shapes regardless of account existence. |
| **Privilege escalation via DevTools** | Every sensitive mutation callable checks `requireFounder()` server-side. |
| **TTS / HeyGen credential leak** | Server-side only; client gets short-lived session JWTs only. |
| **Concurrent HeyGen session multiplexing** | `avatarStartedAt` check rejects sessions started within 60s of an existing live one. |

### Founder bypass

Founder accounts (by email allowlist in `index.ts`) bypass credit checks for internal product testing. They still create `creditTransactions` rows tagged `founder_unlock` for audit. Don't add anyone to this list who isn't testing the product — they get the product for free.

---

## Deployment

### Frontend (both apps)

Push to `main`. Vercel auto-deploys.

Per-repo Vercel project:
- Main app: `UniFinder` repo → `collegeready.io`.
- Ops portal: `UniFinder-ops` repo → ops Vercel subdomain.

Env vars on Vercel:
- All `VITE_FIREBASE_*` public client config.
- `VITE_WAITLIST_MODE` on main app (currently `false`).

### Backend (Cloud Functions)

```bash
# Deploy everything (functions + rules + indexes)
firebase deploy

# Deploy one function (preferred for safety)
firebase deploy --only "functions:functionName"

# Deploy multiple
firebase deploy --only "functions:fn1,functions:fn2,firestore:rules"

# Just rules
firebase deploy --only firestore:rules
```

First-time deploys with `minInstances > 0` require `--force` (Firebase warns about the cost). Confirm the budget impact before approving.

### Region

Single region for now: `us-central1`. Firestore is `nam5` (multi-region). Latency to West Africa is ~150-250ms which is acceptable for callables; if it becomes a bottleneck, consider a Europe deployment.

### Secrets

```bash
firebase functions:secrets:set <SECRET_NAME>
firebase functions:secrets:access <SECRET_NAME>   # confirm value (printed locally only)
```

Functions that need secrets declare them via `defineSecret()` and the deploy time `secrets:` array. New deploys after a secret rotation pick up the new value automatically.

---

## Common admin operations

These are operator runbooks for things the founder or any admin might need to do. Most are now self-serve from the ops portal Dashboard.

### Restoring credits across all users

Symptom: many users show "0 credits" in ops portal, or freshly signed-up users are missing the 2-credit grant.

1. Open ops portal → Dashboard.
2. **Sync wallets** card → click **Dry run** to see how many wallets need creating + restoring.
3. Click **Sync now** → type `SYNC` → confirm. Runs `backfillCreditWallets` then `restoreSignupCredits` in sequence.

### Sending a "we're live" launch email to all waitlist signups

(Card was removed from Dashboard in cleanup; backend function still deployed.)

```js
// In the ops portal, DevTools console:
const { httpsCallable } = await import("firebase/functions");
const { functions } = await import("/src/lib/firebase.ts");
const fn = httpsCallable(functions, "announceLaunch");

// Dry run first
await fn({ dryRun: true }).then(r => console.log(r.data));

// Then live
await fn({ dryRun: false, maxToSend: 5000 }).then(r => console.log(r.data));
```

Per-recipient `launchEmailSentAt` makes this idempotent — safe to re-run.

### Sending a bulk email (announcement, promo, re-engagement)

1. Ops portal → **Bulk email** in sidebar.
2. Pick a template, edit subject/headline/body/CTA.
3. Pick audience.
4. **Dry run** → confirm recipient count + sample.
5. **Send blast** → type `SEND` → confirm.

Track via `/bulkCampaigns/{campaignId}` in Firestore.

### Retrying a failed transactional email

1. Ops portal → **Email failures**.
2. Click the **Retry** button on any row.
3. Row drops from the list on success; updates with new error on failure.

Currently surfaces: user-welcome, waitlist-welcome, waitlist-launch failures. Payment-receipt failures live in `/errorLogs` (Errors page).

### Inviting a new admin with a specific role

1. Ops portal → **Admins** → click **Invite admin**.
2. Type email, pick role (Founder / Analyst / Developer).
3. Submit. Backend creates the Auth user if needed, sets the role custom claim, sends a Resend-delivered sign-in link.

### Changing an admin's role

1. Ops portal → **Admins**.
2. Click the role badge on their row. Pick a new role from the dropdown.
3. Saves immediately. Their token refreshes on next sign-in (or within ~1 hour automatic rotation).

Self-demotion away from Founder is blocked.

### Editing what a role can see

1. Ops portal → **Admins** → scroll to **Role permissions** card.
2. Toggle pages on/off in the Analyst or Developer column.
3. Click **Save Analyst** or **Save Developer**.
4. Affected sessions update within a second via onSnapshot.

### Migrating legacy admins to the role system

One-shot. Run once after the role-RBAC release.

```js
const { httpsCallable } = await import("firebase/functions");
const { functions } = await import("/src/lib/firebase.ts");
const fn = httpsCallable(functions, "migrateAdminsToFoundersFn");
await fn({}).then(r => console.log(r.data));
```

Stamps `role: "founder"` on every existing admin without a role claim. Idempotent.

### Toggling maintenance mode

1. Ops portal → Dashboard → **Maintenance card** → click toggle.
2. Type confirmation phrase.
3. Optional: set ETA + custom user-facing message.
4. Effect propagates in ~1 second via `/appConfig/runtime` onSnapshot.

User app gates every `/intake`, `/results`, `/app/*` route behind `MaintenanceGate`. Public marketing pages stay live.

### Looking up a user

Three paths in the ops portal:
- **Autocomplete suggest**: type into the search bar on `/users`.
- **Direct UID**: paste a UID and Enter — direct doc lookup.
- **Paginated browse**: scroll the recent-signups list below the search bar.

Search dedupes by email (handles the Google + email-link UID split). To see the duplicates, click into a user — the "Linked accounts" panel shows siblings.

---

## Audit + observability

### Audit logs (admin actions)

Two collections:

- **`/auditLogs`** — admin actions (sign-in, user_viewed, admin_invited, admin_revoked, admin_role_changed, role_permissions_updated, test_payments_cleanup, etc.). Visible on the Audit page in the ops portal.
- **`/userAuditLogs`** — user actions (user_sign_in, user_sign_out). Visible on the Audit page's "User activity" tab.

Append-only by design: Firestore Rules block all client writes. Only the corresponding Cloud Functions write via Admin SDK.

### Error logs

`/errorLogs` collection captures backend errors with:
- `category` — `payment_webhook` / `ai_call` / `email_send` / `external_api` / `storage` / `tts` / `other`
- `severity` — `error` / `warning`
- `source` — narrow label like `paystack.signature_invalid`
- `userId` / `paymentId` / `context` — best-effort attribution

Visible on the Errors page (`/errors`). Filter by category, severity, time range.

### Health page

`/health` shows current Cloud Function status, recent invocation counts, error rates. Mostly a status-board view powered by direct Firestore reads on `errorLogs`.

### Business report

`/report` aggregates KPIs into a printable + CSV-exportable report:
- Total users + new signups by day
- Revenue (Paystack-confirmed) + credit liability held
- Per-pack unit economics (cost vs revenue, margin)
- Projections at current pace
- Funnel breakdown

---

## Known limitations & V2 candidates

| Limitation | V2 plan |
|---|---|
| GHS-only checkout (Paystack-Ghana account) | Flutterwave migration for true pan-African multi-currency (NGN, KES, ZAR, USD). |
| `aiMatchSchoolsCallable` anonymous + only IP-rate-limited | Move to Haiku has reduced cost-per-call ~3×. Real fix is App Check + auth, but it breaks the guest-preview UX. Continue monitoring. |
| Frontend pulls full schools collection on load | Cached in-memory per session via `lib/schools/getSchools.ts`. Cross-session CDN-bundle fix still TODO. |
| Per-individual permission overrides | Currently role-level only. V2: per-user overrides for one-off "this analyst sees Payments too". |
| Action-level granularity within a page | Currently page-on/off only. V2: per-button toggles (e.g., view payments but can't refund). |
| Post-hoc duplicate-account merger | Account linking prevents future duplicates. Existing duplicates (e.g., user signed up twice before the fix) need a manual merge — see Linked Accounts panel on UserDetailPage. V2: automated merger that moves credits + transactions + reports onto a canonical UID. |
| Bulk email: no scheduling, no variable substitution | V2 if a campaign volume warrants it. Currently the dry-run-then-send flow is sufficient. |
| Payment-receipt failures not on /email/failures page | They live in `/errorLogs`. V2: surface them alongside the other doc-stamped failures. Requires the webhook to also stamp `receiptSentAt` on `/paystackPayments`. |
| Firestore Rules: any admin can read any admin-readable collection | Today a non-founder with `admin:true` could read `/paystackPayments` directly via the Firestore SDK even if their role doesn't include the Payments page. Tightening this would require per-collection role checks in rules. |
| Min-instance cost | Always-warm `minInstances` on hot endpoints costs ~$90/month. Watch the budget. |

### Audit memory

A detailed pre-launch audit ran on 2026-05-15 and the items above are the **carry-overs** that weren't fully closed. The original audit list (with line citations) lives in the founder's memory file — most items were fully closed in-session and aren't visible here.

---

## Glossary

- **Founder** — top-tier ops portal role; full access. Set on initial admins.
- **Analyst** — customer-support shaped role; default sees Dashboard, Users, Audit, Reports, Email failures.
- **Developer** — engineering shaped role; default sees Dashboard, Errors, Health, Audit.
- **Wallet** — `/creditWallets/{uid}` document holding the user's credit balance. Materialised eagerly at signup.
- **Pending referral** — `/pendingReferrals/{refereeUid}` document tracking a referral that hasn't paid out yet (referee hasn't made first paid purchase).
- **Match report** — output of `unlockMatchReport`. Stored in `/matchReports/{id}` per unlock.
- **Visa session** — F-1 interview practice run. Tracked across multiple collections: session, messages, report, documents.
- **OOB code** — out-of-band code in a Firebase email-link URL. Single-use, expires.
- **Custom claim** — Firebase Auth attribute (`admin`, `role`) attached to a UID. Travels in every ID token.
- **Implicit signup grant** — the 2 free credits a brand-new user gets. Now materialised explicitly via `onUserCreated`; the term lingers in code comments.

---

## Where to ask "what is X"

- **"How does flow X work?"** → [Key user flows](#key-user-flows)
- **"What does function Y do?"** → [Cloud Functions reference](#cloud-functions-reference)
- **"What field lives where?"** → [Firestore data model](#firestore-data-model)
- **"Why was decision Z made?"** → Inline code comments. Every non-obvious decision has a `// WHY:` or `// SECURITY:` or `// audit YYYY-MM-DD` comment.
- **"How do I do operation W?"** → [Common admin operations](#common-admin-operations)
- **"How do roles work?"** → [Security & access control](#security--access-control)

---

End of guide. If something here is wrong or missing, edit this file and PR it — keeping this doc accurate is part of doing onboarding well.
