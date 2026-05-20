// src/providers/anthropic.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getAccessToken } = require('../credentials.js');
const { httpGet, createResult, errorResult, msToISO } = require('./base.js');

function readSettings() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Detect if using Zhipu GLM (BigModel) endpoint
function isZhipu(baseUrl) {
  if (!baseUrl) return false;
  return baseUrl.includes('bigmodel.cn') || baseUrl.includes('api.z.ai');
}

// Fetch usage from Zhipu's native API
async function fetchZhipuUsage(token) {
  const url = 'https://api.z.ai/api/monitor/usage/quota/limit';

  const data = await httpGet(url, {
    Authorization: token, // Zhipu doesn't use Bearer prefix
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en',
  });

  if (data.success === false) {
    throw new Error(data.msg || 'Zhipu API error');
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
  return {
    pct: primary?.utilization ?? 0,
    resetsAt: primary?.resetsAt,
    planName: data.data?.level ?? null,
    tiers,
  };
}

// Fetch usage from Anthropic OAuth API
async function fetchAnthropicUsage(token) {
  const url = 'https://api.anthropic.com/api/oauth/usage';

  const data = await httpGet(url, {
    Authorization: `Bearer ${token}`,
    'anthropic-beta': 'oauth-2025-04-20',
    'User-Agent': 'claude-code-usage/1.0',
  });

  return {
    pct: Math.round(data.five_hour?.utilization ?? 0),
    resetsAt: data.five_hour?.resets_at ?? null,
    tiers: [{ name: 'five_hour', utilization: data.five_hour?.utilization ?? 0, resetsAt: data.five_hour?.resets_at ?? null }],
  };
}

module.exports = {
  id: 'anthropic',
  name: 'Anthropic',

  async fetchUsage(config) {
    const settings = readSettings();

    // Try OAuth token from system credentials first
    let token = getAccessToken();

    // Fall back to ANTHROPIC_AUTH_TOKEN from settings
    if (!token && settings.env?.ANTHROPIC_AUTH_TOKEN) {
      token = settings.env.ANTHROPIC_AUTH_TOKEN;
    }

    if (!token) {
      return errorResult('No Anthropic credentials found');
    }

    const baseUrl = settings.env?.ANTHROPIC_BASE_URL;

    try {
      let result;

      if (isZhipu(baseUrl)) {
        // Use Zhipu's native usage API
        const zhipuData = await fetchZhipuUsage(token);
        result = createResult({
          used: zhipuData.pct,
          remaining: 100 - zhipuData.pct,
          unit: '%',
          resetsAt: zhipuData.resetsAt,
          planName: zhipuData.planName,
          isValid: true,
          tiers: zhipuData.tiers,
        });
      } else {
        // Use Anthropic OAuth API
        const anthropicData = await fetchAnthropicUsage(token);
        result = createResult({
          used: anthropicData.pct,
          remaining: 100 - anthropicData.pct,
          unit: '%',
          resetsAt: anthropicData.resetsAt,
          isValid: true,
          tiers: anthropicData.tiers,
        });
      }

      return result;
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
