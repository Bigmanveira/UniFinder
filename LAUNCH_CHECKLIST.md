# Launch Checklist

Working doc. Tick items as you finish them. Aim: open public launch in **~2 weeks**.

The three phases are sequential — don't skip ahead. Each phase has a "done when" condition; if you can't honestly check it, you're not done.

---

## Phase 1 — Critical path (blocks any real users)

If you skip any of these, you'll either bleed money, lose trust, or both.

### 1.1 Payments — wire Dodo product IDs

- [ ] In Dodo dashboard, create 4 one-time products: **Starter $5 / Plus $20 / Pro $50 / Power $120**
- [ ] Copy each product's stable ID
- [ ] Paste into [`functions/src/index.ts`](functions/src/index.ts) `CREDIT_PACKS` — replace each `REPLACE_WITH_DODO_PRODUCT_ID_*`
- [ ] Deploy: `firebase deploy --only functions:listCreditPacks,functions:createDodoCheckout --project unifinder-dev-d61aa`
- [ ] Buy the **Starter pack** end-to-end as a real user with a real card
- **Done when:** one real $5 charge clears, the webhook fires, 5 credits land in your wallet within 30 seconds

### 1.2 App Check — flip enforcement

- [ ] Wait until **24–48h** after the App Check frontend deploy (2026-05-18) so the verified/total ratio stabilises
- [ ] Open https://console.firebase.google.com/project/unifinder-dev-d61aa/appcheck
- [ ] Confirm **verified ≥ 95%** on Cloud Firestore + Cloud Functions
- [ ] Ping me — I'll add `request.app != null` to the waitlist Firestore rule and `enforceAppCheck: true` to `aiMatchSchoolsCallable`. ~10 min of code + deploy.
- **Done when:** hitting `aiMatchSchoolsCallable` from a non-App-Check context (`curl` or a postman with no token) returns 401

### 1.3 Avatar audio reliability

- [ ] Run **5 consecutive** practice visa interviews end-to-end
- [ ] Each must complete without the "officer speaking but no audio" stall
- [ ] If even one fails: open browser DevTools → Network during the stall, look for failed LiveKit websocket frames or rejected `speakAudio` promises, ping me with the logs
- **Done when:** 5/5 clean runs

### 1.4 iOS Safari mic test

- [ ] Open the live site on a **real iPhone in Safari** (not the desktop "Show me iPhone" simulator)
- [ ] Sign up, tap Start interview, grant the two permission prompts
- [ ] Speak an answer after Anna's greeting
- **Done when:** Anna's next question fires within ~3 seconds of you finishing speaking
- **If it fails:** ping me. Backend Whisper STT path is a 4–6 hour ship; until then, gate iOS Safari with a friendly "Use Chrome on iOS" message rather than ship broken

### 1.5 Error tracking (Sentry)

- [ ] Create a free Sentry project at https://sentry.io (org: College Ready, project: web)
- [ ] Grab the DSN
- [ ] Ping me — I'll wire `@sentry/react` into `src/main.tsx` and Cloud Functions integration into `functions/src/index.ts`. ~30 min, deploy and done.
- **Done when:** triggering a synthetic frontend error shows up in Sentry within 1 minute

### 1.6 Production project decision

You have two Firebase projects: `unifinder-dev-d61aa` (actively serving everything) and `unifinder-8e5db` (empty shell, never used).

**Recommended: adopt dev as production.** Fewer moving parts.

- [ ] Confirm `.firebaserc` "default" alias = `unifinder-dev-d61aa`
- [ ] Map `collegeready.io` either to Firebase Hosting OR keep Vercel as the front door (Vercel is fine; that's what's deployed today)
- [ ] Mentally retire `unifinder-8e5db` — don't delete it, just stop thinking about it

**If you want a separate prod (only if you have a strong reason):** that's a 1-day project — enabling Firestore + Auth + secrets + redeploying functions + mirroring data + setting up budget alerts on the new project. Tell me if you want to go that route.

### 1.7 Budget alerts confirmed

- [ ] Open https://console.cloud.google.com/billing/budgets
- [ ] Confirm the $50 / $200 / $1000 thresholds are active for `unifinder-dev-d61aa`
- [ ] Confirm your email is on the notification list

---

## Phase 2 — Soft launch (5–50 invited users)

After every Phase 1 box is green.

