# Changelog

## 1.3.1 — 2026-10-07

- Repair the stale dependency lock and require hostfence 1.4.1; check manifest,
  lock, installed version, and pinning exports before tests.
- Pair package Undici Fetch/Request with its Agent, fixing native Node.js 26
  Fetch's incompatible dispatcher callbacks. Return an Undici Response and
  explicitly convert native Request inputs without buffering their bodies.
- Replace the unbounded global Agent cache with one Agent per request, closed
  after its response finishes and destroyed on failure.
- Reject Host/dispatcher overrides and reject promptly on cancellation during
  validation. Preserve automatic redirect rejection.
- Add real local transport regressions for destination pinning, native Request
  forwarding, changed DNS answers, redirects, aborts, and socket cleanup.
- Correct installation, transport security, response compatibility, and resource
  lifecycle documentation. Native Request bodies with keepalive are unsupported;
  URL inputs with a buffered init.body can use keepalive.

## 1.3.0 — 2026-10-07

- Introduce connection pinning through a hostfence lookup and an Undici Agent.
- This release's stale lock and native Fetch compatibility are corrected in 1.3.1.

## 1.2.0 — 2026-10-04

- Adopt hostfence 1.3.0 destination-policy hardening and standalone CI.
- Disable automatic redirects by default, including inherited `Request` defaults;
  reject explicit `redirect: "follow"` and retain manual redirect inspection.
- Snapshot request inputs before asynchronous validation and check cancellation
  before transport.
- Add TypeScript declarations and offline regression tests for request forwarding,
  redirect policy, mixed DNS answers, and cancellation.
- Clarify that DNS preflight does not pin the connected address.
