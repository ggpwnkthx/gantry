import { createApp } from 'honox/server'
import * as apiHubStatus from '../../app/routes/api/hub/status'
import * as apiShuttleStatus from '../../app/routes/api/shuttle/status'
import * as healthz from '../../app/routes/healthz'
import * as hub from '../../app/routes/hub/index'
import * as index from '../../app/routes/index'
import * as middleware from '../../app/routes/_middleware'
import * as renderer from '../../app/routes/_renderer'
import * as readyz from '../../app/routes/readyz'
import * as shuttle from '../../app/routes/shuttle/index'

/**
 * The application of the tests.
 *
 * HonoX finds the routes with `import.meta.glob`, which is a feature of
 * Vite: the tests of `bun test` name the routes themselves, so the
 * application is the same one as the one of the server.
 */
export function createTestApp() {
  return createApp({
    root: '/app/routes',
    NOT_FOUND: {},
    ERROR: {},
    RENDERER: { '/app/routes/_renderer.tsx': renderer },
    MIDDLEWARE: { '/app/routes/_middleware.ts': middleware },
    ROUTES: {
      '/app/routes/healthz.ts': healthz,
      '/app/routes/hub/index.tsx': hub,
      '/app/routes/index.tsx': index,
      '/app/routes/readyz.ts': readyz,
      '/app/routes/shuttle/index.tsx': shuttle,
      '/app/routes/api/hub/status.ts': apiHubStatus,
      '/app/routes/api/shuttle/status.ts': apiShuttleStatus,
    },
  })
}
