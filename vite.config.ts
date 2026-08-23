import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // No manualChunks: rolldown's default chunking already keeps heavyweight
  // libraries out of the entry. Firebase and framer-motion are only reached
  // via dynamic imports / lazy routes, so they land in on-demand chunks.
  // (A hand-rolled manualChunks previously forced React core INTO the
  // framer-motion chunk, which made the entry preload all of framer on
  // every first paint — do not reintroduce it.)
})
