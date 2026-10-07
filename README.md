# hostfence-fetch

```sh
npm install github:hon900/hostfence-fetch#v1.3.1
```

A Node.js fetch wrapper that checks the URL with
[hostfence](https://github.com/hon900/hostfence) and then connects to the
verified pin address (TLS SNI and Host stay on the original name). Automatic
redirects are disabled so a public URL cannot hop to an unchecked internal
target. Requires Node.js 18.18 or later.

```js
import { fetchSafe, createFetch, HostfenceError } from "hostfence-fetch";

const response = await fetchSafe("https://example.com/ok");

const partnerFetch = createFetch({
  protocols: ["https"],
  allowedHosts: ["api.example.com"],
});
await partnerFetch("https://api.example.com/v1/events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "example" }),
});

try {
  await fetchSafe("http://127.0.0.1/");
} catch (error) {
  if (error instanceof HostfenceError) console.error(error.code, error.reasons);
  else throw error;
}
```

## API and redirects

- `fetchSafe(input, init?)` accepts a string, `URL`, or native/Undici `Request`
  and returns a Fetch-compatible **Undici `Response`**, not an instance of the
  global `Response` class. The wrapper pairs Undici's Fetch implementation with
  its own Agent so newer Node.js bundled dispatcher APIs cannot break transport.
- Method, headers, streaming body, and cancellation are preserved. Native
  `Request` bodies are transferred as streams; a native `Request` with both a
  body and `keepalive: true` is rejected. For that combination, pass a URL and
  a buffered `init.body` instead. Streaming `init.body` requires `duplex: "half"`.
- `createFetch(policy?)` creates a fetch function using the full hostfence policy.
- `Hostfence` and `HostfenceError` are re-exported. TypeScript declarations are included.

The default redirect mode is `error`, including when a supplied `Request` inherits
native Fetch's `follow` default. Explicit `init.redirect: "follow"` throws
`TypeError` before a request is sent. This closes the older wrapper's automatic
redirect behavior; callers that relied on it need to handle redirects explicitly.

Use `redirect: "manual"` to inspect a redirect response. Before following one,
resolve its `Location` relative to the current URL and submit the next URL through
the guarded function again. Bound the number of hops, cancel unused response
bodies, and do not forward credentials or sensitive headers to a different origin.
This package intentionally does not implement redirect chains for you.

## Security boundary

Every request gets a dedicated Undici Agent whose DNS lookup returns only the IP
selected by `hostfence.assertPin()`. The HTTP Host header and TLS server name are
derived from the checked URL; custom `Host` headers and `init.dispatcher` are
rejected. The connection cannot independently re-resolve the hostname to a
different address. There is no fallback to another DNS answer if that IP fails.

The Agent closes gracefully when the response finishes and is destroyed on
request failure. There is no global Agent cache. Always consume or cancel each
response body: an unfinished response can still hold its active connection.
Aborting during validation rejects promptly; the underlying DNS lookup may
continue until it settles or the hostfence lookup timeout expires.

This protects requests made through this wrapper, not other network operations
in the process. It does not replace destination-restricted egress, authenticate
the remote application, or make intentionally permissive policies safe.

Response status handling, response body limits, and request deadlines belong to
the caller. An allowlisted hostname still has to pass address checks. Do not log
callback URLs or errors without considering tokens and other sensitive URL data.

## Development

```sh
npm ci
npm test
```

Tests combine mocked validation with real HTTP connections to local test servers;
they make no public network requests. The transport tests use non-resolving
`.invalid` hostnames, with loopback enabled only in their test policies, to prove
the checked IP reaches the socket and the original Host header survives. They
also cover redirects, cancellation, changed DNS answers, and connection cleanup.
This release pins `github:hon900/hostfence#v1.4.1`. CI installs the committed lock
from scratch and checks the installed dependency version and pinning API before
running tests. A local sibling link is useful for development, but does not
replace a clean-install check before release.
