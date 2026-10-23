import { useState } from 'preact/hooks'

/**
 * The route table of the deployment and its history.
 *
 * The island shows the table that is active, the revisions that came
 * before it, and the rollback of the table to a revision. The rollback is
 * a write of the deployment: it asks twice, and it needs the permission of
 * the platform.
 */

/** A revision of the route table. */
export interface Revision {
  /** The number of the revision. */
  revision: number
  /** The person who wrote it, when the table says. */
  author?: string
  /** The moment of the revision. */
  createdAt?: string
  /** The routes of the revision. */
  routes: Array<{ id: string; methods: string[]; upstream: string }>
}

/** The props of the island. */
export interface RouteTableProps {
  /** The revision that is active. */
  active: number
  /** The revisions of the history, the newest first. */
  revisions: Revision[]
  /** True when the caller may roll the table back. */
  mayRollback: boolean
  /** The routes of the table that is active. */
  activeRoutes: Array<{ id: string; methods: string[]; upstream: string }>
}

/** The route table of the deployment and its history. */
export function RouteTable(props: RouteTableProps) {
  const [confirming, setConfirming] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rollback = async (revision: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.set('revision', String(revision))
      body.set('expectedRevision', String(props.active))
      const response = await fetch('/api/ops/rollback', {
        method: 'POST',
        body,
      })
      const text = await response.text()
      if (!response.ok) {
        setError(text)
        return
      }
      location.reload()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  return (
    <div class="route-table" id="route-table">
      <h2>the route table</h2>
      <p>the revision that is active is the revision {props.active}.</p>
      <table>
        <caption>the routes that are active</caption>
        <thead>
          <tr>
            <th>the route</th>
            <th>the methods</th>
            <th>the upstream</th>
          </tr>
        </thead>
        <tbody>
          {props.activeRoutes.map((route) => (
            <tr key={route.id}>
              <td>{route.id}</td>
              <td>{route.methods.join(', ') || 'every method'}</td>
              <td>{route.upstream}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <caption>the history of the table</caption>
        <thead>
          <tr>
            <th>the revision</th>
            <th>the moment</th>
            <th>the author</th>
            <th>the rollback</th>
          </tr>
        </thead>
        <tbody>
          {props.revisions.map((revision) => (
            <tr key={revision.revision}>
              <td>{revision.revision}</td>
              <td>{revision.createdAt ?? ''}</td>
              <td>{revision.author ?? ''}</td>
              <td>
                {revision.revision === props.active ? (
                  'the active one'
                ) : props.mayRollback ? (
                  confirming === revision.revision ? (
                    <span class="form-warning">
                      the table of the deployment is replaced by the revision {revision.revision}.{' '}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void rollback(revision.revision)}
                      >
                        yes, roll it back
                      </button>
                      <button type="button" onClick={() => setConfirming(null)}>
                        no
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(revision.revision)}>
                      the rollback
                    </button>
                  )
                ) : (
                  'the operators of the platform'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p class="form-error">{error}</p> : null}
    </div>
  )
}
