'use strict';

const path = require('node:path');
const { app, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const { registerIpc } = require('./ipc');
const { createSettingsStore } = require('./settings/store');
const { applyStartupPreference } = require('./startup');
const { createUpdater } = require('./updater');
const { createWindowManager } = require('./windows');

const APP_ROOT = path.join(__dirname, '..', '..');
const isDevelopment = !app.isPackaged || process.env.NODE_ENV === 'development';
let windows;
let updater;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => windows?.focusMainWindow());

  app.whenReady().then(() => {
    const store = createSettingsStore(app.getPath('userData'));
    store.load();

    updater = createUpdater({
      autoUpdater,
      isPackaged: app.isPackaged,
      getCurrentVersion: () => app.getVersion(),
      getSettings: () => store.get(),
      onStatus: (status) => windows?.sendUpdateStatus(status)
    });
    windows = createWindowManager({
      appRoot: APP_ROOT,
      isDevelopment,
      getUpdateStatus: () => updater.getStatus()
    });

    registerIpc({ app, dialog, ipcMain, store, updater, windows });
    applyStartupPreference(app, store.get());
    const mainWindow = windows.createMainWindow();
    if (!store.get().configured) {
      mainWindow.webContents.once('did-finish-load', () => windows.createSettingsWindow());
    }
    updater.start();

    app.on('activate', () => {
      if (!windows.hasWindows()) windows.createMainWindow();
    });
  });

  app.on('before-quit', () => updater?.stop());
  app.on('window-all-closed', () => app.quit());
}
