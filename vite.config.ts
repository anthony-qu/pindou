import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the built site works on Cloudflare Pages, Netlify and
// GitHub Pages (which serves from /<repo>/) without reconfiguration.
export default defineConfig({
  plugins: [react()],
  base: './',
})
