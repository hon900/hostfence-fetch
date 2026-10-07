import { Agent } from "undici";
import { Hostfence, pinLookup } from "hostfence";

const fence = new Hostfence();
const agents = new Map();

export { Hostfence, HostfenceError } from "hostfence";

function dispatcherFor(pin) {
  const key = `${pin.family}/${pin.address}`;
  let agent = agents.get(key);
  if (!agent) {
    agent = new Agent({ connect: { lookup: pinLookup(pin) } });
    agents.set(key, agent);
  }
  return agent;
}

async function requestWithFence(local, input, init) {
  const redirect = init?.redirect ??
    (input instanceof Request && input.redirect !== "follow" ? input.redirect : "error");
  if (redirect !== "error" && redirect !== "manual") {
    throw new TypeError('hostfence-fetch supports only redirect: "error" or "manual"');
  }

  const request = new Request(input, { ...init, redirect });
  request.signal.throwIfAborted();
  const { pin } = await local.assertPin(request.url);
  request.signal.throwIfAborted();
  return fetch(request, { dispatcher: dispatcherFor(pin) });
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
