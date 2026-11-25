'use strict';

const MAX_STOCK = 999_999_999;
const DAY_MS = 86_400_000;

function localDateKey(date) {
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateSerial(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return NaN;
  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? timestamp / DAY_MS : NaN;
}

function timeMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return -1;
  const [, hours, minutes] = match.map(Number);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : -1;
}

function schedulePosition(hours, now) {
  const date = localDateKey(now);
  const opening = hours.enabled ? timeMinutes(hours.startTime) : 0;
  const closing = hours.enabled ? timeMinutes(hours.endTime) : 1440;
  const minute = now.getHours() * 60 + now.getMinutes();
  const active = (!hours.enabled || (date >= hours.startDate && date <= hours.endDate)) &&
    minute >= opening && minute < closing;
  const openedAt = new Date(now);
  openedAt.setHours(Math.floor(opening / 60), opening % 60, 0, 0);
  return { active, openedAt };
}

function stockThroughDate(hours, now) {
  const today = localDateKey(now);
  if (!hours.enabled) return today;
  return today < hours.startDate ? hours.startDate : today > hours.endDate ? hours.endDate : today;
}

function replenishStock(settings, now) {
  const hours = settings.workingHours;
  if (!settings.configured) return settings;
  const throughDate = stockThroughDate(hours, now);
  const previous = settings.rewardState.stockThroughDate || (hours.enabled ? hours.startDate : throughDate);
  const days = dateSerial(throughDate) - dateSerial(previous);
  if (days < 0 || (days === 0 && settings.rewardState.stockThroughDate)) return settings;
  return {
    ...settings,
    rewards: settings.rewards.map((reward) => reward.restockDaily ? ({
      ...reward,
      quantity: Math.min(MAX_STOCK, reward.quantity + days * reward.dailyQuantity)
    }) : reward),
    rewardState: { ...settings.rewardState, stockThroughDate: throughDate }
  };
}

function chanceAt(points, minutes) {
  if (minutes <= points[0].minute) return points[0].percent / 100;
  for (let index = 1; index < points.length; index += 1) {
    const end = points[index];
    if (minutes > end.minute) continue;
    const start = points[index - 1];
    const progress = (minutes - start.minute) / (end.minute - start.minute);
    return (start.percent + progress * (end.percent - start.percent)) / 100;
  }
  return points.at(-1).percent / 100;
}

function rewardStatus(settings, now = new Date()) {
  const { active, openedAt } = schedulePosition(settings.workingHours, now);
  const remaining = settings.rewards.reduce((total, reward) => total + reward.quantity, 0);
  const lastAward = Date.parse(settings.rewardState.lastAwardAt);
  const elapsedMinutes = (now - Math.max(openedAt.getTime(), lastAward || 0)) / 60_000;
  const odds = chanceAt(settings.rewardChances.points, elapsedMinutes);
  return { active, remaining, chance: active && remaining > 0 ? odds : 0 };
}

function drawReward(settings, { now = new Date(), random = Math.random } = {}) {
  const current = replenishStock(settings, now);
  const status = rewardStatus(current, now);
  if (!current.configured || !status.active || status.remaining === 0 || random() >= status.chance) {
    return { settings: current, reward: null };
  }

  let ticket = Math.floor(random() * status.remaining);
  const index = current.rewards.findIndex((reward) => {
    ticket -= reward.quantity;
    return ticket < 0;
  });
  const reward = current.rewards[index];
  const rewards = [...current.rewards];
  rewards[index] = { ...reward, quantity: reward.quantity - 1 };
  const awardedAt = now.toISOString();
  return {
    reward,
    settings: {
      ...current,
      rewards,
      rewardState: { ...current.rewardState, lastAwardAt: awardedAt },
      rewardLog: current.logRewardWins
        ? [...current.rewardLog, { time: awardedAt, reward: reward.name }]
        : current.rewardLog
    }
  };
}

module.exports = { MAX_STOCK, dateSerial, timeMinutes, stockThroughDate, replenishStock, rewardStatus, drawReward };
