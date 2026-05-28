# Ops Portal — Training Guide

For new staff joining College Ready and being granted ops portal access. Plain language, step-by-step, no code knowledge required.

> **Who this is for:** Customer support analysts, on-call developers, founders.
> **Who this is NOT for:** Engineers who need to understand how the portal works internally — read [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) instead.

---

## Table of contents

1. [What the ops portal is](#what-the-ops-portal-is)
2. [Signing in for the first time](#signing-in-for-the-first-time)
3. [Understanding your role](#understanding-your-role)
4. [The Dashboard — your home base](#the-dashboard--your-home-base)
5. [Navigating the portal](#navigating-the-portal)
6. [Page-by-page walkthrough](#page-by-page-walkthrough)
7. [Common workflows](#common-workflows)
8. [Troubleshooting](#troubleshooting)
9. [Escalation: when to ping a Founder](#escalation-when-to-ping-a-founder)
10. [Glossary](#glossary)

---

## What the ops portal is

The ops portal is the **internal operator dashboard** for College Ready. It sits at a separate URL from the user-facing site (`collegeready.io`). Customers never see it. We use it to:

- Look up users and see their full activity history (credits, payments, AI runs, visa interview sessions, match reports).
- Send bulk emails (product announcements, promotions, re-engagement).
- Manage admins and their permissions.
- Diagnose issues (failed emails, errors, payment problems).
- Take the app offline for maintenance.
- Run analytical reports.

Think of it as the back office. The user-facing app is the storefront; this is the supply room, the customer-service desk, and the manager's office combined.

---

## Signing in for the first time

You'll receive an email titled something like **"Sign in to College Ready Ops"** from `noreply@collegeready.io`.

1. Open the email. Click the **"Sign in"** button (or the long link if the button doesn't render).
2. You'll land on the ops portal, already signed in. No password — the link IS your authentication.
3. The link works **once**. If you click it twice, the second time will fail with "link expired." Ask a Founder to re-send.
4. Sign-in links expire after **1 hour**. If you don't click in time, ask for a fresh one.

### After your first sign-in

- Your session stays active until you sign out OR until you've been idle for ~15 minutes.
- Coming back later: visit the ops portal URL. You'll either be auto-signed in (if your session is still alive) or prompted to enter your email to receive a new link.
- **If you see a screen that says "Access denied,"** your account doesn't have ops portal access yet. A Founder needs to invite you.

### Sign-in checklist for new staff

- [ ] You received the invite email
- [ ] You clicked the link within 1 hour
- [ ] You can see the **Dashboard** page after sign-in
- [ ] You can see your role badge somewhere in the UI (founder / analyst / developer)
- [ ] You know who to ask if something doesn't work (your Founder contact)

---

## Understanding your role

The portal has **three roles**, each with different page access. Your role determines what sidebar items you see and what actions you can take.

### Founder

Full access. Every page, every button. Founders can:
- Invite new admins and assign their roles
- Edit what Analysts and Developers can see
- Run destructive operations (cleanup, bulk email, role management)
- Access financial data (Payments, Reports, Marketing)

If you don't know who the Founders are, ask. There are typically only 1-3 of them.

### Analyst (customer-support shaped)

Default pages you can see:
- Dashboard (status overview)
- Users (search + detail)
- Audit logs (history of admin actions)
- Reports (business analytics)
- Email failures (retry broken sends)

Default pages you **cannot** see:
- Payments (financial data)
- Errors (technical surface)
- Bulk email (outbound communications)
- Marketing (referral code management)
- Admins (admin management)
- Health (system status)

A Founder can grant additional pages to your role — if you need access to something not on this list, ask.

### Developer (engineering shaped)

Default pages you can see:
- Dashboard
- Errors (technical errors)
- Health (system status)
- Audit logs

Default pages you **cannot** see:
- Users / User detail (privacy)
- Payments
- Reports
- Marketing
- Bulk email
- Admins
- Email failures

Same as Analyst — a Founder can extend access if your role needs more.

### How to check your role

Visit the **Admins** page if you can see it (Founders only). Otherwise, ask a Founder which role they assigned you. There isn't currently a "view my role" badge on every page — that's a V2 candidate.

---

## The Dashboard — your home base

This is the first page you'll see when you sign in. It answers three questions at a glance:

1. **Is the system OK right now?**
2. **Who just signed up?**
3. **Did anything blow up in the last 24 hours?**

### What's on the Dashboard

- **Welcome strip** with today's date.
- **Maintenance kill switch card** — green when the app is live, rose when in maintenance. Big toggle button. (Founder + Developer can flip it.)
- **Wallet sync card** — for fixing credit display issues. (Founder only.)
- **KPI cards** — total users, new signups (last 7 days), errors (last 24h), reports unlocked (last 7 days).
- **Signups sparkline** — 14-day signup trend, bucketed by day.
- **Recent signups** — last 8 new accounts. Clickable.
- **Recent errors** — last 8 errors. Clickable if attributable to a user.

### Reading the KPIs

- **Total users**: lifetime account count, de-duplicated by email.
- **New signups · 7d**: how many new humans signed up in the last 7 days.
- **Errors · 24h**: backend errors logged in the last 24 hours. A non-zero number doesn't automatically mean something's broken — many errors are non-fatal (e.g., a Resend hiccup on a single welcome email).
- **Reports unlocked · 7d**: the most important number. This tracks paid product activity, not just signups.

### What to do if the Maintenance card is RED

The app is currently in maintenance mode. Users on `/intake`, `/results`, and `/app/*` see a branded "we'll be back" page; checkout and AI matching are paused. Public marketing pages stay live.

Don't panic. Either:
- A Founder/Developer flipped it intentionally (planned maintenance) — check `/audit` for who did it and why.
- Something needs your attention — read the maintenance message in the card and contact the founder if you weren't expecting this.

---

## Navigating the portal

### Sidebar

The left sidebar lists every page you have access to. Click any item to jump to it. The current page is highlighted with a dark pill.

At the bottom of the sidebar: your profile photo (or initial), name, email, and a **Sign out** button.

### Page header

Every page has a header showing what page you're on. Some pages have a **Refresh** button — click it to re-fetch the data without a full page reload.

### Browser tabs

The portal works fine in multiple browser tabs. A common pattern: keep the Dashboard open in one tab and the Users page in another while you investigate a support ticket.

### Hard refresh

If a page looks stale (e.g., you just changed something but don't see the update), press **Ctrl+Shift+R** (or Cmd+Shift+R on Mac) to force a clean reload bypassing the browser cache.

---

## Page-by-page walkthrough

### Dashboard (`/`)

Covered above. Your starting point for almost every workflow.

### Users (`/users`)

Where you go when someone needs help. Three ways to find a user:

1. **Autocomplete suggest**: type a few characters of an email in the search bar at the top. Up to 6 candidates appear in a dropdown. Click one to jump to their detail page.
2. **Full search**: type the email and press Enter. If exactly one match, you land on the detail page. If multiple, you get a list to pick from.
3. **Paginated browse**: below the search bar, the most recent signups are listed. Use **Next** / **Prev** to scroll back through time. Each row clickable.

### User detail (`/users/:uid`)

The most important page in the portal for support. Shows everything about one specific user.

**Top section — Profile card:**
- Name + email + UID
- Signed-up date
- **Credits (live)**: their current credit balance, streaming live from the database. Updates automatically when their balance changes.
- Referred by (if any)

> **If the credits cell shows "—" (a dash) instead of a number**, the user doesn't have a wallet document yet. This is rare after the eager-materialisation fix. A Founder can run "Sync Wallets" from the Dashboard to create the missing wallet.

**Linked accounts panel (amber, only if applicable):**
- Shows other accounts that share this user's email. Firebase Auth assigns a separate UID per sign-in method (Google vs email-link), so the same human can have multiple accounts. Each row is clickable to jump to the sibling.
- **Important**: when a user reports a credit problem, ALWAYS check this panel. They may be signed into a different UID on the app than the one you're viewing.

**Credit reconciliation panel:**
- Compares the stored wallet balance against an expected balance derived from the transaction ledger.
- ✅ Emerald: matches. Everything's fine.
- ⚠ Amber: doesn't match. Most common cause is a past data-cleanup run that wiped credits.
- Slate "Ledger truncated": the user has 50+ transactions and we can't be sure. Doesn't apply at current scale.

**Detail sections (in order):**
- **Credit transactions** — every credit movement (purchase, unlock, referral payout, etc.). Last 50.
- **Payments** — Paystack transactions. Each shows reference, amount, credits granted, status.
- **AI runs** — every Claude / HeyGen / TTS call attributed to this user.
- **Visa interview sessions** — sessions started + status.
- **Match reports** — reports unlocked.

### Errors (`/errors`)

Backend errors. Most are non-fatal (warnings rather than failures).

**Filter by:**
- Time range: 24h / 7d / 30d / all
- Category: payment_webhook / ai_call / email_send / external_api / storage / tts / other
- Severity: error / warning

**What each error row shows:**
- When it fired (in your local timezone)
- Category + source (e.g., `email_send · resend.welcome_failed`)
- Severity
- Message
- Attributable user (if any) — clickable into their detail page

**Day-to-day pattern:** if a user reports something not working, search `/errors` for their UID. You can often see exactly what went wrong on the backend.

### Audit logs (`/audit`)

Append-only history of every admin action and important user action.

**Two tabs:**
- **Admin activity** — sign_in, sign_out, user_viewed, admin_invited, admin_revoked, admin_role_changed, role_permissions_updated, test_payments_cleanup, etc.
- **User activity** — user_sign_in, user_sign_out per user.

**Filter by:** action type, actor email, target uid, time range.

**When to use:**
- "Who changed maintenance mode 3 hours ago?"
- "When did this user last sign in?"
- "Did someone delete that referral code?"

### Payments (`/payments`)

Every Paystack transaction. Founder-only by default.

Each row shows: reference, user, pack purchased, amount paid (in GHS), credits granted, status (success / refunded / failed), created date.

**Click into a row** to see full payment details and the user's other transactions.

### Reports (`/report`)

Comprehensive business + financial report. Founder + Analyst (by default).

**KPIs:**
- Signups (total + period)
- Revenue (Paystack-confirmed)
- Credit liability held (sum of all unspent credits)
- Conversion funnel (signup → paid → repeat)
- Per-pack unit economics (cost vs revenue, margin)
- Projections at current pace (next 30 days)

**Export options:**
- **CSV** — for spreadsheets. Header includes a "Generated" timestamp in your local timezone.
- **Print to PDF** — clean printable layout.

**Period selector:** 7d / 30d / 90d / all-time.

### Marketing (`/marketing`)

Admin-issued referral codes for marketers and campaigns. Founder-only.

**Each code carries:**
- The code itself (e.g., `FRIENDS20`)
- The marketer's name (just a label for your records)
- Bonus credits granted to the NEW USER who applies it
- Optional max-redemptions cap
- Optional expiry date
- Enabled/disabled toggle

**Common operations:**
- **Create a new code** for a partner/marketer.
- **Disable a code** if a marketer's contract ends or a code leaks.
- **Copy the signup link** (`collegeready.io/signup?ref=CODE`) to share with the marketer.

> Marketer codes differ from user referral codes — marketer codes give credits to the NEW USER (the marketer is paid out-of-band, separately). User referral codes give credits to the REFERRER when the referee makes their first paid purchase.

### Bulk email (`/email/bulk`)

Founder-only. Send a campaign to a chosen audience.

**Flow:**
1. Pick a template from the dropdown:
   - **Announcement** — product updates, feature launches
   - **Re-engagement** — for inactive users
   - **Promo** — discount or credit-pack offers
   - **Custom** — start from scratch
2. Edit the subject, headline, body, and optional CTA button (text + URL).
3. Pick an audience:
   - All registered users
   - Paying customers (purchased at least once)
   - Free users (no purchases)
   - All waitlist signups
   - Custom email list (paste comma-separated emails)
4. Click **Dry run** to confirm the recipient count and see 5 sample emails.
5. Click **Send blast** → type `SEND` to confirm → choose max-to-send → confirm again.

**Idempotency:** if a send is interrupted or some recipients fail, you can re-run with the same campaign — already-mailed addresses are skipped.

**Best practices:**
- **Always dry-run first.** Confirm the count looks right before sending.
- **Start small.** Set max-to-send to 5 or 10 for a smoke test, send to your own email + a teammate. Then re-run uncapped to mail everyone else.
- **Body is plain text.** Don't paste HTML — the system wraps your text in the standard College Ready branding. Use a blank line between paragraphs.
- **The CTA button is optional.** Leave both CTA fields blank if your email doesn't need one.

### Email failures (`/email/failures`)

Failed transactional emails (welcome, waitlist confirmation, launch announcement). Each row has a one-click **Retry** button.

**When to use:** if a user reports they never received their welcome email, look here. You can also see *what* Resend rejected (bounce, invalid address, rate limit, etc.).

**Currently does NOT include:** payment-receipt failures (those live in `/errors`).

### Admins (`/admins`)

Founder-only. Three things:

1. **Admin list** — every account with ops portal access. Each row shows:
   - Email + display name
   - Role badge (Founder / Analyst / Developer). Click it to change.
   - Created date
   - Last sign-in
   - Email verified status
   - **Revoke** button (disabled for yourself — you can't revoke your own access from here)

2. **Invite admin button** — top-right. Opens a modal:
   - Type email
   - Pick role (Founder / Analyst / Developer)
   - Click "Send invite"
   - The new admin receives a sign-in email automatically.

3. **Role permissions card** — toggle grid where you choose which pages Analysts and Developers can see. Founder column is always-on (locked). Changes save immediately and propagate to affected sessions within a second.

### Health (`/health`)

System status. Cloud Function invocation counts, error rates, current uptime. Mostly a glance-and-go page.

---

## Common workflows

These are step-by-step recipes for the situations you'll hit most often.

### Workflow 1: A user says "I paid but didn't get credits"

1. Open **Users** → search their email → click into their detail page.
2. Scroll to **Payments** section.
3. Look for a recent transaction. Is it there?
   - **Yes, status "success"**: scroll to **Credit transactions**. Confirm a matching `purchase` transaction. If credits are missing from the wallet but the transaction exists, escalate to a Founder — likely a wallet-write race.
   - **Yes, status "failed"**: the payment never completed. Tell the user to retry.
   - **Yes, status "refunded"**: a refund was issued. Confirm with the user.
   - **No payment at all**: did they actually pay? Ask for their bank statement / Paystack confirmation email. If they have proof but it's not in our system, escalate — webhook may have failed.
4. Always check the **Linked accounts** panel. They may have paid on a different UID than the one you're viewing.

### Workflow 2: A user says "the app shows X credits but I see Y in the portal"

1. Open their User detail page.
2. Check the **Linked accounts** panel. **This is almost always the cause.** The user's in-app session might be on a different UID than the one you're looking at. If linked accounts exist, click each one and check which UID matches their actual balance.
3. If they only have one UID:
   - Compare the **Credits (live)** number to the **Credit reconciliation** panel.
   - Emerald (matches): the portal is correct. The user's app may be showing a cached value — ask them to refresh.
   - Amber (mismatch): there's real drift. Escalate to a Founder.

### Workflow 3: A user says "I never got my welcome email"

1. Open **Email failures** in the sidebar.
2. Search/scan for the user's email.
   - **Found**: click **Retry** on the row. If it succeeds, the email goes out fresh.
   - **Not found**: the email may have actually sent but landed in spam. Ask the user to check spam folder. If they still don't see it, look up the user in `/users` → check `/errors` for `email_send` errors attributed to their UID.

### Workflow 4: A user's referral didn't fire

1. Open the referrer's detail page → scroll to **Credit transactions**.
2. Look for a `referral_reward` entry.
   - **Found**: it paid out. The referrer just needs to refresh the app to see it.
   - **Not found**: the referral is still pending. The referee must complete their first paid purchase for the referrer to be credited.
3. To confirm the pending state: ask a Founder to check `/pendingReferrals/{refereeUid}` in Firestore directly. Status should be `pending`.

### Workflow 5: A user has duplicate accounts (Google + email-link)

This happens when the user signs up via one method, then signs in via the other. Firebase creates a separate UID per method.

**What's happening:** the user has two `/users` docs, two wallets, two credit-transaction histories. They're effectively two accounts.

**What you can do as an Analyst:**
- Confirm the situation via the **Linked accounts** panel on either UID's detail page.
- Tell the user which sign-in method to use going forward (the one with the most activity).

**What you cannot do:**
- Merge the two accounts. There's no automated merger yet (V2 candidate).

**Escalate to a Founder** if the user needs the accounts merged manually. They'll move credits + activity manually via the Firebase console.

### Workflow 6: Sending a product announcement

(Founder-only — Analysts cannot do this.)

1. Open **Bulk email** in the sidebar.
2. Select **Announcement** template.
3. Edit:
   - **Subject**: keep it short, descriptive (e.g., "New: F-1 visa interview practice is live").
   - **Headline**: shown big in the dark header strip.
   - **Body**: plain text. Use blank lines between paragraphs. The system wraps in the standard branding.
   - **CTA text + URL** (optional): adds a clickable button.
4. Pick the audience. For announcements: **All registered users** usually.
5. Click **Dry run**. Confirm the count matches your expectation.
6. Click **Send blast** → type `SEND`.
7. **For the first send, set max-to-send to 5.** Type your own email + 4 teammates' emails in your audience (use Custom list) for a final preview.
8. Once you've reviewed the preview emails, re-open Send blast and run uncapped to send to the real audience.

### Workflow 7: Taking the app offline for maintenance

(Founder + Developer only by default.)

1. Dashboard → **Maintenance kill switch** card → click **Take offline**.
2. Confirmation modal opens:
   - Type the confirmation phrase (shown in the modal).
   - Optional: enter a user-facing message (e.g., "Back in 15 minutes — we're shipping a fix").
   - Optional: set an ETA datetime — users see a live countdown.
3. Submit. Effect propagates in ~1 second.
4. To bring back online: same card, click **Bring back online**.

**What gets gated:**
- `/intake` (guest matching)
- `/results` (preview)
- `/app/*` (signed-in user pages)
- AI calls + checkout + visa interview

**What stays live:**
- Public marketing pages (landing, pricing, FAQ)
- Login + signup (so users can still authenticate)
- Paystack webhook (so any in-flight payments still credit the wallet)

### Workflow 8: Inviting a new admin

(Founder only.)

1. **Admins** → **Invite admin** (top right).
2. Type the email of the person to invite.
3. Pick their role:
   - **Founder** — only for trusted co-leaders. Has full access.
   - **Analyst** — for customer-support staff.
   - **Developer** — for engineers / on-call.
4. Click **Send invite**. They'll receive a sign-in email from `noreply@collegeready.io`.

**If you typo the email**, fix it before sending. The system creates the Firebase Auth account on first invite — if you invite the wrong address, you'll need to revoke that account and invite the right one.

### Workflow 9: Customising what Analysts or Developers can see

(Founder only.)

1. **Admins** → scroll to the **Role permissions** card.
2. You'll see a grid:
   - Rows: each page in the portal
   - Columns: Founder (always-on), Analyst, Developer
3. Click a checkbox to toggle a page on/off for that role.
4. Hit **Save Analyst** or **Save Developer** to persist.
5. Affected users see the change within a second — no sign-out needed.

**The Dashboard is always-on** for every role. It's the redirect landing pad if someone navigates to a forbidden page.

### Workflow 10: Looking up "what did Person X do yesterday"

1. **Audit logs** → User activity tab.
2. Filter by **Actor email** = their email.
3. Filter by **Time range** = 24h or 7d.
4. You'll see every sign_in / sign_out event for that user.

For admin actions (someone changed a setting, invited an admin, etc.), use the Admin activity tab with the actor's email.

### Workflow 11: Looking up an error message

A user mentions an error they saw. You want to find what happened on the backend.

1. **Errors** in sidebar.
2. Filter by time range (start narrow — 24h).
3. Filter by category if you know it (e.g., `payment_webhook` if it was a checkout issue).
4. Scan messages for keywords.
5. If you find a relevant row, click into the attributable user (if shown) to see their detail page.

---

## Troubleshooting

### I can't sign in

- **Link expired?** Sign-in links work once and last 1 hour. Ask a Founder for a fresh invite.
- **Click the link in the same browser** you'll use the portal in. Don't paste the link into a different browser.
- **Different device** than where you requested? Firebase needs the email at the verification step. You may be prompted to confirm your email — type the one you requested the link for.
- **Access denied screen?** You're signed in but lack admin access. Ask a Founder to grant you the admin claim.

### Page is empty / blank

- **Hard refresh** (Ctrl+Shift+R). Browser caching can serve stale assets.
- **Sign out and back in.** Sometimes the auth state gets weird.
- **Check the URL.** If you typed a URL by hand (e.g., `/payments`) but your role doesn't have that page, the portal redirects you back to the Dashboard silently.

### I see "0 credits" for a user I think has more

- This is almost always one of:
  1. **Multi-account problem.** Check the **Linked accounts** panel on the user detail page. The user's in-app session is on a different UID.
  2. **Wallet not materialised yet** (rare). The credits cell shows "—" not "0" in this case.
  3. **They actually have 0.** They spent everything. Check the **Credit transactions** section.
- The **Credit reconciliation** panel will tell you which case you're in:
  - Emerald → user really has the shown amount
  - Amber → real drift; escalate to a Founder

### The portal feels slow

- The first sign-in of the day can take a few seconds because Cloud Functions cold-start.
- Some pages do heavy reads (Reports, Business report) — they take 2-5 seconds.
- If a page is taking 30+ seconds, something's wrong. Refresh; if still slow, ping a developer.

### A button I expected to see isn't there

You don't have permission for it. Either:
- Your role doesn't grant access to that page/action.
- A Founder disabled that page for your role.

Ask a Founder if you think this is wrong.

### Timestamps look weird (wrong by hours)

- All timestamps display in **your local timezone** with a short suffix (EDT, EST, PST, etc.).
- If you're seeing UTC times, you're on an old version of the portal. Hard-refresh.

### I clicked a Refresh button and nothing changed

- Some data is real-time (credit balances, maintenance flag). Refreshing doesn't help — the data was already current.
- Other pages need an explicit refresh. The Refresh button should re-fetch.
- If the data definitively isn't updating, ping a developer — could be a Cloud Function issue.

---

## Escalation: when to ping a Founder

Some operations are Founder-only. Some situations are above an Analyst or Developer's pay grade. Escalate when:

### Money / billing
- A user paid but the system shows no record of it.
- A user requests a refund.
- A user has a credit balance that doesn't reconcile with their transactions.
- Anything related to Marketer codes or partnerships.

### Account integrity
- A user has duplicate accounts that need merging.
- A user requests account deletion (GDPR-style request).
- A user reports unauthorised access to their account.

### System changes
- The maintenance flag needs to be flipped for a planned outage.
- Bulk email needs to go out (you can't do this as an Analyst — only Founders).
- A new admin needs to be invited.
- An admin's role needs to be changed.

### Anything destructive
- "Should I delete this?" — escalate.
- "Should I reset this user's credits?" — escalate.
- "Should I disable this referral code?" — for Marketing, escalate.

### Anything you're not sure about

Always escalate. It's cheaper to confirm than to undo.

---

## Glossary

- **Admin** — anyone with ops portal access. There are three roles: Founder, Analyst, Developer.
- **Audit log** — the append-only history of every admin action and important user action. Lives in `/audit`.
- **Bulk campaign** — a single bulk email send. Each has a unique ID and tracks per-recipient state.
- **Credit** — the product's unit of value. 1 credit = 1 match report unlock. 15 credits = 1 visa interview session.
- **Credit transaction** — a single +/- movement on someone's wallet. Visible on the user detail page.
- **Custom list** — for bulk email: a hand-typed audience (paste comma-separated emails).
- **Drift / reconciliation mismatch** — when the wallet's stored balance disagrees with what the credit-transaction ledger predicts. Surfaces on the user detail page as an amber alert.
- **Dry run** — preview what an action would do without actually doing it. Available on bulk email, wallet sync, and most destructive operations.
- **Email failure** — a transactional email Resend rejected. Visible on `/email/failures` with a one-click Retry.
- **Founder bypass** — founders can unlock match reports / start visa sessions without their wallet being decremented (for internal testing).
- **HeyGen** — third-party service that renders the live AI consular officer's avatar during the visa interview.
- **Linked accounts** — multiple ops portal-visible accounts that share the same email but are different Firebase Auth UIDs (e.g., Google + email-link sign-in for the same human). Shown in an amber panel on the user detail page.
- **Maintenance mode** — kill-switch state where user-facing features are gated behind a "we'll be back" page. Marketing + login stay live.
- **Match report** — output of an `unlockMatchReport` call. The user spent 1 credit to get a deep per-school explanation.
- **Paystack** — payment processor. We're on a Ghana merchant account, so all charges go through in GHS.
- **Pending referral** — a referral that hasn't paid out yet because the referee hasn't made their first paid purchase.
- **Refund** — a Paystack-initiated reverse of a charge. Triggers `applyPaystackRefund` which removes the credits granted from the wallet.
- **Resend** — third-party email service. Sends every transactional + bulk email from `noreply@collegeready.io`.
- **Role** — your permission tier in the ops portal: Founder, Analyst, or Developer.
- **Role permissions** — the toggle grid on the Admins page that lets Founders configure which pages Analysts and Developers can see.
- **Sign-in link** — a one-time-use, hour-long URL emailed to a user (or admin) to authenticate them without a password.
- **Tier-2 mutation** — privileged action that mutates real data (refund, manual credit grant). Most are Founder-only. Audit-logged automatically.
- **UID** — Firebase Auth User ID. Each sign-in method gets a separate UID for the same email, which is why "linked accounts" exist.
- **Wallet** — the document holding a user's credit balance. Eagerly materialised at signup with 2 free credits.
- **Wallet sync** — Founder-only Dashboard card that fixes wallet drift (creates missing wallets, restores zeroed wallets).

---

## Quick reference cards

### When in doubt, do this

| Situation | First action |
|---|---|
| User complaint about credits | Open their User detail → check Linked accounts panel |
| User complaint about a charge | User detail → Payments section |
| User says no welcome email | Email failures page → search their email |
| Something feels broken | Errors page → narrow to last 24h |
| You need to send announce | Escalate to a Founder (Bulk email is Founder-only) |
| Maintenance message needed | Dashboard → Maintenance card (Founder/Developer) |
| Anything destructive | Escalate to a Founder |

### Sign-in checklist

- [ ] Received invite email
- [ ] Clicked within 1 hour
- [ ] Saw the Dashboard
- [ ] Confirmed your role with the Founder
- [ ] Bookmarked the ops portal URL

### Time-zone reminder

All timestamps display in **your local timezone** with a short suffix. If you see UTC, hard-refresh.

---

## Practice exercises for new staff

These are low-risk things you can try in your first hour to build muscle memory. Each is reversible and won't affect users.

1. **Sign in, navigate to the Dashboard.** Read every card. Identify the maintenance state (should be green).
2. **Search for yourself in `/users`.** You're a user too — find your own UID. Click into your detail page. Confirm your credit balance.
3. **Open `/audit`.** Filter by your own email. Confirm your sign-in event shows up.
4. **Open `/errors`** with the 24h filter. Read a couple of recent errors. Confirm you understand what each category means.
5. **Open `/email/failures`.** This list should be small (often empty). If a row exists, hover the Retry button but don't click — just learn the layout.
6. **If you're Founder or Analyst with Reports access**: open `/report`, change the period to 30d, scroll the report end-to-end. Notice the "Generated" timestamp at the top — it's in your local timezone.
7. **Hard-refresh the page** (Ctrl+Shift+R). Confirm the data is still there afterwards.
8. **Sign out** via the sidebar. Confirm you see the sign-in screen. Sign back in.

After this, you've touched every major page in a non-destructive way.

---

End of training guide. If you run into a situation not covered here, write down what happened — we'll add it to the next revision of this doc so the next person knows what to do.
