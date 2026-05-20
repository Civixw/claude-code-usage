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
