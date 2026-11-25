'use strict';

function csvCell(value) {
  const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function rewardLogCsv(entries) {
  return '\uFEFF' + ['time,reward', ...entries.map(({ time, reward }) =>
    [csvCell(time), csvCell(reward)].join(',')
  )].join('\r\n') + '\r\n';
}

module.exports = { rewardLogCsv };