- [ ] Pick **20–50 trusted people** (friends, classmates, beta testers from the waitlist)
- [ ] Send them a short DM/email with the URL + what to try
- [ ] Watch every 12h for the first 3 days:
  - GCP Billing — sudden spike = something's burning
  - Sentry — error rate per user
  - Resend dashboard — delivery failures
  - Firebase Auth — sign-up rate, % completing first match
- [ ] After each user finishes their first session, send a 2-question survey: **"one bug?"** + **"one thing that surprised you?"**
- **Done when:** ≥ 5 beta users have completed the full happy path (sign up → match unlock → visa interview) AND no critical bugs reported in the last 48h

---

## Phase 3 — Open public launch

After Phase 2 has been calm for 48h.

- [ ] Schools CDN bundle (replaces the 6k-doc client fetch). Not a blocker for opening up; cost-saving once you hit ~1k DAU. ~2–4 hours of work — ping me when ready.
- [ ] Negotiate HeyGen committed-spend if monthly projection > $5k. They give 20–30% off for committed volume.
- [ ] Adjust budget alerts to your real-volume thresholds (current $50/$200/$1000 will paste-spam you once real money flows)
- [ ] Marketing kickoff — social, ProductHunt, university Slack/Discord groups, etc.
- **Done when:** anyone on the open internet can sign up and complete a paid flow

---

## Standing orders — do these on a cadence, not once

- [ ] Check GCP Billing every Monday for the first month
- [ ] Check App Check verified ratio weekly — if it dips < 90%, something's misconfigured
- [ ] Address GitHub Dependabot alerts within a month of being filed (currently 2 low-severity open: https://github.com/Bigmanveira/UniFinder/security/dependabot)
- [ ] Schedule Node.js 20 → Node.js 22 runtime upgrade before **2026-10-30** (Firebase decom date — Functions will refuse to deploy after that)
- [ ] Re-run the production audit every quarter — the project moves; new endpoints accrete new risk

---

## Quick command reference

Deploy frontend (Vercel auto-deploys from main):
```
git push origin main
```

Deploy a single function:
```
firebase deploy --only functions:<NAME> --project unifinder-dev-d61aa
```

Set a Firebase Secret without putting it in shell history:
```
printf '%s' 'VALUE' | firebase functions:secrets:set NAME --project unifinder-dev-d61aa --data-file=-
```

Tail logs for one function:
```
firebase functions:log --only <NAME> --project unifinder-dev-d61aa
```

Roll back to a previous functions deploy (only works if you noted the build id):
```
firebase functions:list --project unifinder-dev-d61aa
```

---

## What I'll do for you when you say go

These are pre-scoped; just ping me with the trigger word and I execute.

| Trigger | What happens | Time |
|---|---|---|
| "flip App Check enforcement" | Rule update + `enforceAppCheck: true` on the right functions + redeploy | ~15 min |
| "wire Sentry" | `@sentry/react` in main.tsx + functions integration + smoke test | ~30 min |
| "ship the schools CDN bundle" | Build-time JSON generator + frontend swap + cache headers | ~2–4 hrs |
| "iOS Safari backend STT" | MediaRecorder + Whisper callable + integrate with `useSpeechRecognition` fallback path | ~4–6 hrs |
| "upgrade Node 20 → 22" | package.json bump + test build + redeploy all functions | ~1 hr |
| "set up prod project from scratch" | Mirror everything to `unifinder-8e5db` | ~1 day |

---

## Bottom line — what's still in your way

In rough order of effort:
1. **Dodo product IDs** (Phase 1.1) — 30 min in their dashboard + a paste + a deploy
2. **iOS Safari mic test on real device** (Phase 1.4) — 10 min, but the result determines whether you need a 4–6 hour ship
3. **Sentry** (Phase 1.5) — 30 min of my time once you have a DSN
4. **App Check enforcement** (Phase 1.2) — waiting on the 24–48h observation window, then 15 min
5. **Avatar audio confirmation** (Phase 1.3) — 30 min of your time, 5 dry runs
6. **Budget alerts confirmed** (Phase 1.7) — 5 min if you haven't done them yet
7. **Production project decision** (Phase 1.6) — usually 0 effort (adopt dev)

If everything goes smoothly, **you can be live to a 20-person beta this weekend** and open public ~1 week after that.

---

_Last updated: 2026-05-18. Update as items land._
