// src/providers/stepfun.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const DEFAULT_URL = 'https://api.stepfun.com/v1/accounts';

module.exports = {
  id: 'stepfun',
  name: 'StepFun',

  async fetchUsage(config) {
    try {
      const data = await httpGet(
        config.baseUrl || DEFAULT_URL,
        {
          Authorization: `Bearer ${config.apiKey}`,
          Accept: 'application/json',
        },
      );

      const balance = parseNum(data, 'balance') ?? 0;

      return createResult({
        total: balance,
        remaining: balance,
        unit: 'CNY',
        isValid: true,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
