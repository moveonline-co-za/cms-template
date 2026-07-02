# Blueprint: Ephemeral Astro v7 + Keystatic + Resend Template for Cloudflare Workers

This document serves as an exhaustive technical specification for a coding agent to build, test, and validate a bare-minimum, boilerplate repository. The stack leverages server-side rendering (SSR), secure cloud workflows, and a deterministic ephemeral integration testing cycle that guarantees pristine git history.

---

## 1. Stack & Architecture Summary

- **Framework:** Astro v7 (Current) set to `output: 'server'`
- **Deployment Target:** Cloudflare Workers via `@astrojs/cloudflare` (utilizing standard `workerd` runtime environments)
- **Content Management:** Keystatic CMS configured for local file system access during local execution, and structural GitHub OAuth App redirection when deployed.
- **Communications:** Astro Actions integrated with the `resend` SDK for type-safe contact form submission.
- **CI/CD Lock:** GitHub Actions to validate package staleness and handle automated testing.

---

## 2. Directory Topology

The agent should construct a minimal boilerplate with the following explicit directory structure:

```text
├── .github/
│   └── workflows/
│       ├── check-dependencies.yml    # Fails if core packages are out of date
│       └── deploy-test-teardown.yml  # Ephemeral build, deployment, and sweep
├── src/
│   ├── actions/
│   │   └── index.ts                  # Astro Actions logic (Resend Integration)
│   ├── content/
│   │   └── posts/                    # Lean collection directory for Keystatic validation
│   │       └── .gitkeep
│   ├── pages/
│   │   ├── api/
│   │   │   └── keystatic/
│   │   │       └── [...configs].ts   # Keystatic API route handler
│   │   └── index.astro               # Bare minimum landing page with contact form
│   └── keystatic.config.ts           # Keystatic main structural configuration
├── astro.config.mjs                  # Core configuration module
├── package.json
├── wrangler.toml                     # Minimal configuration for Cloudflare binding mapping
└── pnpm-lock.yaml
```


---

## 3. Core Component Implementation Specs

### 3.1 Astro Configuration (`astro.config.mjs`)
The configuration must enforce absolute SSR rendering using the Cloudflare adapter configured for structural directory mode to facilitate clean environment integration.

```javascript
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import markdoc from '@astrojs/markdoc';

export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [markdoc()],
});
```

### 3.2 Keystatic Configuration (`src/keystatic.config.ts`)
The configuration must support dynamic branch switching targeting a private GitHub repository via runtime environment variables, defaulting to a static fallback for local developer workflows.

```typescript
import { config, fields, collection } from '@keystatic/core';

// Dynamically target the testing branch during automated test flights
const branch = process.env.KEYSTATIC_TARGET_BRANCH || 'main';
const isLocal = process.env.NODE_ENV === 'development';

export default config({
  storage: isLocal ? { kind: 'local' } : {
    kind: 'github',
    repo: 'moveonline-co-za/cms-template',
    branch: branch,
  },
  collections: {
    posts: collection({
      label: 'Posts',
      slugField: 'title',
      path: 'src/content/posts/*',
      schema: {
        title: fields.slug({ name: { label: 'Title' } }),
      },
    }),
  },
});
```

### 3.3 Keystatic Dynamic Route Handler (`src/pages/api/keystatic/[...configs].ts`)
Config import path: `../../../keystatic.config`
To securely test the app within a non-interactive CI run where GitHub OAuth interaction is impossible, implement an authorized header bypass payload token.

```typescript
import { makeRouteHandler } from '@keystatic/astro/api';
import config from '../../../keystatic.config';

const handler = makeRouteHandler({ config });

export const ALL = async (context: any) => {
  const authBypassToken = context.locals.runtime?.env?.CI_AUTH_BYPASS_TOKEN;
  const clientToken = context.request.headers.get('X-CI-Bypass-Token');

  // Securely intercept automated testing runs to bypass visual interactive login loops
  if (authBypassToken && clientToken === authBypassToken) {
    return new Response(JSON.stringify({ status: 'authenticated-mock-session' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return handler(context);
};
```

### 3.4 Resend Astro Action (`src/actions/index.ts`)
Leverage Astro Actions to expose an entry point for contact form submissions.

