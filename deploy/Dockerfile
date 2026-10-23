# syntax=docker/dockerfile:1

# The image of Gantry.
#
# The image holds the built server and nothing else: no source, no
# development dependency and no secret. The base image is pinned by
# digest: a tag is a name that moves, and the image of a release has to be
# the image that was built and scanned.
ARG BUN_VERSION=1.4.3
ARG BUN_DIGEST=sha256:629e17411f1f129dbec3af78d5af9c9f2a937435c80349437206c6b0b7422373
ARG VERSION=0.1.0
ARG REVISION=unknown

# ------------------------------------------------------------------- build
#
# The build of the client and the build of the server. The two builds are
# the ones of the deployment: `vite build --mode client` writes the files
# of the browser and `vite build` writes the server.
FROM oven/bun:${BUN_VERSION}-alpine@${BUN_DIGEST} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ----------------------------------------------------------------- runtime
#
# The image of the service. It holds the output of the build and nothing
# else, and it runs as a user that is not root.
FROM oven/bun:${BUN_VERSION}-alpine@${BUN_DIGEST} AS runtime
WORKDIR /app

ARG VERSION
ARG REVISION
LABEL org.opencontainers.image.title="gantry" \
      org.opencontainers.image.description="The operator console of the Shuttle gateway and the Hub access service." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.source="https://github.com/ggpwnkthx/gantry" \
      org.opencontainers.image.licenses="MIT"

ENV GANTRY_PORT=3000
COPY --from=build /app/dist ./

# The service runs as a user that is not root: a container that is root on
# the host of the container is root on the host.
USER bun
EXPOSE 3000

# The probe of the process. The readiness of the deployment asks the
# service itself, and the service reads its own configuration.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["bun", "index.js"]
