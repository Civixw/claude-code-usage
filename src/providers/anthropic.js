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
