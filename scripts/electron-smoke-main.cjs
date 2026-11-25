'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, BrowserWindow, dialog } = require('electron');
const { defaultSettings } = require('../src/main/settings/schema');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'max-mila-smoke-'));
app.setPath('userData', userData);
require('../src/main');

async function waitForWindows() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const windows = BrowserWindow.getAllWindows();
    const game = windows.find((window) => window.webContents.getURL().endsWith('/renderer/game/index.html'));
    const settings = windows.find((window) => window.webContents.getURL().endsWith('/renderer/settings/settings.html'));
    if (game && settings && !game.webContents.isLoading() && !settings.webContents.isLoading()) {
      return { game, settings };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Game and first-run Settings windows did not finish loading.');
}

function previewDefaults(contents) {
  return contents.executeJavaScript(`(async () => {
    const resetButton = document.querySelector('#reset-defaults');
    const waitUntilReady = async () => {
      const deadline = Date.now() + 3000;
      while (resetButton.disabled && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      if (resetButton.disabled) throw new Error('Reset button did not become available.');
    };
    await waitUntilReady();
    resetButton.click();
    await waitUntilReady();
    return {
      resultIdleSeconds: document.querySelector('#result-idle').valueAsNumber,
      quantity: document.querySelector('#reward-list input[type=number]').valueAsNumber,
      pointCount: document.querySelector('#chance-points').childElementCount,
      message: document.querySelector('#form-message').textContent
    };
  })()`);
}

