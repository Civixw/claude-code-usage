// src/index.js
const { fetchAllUsage } = require('./providers/index.js');
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

  // Fallback to cache for any providers that failed or timed out
  if (providerResults.length === 0) {
    const { readSettings, resolveProviders, providerMap } = require('./providers/index.js');
    const settings = readSettings();
    const configured = resolveProviders(settings);
    for (const { provider } of configured) {
      const cached = readCache(provider.id, 'default');
      if (cached) {
        providerResults.push({ id: provider.id, name: provider.name, result: cached });
      }
    }
  }

  process.stdout.write(formatStatusLine(providerResults, stdinData) + '\n');
}

module.exports = { run };
