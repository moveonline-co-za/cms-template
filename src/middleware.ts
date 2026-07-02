import { defineMiddleware } from 'astro:middleware';
import { getEnvVar } from './utils/env';

/**
 * CI Bypass Middleware
 *
 * Keystatic requires OAuth authentication to access its API in production.
 * In non-interactive CI environments, this is impossible. When a valid
 * CI_AUTH_BYPASS_TOKEN is provided via the X-CI-Bypass-Token request header,
 * this middleware short-circuits the Keystatic API with a mock authenticated
 * session response — allowing automated test flights to proceed without OAuth.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);

  if (pathname.startsWith('/api/keystatic')) {
    const authBypassToken = await getEnvVar('CI_AUTH_BYPASS_TOKEN');
    const clientToken = context.request.headers.get('X-CI-Bypass-Token');

    if (authBypassToken && clientToken === authBypassToken) {
      return new Response(JSON.stringify({ status: 'authenticated-mock-session' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return next();
});
