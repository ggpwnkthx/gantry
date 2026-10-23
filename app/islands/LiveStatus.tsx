import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { ServiceStatus } from '../types'

/**
 * The live status of a service.
 *
 * The island is the part of the page that the browser owns: it reads the
 * status of the service again, every fifteen seconds, through the same
 * origin of Gantry. The credential of the metrics and the address of the
 * replicas never reach the browser: the island reads numbers, and the
 * server reads the services.
 */

/** The interval of the refresh, in milliseconds. */
export const REFRESH_MS = 15_000

/** The words of the states. A state is a word and a colour, never a
 * colour alone. */
const STATES: Record<string, string> = {
  ok: 'healthy',
  warn: 'degraded',
  error: 'broken',
}

/** The props of the island. */
export interface LiveStatusProps {
  /** The service of the status. */
  service: 'shuttle' | 'hub'
  /** The status of the first answer of the server. */
  initial: ServiceStatus
  /** The child of the server, under the numbers. */
  children?: ComponentChildren
  /** The interval of the refresh, in milliseconds. */
  refreshMs?: number
}

/** The island of the live status. */
export function LiveStatus(props: LiveStatusProps) {
  const [status, setStatus] = useState<ServiceStatus>(props.initial)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/${props.service}/status`, {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) throw new Error(`the status answered ${response.status}`)
        const next = (await response.json()) as ServiceStatus
        if (!alive) return
        setStatus(next)
        setFailed(false)
      } catch {
        if (alive) setFailed(true)
      }
    }
    const timer = setInterval(() => void refresh(), props.refreshMs ?? REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [props.service, props.refreshMs])

  const ready = status.replicas.filter((replica) => replica.state === 'ready').length

  return (
    <div class="status">
      <p class="status-source" id="source">
        {status.source.ok
          ? `the numbers of ${status.source.replicas} replica(s), read ${new Date(status.at).toLocaleTimeString()}`
          : `the numbers are not there: ${status.source.reason ?? 'there is no source'}`}
        {failed ? ' — the last refresh failed' : ''}
      </p>

      {status.replicas.length > 0 ? (
        <table id="replicas">
          <caption>the replicas</caption>
          <thead>
            <tr>
              <th>the replica</th>
              <th>the state</th>
              <th>the time of the answer</th>
            </tr>
          </thead>
          <tbody>
            {status.replicas.map((replica) => (
              <tr key={replica.address}>
                <td>{replica.address}</td>
                <td class={`state state-${replica.state}`}>{replica.state}</td>
                <td>{replica.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div class="tiles" id="tiles">
        {status.tiles.map((tile) => (
          <div class={`tile tile-${tile.state ?? 'plain'}`} data-tile={tile.label} key={tile.label}>
            <span class={`tile-value tile-value-${tile.state ?? 'plain'}`}>
              {tile.value}
              {tile.unit === 'seconds' ? ' s' : ''}
            </span>
            <span class="tile-label">{tile.label}</span>
            {tile.state ? (
              <span class={`tile-state tile-state-${tile.state}`}>{STATES[tile.state]}</span>
            ) : null}
          </div>
        ))}
      </div>

      {status.breakdowns.map((breakdown) => (
        <table key={breakdown.label}>
          <caption>{breakdown.label}</caption>
          <thead>
            <tr>
              <th>the key</th>
              <th>the value</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.rows.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>
                  {row.value}
                  {row.unit === 'seconds' ? ' s' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {status.pending.length > 0 ? (
        <div class="pending" id="pending">
          <h2>the panels that are not there yet</h2>
          <ul>
            {status.pending.map((panel) => (
              <li key={panel.label}>
                <strong>{panel.label}</strong> — needs {panel.needs}: {panel.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p class="status-summary">
        {ready} of {status.replicas.length} replicas are ready.
      </p>
      <div id="slot">{props.children}</div>
    </div>
  )
}
