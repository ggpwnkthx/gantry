import { useState } from 'preact/hooks'

/**
 * The dialog of a purge.
 *
 * The purge of the sessions and of the cached decisions of a subject is a
 * destructive act: it ends the sessions of a caller and it makes the
 * gateway ask Hub again. The dialog therefore asks twice: once for the
 * subject, and once for the confirmation.
 */

/** The kinds of purge. */
export type PurgeKind = 'sessions' | 'decisions'

/** The props of the dialog. */
export interface PurgeDialogProps {
  /** The kind of the purge. */
  kind: PurgeKind
}

/** The dialog of a purge. */
export function PurgeDialog(props: PurgeDialogProps) {
  const [subject, setSubject] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')

  const what = props.kind === 'sessions' ? 'the sessions' : 'the cached decisions'

  const purge = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.set('kind', props.kind)
      body.set('subject', subject)
      const response = await fetch('/api/ops/purge', {
        method: 'POST',
        body,
      })
      const text = await response.text()
      if (!response.ok) {
        setError(text)
        return
      }
      const answer = JSON.parse(text) as { count?: number }
      setAnswer(`${what} of ${subject} are gone: ${answer.count ?? 0}`)
      setConfirming(false)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      class="form"
      id={`purge-${props.kind}`}
      onSubmit={(event: Event) => {
        event.preventDefault()
        if (!subject) {
          setError('the subject of the purge is needed')
          return
        }
        if (!confirming) {
          setConfirming(true)
          setError('')
          return
        }
        void purge()
      }}
    >
      <h2>the purge of {what}</h2>
      <label>
        the subject
        <input
          name="subject"
          type="text"
          value={subject}
          onInput={(event) => setSubject((event.target as HTMLInputElement).value)}
        />
      </label>
      {confirming ? (
        <p class="form-warning">
          the sessions of {subject} end and the gateway asks Hub again. It cannot be undone.
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {confirming ? `yes, ${what} of ${subject} are gone` : 'the purge'}
      </button>
      {confirming ? (
        <button type="button" onClick={() => setConfirming(false)}>
          no
        </button>
      ) : null}
      {error ? <p class="form-error">{error}</p> : null}
      {answer ? <p class="form-answer">{answer}</p> : null}
    </form>
  )
}
