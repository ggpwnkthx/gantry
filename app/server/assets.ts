/**
 * The assets of the client.
 *
 * The build of the client writes the entry and the style sheet with fixed
 * names, so the renderer of the server knows where they are without reading
 * the manifest of the build.
 */
export const CLIENT_SCRIPT = import.meta.env.PROD ? '/static/client.js' : '/app/client.ts'
export const CLIENT_STYLE = import.meta.env.PROD ? '/static/style.css' : '/app/style.css'
