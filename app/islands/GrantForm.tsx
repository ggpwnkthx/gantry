import { useState } from 'preact/hooks'

/**
 * The form of a grant.
 *
 * The form writes a grant of the tenant, through the same origin of
 * Gantry. The person who fills it is the operator of the console, and
 * Hub writes the row of its audit: the console writes its own line too,
 * with the e-mail of the person, because the credential of the console is
 * what Hub sees.
 */

/** A group of the tenant, as the form offers it. */
export interface GrantGroup {
  /** The key of the group. */
  key: string
  /** The name of the group. */
  label: string
}

/** A principal of the tenant, as the form offers it. */
export interface GrantPrincipal {
  /** The id of the principal. */
  id: string
  /** The name of the principal. */
  label: string
}

/** The props of the form. */
export interface GrantFormProps {
  /** The slug of the tenant. */
  tenant: string
  /** The groups of the tenant. */
  groups: GrantGroup[]
  /** The principals of the tenant. */
  principals: GrantPrincipal[]
  /** The routes of the deployment. */
  routes: string[]
  /** The permissions of the console. */
  permissions: string[]
}

/** The form of a grant. */
export function GrantForm(props: GrantFormProps) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    const subject = String(data.get('subject') ?? '')
    const permission = String(data.get('permission') ?? '')
    const routeId = String(data.get('routeId') ?? '')
    if (!subject || !permission) {
      setError('the subject of the grant and its permission are needed')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.set('subject', subject)
      body.set('permission', permission)
      if (routeId.length > 0) body.set('routeId', routeId)
      const response = await fetch(`/api/hub/tenants/${props.tenant}/grants`, {
        method: 'POST',
        body,
      })
      if (!response.ok) {
        setError(await response.text())
        return
      }
      location.reload()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form class="form" id="grant-form" onSubmit={submit}>
      <h2>a new grant</h2>
      <label>
        the group or the principal
        <select name="subject">
          <optgroup label="the groups">
            {props.groups.map((group) => (
              <option key={`group-${group.key}`} value={`group:${group.key}`}>
                {group.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="the principals">
            {props.principals.map((principal) => (
              <option key={`user-${principal.id}`} value={`user:${principal.id}`}>
                {principal.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label>
        the permission
        <select name="permission">
          {props.permissions.map((permission) => (
            <option key={permission} value={permission}>
              {permission}
            </option>
          ))}
        </select>
      </label>
      <label>
        the route
        <select name="routeId">
          <option value="">every route</option>
          {props.routes.map((route) => (
            <option key={route} value={route}>
              {route}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'the grant is being written' : 'the grant is written'}
      </button>
      {error ? <p class="form-error">{error}</p> : null}
    </form>
  )
}
