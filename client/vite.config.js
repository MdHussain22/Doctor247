import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, the browser talks to Vite (5173); API + websocket calls are proxied to Express (5000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
