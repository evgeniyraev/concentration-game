'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.resolve(__dirname, '../../.github/scripts/prepare-pr-version.cjs');

function versionCheckFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-version-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const file = (name) => path.join(directory, name);
  const write = (name, value) => fs.writeFileSync(file(name), JSON.stringify(value, null, 4));
  const read = (name) => fs.readFileSync(file(name), 'utf8');
  const check = (branch, labels = []) => execFileSync(process.execPath, [
    script, file('main.json'), directory, branch, JSON.stringify(labels), file('output'),
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  return { write, read, check };
}

test('an approved PR already at the expected version keeps its manifest bytes', (t) => {
  const { write, read, check } = versionCheckFixture(t);
  write('main.json', { version: '1.0.8' });
  write('package.json', { name: 'app', version: '1.1.0' });
  write('package-lock.json', { version: '1.1.0', packages: { '': { version: '1.1.0' } } });
  const original = ['package.json', 'package-lock.json'].map(read);

  assert.equal(check('feature/rewards'), '1.1.0');
  assert.deepEqual(['package.json', 'package-lock.json'].map(read), original);
});

test('refreshing after main advances corrects all version fields and keeps other manifest data', (t) => {
  const { write, read, check } = versionCheckFixture(t);
  write('main.json', { version: '1.0.9' });
  write('package.json', { version: '1.0.9', description: 'Changed on the PR' });
  write('package-lock.json', { version: '1.0.9', packages: { '': { version: '1.0.8' } } });

  assert.equal(check('fix/fullscreen'), '1.0.10');
  assert.deepEqual(JSON.parse(read('package.json')), { version: '1.0.10', description: 'Changed on the PR' });
  assert.deepEqual(JSON.parse(read('package-lock.json')), {
    version: '1.0.10',
    packages: { '': { version: '1.0.10' } },
  });
  assert.match(read('output'), /^bump=patch\nversion=1\.0\.10\ntag=v1\.0\.10\n$/);
});
