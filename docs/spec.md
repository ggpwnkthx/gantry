# Gantry — the specification

This document is the normative behavior of Gantry: what the service does,
what it refuses, and what an operator may expect. The build plan is the
scope and the architecture ([plan.md](plan.md)); the decisions of the build
are in [decisions.md](decisions.md).

The keywords **must**, **must not** and **may** are the ones of a
specification.

## 1. The identity of a request

Gantry is an upstream of Shuttle. Shuttle signs the identity of every
request it forwards, and Gantry verifies the signature with the public key
of the deployment.

1.1. Gantry **must** accept a request only when the header
`x-shuttle-signature` carries a valid signature of the version `v5`, signed
with the algorithm `ES256` and verified with the public key of the
deployment, a key of the curve P-256.

1.2. Gantry **must not** accept a signature of another version, of another
algorithm or of another curve, and it **must not** fall back from one
version to another. The version `v4` is refused like any other unknown
version.

1.3. The signature covers the request: the method, the path, the query
string, the host and the identity headers. A request whose headers, path,
query string or host differ from the ones that were signed **must** be
refused.

1.4. The host of the signature is the value of the header
`x-forwarded-host`, which is the host the caller used. A request that
carries no such header cannot be verified and **must** be refused.

1.5. A request without a valid signature **must** be answered with a `401`.
Gantry **must not** answer such a request with a page, and it **must not**
act as anyone.

1.6. The paths `/healthz` and `/readyz` are exempt from the check of the
identity. They are the probes of the deployment, and they have to answer
while Shuttle is down.

## 2. The scope of the caller

The scope of a caller says what the caller may do inside Gantry. Gantry
**must** read it from Hub, and **must not** take it from a header, from a
cookie or from anything else.

2.1. Gantry **must** read the principal of the caller in Hub with the
credential of the platform, and it **must** match the principal on the
subject of the identity. A caller that is not a principal of a tenant of
the platform **must** be refused with a `403`.

2.2. Gantry **must** read the permission keys of the caller for the route
`gantry` with the credential of the access context of Hub. The question
carries a `workspaceId` that is not empty: Hub refuses an empty one, and
the field is not a uuid, so the question about a route alone carries the
name of the tenant as a placeholder.

2.3. The key `gantry.platform` means that the caller is an operator of the
platform. Every other caller is scoped to its own tenant.

2.4. Gantry **must** choose the credential of the administration of Hub
with the scope: the credential of the platform for an operator of the
platform, the credential of the tenant of the caller for the others. A
caller whose tenant has no credential **must** be refused with a `403`.

2.5. Gantry **must** keep the scope of a caller no longer than the
`validUntil` of the answer of Hub, which is at most five seconds. A
revocation of a grant **must** therefore be seen in at most five seconds.

2.6. A caller without a scope **must** be answered with a `403`. A caller
without an identity **must** be answered with a `401`.

2.7. The data of a tenant **must** be read with the credential of that
tenant. A tenant operator therefore sees the data of its own tenant and
nothing else, and the boundary is held by Hub as well.

## 3. The routes

3.1. The route `gantry` of the table of Shuttle forwards the `GET` to
Gantry. The route `gantry-admin` forwards the `POST`, the `PUT` and the
`DELETE`. Both use `auth.mode: session`, `accessCheck: true`,
`crossSite: strict` and `forwardAuthorization: false`, so Hub decides, per
request, whether the caller may use the route.

3.2. The page of Gantry **must** show the subject of the caller, the tenant
of the caller, the permission keys of the caller and the scope of the
caller.

3.3. A tenant operator **must** see the principals of its own tenant and
**must not** see the principals of another tenant.

3.4. The methods of the route of the administration **must** be refused
with a `405` until the administration of Gantry exists. The check of the
identity and the check of the scope come first: a request without them is
refused with a `401` or a `403` and not with a `405`.

## 4. The status of the services

4.1. The console **must** show the state of the gateway and the state of
Hub: the numbers of the services, the state of their replicas, and the
panels that a service does not carry yet.

4.2. The numbers **must** come from the services themselves: the metrics
of the replicas that the console probes, and the readiness of the same
replicas. A number that the console cannot read **must not** be invented:
the screen says that the source is missing.

4.3. A panel that waits for a change of a service **must** say which
service and which version carry it, and what it will show. The console
**must not** show a number it does not have.

4.4. The status screens **must** need the permission `gantry.status`.

4.5. The numbers that break the traffic down by tenant **must** be shown
to the operators of the platform only. A tenant operator **must not**
receive the numbers of another tenant, in the page and in the answers of
the api.

4.6. The island of the status **must** read the status again every fifteen
seconds, through the same origin of Gantry, and the answers of the api
**must** need the identity and the scope of the caller like every other
route.

## 5. The probes

4.1. `GET /healthz` **must** answer `200` as long as the process is alive.
It **must not** depend on Hub and **must not** depend on Shuttle.

4.2. `GET /readyz` **must** answer `200` when the configuration is loaded
and the public key of the identity is parsed, and `503` otherwise. It
**must not** depend on Hub: a Hub outage **must not** pull Gantry out of
the rotation.

## 6. The environment

The configuration is read from the environment of the process, and never
from `process.env` in the code: the build replaces `process.env` with an
empty object.

| Variable | Holds |
| --- | --- |
| `GANTRY_PORT` | the port of the listener, `3000` by default |
| `GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY_FILE` | the file of the public key of Shuttle (P-256) |
| `GANTRY_SHUTTLE_IDENTITY_PUBLIC_KEY` | the public key of Shuttle, when it is not in a file |
| `GANTRY_HUB_URL` | the address of Hub |
| `GANTRY_HUB_ADMIN_TOKENS_FILE` | the file of the map of the credentials of the administration: the slug of a tenant, or `*` for the platform, to the credential |
| `GANTRY_HUB_ACCESS_CONTEXT_TOKEN_FILE` | the file of the credential of the access context |
| `GANTRY_SHUTTLE_REPLICAS` | the addresses of the replicas of the gateway, separated by commas |
| `GANTRY_HUB_REPLICAS` | the addresses of the replicas of Hub, separated by commas |
| `GANTRY_SHUTTLE_METRICS_TOKEN_FILE` | the file of the token of the metrics of the gateway |
| `GANTRY_HUB_METRICS_TOKEN_FILE` | the file of the token of the metrics of Hub |
| `GANTRY_STATUS_REFRESH_MS` | the interval of the refresh of the islands, `15000` by default |

5.1. A credential **must** live in a file and **must not** reach the
browser, a log line or an error page.

5.2. The file of a credential **must** be read again when it changes: a
rotation of a credential **must not** need a restart of Gantry.

## 7. The rules of the browser

6.1. The browser **must** talk to one origin: the gateway. The islands
**must** call only the same-origin endpoints of Gantry, and **must not**
call Hub, `shuttle-control` or Prometheus.

6.2. The server code **must not** be in the client bundle. The check of
the bundle is part of the build.

6.3. Every page **must** be rendered on the server. The browser carries
the islands and nothing else.

## 8. The deployment

7.1. The image of Gantry **must** hold the output of the build and nothing
else, **must** run as a user that is not `root`, and **must** have its
base image pinned by digest.

7.2. The route table of Shuttle **must** name the two routes of Gantry,
and both of them **must** be in `SHUTTLE_PROTECTED_ROUTES` of
`shuttle-control`: no write of the route table may remove or change them.

7.3. The grants of Hub **must** be applied with the administration of Hub:
`gantry.status` on the route `gantry`, `gantry.admin` on the two routes and
`gantry.platform` on the two routes.
