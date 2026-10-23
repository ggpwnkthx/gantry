import type { ComponentChildren } from 'preact'
import { CLIENT_SCRIPT, CLIENT_STYLE } from '../server/assets'

/**
 * The shell of every page.
 *
 * The page is rendered on the server: the only script of the page is the
 * entry of the client, which hydrates the islands.
 */
export function Layout(props: { title?: string; children?: ComponentChildren }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title ?? 'Gantry'}</title>
        <link rel="stylesheet" href={CLIENT_STYLE} />
      </head>
      <body>
        <main>{props.children}</main>
        <script type="module" src={CLIENT_SCRIPT} />
      </body>
    </html>
  )
}
