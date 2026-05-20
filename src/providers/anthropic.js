// src/providers/anthropic.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getAccessToken } = require('../credentials.js');
const { httpGet, createResult, errorResult } = require('./base.js');

function readSettings() {
  try {
    const raw = fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
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

    // Build usage URL from BASE_URL settings
    const baseUrl = settings.env?.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const usageUrl = baseUrl.replace(/\/$/, '') + '/api/oauth/usage';

    try {
      const data = await httpGet(usageUrl, {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code-usage/1.0',
      });

      const pct = Math.round(data.five_hour?.utilization ?? 0);
      const resetsAt = data.five_hour?.resets_at ?? null;

      return createResult({
        used: pct,
        remaining: 100 - (pct),
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
