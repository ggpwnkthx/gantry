import { createApp } from 'honox/server'
import * as healthz from '../../app/routes/healthz'
import * as index from '../../app/routes/index'
import * as middleware from '../../app/routes/_middleware'
import * as renderer from '../../app/routes/_renderer'
import * as readyz from '../../app/routes/readyz'

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
      '/app/routes/index.tsx': index,
      '/app/routes/readyz.ts': readyz,
    },
  })
}