app.whenReady().then(async () => {
  try {
    const windows = await waitForWindows();
    const gameResult = await windows.game.webContents.executeJavaScript(`({
      title: document.title,
      hasApi: Boolean(window.gameApp),
      hasSettingsButton: [...document.querySelectorAll('button')].some(
        (button) => button.getAttribute('aria-label') === 'Open settings'
      )
    })`);
    const settingsResult = await windows.settings.webContents.executeJavaScript(`(async () => {
      const value = await window.settingsApp.getSettings();
      document.querySelector('#chances-tab').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const chancesPanel = document.querySelector('#chances-panel');
      const chart = document.querySelector('#chance-chart');
      return {
        title: document.title,
        hasApi: Boolean(window.settingsApp),
        formPresent: Boolean(document.querySelector('#settings-form')),
        configured: value.configured,
        autoplaySeconds: value.videoAutoplay.idleSeconds,
        resultIdleSeconds: value.resultIdleSeconds,
        updateScope: value.updates.scope,
        chancesVisible: !chancesPanel.hidden,
        curveTogglePresent: Boolean(document.querySelector('#chances-enabled')),
        workingHours: value.workingHours,
        autoplayEnabled: value.videoAutoplay.enabled,
        logRewardWins: value.logRewardWins,
        defaultRewards: value.rewards.map(({ name, quantity, restockDaily, dailyQuantity }) =>
          ({ name, quantity, restockDaily, dailyQuantity })),
        defaultPoints: value.rewardChances.points,
        graphPointCount: document.querySelector('#chance-markers').childElementCount,
        graphFitsPanel: chart.getBoundingClientRect().width <= chancesPanel.getBoundingClientRect().width
      };
    })()`);
    const dragPoint = await windows.settings.webContents.executeJavaScript(`(async () => {
      document.querySelector('#add-chance-point').click();
      const chart = document.querySelector('#chance-chart');
      chart.scrollIntoView({ block: 'center' });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const marker = document.querySelector('#chance-markers [data-point="1"]');
      const transform = chart.getScreenCTM();
      const position = (x, y) => {
        const point = new DOMPoint(x, y).matrixTransform(transform);
        return { x: Math.round(point.x), y: Math.round(point.y) };
      };
      const x = Number(marker.getAttribute('cx'));
      return { from: position(x, 120), to: position(x, 84) };
    })()`);
    windows.settings.focus();
    const contents = windows.settings.webContents;
    contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...dragPoint.from });
    contents.sendInputEvent({ type: 'mouseMove', ...dragPoint.to });
    contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...dragPoint.to });
    const editedPoints = await contents.executeJavaScript(`(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const list = document.querySelector('#chance-points');
      const rows = () => [...list.children];
      const change = (row, column, value) => {
        const field = rows()[row].querySelectorAll('input')[column];
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const draggedPercent = rows()[1].querySelectorAll('input')[1].valueAsNumber;
      change(0, 0, 2);
      change(0, 1, 10);
      change(2, 0, 30);
      change(2, 1, 90);
      document.querySelector('#add-chance-point').click();
      rows()[2].querySelector('button').click();
      change(1, 0, 2);
      document.querySelector('#settings-form').requestSubmit();
      const duplicateRejected = Boolean(document.querySelector('#chance-error').textContent);
      change(1, 0, 10);
      document.querySelector('#hours-enabled').click();
      document.querySelector('#log-reward-wins').click();
      document.querySelector('#result-idle').value = 1;
      document.querySelector('#video-list input[type=checkbox]').click();
      document.querySelector('#reward-list input[type=checkbox]').click();
      document.querySelector('#settings-form').requestSubmit();
      return { draggedPercent, duplicateRejected, pointCount: rows().length };
    })()`);
    const saved = await windows.game.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 3000;
      do {
        const settings = await window.gameApp.getSettings();
        if (settings.configured) return settings;
        await new Promise((resolve) => setTimeout(resolve, 25));
      } while (Date.now() < deadline);
      return null;
    })()`);
    const game = windows.game.webContents;
    if (!windows.settings.isDestroyed()) {
      await once(windows.settings, 'closed', { signal: AbortSignal.timeout(3000) });
    }
    windows.game.focus();
    game.sendInputEvent({
      type: 'keyDown',
      keyCode: ',',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control']
    });
    const chanceSettings = await waitForWindows();
    const singlePoint = await chanceSettings.settings.webContents.executeJavaScript(`(async () => {
      await window.settingsApp.getSettings();
      document.querySelector('#chances-tab').click();
      const list = document.querySelector('#chance-points');
      while (list.children.length > 1) list.lastElementChild.querySelector('button').click();
      const lastPointProtected = list.querySelector('button').disabled;
      const [minute, percent] = list.querySelectorAll('input');
      minute.value = 0;
      percent.value = 100;
      percent.dispatchEvent(new Event('input', { bubbles: true }));
      const markerCount = document.querySelector('#chance-markers').childElementCount;
      document.querySelector('#video-autoplay').click();
      document.querySelector('#idle-seconds').value = 1;
      document.querySelector('#settings-form').requestSubmit();
      return { lastPointProtected, markerCount };
    })()`);
    const playback = await game.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const deadline = Date.now() + 4000;
      let video;
      while (Date.now() < deadline) {
        video = document.querySelector('main video');
        if (video && !video.paused) break;
        await wait(35);
      }
      if (!video || video.paused) return null;
      const initiallyMuted = video.muted;
      document.querySelector('.video-mute').click();
      const toggleWorked = !video.muted;
      document.querySelector('[aria-label="Return home"]').click();
      document.querySelector('[aria-label="Start game"]').click();
      const pairs = new Map();
      for (const tile of document.querySelectorAll('.tile')) {
        const face = tile.querySelector('.face').src;
        if (!pairs.has(face)) pairs.set(face, []);
        pairs.get(face).push(tile);
      }
      for (const pair of pairs.values()) for (const tile of pair) tile.click();
      while (!document.querySelector('.gift') && Date.now() < deadline) await wait(25);
      const reward = document.querySelector('.gift')?.alt;
      await wait(650);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      await wait(600);
      const stayedOnResult = Boolean(document.querySelector('.gift'));
      await wait(500);
      const returnedHome = Boolean(document.querySelector('[aria-label="Start game"]'));
      return { initiallyMuted, toggleWorked, reward, stayedOnResult, returnedHome };
    })()`);
    await game.executeJavaScript('window.gameApp.openSettings()');
    const reopened = await waitForWindows();
    const csvPath = path.join(userData, 'reward-wins.csv');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: csvPath });
    const exportedCount = await reopened.settings.webContents.executeJavaScript('window.settingsApp.exportRewardLog()');
    const csv = fs.readFileSync(csvPath, 'utf8');
    const beforeReset = await game.executeJavaScript('window.gameApp.getSettings()');
    const resetPreview = await previewDefaults(reopened.settings.webContents);
    assert.deepEqual(resetPreview, {
      resultIdleSeconds: 60,
      quantity: 70,
      pointCount: 2,
      message: 'Defaults loaded. Save settings to apply them.'
    });
    assert.deepEqual(await game.executeJavaScript('window.gameApp.getSettings()'), beforeReset);
    const discarded = once(reopened.settings, 'closed', { signal: AbortSignal.timeout(3000) });
    reopened.settings.close();
    await discarded;
    assert.deepEqual(await game.executeJavaScript('window.gameApp.getSettings()'), beforeReset);

    await game.executeJavaScript('window.gameApp.openSettings()');
    const resetWindow = (await waitForWindows()).settings;
    await previewDefaults(resetWindow.webContents);
    const resetClosed = once(resetWindow, 'closed', { signal: AbortSignal.timeout(3000) });
    await resetWindow.webContents.executeJavaScript('document.querySelector("#settings-form").requestSubmit()');
    await resetClosed;
    const { rewardStatus, rewardLogCount, appVersion, ...resetSettings } =
      await game.executeJavaScript('window.gameApp.getSettings()');
    const { rewardState, rewardLog, ...defaults } = defaultSettings();
    resetSettings.rewards = resetSettings.rewards.map(({ url, ...reward }) => reward);
    resetSettings.videos = resetSettings.videos.map(({ url, ...video }) => video);
    assert.deepEqual(resetSettings, { ...defaults, configured: true });
    assert.equal(rewardLogCount, 1);
    const passed = gameResult.title === 'Max & Mila’s World'
      && gameResult.hasApi
      && gameResult.hasSettingsButton
      && settingsResult.title === 'Settings'
      && settingsResult.hasApi
      && settingsResult.formPresent
      && settingsResult.configured === false
      && settingsResult.autoplaySeconds === 300
      && settingsResult.resultIdleSeconds === 60
      && settingsResult.updateScope === 'minor'
      && settingsResult.chancesVisible
      && !settingsResult.curveTogglePresent
      && JSON.stringify(settingsResult.defaultPoints) === '[{"minute":7,"percent":0},{"minute":13,"percent":100}]'
      && JSON.stringify(settingsResult.defaultRewards) === '[{"name":"Medallion","quantity":70,"restockDaily":true,"dailyQuantity":70}]'
      && settingsResult.workingHours.enabled && settingsResult.workingHours.startDate === '2026-11-28'
      && settingsResult.workingHours.endDate === '2026-11-29' && settingsResult.workingHours.startTime === '11:00'
      && settingsResult.workingHours.endTime === '17:00'
      && !settingsResult.autoplayEnabled && !settingsResult.logRewardWins
      && settingsResult.graphPointCount === 2
      && settingsResult.graphFitsPanel
      && Math.abs(editedPoints.draggedPercent - 70) <= 1
      && editedPoints.duplicateRejected
      && editedPoints.pointCount === 3
      && JSON.stringify(saved?.rewardChances.points) === JSON.stringify([
        { minute: 2, percent: 10 },
        { minute: 10, percent: editedPoints.draggedPercent },
        { minute: 30, percent: 90 }
      ])
      && saved.rewards[0].restockDaily === false
      && singlePoint.lastPointProtected && singlePoint.markerCount === 1
      && playback?.initiallyMuted && playback.toggleWorked
      && playback.reward === 'Medallion' && playback.stayedOnResult && playback.returnedHome
      && exportedCount === 1 && /"[^"]+Z","Medallion"/.test(csv);
    console.log(JSON.stringify({
      game: gameResult, settings: settingsResult, editedPoints, singlePoint, playback, exportedCount, resetPreview
    }, null, 2));
    fs.rmSync(userData, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error(error);
    fs.rmSync(userData, { recursive: true, force: true });
    app.exit(1);
  }
});
