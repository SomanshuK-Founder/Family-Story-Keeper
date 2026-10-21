import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  envDir: '../..',
  plugins: [react()],
  server: {
    proxy: {
      '/mcp': {
        target: 'http://127.0.0.1:3000',
      },
    },
  },
  test: { environment: 'happy-dom', setupFiles: ['./src/test-setup.ts'] },
});