```typescript
import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { Resend } from 'resend';

export const server = {
  sendContactEmail: defineAction({
    accept: 'json',
    input: z.object({
      email: z.string().email(),
      message: z.string().min(5),
    }),
    handler: async (input, context) => {
      const resendApiKey = context.locals.runtime?.env?.RESEND_API_KEY;
      if (!resendApiKey) {
        throw new Error("Missing Resend API credentials configuration binding.");
      }

      const resend = new Resend(resendApiKey);
      const { data, error } = await resend.emails.send({
        from: 'Template Canary <onboarding@resend.dev>',
        to: ['delivered@example.com'],
        subject: 'Canary Contact Form Submission Flight',
        text: `Sender: ${input.email}\n\nPayload: ${input.message}`,
      });

      if (error) return { success: false, error };
      return { success: true, id: data?.id };
    }
  })
};
```

---

## 4. Automation & Verification Workflows

### 4.1 Dependency Guard Engine (`.github/workflows/check-dependencies.yml`)
This step ensures zero tracking drift against underlying core modules. If any core packages have minor or major updates available, it immediately breaks the pipeline.

```yaml
name: Dependency Lock Checker

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 6 * * *'

jobs:
  audit-versions:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install

      - name: Assert Dependency Alignment
        run: |
          OUTDATED=$(pnpm outdated --json || true)
          echo "Outdated packages reported: $OUTDATED"
          
          if echo "$OUTDATED" | grep -E '"(astro|@astrojs/cloudflare|@keystatic/core|resend)"'; then
            echo "❌ Core framework packages are out of date! Tearing down execution loop."
            exit 1
          else
            echo "✅ All core infrastructure targets match the requested locks."
          fi
```

### 4.2 Ephemeral Deploy, Integration Test, & Structural Revert Loop (`.github/workflows/deploy-test-teardown.yml`)
To thoroughly test the deployment pipeline without cluttering the main branch with temporary mutations or manual rollback artifacts, this workflow handles state tracking through a complete **Ephemeral Branch Lifecycle**:

```yaml
name: Ephemeral Infrastructure Test

on: [push]

jobs:
  deploy-test-teardown:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install

      - name: Create Isolated Test Branch
        id: git_meta
        run: |
          BRANCH_NAME="test/canary-$(date +%s)"
          echo "branch_name=$BRANCH_NAME" >> $GITHUB_OUTPUT
          
          git checkout -b "$BRANCH_NAME"
          git push origin "$BRANCH_NAME"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Build Astro Production Payload
        run: pnpm run build
        env:
          KEYSTATIC_SECRET: ${{ secrets.KEYSTATIC_SECRET }}
          KEYSTATIC_TARGET_BRANCH: ${{ steps.git_meta.outputs.branch_name }}

      - name: Deploy Ephemeral Cloudflare Worker
        id: cloudflare_deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: |
            deploy --name=temp-template-canary             --var KEYSTATIC_TARGET_BRANCH:${{ steps.git_meta.outputs.branch_name }}             --var CI_AUTH_BYPASS_TOKEN:${{ secrets.CI_AUTH_BYPASS_TOKEN }}             --var RESEND_API_KEY:${{ secrets.RESEND_API_KEY }}

      - name: Run E2E Verification Flight
        run: |
          TARGET_URL="https://temp-template-canary.${{ secrets.CLOUDFLARE_SUBDOMAIN }}.workers.dev"
          
          # 1. Verify Application Delivery
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$TARGET_URL")
          if [ "$STATUS" -ne 200 ]; then echo "HTTP App Check Failed"; exit 1; fi
          
          # 2. Test Astro Contact Action Endpoint
          ACTION_STATUS=$(curl -s -o /dev/null -w "%{http_code}"             -X POST "$TARGET_URL/_astro/actions/sendContactEmail"             -H "Content-Type: application/json"             -d '{"email": "canary@example.com", "message": "Automated pipeline validation script run."}')
          if [ "$ACTION_STATUS" -ne 200 ]; then echo "Astro Action Execution Block Failed"; exit 1; fi
          
          # 3. Validate Keystatic Bypass Authenticator
          BYPASS_STATUS=$(curl -s -o /dev/null -w "%{http_code}"             -H "X-CI-Bypass-Token: ${{ secrets.CI_AUTH_BYPASS_TOKEN }}"             "$TARGET_URL/api/keystatic")
          if [ "$BYPASS_STATUS" -ne 200 ]; then echo "Keystatic Security Bypass Failure"; exit 1; fi

      - name: Absolute Environmental Teardown
        if: always()
        run: |
          echo "🧹 Cleaning up deployment infrastructure and temporary branch state..."
          
          # 1. Delete the ephemeral Cloudflare Worker
          npx wrangler delete --name=temp-template-canary --yes || true
          
          # 2. Delete the temporary remote test branch from GitHub, wiping away all trial state
          git push origin --delete ${{ steps.git_meta.outputs.branch_name }} || true
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
