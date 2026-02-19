const DEFAULT_SETTINGS = {
  cps: 1,
  jitter: 0,
  clickType: 'single',
  mouseButton: 'left',
  startHotkey: 'KeyQ',
  stopHotkey: 'KeyW',
};

const cpsInput = document.getElementById('cps');
const jitterInput = document.getElementById('jitter');
const clickTypeInput = document.getElementById('clickType');
const mouseButtonInput = document.getElementById('mouseButton');
const startHotkeyInput = document.getElementById('startHotkey');
const stopHotkeyInput = document.getElementById('stopHotkey');
const statusLabel = document.getElementById('status');
const saveButton = document.getElementById('save');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');

function normalizeCps(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.cps;
  }

  return Math.min(50, Math.max(0.2, parsed));
}

function normalizeJitter(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.jitter;
  }

  return Math.min(80, Math.max(0, Math.round(parsed)));
}

function normalizeClickType(value) {
  return value === 'double' ? 'double' : 'single';
}

function normalizeMouseButton(value) {
  if (value === 'middle' || value === 'right') {
    return value;
  }

  return 'left';
}

function formatHotkey(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return '';
  }

  if (code.startsWith('Key')) {
    return code.slice(3).toUpperCase();
  }

  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  return code;
}

function normalizeSettings(rawSettings = {}) {
  const legacyHotkey = typeof rawSettings.hotkey === 'string' ? rawSettings.hotkey : null;

  const startHotkey =
    (typeof rawSettings.startHotkey === 'string' && rawSettings.startHotkey.length > 0)
      ? rawSettings.startHotkey
      : (legacyHotkey || DEFAULT_SETTINGS.startHotkey);

  const stopHotkey =
    (typeof rawSettings.stopHotkey === 'string' && rawSettings.stopHotkey.length > 0)
      ? rawSettings.stopHotkey
      : DEFAULT_SETTINGS.stopHotkey;

  return {
    cps: normalizeCps(rawSettings.cps),
    jitter: normalizeJitter(rawSettings.jitter),
    clickType: normalizeClickType(rawSettings.clickType),
    mouseButton: normalizeMouseButton(rawSettings.mouseButton),
    startHotkey,
    stopHotkey,
  };
}

function withActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      setStatus('error', 'No active tab');
      return;
    }

    callback(tabs[0].id);
  });
}

function sendToActiveTab(message, callback) {
  withActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        callback?.(null, lastError);
        return;
      }

      callback?.(response, null);
    });
  });
}

function setStatus(kind, text) {
  statusLabel.className = `status ${kind}`;
  statusLabel.textContent = text;
}

function applySettingsToUi(rawSettings) {
  const settings = normalizeSettings(rawSettings);
  cpsInput.value = String(settings.cps);
  jitterInput.value = String(settings.jitter);
  clickTypeInput.value = settings.clickType;
  mouseButtonInput.value = settings.mouseButton;

  startHotkeyInput.dataset.code = settings.startHotkey;
  startHotkeyInput.value = formatHotkey(settings.startHotkey);

  stopHotkeyInput.dataset.code = settings.stopHotkey;
  stopHotkeyInput.value = formatHotkey(settings.stopHotkey);
}

function getUiSettings() {
  return normalizeSettings({
    cps: cpsInput.value,
    jitter: jitterInput.value,
    clickType: clickTypeInput.value,
    mouseButton: mouseButtonInput.value,
    startHotkey: startHotkeyInput.dataset.code,
    stopHotkey: stopHotkeyInput.dataset.code,
  });
}

function saveSettings() {
  const settings = getUiSettings();
  applySettingsToUi(settings);

  chrome.storage.sync.set(settings, () => {
    sendToActiveTab({ action: 'updateSettings', settings }, () => {
      refreshStatus();
    });
  });
}

function bindHotkeyCapture(input) {
  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    if (event.code === 'Tab') {
      return;
    }

    input.dataset.code = event.code;
    input.value = formatHotkey(event.code);
    saveSettings();
  });
}

function refreshStatus() {
  sendToActiveTab({ action: 'getStatus' }, (response, error) => {
    if (error || !response) {
      setStatus('error', 'No access');
      return;
    }

    setStatus(response.running ? 'running' : 'stopped', response.running ? 'Running' : 'Stopped');
  });
}

chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
  applySettingsToUi(storedSettings);
  refreshStatus();
});

cpsInput.addEventListener('change', saveSettings);
jitterInput.addEventListener('change', saveSettings);
clickTypeInput.addEventListener('change', saveSettings);
mouseButtonInput.addEventListener('change', saveSettings);
bindHotkeyCapture(startHotkeyInput);
bindHotkeyCapture(stopHotkeyInput);

saveButton.addEventListener('click', saveSettings);

startButton.addEventListener('click', () => {
  const settings = getUiSettings();
  chrome.storage.sync.set(settings, () => {
    sendToActiveTab({ action: 'start', settings }, () => {
      refreshStatus();
    });
  });
});

stopButton.addEventListener('click', () => {
  sendToActiveTab({ action: 'stop' }, () => {
    refreshStatus();
  });
});

window.addEventListener('focus', refreshStatus);
