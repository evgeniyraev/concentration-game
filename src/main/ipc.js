'use strict';

const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { copyUserMedia, hydrateSettings } = require('./settings/media');
const { drawReward, replenishStock, rewardStatus, stockThroughDate } = require('./rewards');
const { rewardLogCsv } = require('./reward-log');
const { BUNDLED_REWARDS, defaultSettings, normalizeSettings } = require('./settings/schema');
const { applyStartupPreference } = require('./startup');

function registerIpc({ app, dialog, ipcMain, store, updater, windows }) {
  function currentSettings(now = new Date()) {
    const current = store.get();
    const replenished = replenishStock(current, now);
    return replenished === current ? current : store.save(replenished);
  }

  const toPublicSettings = (settings = currentSettings(), now = new Date()) => {
    const { rewardState, rewardLog, ...publicSettings } = settings;
    return {
      ...hydrateSettings(
        publicSettings,
        app.getAppPath(),
        app.getPath('userData'),
        app.getVersion()
      ),
      rewardStatus: rewardStatus(settings, now),
      rewardLogCount: rewardLog.length
    };
  };

  function persistSettings(value) {
    const settings = store.save(value);
    const publicSettings = toPublicSettings(settings);
    windows.sendSettings(publicSettings);
    applyStartupPreference(app, settings);
    updater.configure();
    return publicSettings;
  }

  ipcMain.handle('settings:get', () => toPublicSettings());
  ipcMain.handle('settings:defaults', (event) => {
    if (event.sender !== windows.getSettingsWindow()?.webContents) throw new Error('Settings window required.');
    return toPublicSettings(defaultSettings());
  });
  ipcMain.handle('settings:open', () => {
    windows.createSettingsWindow();
    return true;
  });
  ipcMain.handle('settings:save', (event, value) => {
    if (event.sender !== windows.getSettingsWindow()?.webContents) throw new Error('Settings window required.');
    const now = new Date();
    const current = currentSettings(now);
    const stock = new Map(current.rewards.map(({ id, quantity }) => [id, quantity]));
    const rewards = (Array.isArray(value?.rewards) ? value.rewards.slice(0, 100) : current.rewards)
      .map((reward) => ({
        ...reward,
        quantity: stock.has(reward?.id) && reward.quantityChanged !== true
          ? stock.get(reward.id) : reward?.quantity
      }));
    const normalized = normalizeSettings({
      ...value, rewards, rewardState: current.rewardState, rewardLog: current.rewardLog
    });
    const before = current.workingHours;
    const after = normalized.workingHours;
    if (!current.configured || before.enabled !== after.enabled ||
      before.startDate !== after.startDate || before.endDate !== after.endDate) {
      normalized.rewardState.stockThroughDate = stockThroughDate(after, now);
    }
    normalized.configured = true;
    const result = persistSettings(normalized);
    setImmediate(() => {
      const settingsWindow = windows.getSettingsWindow();
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
    });
    return result;
  });
  ipcMain.handle('rewards:draw', (event) => {
    if (event.sender !== windows.getMainWindow()?.webContents) throw new Error('Game window required.');
    const current = store.get();
    const now = new Date();
    const result = drawReward(current, { now });
    const nextSettings = result.settings === current ? current : store.save(result.settings);
    const settings = toPublicSettings(nextSettings, now);
    return {
      reward: result.reward ? settings.rewards.find(({ id }) => id === result.reward.id) : null,
      settings
    };
  });
  ipcMain.handle('rewards:presets', () => hydrateSettings({
    rewards: BUNDLED_REWARDS.map((reward) => ({
      ...reward, quantity: 0, restockDaily: false, dailyQuantity: 0
    })),
    videos: []
  }, app.getAppPath(), app.getPath('userData'), app.getVersion()).rewards);
  ipcMain.handle('rewards:export-log', async (event) => {
    const owner = windows.getSettingsWindow();
    if (event.sender !== owner?.webContents) throw new Error('Settings window required.');
    const { canceled, filePath } = await dialog.showSaveDialog(owner, {
      title: 'Export reward wins',
      defaultPath: 'reward-wins.csv',
      filters: [{ name: 'CSV files', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return null;
    const entries = store.get().rewardLog;
    await writeFile(filePath, rewardLogCsv(entries), 'utf8');
    return entries.length;
  });
  ipcMain.handle('media:select-image', async () => {
    const options = {
      title: 'Choose a reward image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    };
    const owner = windows.getSettingsWindow() || windows.getMainWindow();
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const source = copyUserMedia(result.filePaths[0], 'images', app.getPath('userData'));
    return hydrateSettings({
      rewards: [{
        id: `reward-${Date.now()}`,
        name: path.basename(result.filePaths[0], path.extname(result.filePaths[0])),
        source, quantity: 0, restockDaily: false, dailyQuantity: 0
      }],
      videos: []
    }, app.getAppPath(), app.getPath('userData'), app.getVersion()).rewards[0];
  });
  ipcMain.handle('media:select-videos', async () => {
    const options = {
      title: 'Choose videos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'm4v', 'webm', 'mov'] }]
    };
    const owner = windows.getSettingsWindow() || windows.getMainWindow();
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    const videos = result.filePaths.map((filePath, index) => ({
      id: `video-${Date.now()}-${index}`,
      name: path.basename(filePath),
      muted: false,
      source: copyUserMedia(filePath, 'videos', app.getPath('userData'))
    }));
    return hydrateSettings({ rewards: [], videos }, app.getAppPath(), app.getPath('userData'), app.getVersion()).videos;
  });

  return { toPublicSettings };
}

module.exports = { registerIpc };
