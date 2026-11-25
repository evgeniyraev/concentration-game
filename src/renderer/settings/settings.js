import { mountChanceEditor } from './chance-editor.mjs';

const api = window.settingsApp;
const form = document.querySelector('#settings-form');
const gameTime = document.querySelector('#game-time');
const rewardList = document.querySelector('#reward-list');
const videoList = document.querySelector('#video-list');
const autoplay = document.querySelector('#video-autoplay');
const idleSeconds = document.querySelector('#idle-seconds');
const idleField = document.querySelector('#idle-field');
const resultIdle = document.querySelector('#result-idle');
const startAtLogin = document.querySelector('#start-at-login');
const updatesEnabled = document.querySelector('#updates-enabled');
const updateScope = document.querySelector('#update-scope');
const updateScopeField = document.querySelector('#update-scope-field');
const updateStatus = document.querySelector('#update-status');
const message = document.querySelector('#form-message');
const saveButton = document.querySelector('#save');
const resetButton = document.querySelector('#reset-defaults');
const hoursEnabled = document.querySelector('#hours-enabled');
const hourFields = document.querySelector('#hour-fields');
const startDate = document.querySelector('#start-date');
const endDate = document.querySelector('#end-date');
const startTime = document.querySelector('#start-time');
const endTime = document.querySelector('#end-time');
const rewardStatus = document.querySelector('#reward-status');
const logWins = document.querySelector('#log-reward-wins');
const logStatus = document.querySelector('#reward-log-status');
const exportLog = document.querySelector('#export-reward-log');
const rewardPreset = document.querySelector('#reward-preset');
const addPreset = document.querySelector('#add-preset');
const chanceEditor = mountChanceEditor();
const tabs = [...document.querySelectorAll('[role="tab"]')];
let presets;
let draft;
const originalQuantities = new Map();

function button(text, className, action, label = text) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = text;
  element.className = className;
  element.ariaLabel = label;
  element.addEventListener('click', action);
  return element;
}

function renderRewards() {
  rewardList.replaceChildren();
  for (const reward of draft.rewards) {
    const row = document.createElement('div');
    row.className = 'item-row reward-row';
    const image = document.createElement('img');
    image.src = reward.url;
    image.alt = '';
    const change = button('Change image', 'secondary', async () => {
      const replacement = await api.selectRewardImage();
      if (!replacement) return;
      reward.source = replacement.source;
      reward.url = replacement.url;
      image.src = reward.url;
    });
    const name = rewardField(reward, 'name', 'Reward name', 'text');
    const quantity = rewardField(reward, 'quantity', 'In stock', 'number', 999999999);
    const daily = rewardField(reward, 'dailyQuantity', 'Units to add', 'number', 999999);
    const restock = document.createElement('label');
    restock.className = 'check-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = reward.restockDaily;
    const dailyInput = daily.querySelector('input');
    dailyInput.disabled = !checkbox.checked;
    checkbox.addEventListener('change', () => {
      reward.restockDaily = checkbox.checked;
      dailyInput.disabled = !checkbox.checked;
    });
    restock.append(checkbox, 'Daily restock');
    const remove = button('×', 'icon', () => {
      draft.rewards.splice(draft.rewards.indexOf(reward), 1);
      originalQuantities.delete(reward.id);
      row.remove();
      renderPresets();
    }, `Remove ${reward.name}`);
    const details = document.createElement('div');
    details.className = 'reward-fields';
    details.append(name, quantity, restock, daily);
    const actions = document.createElement('div');
    actions.className = 'reward-actions';
    actions.append(change, remove);
    row.append(image, details, actions);
    rewardList.append(row);
  }
  renderPresets();
}

function rewardField(reward, key, label, type, max) {
  const field = document.createElement('label');
  field.className = 'stacked-field';
  field.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.required = true;
  input.value = String(reward[key]);
  if (type === 'number') {
    input.min = '0';
    input.max = String(max);
    input.step = '1';
  } else {
    input.maxLength = 300;
  }
  input.addEventListener('input', () => {
    if (type === 'text') reward[key] = input.value;
    else if (Number.isFinite(input.valueAsNumber)) reward[key] = input.valueAsNumber;
  });
  field.append(input);
  return field;
}

