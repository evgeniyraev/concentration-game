'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const videoModule = import('../../src/renderer/game/video.mjs');

test('video playback has no mute control overlay', async () => {
  const { mountVideo } = await videoModule;
  const hotspots = [];
  const video = {
    addEventListener() {},
    pause() {},
    play: () => Promise.resolve(),
    removeAttribute() {}
  };

  const cleanup = mountVideo({
    createElement: () => video,
    createHotspot: (label, x, y, width, height, action) => {
      hotspots.push({ action, height, label, width, x, y });
      return {};
    },
    isActive: () => true,
    onExit() {},
    playlist: [{ muted: true, url: 'file:///video.mp4' }],
    stage: {}
  });

  assert.equal(video.muted, true);
  assert.equal(video.src, 'file:///video.mp4');
  assert.deepEqual(hotspots.map(({ label }) => label), ['Return home']);

  cleanup();
});
