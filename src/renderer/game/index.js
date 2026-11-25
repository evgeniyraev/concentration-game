import { mountBoard } from './board.mjs';
import { bindLongPress } from './long-press.mjs';
import { mountVideo } from './video.mjs';

const stage = document.querySelector('main');
const api = window.gameApp;
const asset = (name) => `../../../assets/${name}`;
const screens = {
  home: 'GAME-001-HOME.jpg',
  board: 'board.jpg',
  win: 'win.jpg',
  lose: 'lose.jpg'
};
const unavailableSettings = {
  configured: false,
  gameSeconds: 120,
  rewards: [],
  videos: [],
  workingHours: { enabled: false },
  rewardStatus: { active: false },
  resultIdleSeconds: 60,
  videoAutoplay: { enabled: false, idleSeconds: 300 }
};

let currentCleanup;
let idleTimer;
let page;
let playlist = [];
let statusTimer;
let settings = unavailableSettings;
let startButton;

function resize() {
  stage.style.setProperty('--scale', Math.min(innerWidth / 1080, innerHeight / 1920));
}

function createElement(tag, parent, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  parent.append(node);
  return node;
}

function position(node, x, y, width, height) {
  Object.assign(node.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`
  });
}

function createHotspot(name, x, y, width, height, action) {
  const button = createElement('button', stage, 'hot');
  button.ariaLabel = name;
  button.title = name;
  position(button, x, y, width, height);
  button.addEventListener('click', action);
  return button;
}

function schedulePageIdle() {
  clearTimeout(idleTimer);
  if (page === 'home' && playlist.length && settings.videoAutoplay.enabled) {
    idleTimer = setTimeout(playVideo, settings.videoAutoplay.idleSeconds * 1000);
  } else if ((page === 'win' || page === 'lose') && settings.resultIdleSeconds > 0) {
    idleTimer = setTimeout(home, settings.resultIdleSeconds * 1000);
  }
}

function setPage(nextPage) {
  currentCleanup?.();
  currentCleanup = undefined;
  page = nextPage;
  stage.replaceChildren();
  stage.style.backgroundImage = screens[nextPage] ? `url("${asset(screens[nextPage])}")` : 'none';
  schedulePageIdle();
}

function canStart() {
  return settings.configured && settings.rewardStatus.active;
}

function openSettings() {
  if (api) api.openSettings();
  else window.alert('Settings are available in the Electron application.');
}

function home() {
  setPage('home');
  startButton = createHotspot('Start game', 262, 486, 556, 170, start);
  updateStartButton();
  const settingsButton = createHotspot('Open settings', 0, 0, 140, 134, () => {});
  settingsButton.title = 'Hold for 10 seconds to open settings';
  settingsButton.classList.add('settings-hotspot');
  currentCleanup = bindLongPress(settingsButton, openSettings);
  videoButton();
}

function updateStartButton() {
  const available = canStart();
  startButton.disabled = !available;
  startButton.classList.toggle('gray', !available);
  startButton.title = available ? 'Start game' : 'Game unavailable';
}

function videoButton() {
  const button = createHotspot('Play videos', 443, 1730, 194, 168, playVideo);
  if (!playlist.length) {
    button.disabled = true;
    button.classList.add('gray');
    button.title = 'No videos added';
  }
}

function playVideo() {
  if (!playlist.length) return;
  setPage('video');
  currentCleanup = mountVideo({
    createElement,
    createHotspot,
    isActive: () => page === 'video',
    onExit: () => home(),
    playlist,
    stage
  });
}

function start() {
  if (!canStart()) return home();
  setPage('board');
  currentCleanup = mountBoard({
    asset,
    createElement,
    createHotspot,
    gameSeconds: settings.gameSeconds,
    onHome: () => home(),
    onRestart: start,
    onResult: result,
    position,
    stage
  });
}

async function result(won) {
  if (page !== 'board') return;
  setPage('result-pending');
  let reward;
  if (api && won) {
    try {
      const award = await api.drawReward();
      reward = award.reward;
      applySettings(award.settings);
    } catch {
      // Only show an award after the main process has saved it.
    }
  }

  setPage(reward ? 'win' : 'lose');
  if (reward) {
    const image = createElement('img', stage, 'gift');
    image.src = reward.url;
    image.alt = reward.name;
  }
  createHotspot('Home', 10, 4, 140, 134, home);
  videoButton();
}

function applySettings(nextSettings) {
  settings = nextSettings;
  playlist = settings.videos;
  if (page === 'home') home();
  else schedulePageIdle();
}

async function refreshWorkingHours() {
  if (page !== 'home' || !settings.workingHours.enabled) return;
  const previous = settings;
  const next = await api.getSettings();
  if (page !== 'home' || settings !== previous) return;
  settings = next;
  updateStartButton();
}

async function load() {
  if (api) {
    applySettings(await api.getSettings());
    api.onSettingsChanged(applySettings);
    statusTimer = setInterval(() => refreshWorkingHours().catch(() => {}), 5_000);
  }
  home();
}

window.addEventListener('resize', resize);
for (const interaction of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
  window.addEventListener(interaction, schedulePageIdle, { passive: true });
}
window.addEventListener('unload', () => {
  clearTimeout(idleTimer);
  clearInterval(statusTimer);
});
resize();
load().catch(() => home());
