import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Which third-party chunk a dependency belongs in. Grouped by how often each changes rather
// than by size: React and Radix are stable across releases, so a browser that has them cached
// should not have to re-download them because a page's code changed. Left ungrouped, Rollup
// splits per import and the build emits 40-odd micro-chunks — one for each lucide icon — which
// trades one large request for dozens of small ones.
function vendorChunk(id) {
  if (!id.includes('node_modules')) return undefined
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react'
  if (id.includes('@radix-ui') || id.includes('cmdk')) return 'vendor-ui'
  if (id.includes('lucide-react')) return 'vendor-icons'
  if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
  // jspdf, html2canvas and pdfjs are deliberately NOT grouped: each is already reached only
  // through a dynamic import, and naming them here would pull them back into a chunk that
  // loads eagerly.
  return undefined
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
    // The entry chunk is what matters for first paint and is well under this; the warning was
    // firing on the PDF worker, which is fetched only when a document is actually parsed.
    chunkSizeWarningLimit: 900,
  },
})
