'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  bumpForPullRequest,
  bumpVersion,
  setManifestVersion,
} = require('./versioning.cjs');

const [basePackagePath, worktreePath, branch, labelsJson, outputPath] = process.argv.slice(2);

if (!basePackagePath || !worktreePath || !branch || !labelsJson || !outputPath) {
  throw new Error(
    'Usage: prepare-pr-version.cjs BASE_PACKAGE WORKTREE BRANCH LABELS_JSON GITHUB_OUTPUT',
  );
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const writeJson = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const basePackage = readJson(basePackagePath);
const packagePath = path.join(worktreePath, 'package.json');
const lockPath = path.join(worktreePath, 'package-lock.json');
const packageManifest = readJson(packagePath);
const lockManifest = readJson(lockPath);
const bump = bumpForPullRequest(branch, JSON.parse(labelsJson));
const version = bumpVersion(basePackage.version, bump);

setManifestVersion(packageManifest, lockManifest, version);
writeJson(packagePath, packageManifest);
writeJson(lockPath, lockManifest);

fs.appendFileSync(outputPath, `bump=${bump}\nversion=${version}\ntag=v${version}\n`);
console.log(`Prepared ${bump} version ${version} from main version ${basePackage.version}`);
