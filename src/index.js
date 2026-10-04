import { Hostfence } from "hostfence";

const fence = new Hostfence();

export { Hostfence, HostfenceError } from "hostfence";

async function requestWithFence(local, input, init) {
  // A Request's default is "follow", so override that inherited default too.
  const redirect = init?.redirect ??
    (input instanceof Request && input.redirect !== "follow" ? input.redirect : "error");
  if (redirect !== "error" && redirect !== "manual") {
    throw new TypeError('hostfence-fetch supports only redirect: "error" or "manual"');
  }

  // Snapshot the URL and request options before an asynchronous DNS check.
  const request = new Request(input, { ...init, redirect });
  request.signal.throwIfAborted();
  await local.assert(request.url);
  request.signal.throwIfAborted();
  return fetch(request);
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
