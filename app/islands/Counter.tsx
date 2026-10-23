/**
 * The counter of the spike.
 *
 * The island holds a state of the browser and a child that the server
 * passed as a prop. The child is in a `template` of the markup of the island
 * and the client reads it back before it hydrates.
 */
import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'

export function Counter(props: { label: string; children?: ComponentChildren }) {
  const [count, setCount] = useState(0)
  return (
    <div class="counter">
      <button id="counter" type="button" onClick={() => setCount((value) => value + 1)}>
        {props.label}: {count}
      </button>
      <div id="slot">{props.children}</div>
    </div>
  )
}
