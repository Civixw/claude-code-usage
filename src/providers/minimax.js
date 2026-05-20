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
