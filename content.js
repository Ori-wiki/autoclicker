const DEFAULT_SETTINGS = {
  cps: 1,
  jitter: 0,
  clickType: 'single',
  mouseButton: 'left',
  startHotkey: 'KeyQ',
  stopHotkey: 'KeyW',
};

let clickTimeoutId = null;
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let settings = { ...DEFAULT_SETTINGS };

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

function applySettings(nextSettings = {}) {
  if (typeof nextSettings.cps !== 'undefined') {
    settings.cps = normalizeCps(nextSettings.cps);
  }

  if (typeof nextSettings.jitter !== 'undefined') {
    settings.jitter = normalizeJitter(nextSettings.jitter);
  }

  if (typeof nextSettings.clickType !== 'undefined') {
    settings.clickType = normalizeClickType(nextSettings.clickType);
  }

  if (typeof nextSettings.mouseButton !== 'undefined') {
    settings.mouseButton = normalizeMouseButton(nextSettings.mouseButton);
  }

  const legacyHotkey =
    (typeof nextSettings.hotkey === 'string' && nextSettings.hotkey.length > 0)
      ? nextSettings.hotkey
      : null;

  if (typeof nextSettings.startHotkey === 'string' && nextSettings.startHotkey.length > 0) {
    settings.startHotkey = nextSettings.startHotkey;
  } else if (legacyHotkey) {
    settings.startHotkey = legacyHotkey;
  }

  if (typeof nextSettings.stopHotkey === 'string' && nextSettings.stopHotkey.length > 0) {
    settings.stopHotkey = nextSettings.stopHotkey;
  }

  if (clickTimeoutId) {
    rescheduleClicking();
  }
}

function getBaseDelayMs() {
  return Math.max(10, Math.round(1000 / settings.cps));
}

function getDelayMs() {
  const base = getBaseDelayMs();
  const spread = base * (settings.jitter / 100);
  const delay = base + ((Math.random() * 2 - 1) * spread);
  return Math.max(10, Math.round(delay));
}

function buttonToIndex(button) {
  if (button === 'middle') {
    return 1;
  }

  if (button === 'right') {
    return 2;
  }

  return 0;
}

function buttonToMask(buttonIndex) {
  if (buttonIndex === 1) {
    return 4;
  }

  if (buttonIndex === 2) {
    return 2;
  }

  return 1;
}

function dispatchMouseEvent(target, type, buttonIndex) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: mouseX,
    clientY: mouseY,
    button: buttonIndex,
    buttons: buttonToMask(buttonIndex),
  }));
}

function performSingleClick(target) {
  const buttonIndex = buttonToIndex(settings.mouseButton);

  dispatchMouseEvent(target, 'mousedown', buttonIndex);
  dispatchMouseEvent(target, 'mouseup', buttonIndex);

  if (buttonIndex === 2) {
    dispatchMouseEvent(target, 'contextmenu', buttonIndex);
    return;
  }

  dispatchMouseEvent(target, 'click', buttonIndex);
}

function performClickAtCursor() {
  const target = document.elementFromPoint(mouseX, mouseY);
  if (!target) {
    return;
  }

  performSingleClick(target);

  if (settings.clickType === 'double' && settings.mouseButton === 'left') {
    performSingleClick(target);
    dispatchMouseEvent(target, 'dblclick', 0);
  }
}

function scheduleNextClick() {
  clickTimeoutId = window.setTimeout(() => {
    if (!clickTimeoutId) {
      return;
    }

    performClickAtCursor();
    scheduleNextClick();
  }, getDelayMs());
}

function startClicking() {
  if (clickTimeoutId) {
    return;
  }

  scheduleNextClick();
}

function stopClicking() {
  if (!clickTimeoutId) {
    return;
  }

  window.clearTimeout(clickTimeoutId);
  clickTimeoutId = null;
}

function rescheduleClicking() {
  stopClicking();
  startClicking();
}

function isEditableElement(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

document.addEventListener(
  'mousemove',
  (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  },
  { passive: true },
);

document.addEventListener('keydown', (event) => {
  if (event.repeat || isEditableElement(event.target)) {
    return;
  }

  if (event.code === 'Escape') {
    stopClicking();
    return;
  }

  if (event.code === settings.startHotkey) {
    startClicking();
    return;
  }

  if (event.code === settings.stopHotkey) {
    stopClicking();
  }
});

chrome.storage.sync.get(DEFAULT_SETTINGS, (storedSettings) => {
  applySettings(storedSettings);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  const updated = {};

  if (changes.cps) {
    updated.cps = changes.cps.newValue;
  }

  if (changes.jitter) {
    updated.jitter = changes.jitter.newValue;
  }

  if (changes.clickType) {
    updated.clickType = changes.clickType.newValue;
  }

  if (changes.mouseButton) {
    updated.mouseButton = changes.mouseButton.newValue;
  }

  if (changes.startHotkey) {
    updated.startHotkey = changes.startHotkey.newValue;
  }

  if (changes.stopHotkey) {
    updated.stopHotkey = changes.stopHotkey.newValue;
  }

  if (changes.hotkey) {
    updated.hotkey = changes.hotkey.newValue;
  }

  applySettings(updated);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.settings) {
    applySettings(request.settings);
  }

  if (request.action === 'start') {
    startClicking();
  }

  if (request.action === 'stop') {
    stopClicking();
  }

  if (request.action === 'updateSettings') {
    applySettings(request.settings);
  }

  if (request.action === 'getStatus') {
    sendResponse({ running: Boolean(clickTimeoutId), settings: { ...settings } });
  }
});
