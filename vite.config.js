import { defineConfig } from 'vite';

// Same-origin `/v2` reaches a local Nakama when VITE_NAKAMA_URL is empty.
// The default account path talks to http://127.0.0.1:7350 directly, as the other games do.
// The hub serves the game from a sub-path and builds it with VITE_BASE=/play/sproto-racer/.
// Every asset URL has to go through `base`: import it, or keep it in public/ and reference it
// from index.html or CSS, where Vite adds the prefix.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: {
    proxy: {
      '/v2': { target: 'http://127.0.0.1:7350', changeOrigin: true },
      '/ws': { target: 'http://127.0.0.1:7350', ws: true, changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]/ },
            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]/ },
            { name: 'hub-sdk', test: /vendor[\\/]hub-sdk|node_modules[\\/]@heroiclabs/ },
            {
              name: 'car-art',
              test: /src[\\/](hexshift|crestline|barrage|ironhide|geep|skipper|manta|saucer|shopping-cart|kart-assembly)\.js$/,
            },
          ],
        },
      },
    },
  },
});
