# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Platform operators** — they hold the permission `gantry.platform` and
  they see every tenant of the platform. They are the ones who answer
  "which tenant is affected?" when something is wrong.
- **Tenant operators** — they hold the permission `gantry.admin` inside one
  tenant, and they see that tenant and nothing else. They are the ones who
  run the administrative tasks of their own tenant.
- **On-call engineers** — they hold the permission `gantry.status` and they
  look at the status. They are usually reading during an incident, often at
  night, and they are on a phone more often than an operator is.

## Product Purpose

Gantry is the operator console of the Shuttle gateway and the Hub access
service: one web app that shows the live status of both and lets operators
run the administrative tasks of Hub.

It runs as an ordinary upstream behind Shuttle. The browser talks only to
Shuttle, Shuttle handles the login (through Hub) and the access check, and
Gantry never sees a password and holds no session of its own. Everything the
browser shows is read live from Hub, `shuttle-control`, Prometheus and the
replicas; Gantry keeps no database.

Success is an operator who reaches the right answer during an incident
without leaving the console, and an operator who changes a tenant without
touching a shell.

## Positioning

Gantry is the only place where the decision of the platform and the state of
the platform are read together. The gateway and the access service are two
systems with two contracts, and an operator has to hold both in their head;
Gantry holds them together and shows the scope of the caller while it does
it.

## Operating Context

- The console is read **during an outage**. The reader is under pressure,
  the screen is not in focus, and the answer they need is usually a number
  and a state.
- The work is dense: a route table, a list of tenants, a log of decisions.
  The screen holds tables, not cards.
- The reader is often on a phone, and the screen is often read in a dark
  room.
- The reader is a person who already knows the domain: the vocabulary of
  Shuttle and of Hub is the vocabulary of the console.

## Capabilities and Constraints

- The scope of the reader is decided by Hub, never by the console. A tenant
  operator sees one tenant; the console asks Hub for the permission keys of
  the caller and it holds the credential of that tenant and no other.
- The console is behind Shuttle. The browser talks only to Shuttle, and
  every call of the console to Hub, `shuttle-control` or Prometheus happens
  on the server.
- No secret, no credential and no upstream address ever reaches the
  browser. The islands call only the same-origin `/api/*` endpoints.
- The pages are rendered on the server; the browser carries the islands and
  nothing else.
- **Decided:** the status of the console is read from live data, and the
  islands refresh every 15 seconds.
- **Not decided:** whether Prometheus is deployed everywhere, or whether the
  console scrapes `/metrics` itself as a fallback. The plan leaves the
  question open.

## Brand Commitments

- The name is **Gantry**. It is the name of the app, of the routes
  (`gantry`, `gantry-admin`), of the permissions (`gantry.status`,
  `gantry.admin`, `gantry.platform`) and of the environment (`GANTRY_*`).
- The console stays **quiet**. Colour means status and nothing else: a
  colour that is not a status is a colour that lies.
- The voice is plain and technical. The reader is an operator; the console
  does not explain what a route table is.

## Evidence on Hand

- The build plan ([docs/plan.md](docs/plan.md)) — the scope, the
  architecture, the security model and the milestones.
- The decisions of the build ([docs/decisions.md](docs/decisions.md)) — what
  the build proved, with its evidence.
- The mockups of the status screens are **not** in the repository. The
  screens of the milestone 2 are built from the panels of the plan, and the
  mockups have to be found before they are built.

## Product Principles

1. **The scope is the truth.** The console shows only what the caller may
   see, and it never widens the scope to be helpful.
2. **The answer is live or it is nothing.** A number that is five minutes
   old is a number that is wrong during an incident.
3. **Density over decoration.** An operator reads a table; every pixel that
   is not information is a pixel that costs a second.
4. **The credential stays on the server.** The browser talks to one origin,
   and the console holds the credentials of Hub.
5. **A quiet console is a readable console.** Colour, motion and emphasis
   are reserved for the state of the system.

## Accessibility & Inclusion

- The console is read at 390 px wide and with a keyboard: the plan makes
  both part of the browser suite.
- The colour of a status is never the only sign of it: a state is a word
  and a colour.
- The reader may be tired, in a dark room, or in a hurry: the contrast and
  the size of the type are not a matter of taste.

## Open questions for the person who owns the product

These are the questions of the plan that a person has to answer. They are
written down here so that nobody has to guess them later.

- The mockups of the status screens are not in the repository. Where are
  they?
- Which host does the console live on: its own (`admin.example.com`) or a
  path on an existing host?
- Is Prometheus deployed in every environment, or does the console scrape
  `/metrics` itself as a fallback?
- Live updates: polling every 15 seconds, or server-sent events (Shuttle
  already streams them) from the start?
