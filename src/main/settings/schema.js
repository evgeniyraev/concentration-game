'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const {
  dateSerial,
  emptyCampaignState,
  normalizeCampaignState,
  timeMinutes
} = require('../reward-campaign');

const UPDATE_SCOPES = new Set(['patch', 'minor', 'major']);
const BUNDLED_VIDEOS = [
  'Max & Mila’s World • din 12 Octombrie 2026.mp4',
  'SilverCrest. Прави живота ти лесен.mp4'
];

function id() {
  return crypto.randomUUID();
}

function defaultSettings() {
  const rewardCampaign = {
    enabled: true,
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    startTime: '11:00',
    endTime: '17:00',
    guaranteeMinutes: 20,
    dailyMedallions: 70,
    dailySmiles: 1000
  };
  return {
    schemaVersion: 2,
    configured: false,
    gameSeconds: 120,
    rewards: Array.from({ length: 8 }, (_, index) => ({
      id: `bundled-reward-${index}`,
      source: `bundled:assets/gift${index}.webp`,
      quantity: 0
    })),
    videos: BUNDLED_VIDEOS.map((name, index) => ({
      id: `bundled-video-${index}`,
      name,
      source: `bundled:Video/${name}`
    })),
    startAtLogin: false,
    updates: {
      enabled: true,
      scope: 'patch'
    },
    videoAutoplay: {
      enabled: false,
      idleMinutes: 5
    },
    rewardCampaign,
    rewardCampaignState: emptyCampaignState(rewardCampaign)
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
  return typeof value === 'string' && dateSerial(value) ? value : fallback;
}

function time(value, fallback) {
  return typeof value === 'string' && timeMinutes(value) >= 0 ? value : fallback;
}

function normalizeSettings(value) {
  const defaults = defaultSettings();
  const input = value && typeof value === 'object' ? value : {};
  const rewards = Array.isArray(input.rewards) ? input.rewards.slice(0, 100).map((reward) => {
    const source = safeSource(reward?.source, 'reward');
    if (!source) return null;
    return {
      id: typeof reward.id === 'string' && reward.id ? reward.id.slice(0, 100) : id(),
      source,
      quantity: integer(Number(reward.quantity), 0, 0, 999999)
    };
  }).filter(Boolean) : defaults.rewards;
  const videos = Array.isArray(input.videos) ? input.videos.slice(0, 100).map((video) => {
    const source = safeSource(video?.source, 'video');
    if (!source) return null;
    return {
      id: typeof video.id === 'string' && video.id ? video.id.slice(0, 100) : id(),
      name: typeof video.name === 'string' && video.name.trim()
        ? video.name.trim().slice(0, 300)
        : path.basename(source),
      source
    };
  }).filter(Boolean) : defaults.videos;
  const scope = UPDATE_SCOPES.has(input.updates?.scope) ? input.updates.scope : defaults.updates.scope;
  const campaignInput = input.rewardCampaign && typeof input.rewardCampaign === 'object'
    ? input.rewardCampaign
    : {};
  let startDate = date(campaignInput.startDate, defaults.rewardCampaign.startDate);
  let endDate = date(campaignInput.endDate, defaults.rewardCampaign.endDate);
  let startTime = time(campaignInput.startTime, defaults.rewardCampaign.startTime);
  let endTime = time(campaignInput.endTime, defaults.rewardCampaign.endTime);
  if (dateSerial(endDate) < dateSerial(startDate)) {
    startDate = defaults.rewardCampaign.startDate;
    endDate = defaults.rewardCampaign.endDate;
  }
  if (timeMinutes(endTime) <= timeMinutes(startTime)) {
    startTime = defaults.rewardCampaign.startTime;
    endTime = defaults.rewardCampaign.endTime;
  }
  const rewardCampaign = {
    enabled: campaignInput.enabled !== false,
    startDate,
    endDate,
    startTime,
    endTime,
    guaranteeMinutes: integer(
      Number(campaignInput.guaranteeMinutes),
      defaults.rewardCampaign.guaranteeMinutes,
      1,
      1440
    ),
    dailyMedallions: integer(
      Number(campaignInput.dailyMedallions),
      defaults.rewardCampaign.dailyMedallions,
      0,
      999999
    ),
    dailySmiles: integer(
      Number(campaignInput.dailySmiles),
      defaults.rewardCampaign.dailySmiles,
      0,
      999999
    )
  };

  const settings = {
    schemaVersion: 2,
    configured: input.configured === true,
    gameSeconds: integer(Number(input.gameSeconds), defaults.gameSeconds, 1, 24 * 60 * 60),
    rewards,
    videos,
    startAtLogin: input.startAtLogin === true,
    updates: {
      enabled: input.updates?.enabled !== false,
      scope
    },
    videoAutoplay: {
      enabled: input.videoAutoplay?.enabled === true,
      idleMinutes: integer(Number(input.videoAutoplay?.idleMinutes), defaults.videoAutoplay.idleMinutes, 1, 1440)
    },
    rewardCampaign
  };
  settings.rewardCampaignState = normalizeCampaignState(input.rewardCampaignState, rewardCampaign);
  return settings;
}

module.exports = { defaultSettings, normalizeSettings };
