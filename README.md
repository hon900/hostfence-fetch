# hostfence-fetch

Drop-in `fetch` wrapper. Every URL is passed through
[hostfence](https://github.com/hon900/hostfence) before the request is sent.

```js
import { fetchSafe } from "hostfence-fetch";

await fetchSafe("https://example.com/ok");
await fetchSafe("http://127.0.0.1/"); // throws HostfenceError
```

Depends on `github:hon900/hostfence#v1.2.0`.