function renderPresets() {
  const available = presets.filter((preset) => !draft.rewards.some(({ id }) => id === preset.id));
  rewardPreset.replaceChildren(...available.map(({ name, id }) => new Option(name, id)));
  rewardPreset.disabled = available.length === 0 || draft.rewards.length >= 100;
  addPreset.disabled = rewardPreset.disabled;
}

function renderVideos() {
  videoList.replaceChildren();
  for (const video of draft.videos) {
    const row = document.createElement('div');
    row.className = 'item-row';
    const preview = document.createElement('video');
    preview.src = video.url;
    preview.muted = true;
    preview.preload = 'metadata';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = video.name;
    const mute = document.createElement('label');
    mute.className = 'check-row video-mute-setting';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = video.muted;
    checkbox.ariaLabel = `Mute ${video.name}`;
    checkbox.addEventListener('change', () => { video.muted = checkbox.checked; });
    mute.append(checkbox, 'Mute');
    const remove = button('×', 'icon', () => {
      draft.videos.splice(draft.videos.indexOf(video), 1);
      row.remove();
    }, `Remove ${video.name}`);
    row.append(preview, name, mute, remove);
    videoList.append(row);
  }
}

function secondsToTime(seconds) {
  return [Math.floor(seconds / 60), seconds % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function setConditionalFields() {
  idleField.hidden = !autoplay.checked;
  idleSeconds.disabled = !autoplay.checked;
  updateScopeField.hidden = !updatesEnabled.checked;
  updateScope.disabled = !updatesEnabled.checked;
  hourFields.classList.toggle('disabled', !hoursEnabled.checked);
  for (const input of hourFields.querySelectorAll('input')) {
    input.disabled = !hoursEnabled.checked;
  }
}

function selectTab(tab) {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    document.getElementById(candidate.getAttribute('aria-controls')).hidden = !selected;
  }
  window.scrollTo(0, 0);
}

function renderStatus() {
  const status = draft.rewardStatus;
  rewardStatus.textContent = status.active
    ? `When opened: ${Math.round(status.chance * 100)}% chance with saved settings, ${status.remaining} units in stock.`
    : 'The game is outside its scheduled working hours.';
  logStatus.textContent = `${draft.rewardLogCount} recorded wins. CSV timestamps use UTC.`;
}

function renderDraft() {
  gameTime.value = secondsToTime(draft.gameSeconds);
  autoplay.checked = draft.videoAutoplay.enabled;
  idleSeconds.value = String(draft.videoAutoplay.idleSeconds);
  resultIdle.value = String(draft.resultIdleSeconds);
  startAtLogin.checked = draft.startAtLogin;
  updatesEnabled.checked = draft.updates.enabled;
  updateScope.value = draft.updates.scope;
  hoursEnabled.checked = draft.workingHours.enabled;
  startDate.value = draft.workingHours.startDate;
  endDate.value = draft.workingHours.endDate;
  startTime.value = draft.workingHours.startTime;
  endTime.value = draft.workingHours.endTime;
  logWins.checked = draft.logRewardWins;
  chanceEditor.load(draft.rewardChances.points);
  renderRewards();
  renderVideos();
  setConditionalFields();
}

async function load() {
  [draft, presets] = await Promise.all([api.getSettings(), api.getRewardPresets()]);
  for (const { id, quantity } of draft.rewards) originalQuantities.set(id, quantity);
  document.querySelector('#version').textContent = `Version ${draft.appVersion}`;
  renderDraft();
  renderStatus();
  exportLog.disabled = false;
  saveButton.disabled = false;
  resetButton.disabled = false;
}

resetButton.addEventListener('click', async () => {
  resetButton.disabled = true;
  saveButton.disabled = true;
  try {
    draft = await api.getDefaultSettings();
    // A reset explicitly sets stock even if its quantity matched when Settings opened.
    originalQuantities.clear();
    renderDraft();
    message.textContent = 'Defaults loaded. Save settings to apply them.';
  } catch (error) {
    message.textContent = error.message || 'Could not load the default settings.';
  } finally {
    saveButton.disabled = false;
    resetButton.disabled = false;
  }
});

document.querySelector('#add-reward').addEventListener('click', async () => {
  if (!draft || draft.rewards.length >= 100) return;
  const reward = await api.selectRewardImage();
  if (!reward) return;
  draft.rewards.push(reward);
  renderRewards();
});

addPreset.addEventListener('click', () => {
  const preset = presets.find(({ id }) => id === rewardPreset.value);
  if (!preset) return;
  draft.rewards.push({ ...preset });
  renderRewards();
});

exportLog.addEventListener('click', async () => {
  exportLog.disabled = true;
  try {
    const count = await api.exportRewardLog();
    if (count !== null) logStatus.textContent = `Exported ${count} recorded wins. CSV timestamps use UTC.`;
  } catch (error) {
    logStatus.textContent = error.message || 'Could not export reward wins.';
  } finally {
    exportLog.disabled = false;
  }
});

document.querySelector('#add-videos').addEventListener('click', async () => {
  if (!draft) return;
  const videos = await api.selectVideos();
  if (!videos.length) return;
  draft.videos.push(...videos);
  renderVideos();
});

autoplay.addEventListener('change', setConditionalFields);
updatesEnabled.addEventListener('change', setConditionalFields);
hoursEnabled.addEventListener('change', setConditionalFields);
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const targets = {
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1
    };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    const target = tabs[targets[event.key]];
    selectTab(target);
    target.focus();
  });
}
api.onUpdateStatus((status) => { updateStatus.textContent = status.message; });

