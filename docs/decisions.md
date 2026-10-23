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

**The evidence.** The suite of the island passes on the two versions: the
same two tests of the browser against the built output, the same assertions,
the same empty console of the browser.

| Version | `bun x playwright test` | `bun x playwright test -c playwright.stack.config.ts` | `bun run test` |
| --- | --- | --- | --- |
| `preact@10.29.8` | 2 passed | 2 passed | 17 pass |
| `preact@11.0.1` | 2 passed | 2 passed | 17 pass |

Neither `preact/compat` nor the preset of the Vite breaks with Preact 11:
the alias of `vite.config.ts` is the same, and the wrapper of the island of
HonoX hydrates the same way. The client is 2.3 kB smaller with Preact 11
(37.4 kB instead of 39.7 kB), because the runtime of the islands is smaller.

**The decision that follows.** The branch ends on `preact@11.0.1`: the plan
says to move once the tests pass on it, and they pass. The risk of the plan
— "Preact 11 breaks `preact/compat` or the Vite preset" — did not happen,
and the compatibility suite of the milestone 3 will say the same thing about
the two versions.

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

## D-010 — The scope of the caller is read with two credentials of Hub

**What the plan said.** "The console looks up the caller's principal
(`GET /v1/admin/users?email=` and match on `x-shuttle-user`) to learn their
tenant. It then asks `POST /v1/access-context` for their permission keys on
route `gantry`."

**What the build says.** The lookup needs a credential of the
administration, and the tenant of the caller is not known before the lookup:
the credential of the platform is the one that reads every tenant, and it
is the one of the first step. The keys are read with the credential of the
access context, which is a read only credential of its own. The credential
of the *scope* — the one that reads the data of the tenant — is chosen
afterwards: the credential of the platform for an operator of the platform,
the credential of the tenant of the caller for the others.

The consequence is worth writing down: **Gantry holds the credential of the
platform**, and it uses it for one thing only, the lookup of the principal
of the caller. Every other call of the administration of Hub is made with
the credential of the tenant of the caller, and Hub refuses a call that
goes beyond the tenant of its credential. The boundary is therefore held
twice: by the choice of the credential and by Hub itself.

**The evidence.** `test/contract/scope.test.ts`: a tenant operator sees the
principals of its own tenant and not the principal of the other tenant, and
the fake of Hub refuses the call of a credential of a tenant that names
another tenant. `test/browser/stack.browser.ts`: the same, against the real
Hub of the stack — the principal of the tenant `globex` is in Hub, and the
page of the operator of the tenant `acme` does not carry it.

## D-011 — The e-mail of the caller is needed to find its principal

**What the plan said.** The lookup is by e-mail, and the match is on
`x-shuttle-user`.

**What the build says.** Hub has no lookup of a principal by its id: the
administration reads the principals by tenant, by state and by e-mail. The
e-mail of the identity is therefore needed, and a caller without one has no
scope: it is refused with a `403`. The subject of the identity is the id of
the principal, and the match on `x-shuttle-user` is what says that the
principal of the lookup is the caller and not somebody else with the same
e-mail.

## D-012 — The stack of the development has two tenants and three principals

**What the plan said.** "Creates a tenant, principal and grant through
Hub's admin API, so a real browser login reaches Gantry."

**What the build says.** The gate of the milestone 1 is that a tenant
operator sees only its own tenant, and one tenant cannot show it. The
stack therefore has two tenants — `acme` and `globex` — and three
principals: Alice, an operator of the tenant of the stack, the operator,
an operator of the platform, and Bob, an operator of the other tenant.
Bob cannot log in through the gateway: a gateway has one client of Hub, so
it authenticates the principals of one tenant. His data is in Hub anyway,
and the page of Alice does not carry it: that is the gate.

The provider of the identity of the stack authenticates the next caller as
the subject of its url (`/as/<the subject>`), so a test may log a second
caller in.

