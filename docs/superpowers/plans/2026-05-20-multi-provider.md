# Multi-Provider Usage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend claude-code-usage from Anthropic-only to a multi-provider architecture supporting 9 AI providers (Anthropic, Zhipu, Kimi, MiniMax, DeepSeek, OpenRouter, SiliconFlow, StepFun, Novita), displaying all usage in a single statusline.

**Architecture:** Provider registry pattern — each provider is a standalone module exporting `{ id, name, fetchUsage(config) }`. A registry auto-discovers providers, reads `~/.claude/settings.json` for the `providers` array, and calls all providers in parallel via `Promise.allSettled()`. Results are cached per-provider and formatted into a single statusline.

**Tech Stack:** Node.js >= 18, zero dependencies (Node.js built-in `https` module only)

---

## File Structure

```
src/
  providers/
    base.js          # NEW - Shared HTTP utility + normalized result format
    registry.js      # NEW - Auto-discover providers, read config, orchestrate
    anthropic.js     # NEW - Migrated from api.js + credentials.js
    zhipu.js         # NEW - Zhipu GLM provider
    kimi.js          # NEW - Kimi For Coding provider
    minimax.js       # NEW - MiniMax provider
    deepseek.js      # NEW - DeepSeek provider
    openrouter.js    # NEW - OpenRouter provider
    siliconflow.js   # NEW - SiliconFlow provider
    stepfun.js       # NEW - StepFun provider
    novita.js        # NEW - Novita provider
  credentials.js     # KEEP - Used by anthropic.js
  cache.js           # MODIFY - Support multi-provider caching
  format.js          # MODIFY - Support multi-provider display
  index.js           # MODIFY - Use registry instead of direct api.js calls
```

---

### Task 1: Create `src/providers/base.js` — Shared HTTP utility

**Files:**
- Create: `src/providers/base.js`

- [ ] **Step 1: Create the base module**

```js
// src/providers/base.js
const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT = 5000;

/**
 * Make an HTTPS GET request.
 * @param {string} url - Full URL to request
 * @param {Object} headers - Request headers
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Parsed JSON response
 */
function httpGet(url, headers = {}, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(url, { headers, timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Create a normalized usage result.
 */
function createResult({ total, used, remaining, unit, resetsAt, planName, isValid, tiers, error } = {}) {
  return {
    total: total ?? null,
    used: used ?? null,
    remaining: remaining ?? null,
    unit: unit ?? '%',
    resetsAt: resetsAt ?? null,
    planName: planName ?? null,
    isValid: isValid ?? (error ? false : true),
    tiers: tiers ?? [],
    error: error ?? null,
  };
}

/**
 * Create an error result.
 */
function errorResult(message) {
  return createResult({ isValid: false, error: message });
}

/**
 * Parse a numeric field from JSON, handling both number and string formats.
 */
function parseNum(obj, field) {
  const v = obj?.[field];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n; }
  return null;
}

/**
 * Convert milliseconds timestamp to ISO 8601 string.
 * Auto-detects seconds vs milliseconds.
 */
function msToISO(ms) {
  if (!ms) return null;
  // If < 1e12, it's seconds; otherwise milliseconds
  const millis = ms < 1e12 ? ms * 1000 : ms;
  try {
    return new Date(millis).toISOString();
  } catch {
    return null;
  }
}

module.exports = { httpGet, createResult, errorResult, parseNum, msToISO, DEFAULT_TIMEOUT };
```

- [ ] **Step 2: Verify it loads without errors**

Run: `node -e "require('./src/providers/base.js')" && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/providers/base.js
git commit -m "feat: add shared HTTP utility and normalized result format"
```

---

### Task 2: Migrate Anthropic to `src/providers/anthropic.js`

**Files:**
- Create: `src/providers/anthropic.js`
- Read: `src/api.js` (current implementation)
- Read: `src/credentials.js` (current implementation)

- [ ] **Step 1: Create the Anthropic provider module**

