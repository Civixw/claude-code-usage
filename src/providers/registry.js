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
