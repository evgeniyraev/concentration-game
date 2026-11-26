'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { showMainWindowAtStartup } = require('../../src/main/windows');

test('installed window is shown before it is maximized', () => {
  const calls = [];
  const mainWindow = {
    show: () => calls.push('show'),
    maximize: () => calls.push('maximize')
  };

  showMainWindowAtStartup(mainWindow, false);

  assert.deepEqual(calls, ['show', 'maximize']);
});

test('development window keeps its configured size', () => {
  const calls = [];
  const mainWindow = {
    show: () => calls.push('show'),
    maximize: () => calls.push('maximize')
  };

  showMainWindowAtStartup(mainWindow, true);

  assert.deepEqual(calls, ['show']);
});