```js
// src/providers/anthropic.js
const { getAccessToken } = require('../credentials.js');
const { httpGet, createResult, errorResult } = require('./base.js');

const ANTHROPIC_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

module.exports = {
  id: 'anthropic',
  name: 'Anthropic',

  async fetchUsage(config) {
    const token = getAccessToken();
    if (!token) {
      return errorResult('No Anthropic credentials found');
    }

    try {
      const data = await httpGet(ANTHROPIC_USAGE_URL, {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code-usage/1.0',
      });

      const pct = Math.round(data.five_hour?.utilization ?? 0);
      const resetsAt = data.five_hour?.resets_at ?? null;

      return createResult({
        used: pct,
        remaining: 100 - pct,
        unit: '%',
        resetsAt,
        isValid: true,
        tiers: [{ name: 'five_hour', utilization: pct, resetsAt }],
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/anthropic.js'); console.log(p.id, p.name)"`
Expected: `anthropic Anthropic`

- [ ] **Step 3: Commit**

```bash
git add src/providers/anthropic.js
git commit -m "feat: extract Anthropic provider from api.js"
```

---

### Task 3: Implement Zhipu provider

**Files:**
- Create: `src/providers/zhipu.js`

- [ ] **Step 1: Create the Zhipu provider**

```js
// src/providers/zhipu.js
const { httpGet, createResult, errorResult, msToISO } = require('./base.js');

const DEFAULT_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';

module.exports = {
  id: 'zhipu',
  name: 'Zhipu',

  async fetchUsage(config) {
    const url = config.baseUrl || DEFAULT_URL;

    try {
      const data = await httpGet(url, {
        Authorization: config.apiKey,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en',
      });

      if (data.success === false) {
        return errorResult(data.msg || 'Zhipu API error');
      }

      const limits = data.data?.limits ?? [];
      const tokenLimits = limits
        .filter((l) => l.type?.toUpperCase() === 'TOKENS_LIMIT')
        .sort((a, b) => (a.nextResetTime ?? Infinity) - (b.nextResetTime ?? Infinity));

      const tiers = tokenLimits.slice(0, 2).map((l, idx) => ({
        name: idx === 0 ? 'five_hour' : 'weekly_limit',
        utilization: l.percentage ?? 0,
        resetsAt: msToISO(l.nextResetTime),
      }));

      const primary = tiers[0];
      return createResult({
        used: primary?.utilization ?? 0,
        remaining: 100 - (primary?.utilization ?? 0),
        unit: '%',
        resetsAt: primary?.resetsAt,
        planName: data.data?.level ?? null,
        tiers,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/zhipu.js'); console.log(p.id, p.name)"`
Expected: `zhipu Zhipu`

- [ ] **Step 3: Commit**

```bash
git add src/providers/zhipu.js
git commit -m "feat: add Zhipu GLM provider"
```

---

### Task 4: Implement Kimi provider

**Files:**
- Create: `src/providers/kimi.js`

- [ ] **Step 1: Create the Kimi provider**

```js
// src/providers/kimi.js
const { httpGet, createResult, errorResult, msToISO, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://api.kimi.com/coding/v1/usages';

module.exports = {
  id: 'kimi',
  name: 'Kimi',

  async fetchUsage(config) {
    const url = config.baseUrl || DEFAULT_URL;

    try {
      const data = await httpGet(url, {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      });

      const tiers = [];

      // 5-hour window limits
      if (Array.isArray(data.limits)) {
        for (const item of data.limits) {
          const detail = item.detail;
          if (!detail) continue;
          const limit = parseNum(detail, 'limit') ?? 1;
          const remaining = parseNum(detail, 'remaining') ?? 0;
          const used = Math.max(0, limit - remaining);
          const utilization = limit > 0 ? (used / limit) * 100 : 0;
          const resetsAt = detail.resetTime
            ? (typeof detail.resetTime === 'string' ? detail.resetTime : msToISO(detail.resetTime))
            : null;
          tiers.push({ name: 'five_hour', utilization, resetsAt });
        }
      }

      // Weekly usage
      if (data.usage) {
        const limit = parseNum(data.usage, 'limit') ?? 1;
        const remaining = parseNum(data.usage, 'remaining') ?? 0;
        const used = Math.max(0, limit - remaining);
        const utilization = limit > 0 ? (used / limit) * 100 : 0;
        const resetsAt = data.usage.resetTime
          ? (typeof data.usage.resetTime === 'string' ? data.usage.resetTime : msToISO(data.usage.resetTime))
          : null;
        tiers.push({ name: 'weekly_limit', utilization, resetsAt });
      }

      const primary = tiers[0];
      return createResult({
        used: primary?.utilization ?? 0,
        remaining: 100 - (primary?.utilization ?? 0),
        unit: '%',
        resetsAt: primary?.resetsAt,
        tiers,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/kimi.js'); console.log(p.id, p.name)"`
