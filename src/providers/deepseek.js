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
