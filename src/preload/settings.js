'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApp', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getDefaultSettings: () => ipcRenderer.invoke('settings:defaults'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  selectRewardImage: () => ipcRenderer.invoke('media:select-image'),
  getRewardPresets: () => ipcRenderer.invoke('rewards:presets'),
  exportRewardLog: () => ipcRenderer.invoke('rewards:export-log'),
  selectVideos: () => ipcRenderer.invoke('media:select-videos'),
  onUpdateStatus: (listener) => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on('updates:status', handler);
    return () => ipcRenderer.removeListener('updates:status', handler);
  }
});
