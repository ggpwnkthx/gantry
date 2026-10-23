/**
 * The probe of the process.
 *
 * The probe answers as long as the process is alive: it does not depend on
 * Hub and not on Shuttle.
 */
export default function healthz() {
  return new Response('ok', { headers: { 'content-type': 'text/plain' } })
}
