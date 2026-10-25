import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // O Vitest troca todo CSS por texto vazio; só o rodoviaria.css é lido de verdade,
    // para o teste de contraste conseguir ler os tokens de cor.
    css: { include: [/rodoviaria\.css/] },
  },
})
