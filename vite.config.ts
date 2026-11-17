import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // Project site: https://crazy-nazgul-ops.github.io/Highlighty/
  base: command === 'build' ? '/Highlighty/' : '/',
  plugins: [react()],
  server: { port: 5173 },
}))
