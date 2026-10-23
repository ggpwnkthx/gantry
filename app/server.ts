import { createApp } from 'honox/server'

/**
 * The entry of the server.
 *
 * HonoX finds the routes, the renderer and the middleware in `app/routes/`
 * and mounts them on this application.
 */
const app = createApp()

export default app
