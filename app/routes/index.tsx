import type { Context } from 'hono'

/**
 * The first page of Gantry.
 *
 * The page is the status of the gateway: the reader comes for the state
 * of the platform, and the state of the platform is the first thing the
 * console shows.
 */
export default function Home(c: Context) {
  return c.redirect('/shuttle')
}

/**
 * The methods of the route of the administration.
 *
 * The administration of Gantry is the milestone 3: the route exists, and
 * it says that it is not there yet. The check of the identity and the
 * check of the scope come first: a request without them is refused with a
 * `401` or a `403` and not with a `405`.
 */
const notImplemented = async (c: Context) =>
  c.json(
    {
      error: 'not_implemented',
      message: 'the administration of Gantry arrives in the milestone 3',
    },
    405
  )

export const POST = [notImplemented]
export const PUT = [notImplemented]
export const DELETE = [notImplemented]
