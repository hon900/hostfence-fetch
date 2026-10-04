import assert from "node:assert/strict";
import { test } from "node:test";
import { createFetch, fetchSafe, HostfenceError } from "../src/index.js";

test("defaults to redirect:error and preserves request method, headers, and body", async (t) => {
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.redirect, "error");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.get("x-test"), "yes");
    assert.equal(await request.text(), "payload");
    return new Response("ok");
  });
  const response = await fetchSafe("https://1.1.1.1/", {
    method: "POST", headers: new Headers({ "x-test": "yes" }), body: "payload",
  });
  assert.equal(await response.text(), "ok");
});

test("blocks internal targets before invoking fetch", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected fetch"); });
  for (const input of ["http://127.0.0.1/", "http://169.254.169.254/", "http://[::1]/"]) {
    await assert.rejects(fetchSafe(input), HostfenceError);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("rejects explicit automatic redirects", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected fetch"); });
  await assert.rejects(fetchSafe("https://1.1.1.1/", { redirect: "follow" }), /redirect/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("overrides a Request's inherited follow mode", async (t) => {
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.redirect, "error");
    return new Response();
  });
  await fetchSafe(new Request("https://1.1.1.1/"));
});

test("manual redirects expose the response and the next hop must pass validation", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  });
  const response = await fetchSafe(new Request("https://1.1.1.1/", { redirect: "manual" }));
  await assert.rejects(fetchSafe(response.headers.get("location")), HostfenceError);
  assert.equal(fetch.mock.callCount(), 1);
});

test("snapshots a mutable URL before asynchronous validation", async (t) => {
  let resolveLookup;
  const lookupResult = new Promise((resolve) => { resolveLookup = resolve; });
  const safeFetch = createFetch({ lookup: () => lookupResult });
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(request.url, "https://public.example/original");
    return new Response();
  });
  const input = new URL("https://public.example/original");
  const pending = safeFetch(input);
  input.hostname = "127.0.0.1";
  resolveLookup(["1.1.1.1"]);
  await pending;
});

test("an abort during DNS prevents a later request", async (t) => {
  let resolveLookup;
  const lookupResult = new Promise((resolve) => { resolveLookup = resolve; });
  const safeFetch = createFetch({ lookup: () => lookupResult });
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected fetch"); });
  const controller = new AbortController();
  const reason = new Error("cancelled");
  const pending = safeFetch("https://public.example/", { signal: controller.signal });
  controller.abort(reason);
  resolveLookup(["1.1.1.1"]);
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(fetch.mock.callCount(), 0);
});

test("a mixed public/private DNS answer prevents transport", async (t) => {
  const safeFetch = createFetch({ lookup: async () => ["1.1.1.1", "10.0.0.1"] });
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("unexpected fetch"); });
  await assert.rejects(safeFetch("https://mixed.example/"), HostfenceError);
  assert.equal(fetch.mock.callCount(), 0);
});