Expected: `kimi Kimi`

- [ ] **Step 3: Commit**

```bash
git add src/providers/kimi.js
git commit -m "feat: add Kimi For Coding provider"
```

---

### Task 5: Implement MiniMax provider

**Files:**
- Create: `src/providers/minimax.js`

- [ ] **Step 1: Create the MiniMax provider**

```js
// src/providers/minimax.js
const { httpGet, createResult, errorResult, msToISO, parseNum } = require('./base.js');

const CN_URL = 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains';
const EN_URL = 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains';

function detectDomain(baseUrl) {
  if (!baseUrl) return CN_URL;
  if (baseUrl.includes('minimax.io')) return EN_URL;
  return CN_URL;
}

module.exports = {
  id: 'minimax',
  name: 'MiniMax',

  async fetchUsage(config) {
    const url = detectDomain(config.baseUrl);

    try {
      const data = await httpGet(url, {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      });

      // Check business-level error
      if (data.base_resp && data.base_resp.status_code !== 0) {
        return errorResult(data.base_resp.status_msg || 'MiniMax API error');
      }

      const tiers = [];
      const items = data.model_remains ?? [];
      const item = items[0];

      if (item) {
        // 5-hour interval
        const intervalTotal = parseNum(item, 'current_interval_total_count') ?? 0;
        const intervalUsed = parseNum(item, 'current_interval_usage_count') ?? 0;
        const endTime = item.end_time;

        if (intervalTotal > 0) {
          tiers.push({
            name: 'five_hour',
            utilization: ((intervalTotal - intervalUsed) / intervalTotal) * 100,
            resetsAt: msToISO(endTime),
          });
        }

        // Weekly
        const weeklyTotal = parseNum(item, 'current_weekly_total_count') ?? 0;
        const weeklyUsed = parseNum(item, 'current_weekly_usage_count') ?? 0;
        const weeklyEnd = item.weekly_end_time;

        if (weeklyTotal > 0) {
          tiers.push({
            name: 'weekly_limit',
            utilization: ((weeklyTotal - weeklyUsed) / weeklyTotal) * 100,
            resetsAt: msToISO(weeklyEnd),
          });
        }
      }

      const primary = tiers[0];
      return createResult({
        used: primary?.utilization ?? 0,
        remaining: 100 - (primary?.utilization ?? 0),
        unit: '%',
        resetsAt: primary?.resetsAt,
        tiers,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/minimax.js'); console.log(p.id, p.name)"`
Expected: `minimax MiniMax`

- [ ] **Step 3: Commit**

```bash
git add src/providers/minimax.js
git commit -m "feat: add MiniMax provider"
```

---

### Task 6: Implement DeepSeek provider

**Files:**
- Create: `src/providers/deepseek.js`

- [ ] **Step 1: Create the DeepSeek provider**

```js
// src/providers/deepseek.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://api.deepseek.com/user/balance';

module.exports = {
  id: 'deepseek',
  name: 'DeepSeek',

  async fetchUsage(config) {
    try {
      const data = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      const isAvailable = data.is_available !== false;
      const infos = data.balance_infos ?? [];

      if (infos.length === 0) {
        return createResult({ remaining: 0, unit: 'CNY', isValid: isAvailable });
      }

      // Use first balance info
      const info = infos[0];
      const total = parseNum(info, 'total_balance') ?? 0;
      const currency = info.currency || 'CNY';

      return createResult({
        total,
        remaining: total,
        unit: currency,
        isValid: isAvailable,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/deepseek.js'); console.log(p.id, p.name)"`
Expected: `deepseek DeepSeek`

- [ ] **Step 3: Commit**

```bash
git add src/providers/deepseek.js
git commit -m "feat: add DeepSeek provider"
```

---

### Task 7: Implement OpenRouter provider

