// src/providers/siliconflow.js
const { httpGet, createResult, errorResult, parseNum } = require('./base.js');

const CN_URL = 'https://api.siliconflow.cn/v1/user/info';
const EN_URL = 'https://api.siliconflow.com/v1/user/info';

function detectUrl(baseUrl) {
  if (!baseUrl) return CN_URL;
  if (baseUrl.includes('siliconflow.com')) return EN_URL;
  return CN_URL;
}

module.exports = {
  id: 'siliconflow',
  name: 'SiliconFlow',

  async fetchUsage(config) {
    const url = detectUrl(config.baseUrl);

    try {
      const body = await httpGet(url, {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json',
      });

      const data = body.data ?? body;
      const totalBalance = parseNum(data, 'totalBalance') ?? 0;
      const isCn = url.includes('.cn');

      return createResult({
        total: totalBalance,
        remaining: totalBalance,
        unit: isCn ? 'CNY' : 'USD',
        isValid: true,
      });
    } catch (err) {
      return errorResult(err.message);
    }
  },
};
