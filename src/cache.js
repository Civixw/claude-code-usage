// src/cache.js
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.tmpdir(), 'claude-code-usage');
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCachePath(providerId, keyHash) {
  return path.join(CACHE_DIR, `${providerId}-${keyHash}.json`);
}

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // Ignore
  }
}

function readCache(providerId, keyHash) {
  try {
    const raw = fs.readFileSync(getCachePath(providerId, keyHash), 'utf-8');
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  } catch {
    // Cache miss
  }
  return null;
}

function writeCache(providerId, keyHash, data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(
      getCachePath(providerId, keyHash),
      JSON.stringify({ timestamp: Date.now(), data }),
      'utf-8',
    );
  } catch {
    // Ignore write errors
  }
}

module.exports = { readCache, writeCache };
