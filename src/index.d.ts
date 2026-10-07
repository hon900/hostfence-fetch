import type { HostfencePolicy } from "hostfence";
import type { Request as UndiciRequest, Response as UndiciResponse } from "undici";

export { Hostfence, HostfenceError } from "hostfence";

/** Automatic redirects and dispatcher/Host overrides are rejected. */
export type SafeRequestInit = Omit<RequestInit, "redirect"> & {
  redirect?: "error" | "manual";
  dispatcher?: never;
  /** Required for streaming request bodies, following Undici Fetch. */
  duplex?: "half";
};

/** Returns a Fetch-compatible Undici Response, not a native Response instance. */
export type SafeFetch = (input: string | URL | Request | UndiciRequest, init?: SafeRequestInit) => Promise<UndiciResponse>;
export declare const fetchSafe: SafeFetch;
export declare function createFetch(policy?: HostfencePolicy): SafeFetch;
