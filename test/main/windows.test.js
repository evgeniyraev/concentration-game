'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { showMainWindowAtStartup } = require('../../src/main/windows');

test('installed window is shown in fullscreen mode', () => {
  const calls = [];
  const mainWindow = {
    show: () => calls.push('show'),
    setFullScreen: (enabled) => calls.push(['setFullScreen', enabled])
  };

  showMainWindowAtStartup(mainWindow, false);

  assert.deepEqual(calls, ['show', ['setFullScreen', true]]);
});

test('development window keeps its configured size', () => {
  const calls = [];
  const mainWindow = {
    show: () => calls.push('show'),
    setFullScreen: (enabled) => calls.push(['setFullScreen', enabled])
  };

  showMainWindowAtStartup(mainWindow, true);

  assert.deepEqual(calls, ['show']);
});