**Files:**
- Create: `src/providers/openrouter.js`

- [ ] **Step 1: Create the OpenRouter provider**

```js
// src/providers/openrouter.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://openrouter.ai/api/v1/credits';

module.exports = {
  id: 'openrouter',
  name: 'OpenRouter',

  async fetchUsage(config) {
    try {
      const body = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      const data = body.data ?? body;
      const totalCredits = parseNum(data, 'total_credits') ?? 0;
      const totalUsage = parseNum(data, 'total_usage') ?? 0;
      const remaining = totalCredits - totalUsage;

      return createResult({
        total: totalCredits,
        used: totalUsage,
        remaining,
        unit: 'USD',
        isValid: remaining > 0,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/openrouter.js'); console.log(p.id, p.name)"`
Expected: `openrouter OpenRouter`

- [ ] **Step 3: Commit**

```bash
git add src/providers/openrouter.js
git commit -m "feat: add OpenRouter provider"
```

---

### Task 8: Implement SiliconFlow provider

**Files:**
- Create: `src/providers/siliconflow.js`

- [ ] **Step 1: Create the SiliconFlow provider**

```js
// src/providers/siliconflow.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const CN_URL = 'https://api.siliconflow.cn/v1/user/info';
const EN_URL = 'https://api.siliconflow.com/v1/user/info';

function detectUrl(baseUrl) {
  if (!baseUrl) return CN_URL;
  if (baseUrl.includes('siliconflow.com')) return EN_URL;
  return CN_URL;
}

module.exports = {
  id: 'siliconflow',
  name: 'SiliconFlow',

  async fetchUsage(config) {
    const url = detectUrl(config.baseUrl);

    try {
      const body = await httpGet(url, {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      });

      const data = body.data ?? body;
      const totalBalance = parseNum(data, 'totalBalance') ?? 0;
      const isCn = url.includes('.cn');

      return createResult({
        total: totalBalance,
        remaining: totalBalance,
        unit: isCn ? 'CNY' : 'USD',
        isValid: true,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/siliconflow.js'); console.log(p.id, p.name)"`
Expected: `siliconflow SiliconFlow`

- [ ] **Step 3: Commit**

```bash
git add src/providers/siliconflow.js
git commit -m "feat: add SiliconFlow provider"
```

---

### Task 9: Implement StepFun provider

**Files:**
- Create: `src/providers/stepfun.js`

- [ ] **Step 1: Create the StepFun provider**

```js
// src/providers/stepfun.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://api.stepfun.com/v1/accounts';

module.exports = {
  id: 'stepfun',
  name: 'StepFun',

  async fetchUsage(config) {
    try {
      const data = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      const balance = parseNum(data, 'balance') ?? 0;

      return createResult({
        total: balance,
        remaining: balance,
        unit: 'CNY',
        isValid: true,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/stepfun.js'); console.log(p.id, p.name)"`
Expected: `stepfun StepFun`

- [ ] **Step 3: Commit**

```bash
git add src/providers/stepfun.js
git commit -m "feat: add StepFun provider"
```

---

### Task 10: Implement Novita provider

**Files:**
- Create: `src/providers/novita.js`

- [ ] **Step 1: Create the Novita provider**

```js
// src/providers/novita.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://api.novita.ai/v3/user/balance';

module.exports = {
  id: 'novita',
  name: 'Novita',

  async fetchUsage(config) {
    try {
      const data = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      // Novita amount is in 0.0001 USD units
      const available = (parseNum(data, 'availableBalance') ?? 0) / 10000;

      return createResult({
        total: available,
        remaining: available,
        unit: 'USD',
        isValid: available > 0,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "const p = require('./src/providers/novita.js'); console.log(p.id, p.name)"`
Expected: `novita Novita`

- [ ] **Step 3: Commit**

```bash
git add src/providers/novita.js
git commit -m "feat: add Novita provider"
```

---

### Task 11: Create `src/providers/registry.js` — Provider orchestration

**Files:**
- Create: `src/providers/registry.js`
- Create: `src/providers/index.js` (barrel export for easy require)

- [ ] **Step 1: Create the registry**

