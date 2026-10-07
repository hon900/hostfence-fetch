# hostfence-fetch

```sh
npm install github:hon900/hostfence-fetch#v1.2.0
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

- `fetchSafe(input, init?)` accepts a string, `URL`, or `Request` and returns a
  native `Response`. Method, headers, body, and cancellation follow native Fetch.
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

Hostfence is a **preflight check**, not a transport firewall. Native Fetch performs
its own DNS resolution after validation. This package does not pin the checked IP
to the connection, so DNS changes between check and connection remain a
time-of-check/time-of-use risk. Use destination-restricted egress or a transport
that binds validation to the connected address when handling hostile URLs.

Response status handling, response body limits, and request deadlines belong to
the caller. An allowlisted hostname still has to pass address checks. Do not log
callback URLs or errors without considering tokens and other sensitive URL data.

## Development

```sh
npm install
npm test
```

Tests stub DNS and Fetch; they make no external requests. This release pins
`github:hon900/hostfence#v1.3.0`. A local multi-repository checkout can link its
sibling hostfence build to test local changes together.
