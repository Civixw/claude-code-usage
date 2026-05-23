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

      // DEBUG: Log raw API response to understand data structure
      const fs = require('fs');
      fs.writeFileSync('/tmp/zhipu-raw-response.json', JSON.stringify(data, null, 2));

      const limits = data.data?.limits ?? [];
      const tokenLimits = limits
        .filter((l) => l.type?.toUpperCase() === 'TOKENS_LIMIT')
        .sort((a, b) => (a.nextResetTime ?? Infinity) - (b.nextResetTime ?? Infinity));

      const tiers = tokenLimits.slice(0, 2).map((l, idx) => ({
        // Zhipu API returns weekly limit first, then 5-hour limit
        name: idx === 0 ? 'weekly_limit' : 'five_hour',
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
