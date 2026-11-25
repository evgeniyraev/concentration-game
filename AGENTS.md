# Architecture and engineering principles

## Product shape

This repository is a small Electron kiosk application organized under `src/`. It has two renderer surfaces:

- `src/renderer/game/` renders the portrait game. `index.js` coordinates screens and settings, while `board.mjs`, `video.mjs`, and `model.mjs` isolate gameplay, playback, and pure game logic.
- `src/renderer/settings/` renders the native Settings `BrowserWindow`. This renderer edits a draft and submits it through IPC.

`src/main/index.js` composes the application authority. Modules beneath `src/main/` own windows, persisted settings, reward inventory mutations, media import, Windows login startup, and GitHub update installation. `src/preload/game.js` and `src/preload/settings.js` expose separate, minimal APIs to their respective renderers.

Supporting modules are deliberately independent of Electron where practical:

- `src/main/settings/schema.js` defines defaults and validates the configuration boundary.
- `src/main/settings/store.js` persists normalized JSON atomically.
- `src/main/settings/media.js` resolves controlled media descriptors and copies user-selected files.
- `src/main/update-policy.js` decides whether a newer semantic version is permitted by the selected patch/minor/major scope.
- `electron-builder.config.cjs` defines Windows/NSIS packaging and derives the GitHub publisher from `GITHUB_REPOSITORY` in Actions.
- `.github/workflows/windows-release.yml` publishes releases for both manual versioned runs and pushed semantic-version tags, and also retains workflow artifacts.

## Data flow

1. At startup, the main process reads and normalizes `settings.json` from Electron's per-user `userData` folder.
2. Renderers request hydrated, read-only snapshots through preload APIs. Hydration adds safe `file:` URLs; persisted JSON stores only controlled `bundled:` or `user:` media descriptors.
3. Settings changes return to the main process, are normalized again, written with a temporary-file rename, and broadcast to the game.
4. Reward claims are atomic main-process operations. The game cannot write arbitrary settings or decrement inventory itself.
5. User-selected media is copied beneath `userData/media`; never depend on the original file continuing to exist.

## Core principles

1. **Keep privilege in the main process.** Renderer windows use `contextIsolation`, sandboxing, and no Node.js integration. Add narrowly named preload methods instead of exposing `ipcRenderer`, filesystem APIs, or generic message channels.
2. **Validate every IPC boundary.** Treat renderer payloads as untrusted. Normalize numbers, enum values, list sizes, filenames, and media descriptors before persistence or filesystem access.
3. **Keep gameplay deterministic and offline.** The game and bundled media must work without a network. GitHub update failures must never prevent launch or play.
4. **Preserve display behavior.** The packaged game starts maximized and all windows retain their native frames; Settings is a real modal `BrowserWindow`. The invisible settings target stays at the top-left of the home screen and first-run configuration opens automatically.
5. **Persist operational state centrally.** Configuration, reward stock, and imported-media identity belong in `userData`, not `localStorage` or IndexedDB.
6. **Release with semantic versions.** Tags use `vMAJOR.MINOR.PATCH`. Update policy means patch = same major/minor, minor = same major, and major = any newer release.
7. **Test policy and validation changes.** Pure logic belongs in focused modules and needs `node:test` coverage. Before handing off, run `npm test` and at least a packaging smoke check when dependencies and platform permit.

## Branch and merge workflow

- At the start of each new work item, before editing files, run these commands in order:
  1. Switch to `main` with `git switch main`.
  2. Pull the latest `main` from GitHub with `git pull --ff-only origin main`.
  3. Create and switch to a work branch from the updated `main`. Use `git switch -c fix/<short-description>` for a correction or `git switch -c feature/<short-description>` for new behavior.
- Preserve any existing local changes. If switching to `main` or pulling fails, resolve the issue before creating the work branch.
- Keep the source branch prefix accurate: `fix/*` produces a patch release and `feature/*` produces a minor release.
- A major release is an explicit maintainer decision. Add the `version:major` label to the PR before marking it ready; this overrides the normal patch or minor bump.
- When the PR has been reviewed and is ready to merge, add the `ready-to-merge` label. The version workflow commits the version change to the PR, squash-merges it into `main`, and tags the resulting commit. Do not manually bump the version, merge the PR, or create the release tag.
- Keep squash merging enabled and do not configure the version-and-merge workflow itself as a required status check, because it remains active until the merge and tag are complete.

## Change guidance

- Do not add direct filesystem, updater, shell, or window-management access to renderer code.
- Keep the settings schema backward-compatible. When adding a field, give it a safe default in `defaultSettings()` and normalize older/malformed values in `normalizeSettings()`.
- Do not persist hydrated `url` fields. Persist only `id`, `source`, quantities, names, and application preferences.
- Do not delete imported media merely because a draft removed it; cleanup requires an explicit, carefully tested orphan-management flow.
- Keep update checks non-blocking and packaged-build-only. Every GitHub Actions run must use a unique semantic version and publish a non-draft GitHub Release for clients; the workflow artifact is only a backup copy.
