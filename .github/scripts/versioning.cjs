'use strict';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(version) {
  if (typeof version !== 'string') {
    throw new TypeError('Version must be a string');
  }

  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(`Version must use MAJOR.MINOR.PATCH format: ${version}`);
  }

  return match.slice(1).map(Number);
}

function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);

  switch (bump) {
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'major':
      return `${major + 1}.0.0`;
    default:
      throw new Error(`Unsupported version bump: ${bump}`);
  }
}

function bumpForPullRequest(branch, labels = []) {
  if (!Array.isArray(labels)) {
    throw new TypeError('Labels must be an array');
  }

  let branchBump;
  if (/^fix\/.+/.test(branch)) {
    branchBump = 'patch';
  } else if (/^feature\/.+/.test(branch)) {
    branchBump = 'minor';
  } else {
    throw new Error(
      `PR branch must use fix/* or feature/* before it can be merged: ${branch}`,
    );
  }

  return labels.includes('version:major') ? 'major' : branchBump;
}

function setManifestVersion(packageManifest, lockManifest, version) {
  parseVersion(version);

  if (!packageManifest || typeof packageManifest !== 'object') {
    throw new TypeError('package.json must contain an object');
  }
  if (!lockManifest || typeof lockManifest !== 'object') {
    throw new TypeError('package-lock.json must contain an object');
  }
  if (!lockManifest.packages?.['']) {
    throw new Error('package-lock.json is missing its root package entry');
  }

  packageManifest.version = version;
  lockManifest.version = version;
  lockManifest.packages[''].version = version;
}

module.exports = {
  bumpForPullRequest,
  bumpVersion,
  parseVersion,
  setManifestVersion,
};
