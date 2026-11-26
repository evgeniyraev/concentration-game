'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultSettings, normalizeSettings } = require('../../src/main/settings/schema');

test('new installations are unconfigured with safe app defaults', () => {
  const settings = defaultSettings();
  assert.equal(settings.configured, false);
  assert.equal(settings.schemaVersion, 3);
  assert.equal(settings.updates.enabled, true);
  assert.equal(settings.updates.scope, 'minor');
  assert.equal(settings.resultIdleSeconds, 60);
  assert.equal(settings.logRewardWins, false);
  assert.deepEqual(settings.videos.map(({ source }) => source), [
    'bundled:Video/KW42_MMW_Image_DS.mp4',
    'bundled:Video/KW42_MMW_Image_LoveLanguage_SoMe_9x16_20s.mp4'
  ]);
  assert.deepEqual(settings.videoAutoplay, { enabled: false, idleSeconds: 300 });
  assert.deepEqual(settings.workingHours, {
    enabled: true,
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    startTime: '11:00',
    endTime: '17:00'
  });
  assert.deepEqual(settings.rewardChances, {
    points: [{ minute: 7, percent: 0 }, { minute: 13, percent: 100 }]
  });
  assert.deepEqual(settings.rewards.map(({ name, quantity, restockDaily, dailyQuantity }) =>
    [name, quantity, restockDaily, dailyQuantity]), [['Medallion', 70, true, 70]]);
});

test('saved playlists replace retired bundled clips and keep imported clips and playback settings', () => {
  const [first, second] = defaultSettings().videos;
  const imported = { id: 'imported', name: 'Custom clip', source: 'user:videos/custom.mp4', muted: true };
  const videos = [
    { ...second, source: 'bundled:Video/SilverCrest. Прави живота ти лесен.mp4', name: 'Custom title' },
    imported,
    {
      ...first,
      source: 'bundled:Video/Max & Mila’s World • din 12 Octombrie 2026.mp4',
      name: 'Max & Mila’s World • din 12 Octombrie 2026.mp4',
      muted: true
    }
  ];
  const migrated = normalizeSettings({ videos });

  assert.deepEqual(migrated.videos, [{ ...second, name: 'Custom title' }, imported, { ...first, muted: true }]);
  assert.deepEqual(normalizeSettings(migrated).videos, migrated.videos);
  assert.deepEqual(normalizeSettings({ videos: [] }).videos, []);
});

test('normalization rejects unsafe media paths and bounds numbers', () => {
  const settings = normalizeSettings({
    configured: true,
    gameSeconds: -5,
    rewards: [{ id: 'bad', source: 'user:images/../../secret', quantity: 4 }],
    videos: [{ id: 'bad', name: 'bad', source: 'file:///secret' }],
    updates: { enabled: true, scope: 'everything' },
    videoAutoplay: { enabled: true, idleMinutes: 0 },
    workingHours: {
      enabled: false,
      startDate: 'not-a-date',
      endDate: '2020-01-01',
      startTime: '25:00',
      endTime: '10:00'
    },
    rewardChances: { points: [{ minute: 0, percent: 0 }, { minute: 15, percent: 125 }] }
  });
  assert.equal(settings.gameSeconds, 120);
  assert.equal(settings.rewards.length, 0);
  assert.equal(settings.videos.length, 0);
  assert.equal(settings.updates.scope, 'minor');
  assert.equal(settings.videoAutoplay.idleSeconds, 300);
  assert.deepEqual(settings.rewardChances, defaultSettings().rewardChances);
  assert.deepEqual(settings.workingHours, {
    enabled: false,
    startDate: '2026-11-28',
    endDate: '2026-11-29',
    startTime: '11:00',
    endTime: '17:00'
  });
});

test('settings sort valid curve points and reject duplicate minutes', () => {
  const start = { minute: 3, percent: 10 };
  const end = { minute: 18, percent: 85 };
  const normalized = normalizeSettings({ rewardChances: { points: [end, start] } });
  assert.deepEqual(normalized.rewardChances.points, [start, end]);

  const duplicate = normalizeSettings({ rewardChances: { points: [start, start] } });
  assert.deepEqual(duplicate.rewardChances.points, defaultSettings().rewardChances.points);

  const empty = normalizeSettings({ rewardChances: { points: [] } });
  assert.deepEqual(empty.rewardChances.points, defaultSettings().rewardChances.points);
});

test('a single point persists and a disabled legacy curve migrates to 100 percent from minute zero', () => {
  const points = [{ minute: 0, percent: 100 }];
  const saved = normalizeSettings({ rewardChances: { points } });
  assert.deepEqual(saved.rewardChances, { points });

  for (const value of [
    { rewardChances: { enabled: false, points: defaultSettings().rewardChances.points } },
    { rewardCampaign: { enabled: false, guaranteeMinutes: 20 } }
  ]) {
    assert.deepEqual(normalizeSettings(value).rewardChances, { points });
  }
});

test('legacy settings migrate the guarantee and keep awarded medallions while dropping smile counts', () => {
  const campaign = defaultSettings().workingHours;
  const lastMedallionAt = '2026-11-28T10:00:00.000Z';
  const input = {
    rewards: [{ id: 'treat', source: 'bundled:assets/gift5.webp', quantity: 2 }],
    rewardCampaign: { ...campaign, guaranteeMinutes: 12, dailyMedallions: 70, dailySmiles: 900 },
    videoAutoplay: { enabled: true, idleMinutes: 3 },
    updates: { scope: 'patch' },
    rewardCampaignState: {
      campaignKey: JSON.stringify([true, '2026-11-28', '2026-11-29', '11:00', '17:00', 12, 70, 900]),
      days: { '2026-11-28': { medallions: 4, smiles: 26, lastMedallionAt } }
    }
  };
  const migrated = normalizeSettings(input);
  assert.deepEqual(migrated.workingHours, campaign);
  assert.deepEqual(migrated.rewardChances, {
    points: [{ minute: 0, percent: 0 }, { minute: 12, percent: 100 }]
  });
  assert.deepEqual(migrated.rewards.map(({ quantity }) => quantity), [66, 2]);
  assert.equal(migrated.rewards[0].restockDaily, true);
  assert.equal(migrated.rewards[0].dailyQuantity, 70);
  assert.deepEqual(migrated.rewardState, { stockThroughDate: '2026-11-28', lastAwardAt: lastMedallionAt });
  assert.deepEqual(migrated.videoAutoplay, { enabled: true, idleSeconds: 180 });
  assert.equal(migrated.updates.scope, 'patch');
  assert.deepEqual(normalizeSettings(migrated), migrated);
});
