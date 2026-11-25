// The vendored hub SDK's entrypoints omit file extensions. Vite resolves them; Node's loader does not.
import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  ssr: { noExternal: ['@metaverse/hub-sdk'] },
});
try {
  await server.ssrLoadModule('/qa/hub-portal.test.mjs');
} finally {
  await server.close();
}
if (process.exitCode) process.exit(process.exitCode);
