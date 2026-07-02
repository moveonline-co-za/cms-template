import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import markdoc from '@astrojs/markdoc';
import react from '@astrojs/react';
import keystatic from '@keystatic/astro';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// platformProxy is a dev-only feature (no-op in production builds).
// @keystatic/astro@5.1.0 ships CJS internals that crash under the workerd runner
// even when platformProxy is disabled. Disable in dev to reduce noise; the adapter
// still needs to be present for the build target.
// TODO: Remove this conditional once @keystatic/astro ships Astro 7 support.
const isDev = process.env.NODE_ENV === 'development';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: !isDev,
    },
  }),
  integrations: [react(), markdoc(), keystatic()],
  vite: {
    plugins: [
      // Shim: @keystatic/astro@5.x uses a virtual:keystatic-config module that its
      // internal Vite plugin is supposed to register. Under Astro 7 / Vite 8 (Rolldown),
      // the plugin doesn't resolve correctly — this manually bridges the gap.
      {
        name: 'keystatic-config-virtual-shim',
        resolveId(id) {
          if (id === 'virtual:keystatic-config') {
            return '\0virtual:keystatic-config';
          }
        },
        load(id) {
          if (id === '\0virtual:keystatic-config') {
            const configPath = path.resolve(__dirname, 'src/keystatic.config.ts');
            return `export { default } from ${JSON.stringify(configPath)};`;
          }
        },
      },

      // Dev-mode API shim: @keystatic/astro@5.x is incompatible with the workerd runner
      // that @astrojs/cloudflare v14 uses for SSR routes in Astro 7. This Vite plugin
      // intercepts /api/keystatic/* requests BEFORE they reach the workerd runner and
      // handles them in a plain Node.js context (full CJS support).
      // This has zero effect on production builds.
      // TODO: Remove once @keystatic/astro ships Astro 7 / workerd-compatible support.
      {
        name: 'keystatic-dev-api-shim',
        async configureServer(server) {
          try {
            // Compile keystatic.config.ts → ESM JS so it can be imported in Node.js.
            // Written to project root so @keystatic/core resolves from ./node_modules.
            const { transformSync } = await import('esbuild');
            const { readFileSync, writeFileSync } = await import('node:fs');

            const tsCode = readFileSync(
              path.resolve(__dirname, 'src/keystatic.config.ts'),
              'utf-8'
            );
            const { code: jsCode } = transformSync(tsCode, {
              loader: 'ts',
              format: 'esm',
              target: 'node22',
            });

            // Write to project root so package imports resolve from ./node_modules.
            // Use a timestamped filename — file: URLs don't support query-string cache-busting.
            const shimPath = path.resolve(__dirname, `.keystatic-config-shim-${Date.now()}.mjs`);
            writeFileSync(shimPath, jsCode, 'utf-8');

            const { makeHandler } = await import('@keystatic/astro/api');
            const { default: keystatiConfig } = await import(new URL(`file://${shimPath}`).href);
            const handler = makeHandler({ config: keystatiConfig });

            server.middlewares.use(async (req, res, next) => {
              if (!req.url?.startsWith('/api/keystatic')) return next();

              try {
              const host = req.headers.host ?? 'localhost';
                const url = new URL(req.url, `http://${host}`);
                const headers = new Headers();
                for (const [key, val] of Object.entries(req.headers)) {
                  if (val) headers.set(key, Array.isArray(val) ? val.join(',') : val);
                }

                const body =
                  req.method !== 'GET' && req.method !== 'HEAD'
                    ? await new Promise((resolve) => {
                        const chunks = [];
                        req.on('data', (c) => chunks.push(c));
                        req.on('end', () => resolve(Buffer.concat(chunks)));
                      })
                    : undefined;

                const request = new Request(url.toString(), {
                  method: req.method,
                  headers,
                  body: body?.length ? body : undefined,
                });

                // makeHandler expects an Astro APIContext, not a bare Request.
                // Provide a minimal mock context — in local file-system mode,
                // context.cookies is only used for GitHub OAuth sessions (not needed locally).
                const context = {
                  request,
                  url,
                  params: {},
                  locals: { runtime: { env: {} } },
                  cookies: {
                    set: () => {},
                    get: () => undefined,
                    delete: () => {},
                    has: () => false,
                  },
                };

                const response = await handler(context);

                res.statusCode = response.status;
                response.headers.forEach((value, key) => {
                  if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, value);
                });
                res.end(Buffer.from(await response.arrayBuffer()));
              } catch (err) {
                console.error('[keystatic-dev-api-shim] request error:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: String(err) }));
              }
            });
          } catch (startupErr) {
            // Log but don't crash the dev server — landing page and admin UI still work.
            console.error(
              '[keystatic-dev-api-shim] Startup failed — Keystatic API routes will not work in dev:',
              startupErr
            );
          }
        },
      },
    ],
  },
});
