import type { ComponentChildren } from 'preact'
import { CLIENT_SCRIPT, CLIENT_STYLE } from '../server/assets'
import type { ResolvedOperator } from '../server/operator'

/**
 * The shell of every page.
 *
 * The page is rendered on the server: the only script of the page is the
 * entry of the client, which hydrates the islands. The header of the shell
 * says who the caller is: the reader of an outage has to know whose
 * numbers they are reading.
 */
export function Layout(props: {
  title?: string
  children?: ComponentChildren
  operator?: ResolvedOperator
}) {
  const operator = props.operator
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title ?? 'Gantry'}</title>
        <link rel="stylesheet" href={CLIENT_STYLE} />
      </head>
      <body>
        <header>
          <nav>
            <a href="/shuttle">the gateway</a>
            <a href="/hub">Hub</a>
          </nav>
          {operator ? (
            <p id="scope-header">
              {operator.scope.platform ? 'the platform' : operator.scope.tenantSlug} —{' '}
              {operator.scope.permissionKeys.join(', ')}
            </p>
          ) : null}
        </header>
        <main>{props.children}</main>
        <script type="module" src={CLIENT_SCRIPT} />
      </body>
    </html>
  )
}
