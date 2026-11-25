# Max & Mila’s World

An Electron application for the concentration game. The installed Windows app starts maximized with its native window frame visible. Open the separate Settings window with **Ctrl+,** on Windows or **Command+,** on macOS while the game window is focused. The invisible area in the top-left corner of the home screen also opens Settings. Settings open automatically on a new installation.

## Develop locally

```sh
npm install
npm start
```

The development window is intentionally shown at its configured size. Installed builds start maximized. Both the game and Settings retain their native window frames. Run the tests with `npm test`.

## Source layout

- `src/main/` contains Electron lifecycle, windows, IPC, updater, and settings/media services.
- `src/preload/` contains the separate minimal bridges for the game and Settings renderers.
- `src/renderer/game/` contains the portrait game, including isolated board, video, and pure model modules.
- `src/renderer/settings/` contains the Settings form.
- `assets/` and `Video/` remain at the application root because their paths are part of persisted media descriptors.

## Build and release for Windows

The workflow at `.github/workflows/windows-release.yml` runs on Windows and always produces a published GitHub Release plus a workflow artifact. Start it manually and enter a new `MAJOR.MINOR.PATCH` version, or push a semantic-version tag:

```sh
git tag v1.0.1
git push origin v1.0.1
```

The manual input or tag supplies the packaged application version. Tags must have the form `vMAJOR.MINOR.PATCH`. The repository must allow GitHub Actions to create releases; the workflow declares `contents: write` and uses the built-in `GITHUB_TOKEN`. The repository needs to be public for unauthenticated installed clients to download updates from GitHub Releases. Use a new version for every run so release assets are not overwritten.

The updater checks ten seconds after launch and then every four hours. When the latest release is within the configured patch/minor/major policy, it downloads it and restarts the app to install it. GitHub’s latest-release endpoint exposes one latest release, so a release outside the selected compatibility range is ignored rather than searching older releases.

## Configuration data

Settings and reward stock live in Electron’s per-user `userData` directory, not in browser storage. Images and videos selected in Settings are copied into its `media` directory so they remain available after the original files move. The defaults are:

- updates enabled for minor and patch releases;
- Windows automatic startup disabled;
- video autoplay disabled, with a five-minute Home screen wait;
- two-minute game time and a 60-second idle timeout on the result screen;
- working hours set to 28–29 November 2026, 11:00–17:00 local time;
- the medallion is the sole configured reward, with 70 in stock and 70 added on each subsequent scheduled day;
- the reward chance stays at 0% through minute 7 and reaches 100% at minute 13 after opening or the last award.

On completion, a game rolls against the **Reward chances** curve. A successful draw picks one unit from all remaining stock. Configure stock and per-reward daily restock in **Rewards**. This tab also controls win logging and exports award timestamps in UTC and prize names to CSV. Existing explicit update preferences and saved curves carry forward on upgrade.

For a guaranteed award while stock remains, set a single curve point at 0 minutes and 100%. Upgrading from a disabled curve uses this setting automatically.

