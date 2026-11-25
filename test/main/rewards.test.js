'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { drawReward, replenishStock, rewardStatus } = require('../../src/main/rewards');
const { rewardLogCsv } = require('../../src/main/reward-log');
const { defaultSettings } = require('../../src/main/settings/schema');

function stock(id, quantity, restockDaily = false, dailyQuantity = 0) {
  return { id, name: id, quantity, restockDaily, dailyQuantity };
}

function setup(rewards = [stock('A', 1), stock('B', 2)]) {
  return {
    ...defaultSettings(), configured: true, rewards,
    rewardState: { lastAwardAt: null, stockThroughDate: '2026-11-28' }
  };
}

const at = (minute, day = 28) => new Date(2026, 10, day, 11, minute);
function rolls(...values) {
  return () => {
    assert.ok(values.length, 'unexpected extra roll');
    return values.shift();
  };
}

test('default curve holds at zero until minute 7 and reaches 100 percent at minute 13', () => {
  const settings = setup();
  assert.equal(rewardStatus(settings, at(0)).chance, 0);
  assert.equal(rewardStatus(settings, at(7)).chance, 0);
  assert.equal(rewardStatus(settings, at(10)).chance, 0.5);
  assert.equal(rewardStatus(settings, at(13)).chance, 1);
  const closed = new Date(2026, 10, 28, 17, 0);
  assert.equal(rewardStatus(settings, closed).active, false);
  assert.equal(drawReward(settings, { now: closed, random: rolls() }).reward, null);
});

test('a missed chance consumes one roll, while a successful draw weights picks by stock', () => {
  const settings = setup([stock('Empty', 0), stock('A', 1), stock('B', 2)]);
  const missed = drawReward(settings, { now: at(10), random: rolls(0.5) });
  assert.equal(missed.reward, null);
  assert.equal(missed.settings, settings);
  let zeroChanceRolls = 0;
  const early = drawReward(settings, { now: at(5), random: () => {
    zeroChanceRolls += 1;
    return 0;
  } });
  assert.equal(early.reward, null);
  assert.equal(zeroChanceRolls, 1);

  const first = drawReward(settings, { now: at(10), random: rolls(0.1, 0.333) });
  assert.equal(first.reward.id, 'A');
  assert.deepEqual(first.settings.rewards.map(({ quantity }) => quantity), [0, 0, 2]);
  assert.equal(rewardStatus(first.settings, at(10)).chance, 0);
  assert.equal(rewardStatus(first.settings, at(20)).chance, 0.5);

  const second = drawReward(settings, { now: at(10), random: rolls(0.1, 1 / 3) });
  assert.equal(second.reward.id, 'B');
  assert.deepEqual(second.settings.rewards.map(({ quantity }) => quantity), [0, 1, 1]);
  assert.equal(drawReward(first.settings, { now: at(23), random: rolls(0, 0) }).reward.id, 'B');
});

test('a single 100 percent point awards immediately and again after a win while stock lasts', () => {
  const settings = { ...setup([stock('A', 2)]), rewardChances: { points: [{ minute: 0, percent: 100 }] } };
  const first = drawReward(settings, { now: at(0), random: rolls(0.999, 0) });
  assert.equal(first.reward.id, 'A');
  const second = drawReward(first.settings, { now: at(0), random: rolls(0.999, 0) });
  assert.equal(second.reward.id, 'A');
  assert.equal(drawReward(second.settings, { now: at(0), random: rolls() }).reward, null);
});

test('enabled restock adds units once per later working day and retains leftovers', () => {
  const settings = setup([stock('A', 1, true, 2), stock('B', 2, false, 99)]);
  assert.equal(replenishStock(settings, at(30)), settings);
  const restocked = replenishStock(settings, at(30, 29));
  assert.deepEqual(restocked.rewards.map(({ quantity }) => quantity), [3, 2]);
  assert.equal(replenishStock(restocked, at(45, 29)), restocked);
  assert.equal(replenishStock(restocked, at(30, 30)), restocked);
});

test('no stock still allows play during working hours', () => {
  const settings = setup([]);
  assert.deepEqual(rewardStatus(settings, at(40)), { active: true, remaining: 0, chance: 0 });
  assert.equal(drawReward(settings, { now: at(40), random: rolls() }).reward, null);
});

test('logging records only awards when enabled and CSV escapes reward names', () => {
  const settings = setup([stock('Лакомство, "Max"', 1)]);
  const now = at(20);
  assert.deepEqual(drawReward(settings, { now, random: rolls(0, 0) }).settings.rewardLog, []);
  const logged = drawReward({ ...settings, logRewardWins: true }, { now, random: rolls(0, 0) });
  assert.deepEqual(logged.settings.rewardLog, [{ time: now.toISOString(), reward: 'Лакомство, "Max"' }]);
  assert.equal(rewardLogCsv(logged.settings.rewardLog),
    `\uFEFFtime,reward\r\n"${now.toISOString()}","Лакомство, ""Max"""\r\n`);
  assert.match(rewardLogCsv([{ time: now.toISOString(), reward: '=1+1' }]), /"'=1\+1"/);
});
