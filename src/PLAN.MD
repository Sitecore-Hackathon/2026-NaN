# GEO/SEO/AEO Sitecore Marketplace App — Implementation Plan

## Context

Build a new Sitecore Marketplace app (separate project directory) that generates AI-ready content
for GEO/AEO (Generative/Answer Engine Optimization). The app crawls a Sitecore XM Cloud website,
converts each page's HTML to clean, AEO-optimised markdown, writes it back to a configurable
Sitecore field, and aggregates everything into `llms.txt` / `llms-full.txt`.

---

## Refinements & What's Missing from the Original Vision

**User's stated vision:** HTML → turndown → Vercel AI SDK polish → store in Sitecore field → llms.txt → custom field edit

**Key gaps to address:**

| Gap | Recommendation |
|---|---|
| Page discovery | use `client.agent.sitesGetAllPagesBySite` |
| Fetching HTML | Use `client.agent.pagesGetPageHtml` — SDK handles auth via host proxy, no CORS |
| Change detection | Store `processedAt` timestamp + `lastmod` from sitemap per item → enable incremental re-runs |
| AEO enrichment | Beyond markdown cleanup: auto-generate a `## Frequently Asked Questions` section, extract entities, produce a one-sentence description per page (used in llms.txt index) |
| `llms-full.txt` | Extended format with full markdown bodies inlined (AI crawlers prefer this over just an index) |
| `robots.txt` snippet | App generates the ready-to-copy `User-agent: GPTBot / Allow: /llms.txt` block |
| llms.txt hosting | Needs to live at the website's domain. Leave delivery strategy open; provide download for now + document Media Library upload and proxy options |
| Configuration storage | Store in a dedicated XMC content item (survives Vercel redeployments; visible to editors) |
| Long-running batch | Use Server-Sent Events (SSE) for progress streaming; job state stored in XMC content item |
| Multilingual | Pipeline iterates `(url, language)` pairs; field name per language or JSON blob |

---

## Architecture

