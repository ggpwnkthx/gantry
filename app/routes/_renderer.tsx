import type { Context, Next } from 'hono'
import type { ComponentChildren } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { Layout } from '../components/Layout'

/**
 * The renderer of the pages.
 *
 * HonoX has no renderer for Preact: it renders the page with the renderer
 * that the route sets, so this middleware sets one that renders the tree of
 * Preact with `preact-render-to-string`.
 *
 * The renderer of `@hono/react-renderer` has no Preact equivalent on npm,
 * which is the reason this file exists.
 */
export default async function renderer(c: Context, next: Next) {
  c.setRenderer((content, head) => {
    const children = content as ComponentChildren
    const title = head?.title
    return c.html(`<!doctype html>${renderToString(<Layout title={title}>{children}</Layout>)}`)
  })
  await next()
}
