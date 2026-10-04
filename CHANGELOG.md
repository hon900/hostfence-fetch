# Changelog

## 1.2.0 — 2026-10-04

- Adopt hostfence 1.3.0 destination-policy hardening and standalone CI.
- Disable automatic redirects by default, including inherited `Request` defaults;
  reject explicit `redirect: "follow"` and retain manual redirect inspection.
- Snapshot request inputs before asynchronous validation and check cancellation
  before transport.
- Add TypeScript declarations and offline regression tests for request forwarding,
  redirect policy, mixed DNS answers, and cancellation.
- Clarify that DNS preflight does not pin the connected address.