```js
// src/providers/registry.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

// All built-in providers
const PROVIDERS = [
  require('./anthropic.js'),
  require('./zhipu.js'),
  require('./kimi.js'),
  require('./minimax.js'),
  require('./deepseek.js'),
  require('./openrouter.js'),
  require('./siliconflow.js'),
  require('./stepfun.js'),
  require('./novita.js'),
];

const providerMap = new Map(PROVIDERS.map((p) => [p.id, p]));

/**
 * Read Claude Code settings file.
 */
function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Build the list of providers to query.
 * Anthropic is always included. Others come from settings.providers[].
 */
function resolveProviders(settings) {
  const result = [];

  // Always include Anthropic
  const anthropic = providerMap.get('anthropic');
  if (anthropic) {
    result.push({ provider: anthropic, config: {} });
  }

  // Add configured providers
  const configured = settings.providers ?? [];
  for (const entry of configured) {
    const provider = providerMap.get(entry.name);
    if (!provider) continue;
    result.push({
      provider,
      config: {
        apiKey: entry.apiKey,
        baseUrl: entry.baseUrl,
      },
    });
  }

  return result;
}

/**
 * Generate a short hash of an API key for cache keying.
 */
function hashKey(key) {
  if (!key) return 'default';
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
}

/**
 * Fetch usage for all configured providers in parallel.
 * @returns {Array<{id, name, result}>}
 */
async function fetchAllUsage() {
  const settings = readSettings();
  const providers = resolveProviders(settings);

  if (providers.length === 0) return [];

  const results = await Promise.allSettled(
    providers.map(async ({ provider, config }) => {
      const result = await provider.fetchUsage(config);
      return { id: provider.id, name: provider.name, result };
    }),
  );

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
}

module.exports = { readSettings, resolveProviders, fetchAllUsage, hashKey, providerMap };
```

- [ ] **Step 2: Create barrel export**

```js
// src/providers/index.js
const registry = require('./registry.js');
module.exports = registry;
```

- [ ] **Step 3: Verify it loads**

Run: `node -e "const r = require('./src/providers/'); console.log('providers:', r.providerMap.size)"`
Expected: `providers: 9`

- [ ] **Step 4: Commit**

```bash
git add src/providers/registry.js src/providers/index.js
git commit -m "feat: add provider registry with auto-discovery and parallel fetching"
```

---

### Task 12: Update `src/cache.js` — Multi-provider caching

**Files:**
- Modify: `src/cache.js`

- [ ] **Step 1: Replace cache.js with multi-provider version**

```js
// src/cache.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.tmpdir(), 'claude-code-usage');
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCachePath(providerId, keyHash) {
  return path.join(CACHE_DIR, `${providerId}-${keyHash}.json`);
}

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // Ignore
  }
}

function readCache(providerId, keyHash) {
  try {
    const raw = fs.readFileSync(getCachePath(providerId, keyHash), 'utf-8');
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  } catch {
    // Cache miss
  }
  return null;
}

function writeCache(providerId, keyHash, data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(
      getCachePath(providerId, keyHash),
      JSON.stringify({ timestamp: Date.now(), data }),
      'utf-8',
    );
  } catch {
    // Ignore write errors
  }
}

module.exports = { readCache, writeCache };
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "require('./src/cache.js') && echo OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/cache.js
git commit -m "feat: extend cache for multi-provider support"
```

---

### Task 13: Update `src/format.js` — Multi-provider display

**Files:**
- Modify: `src/format.js`

- [ ] **Step 1: Replace format.js with multi-provider version**

