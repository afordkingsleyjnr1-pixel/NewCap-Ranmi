# Tavily Search Integration

## Overview

The platform now uses **Tavily API** for intelligent web search and content extraction during firm research, replacing the previous multi-turn Claude web_search/web_fetch tool approach.

**Cost reduction**: ~3-8x cheaper per firm
- **Old**: Multiple web_search calls ($10/1K) + web_fetch tools + multi-turn Claude
- **New**: One Tavily search ($5/1K) + single Claude reasoning call (no tools)

## How It Works

### Three-Stage Pipeline

1. **Search (Tavily)**
   - Query: `"{firmName} investment manager AUM assets headquarters"`
   - Depth: `advanced` (crawls 3+ pages, extracts content)
   - Returns: 3 results with cleaned content ready for reasoning

2. **Reason (Claude)**
   - Receives: Pre-cleaned content from Tavily
   - Extracts: Domain, AUM, classification, contacts
   - No web tools needed — just reasoning on facts

3. **Validate & Store**
   - Checks domain is real (drops hallucinated domains if no resolved domain)
   - Applies taxonomy validation (drops unknown tags)
   - Ranks contacts by capital-markets priority

## Setup

### 1. Get Tavily API Key

1. Go to https://tavily.com
2. Sign up (free account includes 100 searches/day)
3. Navigate to API keys section
4. Copy your API key (format: `tvly-...`)

### 2. Configure in Platform

1. **Settings** → **Research Integrations**
2. Paste Tavily API key in the input field
3. Click **Save**
4. Integration status will show "Tavily: configured"

### 3. Use in Firm Research

#### Via API
```bash
curl -X POST http://localhost:3000/api/firms/research-tavily \
  -H "Content-Type: application/json" \
  -d '{"firmName": "Insight Partners"}'
```

Response:
```json
{
  "domain": "insightpartners.com",
  "domainStatus": "resolved",
  "aumValue": 90000000000,
  "aumConfidence": "confirmed",
  "aumAsOf": "2025-06-30",
  "strategies": {
    "Growth Equity": ["Software", "Tech-Enabled Services"]
  },
  "focusAreas": {
    "Geographic": ["North America", "Europe"]
  },
  "contacts": [
    {
      "name": "John Smith",
      "title": "Head of Capital Formation",
      "linkedinUrl": null,
      "rank": 1
    }
  ]
}
```

#### From UI (upcoming)
Add firm → Tavily research will be the default when configured

## Architecture

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/services/tavily-search.ts` | Tavily API wrapper, search & format results |
| `src/lib/services/firm-core-research-tavily.ts` | Research orchestration (Tavily → Claude → validation) |
| `src/lib/services/settings-encryption.ts` | Encrypted API key storage/retrieval |
| `src/app/api/firms/research-tavily/route.ts` | HTTP endpoint for triggering research |
| `prisma/schema.prisma` | AppSettings model includes `tavilyApiKeyEncrypted` |

### Data Flow

```
User clicks "Research" on firm
   ↓
POST /api/firms/research-tavily
   ↓
getTavilyApiKey() — retrieves decrypted key from AppSettings
   ↓
tavily.com/search — returns 3 results + cleaned content
   ↓
runCompletion() — Claude reasons on the content (no tools)
   ↓
extractJson() — parses JSON response
   ↓
validateTaxonomySelection() — drops unknown tags
   ↓
rankByCapitalMarketsPriority() — reranks contacts
   ↓
Return structured firm data
   ↓
Store in Firm record (domain, AUM, strategies, contacts, etc.)
```

## Tavily Result Format

Each Tavily result includes:

```typescript
{
  url: string;              // Source URL
  title: string;            // Page title
  content: string;          // AI-optimized cleaned text
  raw_content: string;      // Full page (with HTML remnants)
  score: number;            // Relevance score 0–1
  published_date?: string;  // When published
}
```

The `content` field is already pre-cleaned by Tavily (removes ads, boilerplate, extracts main text) — ready for Claude without further processing.

## Performance & Limits

### Tavily Quotas
- **Free tier**: 100 searches/day
- **Paid**: $5 per 1,000 searches (after free quota)
- **Response time**: ~1–2 seconds per search

### Claude Token Cost
- **Input**: ~1,200 tokens (Haiku @ $1/MTok input)
- **Output**: ~300 tokens (Haiku @ $5/MTok output)
- **Total per firm**: ~$0.002 reasoning cost

### Old vs New Cost Comparison
| Metric | Old (web_search/fetch) | New (Tavily) |
|--------|--------------------------|--------------|
| Search cost | $0.01 | $0.005 |
| Claude tokens | 2,500–4,000 | 1,500 |
| Claude cost | $0.015–$0.020 | $0.002 |
| **Total/firm** | **$0.025–$0.030** | **$0.007** |
| **Savings** | — | **~3.5x cheaper** |

## Migration Path

### Phase 1 (Done)
- ✅ Tavily API wrapper (`tavily-search.ts`)
- ✅ Tavily-based research (`firm-core-research-tavily.ts`)
- ✅ Settings storage for Tavily key
- ✅ `/api/firms/research-tavily` endpoint

### Phase 2 (Ready for Implementation)
Replace existing research call sites:
- `firm-core-research.ts` → Use Tavily backend
- `classification-engine.ts` → Use Tavily if needed
- `contact-discovery.ts` → Use Tavily if needed
- `populate.ts` → Use Tavily for similarity search

### Phase 3 (Later)
- Use Tavily's entity mapping / `map` feature for structured extraction
- Implement parallel Tavily searches for batch research (Populate mode)

## Fallback & Error Handling

If Tavily search fails or returns no results:

1. **No results found** → Return empty research result (domain: null, strategies: {}, etc.)
2. **API error** → Throw error with message, allow retry
3. **No Tavily key configured** → Return 400 "Tavily API key not configured"

Client should fall back to manual entry or skip research if Tavily unavailable.

## Environment Variables

No new env vars needed. Tavily key is stored encrypted in the database (`appSettings.tavilyApiKeyEncrypted`).

For local development, run with:
```bash
ENCRYPTION_KEY="your-dev-key-here" npm run dev
```

The migration (`20260805_add_tavily_api_key`) will be applied automatically when the database is next synced.

## Testing

```bash
# Test Tavily endpoint (requires auth)
curl -X POST http://localhost:3000/api/firms/research-tavily \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"firmName":"Insight Partners"}'
```

Expected response time: 3–5 seconds (Tavily search ~2s + Claude reasoning ~2–3s).

## Future Improvements

- **Batch research**: Send multiple firms in one call, parallelize Tavily searches
- **Entity extraction**: Use Tavily's `map` mode to extract structured entities (founders, portfolio companies) as separate records
- **Adaptive search**: If AUM not found, run a second search focused on AUM + years in operation
- **Source prioritization**: Prefer official IR pages over news/press releases

## References

- [Tavily API Docs](https://docs.tavily.com/)
- [Tavily Pricing](https://tavily.com/pricing)
- [API Key Management](https://docs.tavily.com/llms.txt)
