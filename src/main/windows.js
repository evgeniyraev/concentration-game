'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

function showMainWindowAtStartup(mainWindow, isDevelopment) {
  mainWindow.show();
  if (!isDevelopment) mainWindow.setFullScreen(true);
}

function createWindowManager({ appRoot, isDevelopment, getUpdateStatus }) {
  let mainWindow;
  let settingsWindow;

  function createMainWindow() {
    mainWindow = new BrowserWindow({
      title: "Max & Mila's World",
      width: 720,
      height: 1280,
      minWidth: 405,
      minHeight: 720,
      fullscreen: false,
      frame: true,
      autoHideMenuBar: true,
      backgroundColor: '#26251d',
      show: false,
      webPreferences: {
        preload: path.join(appRoot, 'src', 'preload', 'game.js'),
        autoplayPolicy: 'no-user-gesture-required',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    mainWindow.loadFile(path.join(appRoot, 'src', 'renderer', 'game', 'index.html'));
    mainWindow.once('ready-to-show', () => {
      showMainWindowAtStartup(mainWindow, isDevelopment);
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== ',' || input.isAutoRepeat || input.shift || input.alt) return;
      const hasShortcutModifier = process.platform === 'darwin'
        ? input.meta && !input.control
        : input.control && !input.meta;
      if (!hasShortcutModifier) return;

      event.preventDefault();
      createSettingsWindow();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return mainWindow;
  }

  function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return settingsWindow;
    }
    settingsWindow = new BrowserWindow({
      title: 'Settings',
      width: 780,
      height: 900,
      minWidth: 640,
      minHeight: 650,
      frame: true,
      modal: false,
      closable: true,
      minimizable: true,
      maximizable: true,
      resizable: true,
      autoHideMenuBar: true,
      backgroundColor: '#f6f1e7',
      show: false,
      webPreferences: {
        preload: path.join(appRoot, 'src', 'preload', 'settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    settingsWindow.loadFile(path.join(appRoot, 'src', 'renderer', 'settings', 'settings.html'));
    settingsWindow.once('ready-to-show', () => {
      settingsWindow.show();
      settingsWindow.webContents.send('updates:status', getUpdateStatus());
    });
    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return settingsWindow;
  }

  function sendSettings(settings) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings:changed', settings);
    }
  }

  function sendUpdateStatus(status) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('updates:status', status);
    }
  }

  function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }

  return {
    createMainWindow,
    createSettingsWindow,
    focusMainWindow,
    getMainWindow: () => mainWindow,
    getSettingsWindow: () => settingsWindow,
    hasWindows: () => BrowserWindow.getAllWindows().length > 0,
    sendSettings,
    sendUpdateStatus
  };
}

module.exports = { createWindowManager, showMainWindowAtStartup };
