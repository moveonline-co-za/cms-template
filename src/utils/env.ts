/**
 * Safe helper to retrieve environment variables / binding values across different runtimes.
 * It handles:
 * 1. Cloudflare Workers / workerd environment (using 'cloudflare:workers')
 * 2. Astro / Vite build-time or dev environment (using import.meta.env)
 * 3. Node.js environment (using process.env, useful in dev shims)
 */
export async function getEnvVar(key: string): Promise<string | undefined> {
  // 1. Try Cloudflare Workers runtime bindings (Astro v6+)
  try {
    // Dynamic import to prevent resolution errors in pure Node.js environments
    const { env } = await import('cloudflare:workers');
    if (env && typeof env === 'object' && key in env) {
      const val = (env as any)[key];
      if (typeof val === 'string') return val;
    }
  } catch {
    // 'cloudflare:workers' is not available in Node.js/Vite dev environment
  }

  // 2. Try Astro / Vite environment variables (e.g. loaded from .env)
  if (typeof import.meta !== 'undefined' && import.meta.env && key in import.meta.env) {
    const val = import.meta.env[key];
    if (typeof val === 'string') return val;
  }

  // 3. Try standard Node.js process environment (useful in local dev server / scripts)
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    const val = process.env[key];
    if (typeof val === 'string') return val;
  }

  return undefined;
}
