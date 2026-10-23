# The decisions of Gantry

Every decision has its evidence: the command that was run and what it said.
The decisions of the plan itself are in [plan.md](plan.md); this file holds
the decisions that the plan left open and the ones where the build said
something else than the plan.

## D-001 — Preact renders the pages: go

**The decision.** HonoX renders every page on the server and Preact renders
the trees, the islands included. The plan calls this the largest risk of the
build, and Milestone 0 exists to retire it.

**The evidence.**

- `bun run build && bun run start` serves `/`, and the island hydrates in the
  output of the build: `bun x playwright test` says `2 passed`
  (`test/browser/island.browser.ts`).
- The island keeps the child that the server passed as a prop: the test clicks
  the counter, reads `clicks: 1` and reads `#slot-child`.
- The console of the browser is empty: the test fails when the browser writes
  anything, so there is no warning of hydration.
- The client carries 39.7 kB and none of it is the code of the server:
  `bun run scripts/check-client-bundle.ts` refuses the build when the files of
  the client carry the verifier of the identity, the reading of the
  environment or a library of the server.

**What the plan did not say.** The island wrapper of HonoX imports its JSX
runtime from the source of the react api, so the wrapper of `preact/compat`
asks for `preact/compat/jsx-runtime`, and Preact keeps the runtime of the
JSX in `preact/jsx-runtime`. Without the alias of `vite.config.ts` the build
of the client fails. The wrapper also needs `preact/compat` and not `preact`:
`useContext` lives in `preact/hooks`, and the wrapper of HonoX imports it
from the source of the react api.

**The cost.** The entry of the client of HonoX imports `hono/jsx/dom`, and
the runtime of HonoX imports it again: 17.5 kB of the client are the
renderer of the DOM of HonoX, and Gantry does not use them, because it gives
its own `hydrate`, its own `createElement` and its own `createChildren` to
`createClient`. The code is not the code of the server, and the plan does
not forbid it, but a client that writes its own runtime would be 17.5 kB
smaller. It is a decision for Milestone 1.

## D-002 — The version of Preact: 10.29.8 first, 11.0.1 in its own change

**The decision.** The plan starts on Preact 10 and moves to Preact 11 in its
own change, once the tests of Milestone 0 pass on it. The spike starts on
10.29.8; the move is the next commit of the branch.

**The evidence.** The suite of the island — the tests of the browser against
the built output — passes on 10.29.8 and on 11.0.1: the same two tests, the
same assertions, the same empty console. The result of the move is in the
commit that makes it.

## D-003 — The access context of Hub refuses an empty `workspaceId`

**The question of the plan.** "Does `POST /v1/access-context` accept an
`workspaceId: ""` for a route-only question?"

**The answer.** No. The field is required and it has to be a string that is
not empty. The question is asked against the real Hub of the stack, with the
revision that `compatibility.json` pins (`ccbcaa468ed66e336fbfe6d10a4196cbcb1b05ec`,
v1.0.1). The script of the stack writes the question and its answer in
`.deps/access-context-answer.json`.

The request:

```http
POST /v1/access-context HTTP/1.1
authorization: Bearer <the access context token of the stack>
content-type: application/json

{"version":1,"subject":"02d81ebf-c72d-4421-9e35-4cab85143a99","tenantId":"6e88a940-4d9d-47c1-b419-0bb2db0523d8","workspaceId":"","routeId":"gantry"}
```

The answer:

```json
{"error":"bad_request","message":"the field \"workspaceId\" is required and it is a string"}
```

The status is `400`.

**What a route-only question can ask.** The field is not a uuid — only
`subject` and `tenantId` are — so a question about a route alone asks with a
placeholder that no workspace holds. The same question with
`"workspaceId":"gantry"` is answered:

```json
{"version":1,"allow":true,"subject":"02d81ebf-c72d-4421-9e35-4cab85143a99","tenantId":"6e88a940-4d9d-47c1-b419-0bb2db0523d8","workspaceId":"gantry","routeId":"gantry","permissionKeys":["gantry.status"],"evaluatedAt":"2026-10-23T18:39:50.389Z","validUntil":"2026-10-23T18:39:55.389Z"}
```

The keys are the keys of the grants that apply to the request: a grant
without a workspace applies to every workspace, so the placeholder keeps the
grants of the route. A grant of a workspace does not apply to the
placeholder, and a question about a route alone therefore reads the grants of
the route, not the grants of a workspace. Gantry asks for the route, with the
name of the tenant as the placeholder, and it reads the keys it needs.

## D-004 — The renderer of the context is the one of Gantry

**What the plan said.** "`app/routes/_renderer.tsx`: a small middleware that
calls `c.setRenderer` and returns `c.html(...)`."

**What the build says.** HonoX calls the renderer of the context with the
tree of the page and the properties of the route: `c.render(content, head)`.
The renderer of HonoX is the one of `hono/jsx`, and it reads
`props.children`; the renderer of Gantry reads the tree itself. The
signature of the renderer is declared in `app/global.d.ts`, the way the
documentation of HonoX says, and the renderer of `app/routes/_renderer.tsx`
renders the tree with `preact-render-to-string`.

## D-005 — The names of the files of the client are fixed

**What the plan said.** The client is built with `vite build --mode client`,
and the renderer of the server writes the script of the page.

**What the build says.** The manifest of the build of HonoX names the files
with a hash, so the renderer of the server would have to read the manifest.
The build of the client writes the entry and the style sheet with fixed
names (`static/client.js` and `static/style.css`), and the renderer names
them. The plan does not say how the renderer finds the files; this is how.

## D-006 — The identity of the upstream is the header `x-forwarded-host`

**What the plan said.** "`_middleware.ts` verifies `x-shuttle-signature` with
the deployment's public key".

**What the build says.** The signature covers the host the caller used, and
Shuttle writes it in the header `x-forwarded-host`. The upstream rebuilds the
payload of the signature with that header, and a request that does not carry
it cannot be verified: it is refused with a `401`. The path and the query
string are the ones the upstream receives, and the method is the one of the
request.

## D-007 — The stack of the development has a provider of its own

**What the plan said.** The stack of the development has Shuttle and Hub, and
Hub authenticates a caller against the provider of a tenant.

**What the build says.** A tenant of Hub needs a provider, and there is no
provider on the machine of a developer. The script of the stack starts a
small OpenID Connect provider of its own (`scripts/idp.ts`), Hub is
registered against it, and the browser logs in at it. The provider is a
fixture of the stack: it never leaves the machine.

**What the stack does not start.** `shuttle-control` is not started: the plan
needs it in Milestone 3, and the spike does not touch the route table of
Shuttle.

## D-008 — The environment of the server is read with `env(c)`

**What the plan said.** "Read configuration with `env(c)` from
`hono/adapter`, not `process.env`, which Vite replaces with an empty object
at build time."

**What the build says.** It is true, and the reason is worth keeping: the
build of the server replaces `process.env` with an empty object, so a server
that reads `process.env` reads nothing. The middleware reads the
environment with `env(c)` and the settings are validated with `zod`, as the
plan says for every other input.

## D-009 — The identity of the request is checked in a middleware, and the
probes are exempt

**What the plan said.** "A request without a valid signature gets `401`", and
the deployment has `GET /healthz` and `GET /readyz`.

**What the build says.** The probes of the deployment have to answer while
Hub is down and while Shuttle is down, so they are the two paths that the
middleware of the identity lets through. The readiness reads the public key
of Shuttle and answers `503` when it cannot: a Gantry that cannot verify an
identity is not ready.
