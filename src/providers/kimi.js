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