## D-013 — The credentials of Hub are read again when their file changes

**What the plan said.** "Credentials ... live only in the server
environment, read through `*_FILE` variables."

**What the build says.** The file of a credential is read at every request
and it is read again when its modification time changes. A rotation of a
credential is a new content of a file, and a console that needs a restart
for it is a console that is down at the moment of the rotation.

## D-014 — The design tooling joins at the start of the milestone 1, and
`PRODUCT.md` is a draft

**What the plan said.** "Start of M1: `npx impeccable install
--providers=claude --scope=project`, then `/impeccable init` (answered by a
person)."

**What the build says.** The tooling is installed, and the telemetry is off
for everyone: `.impeccable/config.json` holds `"telemetry": false`. The
skills themselves (`.claude/`, `.pi/`) are **not** committed: they carry a
23 MB binary of the engine, and a teammate installs them with the command
of the plan.

The `init` of the plan is answered by a person, and it was not: `PRODUCT.md`
is written from the plan, which is the product context of the person who
wrote it, and every fact that the plan does not state is either marked as
an open question at the end of the file or left out. The four open
questions of the plan are the open questions of the file: the mockups are
not in the repository, the host of the console is not decided, the
availability of Prometheus is not decided, and the live updates are not
decided. **A person has to answer them before the screens of the
milestone 2 are shaped.**

`DESIGN.md` is the extraction of the system as it is at the end of the
milestone 1: the shell, the page of the scope and the tokens they use. The
screens of the status arrive in the milestone 2, and the document is written
again then.

## D-015 — The compose of the development runs the released images of Hub
and of Shuttle

**What the plan said.** "dev compose with Hub".

**What the build says.** The compose runs the images of the releases that
`compatibility.json` pins — `ghcr.io/ggpwnkthx/hub:1.0.1` and
`ghcr.io/ggpwnkthx/shuttle:1.3.0` — and not the sources of the clones: a
compose that builds two other repositories is a compose that needs two
other repositories. The image of Gantry is built from the repository, and
the fixtures of the stack (the provider of the identity and the
registration) run the scripts of the repository.

The compose is **not** exercised in the environment of the build: there is
no docker there. The same ground is covered by `bun run dev:stack`, which
runs the same three services with the same revisions, and which the tests
of the browser do run.

## D-016 — The numbers of the services come from the services themselves

**The question of the plan.** "Is Prometheus available in every deployment,
or should the console scrape `/metrics` itself as a fallback?"

**The decision.** The console reads the metrics of the replicas it probes,
and Prometheus is not needed in v1. The answer to the question of the plan
is therefore the second one: the console scrapes `/metrics` itself, and it
does it first and not as a fallback.

**Why.** The replicas are the services the console watches: the probes
already know them, and the metrics of a replica are the truth of that
replica. A deployment that has no Prometheus is a deployment whose console
still shows the state of the platform, and the console of an operator during
an outage is the one thing that must not be missing.

**What it costs.** The trends of the plan — a rate per minute, a chart over
an hour — are not the metrics of a service: they are a history, and the
history lives in Prometheus or in the store of the console. The tiles of
the milestone 2 are counters and gauges, and the counter that moves is read
again every fifteen seconds. The charts of the plan are a panel of the
milestone 2 that says what it needs, like the other panels that wait for a
change of a service.

**The evidence.** `test/contract/status.test.ts`: the numbers of a fake
gateway are on the page, and a fake Hub that is down is shown as an outage
and not as a number. `test/browser/stack.browser.ts`: the numbers of the
**real** gateway and of the **real** Hub of the stack are on the page, and
the replica of each of them is ready.

## D-017 — The route table and the replica revisions come with the
milestone 3

**What the plan said.** The v1 includes the read-only view of the route
table of Shuttle and of its replica revisions, and the plan says that the
replicas of Shuttle come from `shuttle-control`.

**What the build says.** `shuttle-control` is a service with its own
shared state (a Redis or a PostgreSQL), its own tokens and its own
scopes. Bringing it into the stack is the work of the milestone 3, which
the plan builds against the real `shuttle-control` of the pinned release
and not a stand-in. The milestone 2 therefore names the replicas of the
gateway by the environment (`GANTRY_SHUTTLE_REPLICAS`), the same way the
plan names the replicas of Hub (`GANTRY_HUB_REPLICAS`), and the route
table and the revisions arrive with the milestone 3.

## D-018 — The status needs the permission of the status, and the numbers of
the other tenants are for the platform

**What the plan said.** "On-call engineers get read-only status", and the
grant table gives `gantry.status` to the on-call group.

**The decision.** The status screens need the key `gantry.status`. The
numbers that break the traffic down by tenant — the decisions of Hub, which
carry the name of the tenant — are shown to the operators of the platform
only: a tenant operator reads the row of its own tenant and nothing else.

**Why.** The metrics of Hub are global: the endpoint of the metrics of a
replica holds the numbers of every tenant. A console that shows them to a
tenant operator shows the numbers of the other tenants, whatever the
credential of the console is. The rows are therefore removed from the
answer of the server, and the browser never receives them.

**The evidence.** `test/browser/stack.browser.ts`: the page of Hub of a
tenant operator holds the row of its own tenant and not the row of the
other tenant — and the other tenant has traffic in the stack, so the row
exists. The page of the operator of the platform holds both rows.

## D-019 — A panel that waits for a change says which service and which
version

**What the plan said.** "Until a dependency lands, its panel renders a
clear 'needs Shuttle x.y' or 'needs Hub x.y' state instead of failing or
showing made-up numbers."

**What the build says.** The panels that wait say it, and they say what
they will show when they are there: "the upstreams — needs Shuttle 1.4.0:
the failures of every upstream, one row per upstream: the label of the
upstream is needed". The versions are the next releases of the two
services, and they are the versions that carry the changes of the plan.

**The evidence.** `test/contract/status.test.ts`: the page of the gateway
holds `needs Shuttle 1.4.0` and the page of Hub holds `needs Hub 1.0.2`.

## D-020 — The island reads the status every fifteen seconds, and the
server reads the services

**What the plan said.** "Islands then refresh through same-origin `/api/*`
endpoints every 15 seconds, so no credential or upstream address ever
reaches the browser."

**What the build says.** It is what the build does. The island of the
status reads `/api/shuttle/status` and `/api/hub/status` every fifteen
seconds, and the interval is a setting of the server
(`GANTRY_STATUS_REFRESH_MS`) so that a test may read it faster. The
endpoints need the identity and the scope of the caller like every other
route, and the address of a replica and the token of its metrics never
reach the browser: the browser receives numbers.

**The evidence.** `test/browser/island.browser.ts`: the number of the
requests of the fake gateway moves while the page is open, and the console
of the browser stays empty.

## D-021 — The audit of the screens of the milestone 2

**What the plan said.** "After each M2 screen: `/impeccable critique`,
`/impeccable audit`. Review hierarchy and clarity, accessibility, and
layout at 390 px."

**What the audit said.** The screens were looked at, at 390 px and at 1280
px, and the detector of the tooling was run on the sources.

- The tiles had a thick coloured border on one side: the detector calls it
  "the most recognizable tell of AI-generated UIs", and it was right. The
  state of a tile is now the colour of the number and a word — "healthy",
  "degraded", "broken" — because a state is a word and a colour, and never
  a colour alone.
- The numbers of a table were stretched over the whole width of a wide
  screen, which is the opposite of a column that is read down. The tables
  are bounded and the last column, the one of the numbers, is right
  aligned.
- The tiles of a phone were one per row and the page was a long scroll: two
  per row, and the page is read in one screen and a half.
- The duration of the decisions was shown as the number "1" with no unit: it
  is a number of seconds, and it says so.

The detector is clean on the sources of the milestone 2.
