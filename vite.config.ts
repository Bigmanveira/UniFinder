import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep heavyweight libraries out of the entry chunk. The splash and
        // auth gates are deliberately framer-motion-free, so splitting motion
        // (and lucide's icon set) into their own chunks means the very first
        // paint on mobile only downloads what it executes; pages that animate
        // fetch the motion chunk on demand.
        manualChunks(id: string) {
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion')) return 'framer-motion'
          if (id.includes('node_modules/lucide-react')) return 'lucide'
        },
      },
    },
  },
})
