# CLAUDE.md

## Commands

```bash
npm run dev      # HTTPS dev server at https://aeo.local (requires certs — see README)
npm run build
npm run lint     # ESLint + Prettier
```

## Architecture

A **Sitecore Marketplace app** built with Next.js App Router (v16), React 19, Tailwind v4. Runs embedded inside Sitecore XM Cloud as an extension point (fullscreen, custom-field, pages-context-panel), loaded in an iframe.

### Provider hierarchy

Three client-side providers wrap the app:

```
MarketplaceProvider        # Initialises @sitecore-marketplace-sdk/client (postMessage to parent iframe)
  └─ AuthProvider          # Auth0, picks up org/tenant from AppContext
       └─ AppSettingsProvider  # Loads/saves API keys from XMC content items
```

Key hooks: `useMarketplaceClient()`, `useAppContext()`, `usePreviewContextId()` (returns the `sitecoreContextId` required for all XMC calls).

### XMC access

**Client-side:** `client.query` or `client.mutate`

**Server-side (API routes):** `experimental_createXMCClient` from `@sitecore-marketplace-sdk/xmc`, passing the Auth0 Bearer token forwarded from the client.

### Config/key persistence

App config and API keys are stored as XMC content items under `/sitecore/system/Modules/Editors Chat/Api Keys/`. The storage layer in `lib/sitecore/storage/api-key-storage.ts` creates the path on demand and is the model for all XMC-persisted config.

### AI

Vercel AI SDK v6 (`ai` package). Use `generateText` with `Output.object()` for structured output — **not** `generateObject`. AI Gateway provider: `createGateway` from `@ai-sdk/gateway`, key env var `AI_GATEWAY_API_KEY`.

### CSP

`next.config.ts` sets `frame-ancestors` to the three Sitecore cloud domains. Add new local dev origins to `allowedDevOrigins`.

### Import conventions

- Always use `@/` absolute imports — never `../../`
- Import order: builtin → external (react/next first) → `@/` internal → sibling
- Prettier: single quotes, trailing commas (ES5), semicolons
