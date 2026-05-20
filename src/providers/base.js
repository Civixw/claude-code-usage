// src/providers/base.js
const https = require('https');
const http = require('http');

const DEFAULT_TIMEOUT = 5000;

/**
 * Make an HTTPS GET request.
 * @param {string} url - Full URL to request
 * @param {Object} headers - Request headers
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Parsed JSON response
 */
function httpGet(url, headers = {}, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.get(url, { headers, timeout }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

/**
 * Create a normalized usage result.
 */
function createResult({ total, used, remaining, unit, resetsAt, planName, isValid, tiers, error } = {}) {
  return {
    total: total ?? null,
    used: used ?? null,
    remaining: remaining ?? null,
    unit: unit ?? '%',
    resetsAt: resetsAt ?? null,
    planName: planName ?? null,
    isValid: isValid ?? (error ? false : true),
    tiers: tiers ?? [],
    error: error ?? null,
  };
}

/**
 * Create an error result.
 */
function errorResult(message) {
  return createResult({ isValid: false, error: message });
}

/**
 * Parse a numeric field from JSON, handling both number and string formats.
 */
function parseNum(obj, field) {
  const v = obj?.[field];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? null : n; }
  return null;
}

/**
 * Convert milliseconds timestamp to ISO 8601 string.
 * Auto-detects seconds vs milliseconds.
 */
function msToISO(ms) {
  if (!ms) return null;
  // If < 1e12, it's seconds; otherwise milliseconds
  const millis = ms < 1e12 ? ms * 1000 : ms;
  try {
    return new Date(millis).toISOString();
  } catch {
    return null;
  }
}

module.exports = { httpGet, createResult, errorResult, parseNum, msToISO, DEFAULT_TIMEOUT };
