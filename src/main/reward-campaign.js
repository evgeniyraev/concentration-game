'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COUNTER = 999_999_999;

function campaignKey(campaign) {
  return JSON.stringify([
    campaign.enabled,
    campaign.startDate,
    campaign.endDate,
    campaign.startTime,
    campaign.endTime,
    campaign.guaranteeMinutes,
    campaign.dailyMedallions,
    campaign.dailySmiles
  ]);
}

function emptyCampaignState(campaign) {
  return {
    campaignKey: campaignKey(campaign),
    days: {}
  };
}

function boundedInteger(value, maximum = MAX_COUNTER) {
  return Number.isInteger(value) && value >= 0 && value <= maximum ? value : 0;
}

function normalizeCampaignState(value, campaign) {
  const expectedKey = campaignKey(campaign);
  if (!value || value.campaignKey !== expectedKey || typeof value.days !== 'object') {
    return emptyCampaignState(campaign);
  }

  const days = {};
  for (const [date, day] of Object.entries(value.days).slice(0, 3660)) {
    if (!dateSerial(date) || !day || typeof day !== 'object') continue;
    days[date] = {
      medallions: boundedInteger(day.medallions),
      smiles: boundedInteger(day.smiles),
      lastMedallionAt: typeof day.lastMedallionAt === 'string' &&
        Number.isFinite(Date.parse(day.lastMedallionAt))
        ? new Date(day.lastMedallionAt).toISOString()
        : null
    };
  }

  return { campaignKey: expectedKey, days };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateSerial(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return 0;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = Date.UTC(year, month - 1, day);
  const candidate = new Date(result);
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) return 0;
  return result / DAY_MS;
}

function timeMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return -1;
  return hours * 60 + minutes;
}

function campaignPosition(campaign, now) {
  const date = localDateKey(now);
  const serial = dateSerial(date);
  const startSerial = dateSerial(campaign.startDate);
  const endSerial = dateSerial(campaign.endDate);
  const startMinutes = timeMinutes(campaign.startTime);
  const endMinutes = timeMinutes(campaign.endTime);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const active = campaign.enabled &&
    serial >= startSerial &&
    serial <= endSerial &&
    nowMinutes >= startMinutes &&
    nowMinutes < endMinutes;

  return {
    active,
    date,
    dayNumber: serial - startSerial + 1,
    windowStartedAt: active
      ? new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Math.floor(startMinutes / 60),
        startMinutes % 60
      )
      : null
  };
}

function totalsThrough(state, campaign, date) {
  const start = dateSerial(campaign.startDate);
  const end = dateSerial(date);
  let medallions = 0;
  let smiles = 0;
  for (const [dayKey, day] of Object.entries(state.days)) {
    const current = dateSerial(dayKey);
    if (current < start || current > end) continue;
    medallions += day.medallions;
    smiles += day.smiles;
  }
  return { medallions, smiles };
}

function remainingForDate(settings, date) {
  const { rewardCampaign: campaign } = settings;
  const state = normalizeCampaignState(settings.rewardCampaignState, campaign);
  const dayNumber = dateSerial(date) - dateSerial(campaign.startDate) + 1;
  if (dayNumber < 1) return { medallions: 0, smiles: 0 };
  const totals = totalsThrough(state, campaign, date);
  return {
    medallions: Math.max(0, Math.min(
      MAX_COUNTER,
      campaign.dailyMedallions * dayNumber - totals.medallions
    )),
    smiles: Math.max(0, Math.min(
      MAX_COUNTER,
      campaign.dailySmiles * dayNumber - totals.smiles
    ))
  };
}

function campaignStatus(settings, now = new Date()) {
  const campaign = settings.rewardCampaign;
  const position = campaignPosition(campaign, now);
  const remaining = position.active
    ? remainingForDate(settings, position.date)
    : { medallions: 0, smiles: 0 };
  const state = normalizeCampaignState(settings.rewardCampaignState, campaign);
  const day = state.days[position.date];
  const lastMedallionAt = day?.lastMedallionAt ? new Date(day.lastMedallionAt) : null;
  const chanceStartedAt = lastMedallionAt && lastMedallionAt > position.windowStartedAt
    ? lastMedallionAt
    : position.windowStartedAt;
  const medallionChance = position.active
    ? Math.min(1, Math.max(0, (now - chanceStartedAt) / (campaign.guaranteeMinutes * 60 * 1000)))
    : 0;
  const medallionAvailable = position.active &&
    remaining.medallions > 0 &&
    medallionChance > 0;

  return {
    active: position.active,
    medallionChance,
    medallionAvailable,
    remainingMedallions: remaining.medallions,
    remainingSmiles: remaining.smiles,
    hasOutcome: position.active && (medallionAvailable || remaining.smiles > 0)
  };
}

function claimCampaignOutcome(settings, {
  eligibleForMedallion,
  now = new Date(),
  random = Math.random
} = {}) {
  const campaign = settings.rewardCampaign;
  const position = campaignPosition(campaign, now);
  if (!position.active) {
    return { outcome: 'inactive', settings };
  }

  const state = normalizeCampaignState(settings.rewardCampaignState, campaign);
  const remaining = remainingForDate({ ...settings, rewardCampaignState: state }, position.date);
  const day = state.days[position.date] || { medallions: 0, smiles: 0, lastMedallionAt: null };
  const status = campaignStatus({ ...settings, rewardCampaignState: state }, now);
  let outcome = 'unavailable';

  if (
    eligibleForMedallion === true &&
    remaining.medallions > 0 &&
    random() < status.medallionChance
  ) {
    day.medallions += 1;
    day.lastMedallionAt = now.toISOString();
    outcome = 'medallion';
  } else if (remaining.smiles > 0) {
    day.smiles += 1;
    outcome = 'smile';
  }

  if (outcome === 'unavailable') return { outcome, settings };
  state.days[position.date] = day;
  return {
    outcome,
    settings: { ...settings, rewardCampaignState: state }
  };
}

module.exports = {
  campaignKey,
  campaignStatus,
  claimCampaignOutcome,
  dateSerial,
  emptyCampaignState,
  normalizeCampaignState,
  timeMinutes
};
