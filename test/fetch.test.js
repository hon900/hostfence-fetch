import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import undici from "undici";
import { createFetch, fetchSafe, HostfenceError } from "../src/index.js";

test("defaults to redirect:error and preserves request method, headers, and body", async (t) => {
  t.mock.method(undici, "fetch", async (request) => {
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
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
  for (const input of ["http://127.0.0.1/", "http://169.254.169.254/", "http://[::1]/"]) {
    await assert.rejects(fetchSafe(input), HostfenceError);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("rejects explicit automatic redirects", async (t) => {
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
  await assert.rejects(fetchSafe("https://1.1.1.1/", { redirect: "follow" }), /redirect/);
  assert.equal(fetch.mock.callCount(), 0);
});

test("overrides a Request's inherited follow mode", async (t) => {
  t.mock.method(undici, "fetch", async (request) => {
    assert.equal(request.redirect, "error");
    return new Response();
  });
  await fetchSafe(new Request("https://1.1.1.1/"));
});

test("manual redirects expose the response and the next hop must pass validation", async (t) => {
  const fetch = t.mock.method(undici, "fetch", async (request) => {
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
  t.mock.method(undici, "fetch", async (request) => {
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
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
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
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
  await assert.rejects(safeFetch("https://mixed.example/"), HostfenceError);
  assert.equal(fetch.mock.callCount(), 0);
});

test("rejects authority and dispatcher overrides before DNS or transport", async (t) => {
  const lookup = t.mock.fn(async () => ["1.1.1.1"]);
  const safeFetch = createFetch({ lookup });
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
  for (const headers of [{ Host: "internal.example" }, { ":authority": "internal.example" }]) {
    await assert.rejects(safeFetch("https://public.example/", { headers }), /authority/);
  }
  await assert.rejects(safeFetch("https://public.example/", { dispatcher: {} }), /dispatcher/);
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("abort rejects without waiting for DNS to finish", async (t) => {
  let resolveLookup;
  const lookupResult = new Promise((resolve) => { resolveLookup = resolve; });
  const safeFetch = createFetch({ lookup: () => lookupResult });
  const fetch = t.mock.method(undici, "fetch", () => { throw new Error("unexpected fetch"); });
  const controller = new AbortController();
  const reason = new Error("cancelled during lookup");
  const pending = safeFetch("https://public.example/", { signal: controller.signal });
  controller.abort(reason);
  try {
    await assert.rejects(pending, (error) => error === reason);
  } finally {
    resolveLookup(["1.1.1.1"]);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test("native Request conversion preserves Fetch options and init overrides", async (t) => {
  t.mock.method(undici, "fetch", async (request) => {
    assert.ok(request instanceof undici.Request);
    assert.equal(request.method, "PUT");
    assert.equal(await request.text(), "override body");
    assert.equal(request.headers.get("x-test"), "override");
    assert.equal(request.cache, "no-store");
    assert.equal(request.credentials, "omit");
    assert.equal(request.referrerPolicy, "no-referrer");
    assert.equal(request.redirect, "manual");
    return new undici.Response("ok");
  });
  const input = new Request("https://1.1.1.1/", {
    method: "POST", body: "original", cache: "no-store", credentials: "omit",
    referrerPolicy: "no-referrer", redirect: "manual",
  });
  await fetchSafe(input, {
    method: "PUT", body: "override body", headers: { "x-test": "override" },
    referrerPolicy: "no-referrer",
  });
});

test("keepalive rejects converted native bodies but permits buffered URL input", async (t) => {
  const fetch = t.mock.method(undici, "fetch", async (request) => {
    assert.equal(request.keepalive, true);
    assert.equal(await request.text(), "buffered");
    return new undici.Response();
  });
  await assert.rejects(fetchSafe(new Request("https://1.1.1.1/", {
    method: "POST", body: "buffered", keepalive: true,
  })), /Native Request bodies with keepalive/);
  await fetchSafe("https://1.1.1.1/", { method: "POST", body: "buffered", keepalive: true });
  assert.equal(fetch.mock.callCount(), 1);
});

async function listen(t, handler) {
  const server = createServer(handler);
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return { server, port: server.address().port };
}

test("native Request reaches only the verified IP and closes its connection after the body", { timeout: 5000 }, async (t) => {
  let received;
  let socketClosed;
  const closed = new Promise((resolve) => { socketClosed = resolve; });
  const { server, port } = await listen(t, async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received = {
      host: request.headers.host,
      method: request.method,
      header: request.headers["x-test"],
      path: request.url,
      address: request.socket.localAddress,
      body,
    };
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("transport ok");
  });
  server.once("connection", (socket) => socket.once("close", socketClosed));
  const lookup = t.mock.fn(async (hostname) => {
    assert.equal(hostname, "verified-destination.invalid");
    return ["127.0.0.1"];
  });
  // A .invalid hostname cannot reach this server through ordinary DNS. Loopback
  // is allowed only by this isolated test's explicit policy.
  const safeFetch = createFetch({ lookup, allowLoopback: true });
  const input = new Request(`http://verified-destination.invalid:${port}/submit`, {
    method: "POST",
    headers: { "x-test": "native-request" },
    body: "payload",
  });
  const response = await safeFetch(input);
  assert.ok(response instanceof undici.Response);
  assert.equal(await response.text(), "transport ok");
  assert.deepEqual(received, {
    host: `verified-destination.invalid:${port}`,
    method: "POST",
    header: "native-request",
    path: "/submit",
    address: "127.0.0.1",
    body: "payload",
  });
  assert.equal(lookup.mock.callCount(), 1);
  await closed;
});

test("fresh validation blocks a changed DNS answer before reusing a previous connection", { timeout: 5000 }, async (t) => {
  let requests = 0;
  const { port } = await listen(t, (_, response) => {
    requests++;
    response.end("first destination");
  });
  let address = "127.0.0.1";
  const safeFetch = createFetch({ lookup: async () => [address], allowLoopback: true });
  const url = `http://changing-destination.invalid:${port}/`;
  assert.equal(await (await safeFetch(url)).text(), "first destination");
  // A forbidden DNS answer must prevent any subsequent request to the old socket.
  address = "10.0.0.1";
  await assert.rejects(safeFetch(url), HostfenceError);
  assert.equal(requests, 1);
});

test("real redirects remain manual and never issue an unchecked second request", { timeout: 5000 }, async (t) => {
  let requests = 0;
  const { port } = await listen(t, (_, response) => {
    requests++;
    response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
    response.end();
  });
  const safeFetch = createFetch({ lookup: async () => ["127.0.0.1"], allowLoopback: true });
  const url = `http://redirect-destination.invalid:${port}/`;
  await assert.rejects(safeFetch(url), /fetch failed/);
  const response = await safeFetch(url, { redirect: "manual" });
  assert.equal(response.status, 302);
  await response.body?.cancel();
  await assert.rejects(safeFetch(response.headers.get("location")), HostfenceError);
  assert.equal(requests, 2);
});

test("abort cancels a real streaming response and releases its socket", { timeout: 5000 }, async (t) => {
  let socketClosed;
  const closed = new Promise((resolve) => { socketClosed = resolve; });
  const { server, port } = await listen(t, (_, response) => {
    response.writeHead(200);
    response.write("unfinished response");
  });
  server.once("connection", (socket) => socket.once("close", socketClosed));
  const safeFetch = createFetch({ lookup: async () => ["127.0.0.1"], allowLoopback: true });
  const controller = new AbortController();
  const response = await safeFetch(`http://streaming-destination.invalid:${port}/`, { signal: controller.signal });
  controller.abort();
  await assert.rejects(response.text(), { name: "AbortError" });
  await closed;
});