**Framework:** Next.js App Router on Vercel
**Auth:** Full-stack with Auth0 (required: server-side HTML fetching, XMC mutations, AI API calls)
**AI:** Vercel AI SDK with **AI Gateway** as provider abstraction
**UI:** Blok design system (Sitecore's shadcn theme)
**Storage:** Sitecore fields via XMC Authoring GraphQL
**Job state:** Sitecore content item (persists across redeployments; visible to editors)

---

## Extension Points

| Extension | Route | Purpose |
|---|---|---|
| `fullscreen` | `app/fullscreen/page.tsx` | Main dashboard: site selector, batch crawl, progress, output download, config |
| `custom-field` | `app/custom-field/page.tsx` | Per-page markdown viewer + "Regenerate" button inside the content editor |
| `pages-context-panel` | `app/pages-context-panel/page.tsx` | AEO status sidebar in Pages editor; quick regenerate for current page |

---

## Processing Pipeline

```
DISCOVERY → FETCH → CONVERT → POLISH → STORE → AGGREGATE
```

### Stage 1 — Discovery (`sitesGetAllPagesBySite` + XMC GraphQL)
- get site -> call sitesGetAllPagesBySite to get list of ids
- get each page via graphql
- Compare `updatedAt` vs `processedAt` stored in XMC metadata field → skip unchanged pages (incremental mode)

```graphql
query GetItem($path: String!, $language: String!) {
    item(where: { path: $path, language: $language }) {
        itemId
        name
        fields {
            nodes {
                name
                value
            }
        }
    }
}
```

### Stage 2 — Fetch HTML
- Use `client.agent.pagesGetPageHtml` (SDK agent API) to fetch rendered HTML per page
- This avoids CORS entirely — the SDK handles authentication via the Sitecore host proxy
- Exact signature to verify against live SDK docs: `client.agent.pagesGetPageHtml({ pageId, language, sitecoreContextId })`

### Stage 3 — Convert (HTML → Markdown)
- Extract `<main>` / `[role="main"]` content before conversion
- Run `turndown` with `headingStyle: "atx"`, remove `nav / footer / script / style / [aria-hidden]`
- Output: raw markdown string

### Stage 4 — Polish & AEO Enrich (Vercel AI SDK + AI Gateway)

Two-stage prompt:

**Stage A — Structural clean** (every page, fast/cheap model):
```
Fix heading hierarchy, remove nav/footer noise, normalise lists. Output only markdown.
```

**Stage B — AEO enrichment** (optional toggle, smarter model):
```
Add ## FAQ section (3-5 Q&As derived from content).
Ensure first paragraph directly answers "What is {pageTitle}?"
Return JSON: { markdown, description, faqCount, entities }
```

Use `generateText` with `Output.object()` to get structured output:
```typescript
import { generateText, Output } from 'ai';
import { z } from 'zod';

const aeoSchema = z.object({
  markdown: z.string(),
  description: z.string(),   // one-sentence for llms.txt index
  faqCount: z.number(),
  entities: z.array(z.string()),
  wordCount: z.number(),
});

const { output } = await generateText({
  model: gateway('...'),
  output: Output.object({ schema: aeoSchema }),
  prompt: '...',
});
```

### Stage 5 — Store to XMC
- Write `markdown` to the **configured field name** via `xmc.authoring.graphql` mutation
- Write metadata JSON `{ processedAt, wordCount, faqCount, entities, description, sourceUrl, language }` to a second configured field (e.g. `AiMarkdownMeta`)
- Uses `experimental_createXMCClient` (server-side, Auth0 token)

### Stage 6 — Aggregate (llms.txt)
- Query XMC for all items where markdown field is populated
- Group by URL path segment (top-level nav sections)
- Render `llms.txt` (index format per llmstxt.org spec)
- Render `llms-full.txt` (inline full markdown bodies, separated by `---`)

---

## Configuration

Stored in a dedicated XMC content item:
`/sitecore/content/{site}/App Config/LLMs Generator`

| Field | Purpose |
|---|---|
|`Site` | site name to crawl|
| `TargetFieldName` | Field to write markdown to (e.g. `AiMarkdown`) |
| `MetaFieldName` | Field to write JSON metadata to (e.g. `AiMarkdownMeta`) |
| `Vercel AI Gateway API KEY` | (optional) API key to use in AI mode |

First-run wizard populate settings

---

## API Routes

```
POST   /api/jobs/start              Start batch crawl (full or incremental)
GET    /api/jobs/[id]/stream        SSE progress stream
POST   /api/jobs/[id]/cancel        Cancel running job
POST   /api/pages/[itemId]/process  Process a single page (used by custom-field)
GET    /api/config                  Read app configuration
POST   /api/config                  Write app configuration
GET    /api/output/llms-txt         Generate and return llms.txt
GET    /api/output/llms-full-txt    Generate and return llms-full.txt
```

---

## Key GraphQL Operations

Refer to ./src/lib/sitecore/storage/*.ts
---

## UI Layout (Fullscreen Dashboard — 4 tabs)

**Overview:** Site selector · Job status card + progress bar · Start/Cancel buttons · Summary stats (pages indexed / processed / errors)

**Pages:** DataTable — URL · Language · Status badge · Last processed · Word count · FAQ count · [Preview] [Reprocess] actions

**Configuration:** Field names · Site hostname · Language codes · Exclude patterns · AI enrichment toggle · System prompt override · Save

**Output:** llms.txt preview (first 50 lines) · Download llms.txt + llms-full.txt · robots.txt snippet (copy button) · llms.txt delivery options (documented: Media Library upload, proxy rewrite, manual)

---

## Implementation Phases

### Phase 1 — Foundation
- Scaffold Next.js app (full-stack + Auth0 + XMC + AI modules + Blok theme)
- Configure `.env.local`, CSP headers, Auth0 flow
- Stub extension point routes (fullscreen, custom-field, pages-context-panel)
<!-- - `GET/POST /api/config` — read/write XMC config item (first-run wizard creates it) -->

### Phase 2 — Single-Page Pipeline
- `POST /api/pages/[itemId]/process`: fetch HTML → turndown → Stage A → Stage B AEO
- XMC GraphQL mutation to write markdown + metadata back to item
- Custom-field extension: read markdown, show preview, trigger `process` API

### Phase 3 — Batch Processing
- Discovery: recursive XMC GraphQL tree traversal from home item (client-side, SDK)
- `POST /api/jobs/start` → XMC job state item → processing loop
- `GET /api/jobs/[id]/stream` SSE progress
- Overview tab with progress bar; incremental mode (`updatedAt` vs `processedAt`)

### Phase 4 — Output & Context Panel
- `GET /api/output/llms-txt` + `/llms-full-txt` aggregation from XMC
- Output tab: preview, download, robots.txt snippet, delivery options documentation
- pages-context-panel: subscribe to `pages.context`, show AEO status, quick process

### Phase 5 — Multilingual, Polish & Deploy
- Language iteration; error handling, retry, cancellation
- Deploy to Vercel; register extension points in Developer Portal

---

## Verification

1. **Single-page test:** Open custom-field extension on a test item → click Regenerate → verify markdown appears in the Sitecore field
2. **Batch test:** Run full crawl on a small site (10-20 pages) → SSE progress shows per-page updates → all items have markdown field populated
3. **Incremental test:** Re-run crawl → only pages with newer `lastmod` are reprocessed
4. **Output test:** Download `llms.txt` → validate format matches llmstxt.org spec (H1, blockquote, sections, link list)
5. **Context panel test:** Open a processed page in Pages editor → panel shows correct word count and last-processed timestamp
