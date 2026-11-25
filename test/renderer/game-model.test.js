'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const model = import('../../src/renderer/game/model.mjs');

test('deck contains two of each face and one of every back', async () => {
  const { createDeck, FACE_IDS } = await model;
  const deck = createDeck(() => 0.25);
  assert.equal(deck.faces.length, 20);
  assert.equal(deck.backs.length, 20);
  for (const faceId of FACE_IDS) {
    assert.equal(deck.faces.filter((candidate) => candidate === faceId).length, 2);
  }
  assert.deepEqual([...deck.backs].sort((left, right) => left - right), [...Array(20).keys()]);
});

test('timer formatting is deterministic at the boundary', async () => {
  const { formatSeconds, remainingSeconds } = await model;
  assert.equal(remainingSeconds(10_001, 10_000), 1);
  assert.equal(formatSeconds(125), '02:05');
});
