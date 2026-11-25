import { defineConfig } from 'vite';

// Same-origin `/v2` reaches a local Nakama when VITE_NAKAMA_URL is empty.
// The default account path talks to http://127.0.0.1:7350 directly, as the other games do.
export default defineConfig({
  server: {
    proxy: {
      '/v2': { target: 'http://127.0.0.1:7350', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:7350', ws: true, changeOrigin: true },
    },
  },
});