```js
// src/format.js

// ANSI 256-color gradient: dark green -> deep red
const LEVEL_COLORS = [
  '\x1b[38;5;22m',  // 0-10%  dark green
  '\x1b[38;5;28m',  // 11-20% soft green
  '\x1b[38;5;34m',  // 21-30% medium green
  '\x1b[38;5;100m', // 31-40% green-yellowish
  '\x1b[38;5;142m', // 41-50% olive
  '\x1b[38;5;178m', // 51-60% muted yellow
  '\x1b[38;5;172m', // 61-70% yellow-orange
  '\x1b[38;5;166m', // 71-80% darker orange
  '\x1b[38;5;160m', // 81-90% dark red
  '\x1b[38;5;124m', // 91-100% deep red
];

const BLUE = '\x1b[0;34m';
const GREEN = '\x1b[0;32m';
const GRAY = '\x1b[0;90m';
const YELLOW = '\x1b[0;33m';
const RED = '\x1b[0;31m';
const RESET = '\x1b[0m';
const SEP = `${GRAY} │ ${RESET}`;

function getUsageColor(pct) {
  const idx = Math.min(Math.floor(pct / 10), 9);
  return LEVEL_COLORS[idx] || LEVEL_COLORS[9];
}

function buildProgressBar(pct) {
  let filled;
  if (pct === 0) filled = 0;
  else if (pct >= 100) filled = 10;
  else filled = Math.round((pct * 10) / 100);
  filled = Math.max(0, Math.min(10, filled));
  return ' ' + '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatResetTime(resetsAt) {
  if (!resetsAt) return '';
  try {
    const d = new Date(resetsAt);
    if (isNaN(d.getTime())) return '';
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return ` → Reset: ${time}`;
  } catch {
    return '';
  }
}

/**
 * Format a single provider's usage data.
 * @param {string} name - Provider display name
 * @param {Object} result - Normalized usage result
 * @param {boolean} showName - Whether to prefix with provider name
 * @returns {string}
 */
function formatProvider(name, result, showName = true) {
  const prefix = showName ? `${name}: ` : '';

  if (!result || result.error) {
    return `${YELLOW}${prefix}~${RESET}`;
  }

  if (result.unit === '%') {
    const pct = Math.round(result.used ?? result.tiers?.[0]?.utilization ?? 0);
    const color = getUsageColor(pct);
    const bar = buildProgressBar(pct);
    const reset = formatResetTime(result.resetsAt || result.tiers?.[0]?.resetsAt);
    return `${color}${prefix}${pct}%${bar}${reset}${RESET}`;
  }

  // Currency display (USD/CNY)
  const amount = result.remaining ?? 0;
  const symbol = result.unit === 'CNY' ? '¥' : '$';
  const formatted = amount.toFixed(2);
  const color = amount > 0 ? GREEN : RED;
  return `${color}${prefix}${symbol}${formatted}${RESET}`;
}

/**
 * Format the full statusline with context info and multiple providers.
 * @param {Array<{id, name, result}>} providerResults
 * @param {Object} stdinData - Context from Claude Code stdin
 * @returns {string}
 */
function formatStatusLine(providerResults, stdinData) {
  const parts = [];

  // Directory name
  const cwd = stdinData?.cwd || stdinData?.workspace?.current_dir || '';
  if (cwd) {
    const dirName = cwd.split('/').pop() || cwd.split('\\').pop() || cwd;
    parts.push(`${BLUE}${dirName}${RESET}`);
  }

  // Git branch
  try {
    const { execSync } = require('child_process');
    const branch = execSync('git branch --show-current 2>/dev/null', {
      encoding: 'utf-8',
      cwd: cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (branch) {
      parts.push(`${GREEN}⏇ ${branch}${RESET}`);
    }
  } catch {
    // Not a git repo
  }

  // Provider usage
  if (providerResults.length === 0) {
    parts.push(`${YELLOW}Usage: ~${RESET}`);
  } else if (providerResults.length === 1) {
    // Single provider: no name prefix (backward compatible)
    parts.push(formatProvider('Usage', providerResults[0].result, false));
  } else {
    // Multiple providers: show name prefix
    for (const { name, result } of providerResults) {
      parts.push(formatProvider(name, result, true));
    }
  }

  return parts.join(SEP);
}

module.exports = { formatStatusLine, formatProvider };
```

- [ ] **Step 2: Verify it loads**

Run: `node -e "require('./src/format.js') && echo OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/format.js
git commit -m "feat: extend formatter for multi-provider display"
```

---

### Task 14: Update `src/index.js` — Wire everything together

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Replace index.js with registry-based version**

