# Multi-Provider Usage Tracking Design

## Overview

Extend `claude-code-usage` from Anthropic-only usage tracking to a multi-provider architecture supporting 9 AI providers. Each provider has its own API endpoint, authentication method, and response format. The tool displays all configured providers' usage in a single statusline.

## Supported Providers

| Provider | API Endpoint | Auth | Returns |
|----------|-------------|------|---------|
| Anthropic | `GET /api/oauth/usage` | OAuth Bearer (system credential) | `five_hour.utilization` %, `resets_at` |
| Zhipu | `GET https://api.z.ai/api/monitor/usage/quota/limit` | `Authorization: {apiKey}` (no Bearer) | `limits[].percentage` %, `nextResetTime` |
| Kimi | `GET https://api.kimi.com/coding/v1/usages` | `Bearer {apiKey}` | `limits[].detail.remaining/limit` |
| MiniMax | `GET https://{domain}/v1/api/openplatform/coding_plan/remains` | `Bearer {apiKey}` | `model_remains[].current_interval_*` |

MiniMax domain: `api.minimaxi.com` (CN) or `api.minimax.io` (EN). Auto-detect from `baseUrl` or default to CN.
| DeepSeek | `GET https://api.deepseek.com/user/balance` | `Bearer {apiKey}` | `balance_infos[].total_balance` (CNY) |
| OpenRouter | `GET https://openrouter.ai/api/v1/credits` | `Bearer {apiKey}` | `total_credits - total_usage` (USD) |
| SiliconFlow | `GET https://api.siliconflow.cn/v1/user/info` | `Bearer {apiKey}` | `totalBalance` (CNY) |
| StepFun | `GET https://api.stepfun.com/v1/accounts` | `Bearer {apiKey}` | `balance` (CNY) |
| Novita | `GET https://api.novita.ai/v3/user/balance` | `Bearer {apiKey}` | `availableBalance / 10000` (USD) |

## Configuration

Configuration lives in `~/.claude/settings.json` under a `providers` array. Anthropic is always enabled by default (reads from system credential store). Other providers must be explicitly listed.

```json
{
  "statusLine": { "type": "command", "command": "claude-code-usage" },
  "env": {
    "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "your-key"
  },
  "providers": [
    { "name": "zhipu", "apiKey": "your-zhipu-api-key" },
    { "name": "deepseek", "apiKey": "sk-xxx" }
  ]
}
```

- `name` (required): provider identifier
- `apiKey` (required for non-Anthropic): API key for authentication
- `baseUrl` (optional): override default API base URL

No `providers` array = current behavior (Anthropic only). Fully backward compatible.

Note: The `env` block (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`) configures Claude Code itself. Our tool reads it to know what Anthropic endpoint is active, but does not use it for authentication. The `providers` array is separate and configures our tool's additional providers.

## Architecture

```
src/
  providers/
    registry.js      # Auto-discover and register all providers
    base.js          # Shared HTTP utility + unified result format
    anthropic.js     # Provider implementations
    zhipu.js
    kimi.js
    minimax.js
    deepseek.js
    openrouter.js
    siliconflow.js
    stepfun.js
    novita.js
  credentials.js     # Keep, used by Anthropic provider
  cache.js           # Extend, support multi-provider caching
  format.js          # Extend, support multi-provider display
  index.js           # Update entry point
```

### Provider Interface

Each provider exports:

```js
module.exports = {
  id: 'zhipu',
  name: 'Zhipu GLM (智谱)',
  async fetchUsage(config) {
    // config: { apiKey, baseUrl }
    // Returns normalized result object
  }
};
```

### Normalized Result Format

All providers return the same structure:

```js
{
  total: 100,        // Total quota (optional)
  used: 47,          // Used amount
  remaining: 53,     // Remaining amount
  unit: '%',         // '%' | 'USD' | 'CNY' | 'tokens'
  resetsAt: '...',   // ISO 8601 reset time (optional)
  planName: '...',   // Plan name (optional)
  isValid: true,     // Whether credentials are valid
  tiers: [...]       // Multi-tier quotas (Zhipu 5h + weekly)
}

// tiers array format:
[
  { name: 'five_hour', utilization: 44.0, resetsAt: '2026-05-20T...' },
  { name: 'weekly_limit', utilization: 53.0, resetsAt: '2026-05-27T...' }
]
```

### Registry

`registry.js` scans the `providers/` directory and auto-registers all modules. On each run:
1. Read `~/.claude/settings.json` to get configured providers
2. Always include Anthropic (from system credentials)
3. Match each config entry to a registered provider by `name`
4. Call `fetchUsage()` for all providers in parallel via `Promise.allSettled()`
5. Collect results and pass to formatter

## Caching

- Cache key: `{provider}:{hash(apiKey)}` to support multiple providers
- TTL: 30 seconds (unchanged)
- Cache file: `~/.cache/claude-code-usage/{provider}.json` (per-provider files)
- Fallback: read from cache when API fails

## Statusline Format

Current:
```
project | main | Usage: 7% =========> Reset: 10:00 PM
```

Multi-provider:
```
project | main | Anthropic: 7% ==> Reset: 10:00 PM | Zhipu: 44% ===== | DeepSeek: 12.50 CNY
```

Display rules:
- Each provider prefixed with its name
- `%` type: show progress bar + reset time
- `USD`/`CNY` type: show balance number
- Failed providers show `~`
- Line length management: truncate if too long, Anthropic takes priority

## Error Handling

Principle: one provider's failure does not affect others.

| Scenario | Behavior |
|----------|----------|
| Provider API timeout (5s) | Show `~` for that provider |
| Invalid API key | Show `!invalid` for that provider |
| No config file | Anthropic only (backward compat) |
| Invalid JSON in config | Log error to stderr, Anthropic only |
| All providers fail | Show all as `~` |
| Network down | Use cache, show `~` if cache expired |

Timeout control:
- Per-provider: 5 seconds
- Total: 8 seconds via `Promise.allSettled()`
- Providers that complete after total timeout are discarded

## Implementation Order

1. Create `src/providers/base.js` with HTTP utility and result format
2. Create `src/providers/registry.js` with auto-discovery
3. Migrate existing Anthropic logic to `src/providers/anthropic.js`
4. Implement remaining providers (zhipu, kimi, minimax, deepseek, openrouter, siliconflow, stepfun, novita)
5. Update `src/cache.js` for multi-provider caching
6. Update `src/format.js` for multi-provider display
7. Update `src/index.js` to read config and orchestrate providers
8. Test each provider individually and combined
