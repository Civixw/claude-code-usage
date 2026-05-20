// src/providers/openrouter.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://openrouter.ai/api/v1/credits';

module.exports = {
  id: 'openrouter',
  name: 'OpenRouter',

  async fetchUsage(config) {
    try {
      const body = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      const data = body.data ?? body;
      const totalCredits = parseNum(data, 'total_credits') ?? 0;
      const totalUsage = parseNum(data, 'total_usage') ?? 0;
      const remaining = totalCredits - totalUsage;

      return createResult({
        total: totalCredits,
        used: totalUsage,
        remaining,
        unit: 'USD',
        isValid: true,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
