'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bumpForPullRequest,
  bumpVersion,
  parseVersion,
  setManifestVersion,
} = require('../../.github/scripts/versioning.cjs');

test('strictly parses semantic release versions', () => {
  assert.deepEqual(parseVersion('12.3.45'), [12, 3, 45]);
  assert.throws(() => parseVersion('v1.2.3'), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => parseVersion('1.2.3-beta.1'), /MAJOR\.MINOR\.PATCH/);
  assert.throws(() => parseVersion('01.2.3'), /MAJOR\.MINOR\.PATCH/);
});

test('calculates patch, minor, and major versions from the main version', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
});

test('selects patch and minor bumps from the source branch', () => {
  assert.equal(bumpForPullRequest('fix/reward-stock'), 'patch');
  assert.equal(bumpForPullRequest('feature/new-board'), 'minor');
  assert.throws(() => bumpForPullRequest('chore/cleanup'), /fix\/\* or feature\/\*/);
});

test('manual major label overrides the source branch bump', () => {
  assert.equal(bumpForPullRequest('feature/redesign', ['version:major']), 'major');
  assert.equal(bumpForPullRequest('fix/migration', ['version:major']), 'major');
  assert.throws(
    () => bumpForPullRequest('chore/migration', ['version:major']),
    /fix\/\* or feature\/\*/,
  );
});

test('updates both npm manifests idempotently', () => {
  const packageManifest = { name: 'app', version: '1.0.0' };
  const lockManifest = {
    name: 'app',
    version: '1.0.0',
    packages: { '': { name: 'app', version: '1.0.0' } },
  };

  setManifestVersion(packageManifest, lockManifest, '1.1.0');
  setManifestVersion(packageManifest, lockManifest, '1.1.0');

  assert.equal(packageManifest.version, '1.1.0');
  assert.equal(lockManifest.version, '1.1.0');
  assert.equal(lockManifest.packages[''].version, '1.1.0');
});
