'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { dateSerial, timeMinutes, MAX_STOCK } = require('../rewards');

const UPDATE_SCOPES = new Set(['patch', 'minor', 'major']);
const BUNDLED_VIDEOS = [
  'Max & Mila’s World • din 12 Octombrie 2026.mp4',
  'SilverCrest. Прави живота ти лесен.mp4'
];
const MEDALLION = {
  id: 'bundled-reward-8',
  name: 'Medallion',
  source: 'bundled:assets/gift8-MEDALLION.webp',
  quantity: 70,
  restockDaily: true,
  dailyQuantity: 70
};
const BUNDLED_REWARDS = [
  'Mila’s salmon mousse', 'Mila’s trout chunks', 'Max’s beef chunks',
  'Max’s chicken pâté', 'Max’s beef croquettes', 'Max’s chew sticks',
  'Max’s heart-shaped biscuits', 'Max’s beef skin chew sticks'
].map((name, index) => ({
  id: `bundled-reward-${index}`, name, source: `bundled:assets/gift${index}.webp`,
  quantity: 0, restockDaily: false, dailyQuantity: 0
})).concat(MEDALLION);

function id() {
  return crypto.randomUUID();
}

function defaultSettings() {
  return {
    schemaVersion: 3,
    configured: false,
    gameSeconds: 120,
    resultIdleSeconds: 60,
    rewards: [{ ...MEDALLION }],
    videos: BUNDLED_VIDEOS.map((name, index) => ({
      id: `bundled-video-${index}`,
      name,
      source: `bundled:Video/${name}`,
      muted: false
    })),
    startAtLogin: false,
    updates: {
      enabled: true,
      scope: 'minor'
    },
    videoAutoplay: {
      enabled: false,
      idleSeconds: 300
    },
    workingHours: {
      enabled: true, startDate: '2026-11-28', endDate: '2026-11-29', startTime: '11:00', endTime: '17:00'
    },
    rewardChances: {
      points: [{ minute: 7, percent: 0 }, { minute: 13, percent: 100 }]
    },
    logRewardWins: false,
    rewardState: { lastAwardAt: null, stockThroughDate: null },
    rewardLog: []
  };
}

function integer(value, fallback, minimum, maximum) {
  const result = Number(value);
  return Number.isInteger(result) && result >= minimum && result <= maximum ? result : fallback;
}

function safeSource(value, kind) {
  if (typeof value !== 'string') return null;
  const prefix = kind === 'reward' ? 'assets/' : 'Video/';
  if (value.startsWith(`bundled:${prefix}`) && !value.includes('..')) return value;
  if (value.startsWith(`user:${kind === 'reward' ? 'images' : 'videos'}/`) && !value.includes('..')) return value;
  return null;
}

function date(value, fallback) {
  return typeof value === 'string' && Number.isFinite(dateSerial(value)) ? value : fallback;
}

function time(value, fallback) {
  return typeof value === 'string' && timeMinutes(value) >= 0 ? value : fallback;
}

function normalizeChancePoints(points, fallback) {
  if (!Array.isArray(points) || points.length === 0 || points.length > 24) return fallback;
  const result = [];
  const minutes = new Set();
  for (const point of points) {
    const { minute, percent } = point ?? {};
    if (
      !Number.isInteger(minute) || minute < 0 || minute > 1440 || minutes.has(minute) ||
      !Number.isInteger(percent) || percent < 0 || percent > 100
    ) return fallback;
    minutes.add(minute);
    result.push({ minute, percent });
  }
  return result.sort((left, right) => left.minute - right.minute);
}

function name(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback;
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
}

function migrateMedallion(campaign, state, hours) {
  const dailyQuantity = integer(campaign?.dailyMedallions, MEDALLION.dailyQuantity, 0, 999999);
  let stockThroughDate = hours.startDate;
  let awarded = 0;
  let lastAwardAt = null;
  for (const [day, record] of Object.entries(state?.days ?? {})) {
    if (!date(day, null) || day < hours.startDate || day > hours.endDate || !record) continue;
    if (day > stockThroughDate) stockThroughDate = day;
    awarded += integer(record.medallions, 0, 0, MAX_STOCK);
    const awardAt = timestamp(record.lastMedallionAt);
    if (awardAt && (!lastAwardAt || awardAt > lastAwardAt)) lastAwardAt = awardAt;
  }
  const days = dateSerial(stockThroughDate) - dateSerial(hours.startDate) + 1;
  const quantity = Math.max(0, Math.min(MAX_STOCK, days * dailyQuantity - awarded));
  return { reward: { ...MEDALLION, quantity, dailyQuantity }, rewardState: { lastAwardAt, stockThroughDate } };
}

