import type {} from 'hono'

/**
 * The renderer of Gantry.
 *
 * HonoX renders the page with the renderer that the route sets, and the
 * renderer of HonoX is the one of `hono/jsx`. Gantry renders with Preact,
 * so the renderer of the context is the one of Gantry: it receives the tree
 * of the page and the properties of the route.
 */
declare module 'hono' {
  interface ContextRenderer {
    (content: unknown, head?: { title?: string }): Response | Promise<Response>
  }
}