form.noValidate = true;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!draft || saveButton.disabled) return;
  message.textContent = '';
  const invalidField = form.querySelector('input:invalid, select:invalid');
  if (invalidField) {
    selectTab(document.getElementById(invalidField.closest('[role="tabpanel"]').getAttribute('aria-labelledby')));
    invalidField.reportValidity();
    return;
  }
  const [minutes, seconds] = gameTime.value.split(':').map(Number);
  const gameSeconds = minutes * 60 + seconds;
  if (gameSeconds < 1 || gameSeconds > 86400) {
    selectTab(document.querySelector('#app-tab'));
    message.textContent = 'Game time must be between 1 second and 24 hours.';
    return;
  }
  if (hoursEnabled.checked && endDate.value < startDate.value) {
    selectTab(document.querySelector('#hours-tab'));
    message.textContent = 'The last date must be on or after the first date.';
    return;
  }
  if (hoursEnabled.checked && endTime.value <= startTime.value) {
    selectTab(document.querySelector('#hours-tab'));
    message.textContent = 'The daily end time must be after the start time.';
    return;
  }
  const chancePoints = chanceEditor.getPoints();
  if (!chancePoints) {
    selectTab(document.querySelector('#chances-tab'));
    message.textContent = 'Check the curve points before saving.';
    return;
  }
  const submission = {
    gameSeconds,
    resultIdleSeconds: resultIdle.valueAsNumber,
    rewards: draft.rewards.map(({ url, ...reward }) => ({
      ...reward,
      quantityChanged: originalQuantities.get(reward.id) !== reward.quantity
    })),
    videos: draft.videos.map(({ url, ...video }) => video),
    startAtLogin: startAtLogin.checked,
    updates: {
      enabled: updatesEnabled.checked,
      scope: updateScope.value
    },
    videoAutoplay: {
      enabled: autoplay.checked,
      idleSeconds: idleSeconds.valueAsNumber
    },
    workingHours: {
      enabled: hoursEnabled.checked,
      startDate: startDate.value, endDate: endDate.value,
      startTime: startTime.value, endTime: endTime.value
    },
    rewardChances: { points: chancePoints },
    logRewardWins: logWins.checked
  };
  saveButton.disabled = true;
  resetButton.disabled = true;
  message.textContent = 'Saving…';
  try {
    await api.saveSettings(submission);
  } catch (error) {
    saveButton.disabled = false;
    resetButton.disabled = false;
    message.textContent = error.message || 'Could not save the settings.';
  }
});

load().catch((error) => {
  message.textContent = error.message || 'Could not load the settings.';
  saveButton.disabled = true;
});
