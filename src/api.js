// src/api.js
// Kept for backward compatibility. The actual implementation is in providers/anthropic.js.
const anthropic = require('./providers/anthropic.js');

async function fetchUsage(accessToken) {
  // Legacy interface: called with an explicit access token
  // Redirect to the provider's fetchUsage
  const result = await anthropic.fetchUsage({});
  // Return raw API data for backward compat
  return result;
}

module.exports = { fetchUsage };
