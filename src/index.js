import undici from "undici";
import { Hostfence, pinLookup } from "hostfence";

const { Agent, Request } = undici;
const fence = new Hostfence();

export { Hostfence, HostfenceError } from "hostfence";

function snapshotRequest(input, init, redirect) {
  if (input instanceof globalThis.Request && !(input instanceof Request)) {
    const native = new globalThis.Request(input, { ...init, redirect });
    // Native and package Undici use different private Request state. Transfer
    // standard fields explicitly, without buffering a potentially unbounded body.
    if (native.body && native.keepalive) {
      throw new TypeError("Native Request bodies with keepalive are unsupported; pass a URL and buffered init.body instead");
    }
    return new Request(native.url, {
      method: native.method,
      headers: native.headers,
      body: native.body,
      signal: native.signal,
      redirect: native.redirect,
      cache: native.cache,
      credentials: native.credentials,
      integrity: native.integrity,
      keepalive: native.keepalive,
      mode: native.mode,
      referrer: native.referrer,
      referrerPolicy: native.referrerPolicy,
      duplex: "half",
    });
  }
  return new Request(input, { ...init, redirect });
}

async function assertPinWithSignal(local, url, signal) {
  signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([local.assertPin(url), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function requestWithFence(local, input, init) {
  if (init && "dispatcher" in init) {
    throw new TypeError("hostfence-fetch owns its pinned dispatcher");
  }
  const redirect = init?.redirect ??
    ((input instanceof Request || input instanceof globalThis.Request) && input.redirect !== "follow" ? input.redirect : "error");
  if (redirect !== "error" && redirect !== "manual") {
    throw new TypeError('hostfence-fetch supports only redirect: "error" or "manual"');
  }

  const request = snapshotRequest(input, init, redirect);
  if (request.headers.has("host")) {
    throw new TypeError("hostfence-fetch derives Host and TLS authority from the checked URL");
  }
  request.signal.throwIfAborted();
  const { pin } = await assertPinWithSignal(local, request.url, request.signal);
  request.signal.throwIfAborted();
  const dispatcher = new Agent({ connect: { lookup: pinLookup(pin) } });
  try {
    const response = await undici.fetch(request, { dispatcher });
    // Close gracefully after the in-flight response completes. Do not await here:
    // the caller must be able to consume or cancel the response body first.
    void dispatcher.close().catch(() => dispatcher.destroy().catch(() => {}));
    return response;
  } catch (error) {
    await dispatcher.destroy().catch(() => {});
    throw error;
  }
}

export function fetchSafe(input, init) {
  return requestWithFence(fence, input, init);
}

export function createFetch(policy) {
  const local = new Hostfence(policy);
  return function fetchWithFence(input, init) {
    return requestWithFence(local, input, init);
  };
}
