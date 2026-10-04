import type { HostfencePolicy } from "hostfence";

export { Hostfence, HostfenceError } from "hostfence";

/** Automatic redirects are rejected. Validate every manual hop separately. */
export type SafeRequestInit = Omit<RequestInit, "redirect"> & {
  redirect?: "error" | "manual";
};

export type SafeFetch = (input: string | URL | Request, init?: SafeRequestInit) => Promise<Response>;
export declare const fetchSafe: SafeFetch;
export declare function createFetch(policy?: HostfencePolicy): SafeFetch;
