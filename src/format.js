// src/format.js

// ANSI 256-color gradient: bright green -> bright red
const LEVEL_COLORS = [
  '\x1b[38;5;46m',  // 0-10%  bright green
  '\x1b[38;5;82m',  // 11-20% light green
  '\x1b[38;5;118m', // 21-30% medium green
  '\x1b[38;5;154m', // 31-40% green-yellow
  '\x1b[38;5;190m', // 41-50% yellow-green
  '\x1b[38;5;226m', // 51-60% bright yellow
  '\x1b[38;5;220m', // 61-70% yellow-orange
  '\x1b[38;5;214m', // 71-80% orange
  '\x1b[38;5;208m', // 81-90% bright red-orange
  '\x1b[38;5;196m', // 91-100% bright red
];

const BLUE = '\x1b[38;5;39m';
const GREEN = '\x1b[38;5;46m';
const GRAY = '\x1b[38;5;245m';
const YELLOW = '\x1b[38;5;226m';
const RED = '\x1b[38;5;196m';
const RESET = '\x1b[0m';
const SEP = `${GRAY} │ ${RESET}`;

function getUsageColor(pct) {
  const idx = Math.min(Math.floor(pct / 10), 9);
  return LEVEL_COLORS[idx] || LEVEL_COLORS[9];
}

function buildProgressBar(pct) {
  let filled;
  if (pct === 0) filled = 0;
  else if (pct >= 100) filled = 10;
  else filled = Math.round((pct * 10) / 100);
  filled = Math.max(0, Math.min(10, filled));
  return ' ' + '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

function formatResetTime(resetsAt) {
  if (!resetsAt) return '';
  try {
    const d = new Date(resetsAt);
    if (isNaN(d.getTime())) return '';

    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');

    return ` → Reset: ${d.getFullYear()}-${month}-${day} ${hour}:${minute}`;
  } catch {
    return '';
  }
}

/**
 * Format a single provider's usage data.
 * @param {string} name - Provider display name
 * @param {Object} result - Normalized usage result
 * @param {boolean} showName - Whether to prefix with provider name
 * @returns {string}
 */
function formatProvider(name, result, showName = true) {
  const prefix = showName ? `${name}: ` : '';

  if (!result || result.error) {
    return `${YELLOW}${prefix}~${RESET}`;
  }

  if (result.unit === '%') {
    const tiers = result.tiers || [];
    if (tiers.length === 0) {
      // Single tier display (backward compatible)
      const pct = Math.round(result.used ?? 0);
      const color = getUsageColor(pct);
      const bar = buildProgressBar(pct);
      return `${color}${prefix}${pct}%${bar}${RESET}`;
    }

    // Multi-tier display
    const parts = [];
    for (const tier of tiers) {
      const pct = Math.round(tier.utilization ?? 0);
      const color = getUsageColor(pct);
      const bar = buildProgressBar(pct);
      const reset = formatResetTime(tier.resetsAt);

      // Tier label: "5h" for five_hour, "周" for weekly_limit
      let label = '';
      if (tier.name === 'five_hour') label = '5h';
      else if (tier.name === 'weekly_limit') label = '周';

      parts.push(`${color}${pct}%${bar}${label ? ' ' + label : ''}${reset}${RESET}`);
    }

    return parts.join(' | ');
  }

  // Currency display (USD/CNY)
  const amount = result.remaining ?? 0;
  const symbol = result.unit === 'CNY' ? '¥' : '$';
  const formatted = amount.toFixed(2);
  const color = amount > 0 ? GREEN : RED;
  return `${color}${prefix}${symbol}${formatted}${RESET}`;
}

/**
 * Format the full statusline with context info and multiple providers.
 * @param {Array<{id, name, result}>} providerResults
 * @param {Object} stdinData - Context from Claude Code stdin
 * @returns {string}
 */
function formatStatusLine(providerResults, stdinData) {
  const parts = [];

  // Directory name
  const cwd = stdinData?.cwd || stdinData?.workspace?.current_dir || '';
  if (cwd) {
    const dirName = cwd.split('/').pop() || cwd.split('\\').pop() || cwd;
    parts.push(`${YELLOW}${dirName}${RESET}`);
  }

  // Git branch
  try {
    const { execSync } = require('child_process');
    const branch = execSync('git branch --show-current 2>/dev/null', {
      encoding: 'utf-8',
      cwd: cwd || undefined,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (branch) {
      parts.push(`${GREEN}⎇ ${branch}${RESET}`);
    }
  } catch {
    // Not a git repo
  }

  // Provider usage
  if (providerResults.length === 0) {
    parts.push(`${YELLOW}Usage: ~${RESET}`);
  } else if (providerResults.length === 1) {
    // Single provider: no name prefix (backward compatible)
    parts.push(formatProvider('Usage', providerResults[0].result, false));
  } else {
    // Multiple providers: show name prefix
    for (const { name, result } of providerResults) {
      parts.push(formatProvider(name, result, true));
    }
  }

  return parts.join(SEP);
}

module.exports = { formatStatusLine, formatProvider };
