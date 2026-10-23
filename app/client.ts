import { createClient } from 'honox/client'
import { type ComponentChildren, h, hydrate, type VNode } from 'preact'

/**
 * The entry of the client.
 *
 * HonoX finds the islands in the markup of the page and hydrates them. The
 * renderer of Preact is not the one of HonoX: the island is hydrated with
 * `hydrate` of Preact, and the elements of the children are built with `h`.
 *
 * The children of an island are read from the `template` elements of the
 * markup of the island, so `createChildren` builds them with Preact as
 * well. The runtime of HonoX is not used: it renders with `hono/jsx/dom`,
 * and the client of Gantry is Preact only.
 */
const createElement = (type: unknown, props: unknown): Node =>
  h(type as never, props as never) as unknown as Node

const createChildren = async (childNodes: NodeListOf<ChildNode>): Promise<Node[]> => {
  const children: ComponentChildren[] = []
  for (const node of Array.from(childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      children.push(node.textContent ?? '')
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as Element
    const attributes: Record<string, string> = {}
    for (const attribute of Array.from(element.attributes)) {
      attributes[attribute.name] = attribute.value
    }
    children.push(
      h(element.tagName.toLowerCase() as never, {
        ...attributes,
        children: await createChildren(element.childNodes),
      }) as unknown as Node
    )
  }
  return children as unknown as Node[]
}

await createClient({
  hydrate: async (element, parent) => {
    hydrate(element as unknown as VNode, parent)
  },
  createElement,
  createChildren,
})
