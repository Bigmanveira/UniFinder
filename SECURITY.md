# Security policy

## Reporting a vulnerability

If you believe you've found a security issue in UniFinder — credential leak,
authentication bypass, data exposure, dependency vulnerability, etc. — please
**do not open a public issue**. Instead, email the maintainer directly so the
fix can be coordinated before disclosure.

We aim to respond within **72 hours** and to ship a fix within **14 days** for
issues with material user-data impact.

## What's in scope

- This repository (frontend, Cloud Functions, Firebase rules, deployment
  configuration).
- The deployed application at the production URL.

## What's **out** of scope

- Brute-forcing user accounts.
- Findings that depend on social engineering or physical access.
- Denial-of-service via traffic flooding.
- Issues in third-party services we depend on (Firebase, Anthropic, HeyGen,
  Google Cloud TTS) — please report those upstream.

## Hardening conventions used in this codebase

- **Secrets never live in source.** All third-party API keys (Anthropic,
  HeyGen, OpenAI if used) are stored in Firebase Secret Manager and injected
  into Cloud Functions at runtime. They never appear in client bundles.
- **Firebase Security Rules** enforce per-user data isolation — see
  `firestore.rules` and `storage.rules`. The default is `allow read, write:
  if false` and every collection is opened up only with explicit
  ownership checks.
- **Cloud Functions verify caller identity** before doing privileged work
  (transactions on credit wallets, generating Claude / TTS responses,
  reading uploaded documents).
- **Server-side validation** of every callable's `request.data`: type
  checks, length caps, allow-listed enum values. Never trusts the client.
- **The frontend never sees** a privileged API key. The client mints
  short-lived session tokens via Cloud Functions, then talks to third-party
  services (HeyGen LiveKit room) using only those tokens.
- **`.env` is gitignored.** A redacted `.env.example` is checked in to
  document the required variables.

## What you should do as a contributor

1. Never paste real keys or tokens into chat, code review tools, issue
   comments, or commit messages. If you accidentally leak one, **rotate
   immediately** — don't try to delete the leak.
2. Do not weaken security rules, disable App Check, or relax callable
   validation without an architectural justification reviewed by another
   maintainer.
3. Run `git diff` before every push — make sure you're not committing a
   `.env`, a service-account JSON, or any file with hardcoded credentials.
4. Keep dependencies up to date. The repo has Dependabot alerts enabled;
   address advisories within their stated severity windows.
