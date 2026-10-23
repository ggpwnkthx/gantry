import type { Context } from 'hono'
import { Counter } from '../islands/Counter'

/**
 * The one page of the spike.
 *
 * The page is rendered on the server and it holds one island: a counter with
 * a child that is passed as a prop. The island proves that the state of the
 * browser and the children of the server agree.
 */
export default function Home(c: Context) {
  const identity = c.get('identity')
  return (
    <section>
      <h1>Gantry</h1>
      <p id="identity">the caller is {identity.subject}</p>
      <Counter label="clicks">
        <span id="slot-child">the child of the island</span>
      </Counter>
    </section>
  )
}