function normalizeSettings(value) {
  const defaults = defaultSettings();
  const input = value && typeof value === 'object' ? value : {};
  const rewardIds = new Set();
  const rewards = Array.isArray(input.rewards) ? input.rewards.slice(0, 100).map((reward) => {
    const source = safeSource(reward?.source, 'reward');
    if (!source) return null;
    const candidate = typeof reward.id === 'string' && reward.id ? reward.id.slice(0, 100) : id();
    const rewardId = rewardIds.has(candidate) ? id() : candidate;
    rewardIds.add(rewardId);
    return {
      id: rewardId,
      name: name(reward.name, BUNDLED_REWARDS.find((entry) => entry.source === source)?.name ?? path.basename(source)),
      source,
      quantity: integer(reward.quantity, 0, 0, MAX_STOCK),
      restockDaily: reward.restockDaily === true,
      dailyQuantity: integer(reward.dailyQuantity, 0, 0, 999999)
    };
  }).filter(Boolean) : defaults.rewards;
  const videos = Array.isArray(input.videos) ? input.videos.slice(0, 100).map((video) => {
    const source = safeSource(video?.source, 'video');
    if (!source) return null;
    return {
      id: typeof video.id === 'string' && video.id ? video.id.slice(0, 100) : id(),
      name: name(video.name, path.basename(source)),
      source,
      muted: video.muted === true
    };
  }).filter(Boolean) : defaults.videos;
  const scope = UPDATE_SCOPES.has(input.updates?.scope) ? input.updates.scope : defaults.updates.scope;
  const legacy = input.rewardCampaign;
  const hoursInput = input.workingHours ?? legacy ?? {};
  let startDate = date(hoursInput.startDate, defaults.workingHours.startDate);
  let endDate = date(hoursInput.endDate, defaults.workingHours.endDate);
  let startTime = time(hoursInput.startTime, defaults.workingHours.startTime);
  let endTime = time(hoursInput.endTime, defaults.workingHours.endTime);
  if (dateSerial(endDate) < dateSerial(startDate)) {
    startDate = defaults.workingHours.startDate;
    endDate = defaults.workingHours.endDate;
  }
  if (timeMinutes(endTime) <= timeMinutes(startTime)) {
    startTime = defaults.workingHours.startTime;
    endTime = defaults.workingHours.endTime;
  }
  const workingHours = {
    enabled: typeof hoursInput.enabled === 'boolean' ? hoursInput.enabled : defaults.workingHours.enabled,
    startDate, endDate, startTime, endTime
  };
  const guarantee = integer(legacy?.guaranteeMinutes, null, 1, 1440);
  const defaultPoints = guarantee === null ? defaults.rewardChances.points
    : [{ minute: 0, percent: 0 }, { minute: guarantee, percent: 100 }];
  const curveWasDisabled = (input.rewardChances ?? legacy)?.enabled === false;
  let rewardState = {
    lastAwardAt: timestamp(input.rewardState?.lastAwardAt),
    stockThroughDate: date(input.rewardState?.stockThroughDate, null)
  };
  if (legacy && !input.workingHours && legacy.enabled !== false) {
    const migrated = migrateMedallion(legacy, input.rewardCampaignState, workingHours);
    if (!rewards.some((reward) => reward.source === MEDALLION.source)) {
      if (rewards.length < 100) rewards.unshift(migrated.reward);
    } else if (!Array.isArray(input.rewards)) {
      rewards[0] = migrated.reward;
    }
    rewardState = migrated.rewardState;
  }

  return {
    schemaVersion: 3,
    configured: input.configured === true,
    gameSeconds: integer(Number(input.gameSeconds), defaults.gameSeconds, 1, 24 * 60 * 60),
    resultIdleSeconds: integer(input.resultIdleSeconds, defaults.resultIdleSeconds, 0, 3600),
    rewards,
    videos,
    startAtLogin: input.startAtLogin === true,
    updates: {
      enabled: input.updates?.enabled !== false,
      scope
    },
    videoAutoplay: {
      enabled: input.videoAutoplay?.enabled === true,
      idleSeconds: integer(
        input.videoAutoplay?.idleSeconds ?? Number(input.videoAutoplay?.idleMinutes) * 60,
        defaults.videoAutoplay.idleSeconds, 1, 86400
      )
    },
    workingHours,
    rewardChances: {
      points: curveWasDisabled
        ? [{ minute: 0, percent: 100 }]
        : normalizeChancePoints(input.rewardChances?.points ?? legacy?.chancePoints, defaultPoints)
    },
    logRewardWins: input.logRewardWins === true,
    rewardState,
    rewardLog: Array.isArray(input.rewardLog) ? input.rewardLog.flatMap((entry) => {
      const time = timestamp(entry?.time);
      const reward = name(entry?.reward, '');
      return time && reward ? [{ time, reward }] : [];
    }) : []
  };
}

module.exports = { BUNDLED_REWARDS, defaultSettings, normalizeSettings };
