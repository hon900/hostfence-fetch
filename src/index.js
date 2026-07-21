import { Hostfence } from "hostfence";

const fence = new Hostfence();

export { Hostfence, HostfenceError } from "hostfence";

export async function fetchSafe(input, init) {
  const url =
    typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
  await fence.assert(url);
  return fetch(input, init);
}

export function createFetch(policy) {
  const local = new Hostfence(policy);
  return async function fetchWithFence(input, init) {
    const url =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url;
    await local.assert(url);
    return fetch(input, init);
  };
}