```js
// src/index.js
const { fetchAllUsage, hashKey } = require('./providers/index.js');
const { readCache, writeCache } = require('./cache.js');
const { formatStatusLine } = require('./format.js');

const TOTAL_TIMEOUT = 8000; // 8 seconds total

async function run() {
  // Read stdin (Claude Code sends JSON context)
  let stdinData = {};
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8').trim();
    if (raw) stdinData = JSON.parse(raw);
  } catch {
    // Ignore stdin parse errors
  }

  // Fetch usage from all providers (with timeout)
  let providerResults = [];

  try {
    const fetchPromise = fetchAllUsage();
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve([]), TOTAL_TIMEOUT);
    });

    providerResults = await Promise.race([fetchPromise, timeoutPromise]);

    // Cache results per provider
    for (const { id, result } of providerResults) {
      if (result && !result.error) {
        writeCache(id, 'default', result);
      }
    }
  } catch {
    // Fetch failed entirely
  }

  // Fill in from cache for any providers that failed or timed out
  // (fetchAllUsage already handles its own errors, but we can add cache fallback here if needed)

  process.stdout.write(formatStatusLine(providerResults, stdinData) + '\n');
}

module.exports = { run };
```

- [ ] **Step 2: Test the full flow (no providers configured, backward compatible)**

Run: `echo '{}' | node -e "require('./src/index.js').run()"`
Expected: Outputs a statusline with Anthropic usage or `~` (depending on credentials)

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: wire up multi-provider registry in entry point"
```

---

### Task 15: Clean up old `src/api.js`

**Files:**
- Modify: `src/api.js` (remove or keep as re-export)

- [ ] **Step 1: Keep api.js as a thin re-export for backward compatibility**

```js
// src/api.js
// Kept for backward compatibility. The actual implementation is in providers/anthropic.js.
const anthropic = require('./providers/anthropic.js');

async function fetchUsage(accessToken) {
  // Legacy interface: called with an explicit access token
  // Redirect to the provider's fetchUsage
  const result = await anthropic.fetchUsage({});
  // Return raw API data for backward compat
  return result;
}

module.exports = { fetchUsage };
```

- [ ] **Step 2: Verify nothing breaks**

Run: `node -e "require('./src/api.js') && echo OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/api.js
git commit -m "chore: keep api.js as backward-compatible re-export"
```

---

### Task 16: Integration test — Manual verification

- [ ] **Step 1: Test with no providers configured (backward compatible)**

Run: `echo '{}' | node -e "require('./src/index.js').run()"`
Expected: Statusline with Anthropic usage or `~`

- [ ] **Step 2: Test with a mock providers config**

Create a temporary test file:
```bash
cat > /tmp/test-multi.js << 'EOF'
// Mock the settings file
const fs = require('fs');
const os = require('os');
const path = require('path');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch {}

// Temporarily add a test provider (won't actually call API, just test registry)
settings.providers = [{ name: 'deepseek', apiKey: 'test-key' }];
console.log('Config:', JSON.stringify(settings.providers, null, 2));

// Test registry
const { resolveProviders, providerMap } = require('./src/providers/registry.js');
const resolved = resolveProviders(settings);
console.log('Resolved providers:', resolved.map(r => r.provider.id));
EOF
node /tmp/test-multi.js
```
Expected: `Resolved providers: [ 'anthropic', 'deepseek' ]`

- [ ] **Step 3: Test format output**

```bash
node -e "
const { formatStatusLine } = require('./src/format.js');
const results = [
  { id: 'anthropic', name: 'Anthropic', result: { used: 7, remaining: 93, unit: '%', resetsAt: '2026-05-20T22:00:00Z', tiers: [{name:'five_hour',utilization:7,resetsAt:'2026-05-20T22:00:00Z'}] } },
  { id: 'zhipu', name: 'Zhipu', result: { used: 44, remaining: 56, unit: '%', tiers: [{name:'five_hour',utilization:44}] } },
  { id: 'deepseek', name: 'DeepSeek', result: { remaining: 12.50, unit: 'CNY' } },
];
console.log(formatStatusLine(results, { cwd: '/home/user/myproject' }));
"
```
Expected: Multi-provider statusline output

- [ ] **Step 4: Clean up temp file**

```bash
rm -f /tmp/test-multi.js
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: multi-provider usage tracking complete

Supports: Anthropic, Zhipu, Kimi, MiniMax, DeepSeek, OpenRouter,
SiliconFlow, StepFun, Novita.

Configure in ~/.claude/settings.json under 'providers' array.
Anthropic is always enabled by default (reads system credentials)."
```
