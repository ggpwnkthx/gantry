import build from '@hono/vite-build/bun'
import adapter from '@hono/vite-dev-server/bun'
import preact from '@preact/preset-vite'
import honox from 'honox/vite'
import { defineConfig } from 'vite'

/**
 * The client options of HonoX: the entry of the client build and the source
 * of the JSX of the islands.
 *
 * The type of the option is the one of the **client runtime** and not the one
 * of the vite plugin, so the cast is needed.
 */
const client = {
  input: ['/app/client.ts', '/app/style.css'],
  jsxImportSource: 'preact',
}

export default defineConfig(({ mode }) => ({
  plugins: [
    honox({
      devServer: { adapter },
      islandComponents: { reactApiImportSource: 'preact/compat' },
      client: client as never,
    }),
    preact(),
    build(),
  ],
  resolve: {
    alias: {
      // The island wrapper of HonoX imports its JSX runtime from the source of
      // the react api, so `preact/compat/jsx-runtime` is asked for. Preact
      // keeps the runtime of the JSX in `preact/jsx-runtime`.
      'preact/compat/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build:
    mode === 'client'
      ? {
          // The names of the files of the client are fixed, so the renderer of
          // the server knows where the entry and the style sheet are without
          // reading the manifest of the build.
          rollupOptions: {
            output: {
              entryFileNames: 'static/client.js',
              chunkFileNames: 'static/[name].js',
              assetFileNames: 'static/[name][extname]',
            },
          },
        }
      : undefined,
}))
