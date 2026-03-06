const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Default',
  cps: 1,
  jitter: 0,
  clickType: 'single',
  mouseButton: 'left',
  startHotkey: 'KeyQ',
  pauseHotkey: 'KeyE',
  stopHotkey: 'KeyW',
  maxClicks: 0,
  maxDurationSec: 0,
  useTemplate: false,
  templatePoints: [],
  stopOnColorEnabled: false,
  stopColorHex: '#ff0000',
  stopColorTolerance: 12,
  stopColorPoint: { x: 0, y: 0 },
  stopOnSelectorEnabled: false,
  stopSelector: '',
  stopOnWindowBlur: true,
  bindToTabUrl: true,
  safeAreaEnabled: false,
  safeArea: { x: 0, y: 0, width: 0, height: 0 },
  overlayEnabled: true,
  scheduleMode: 'manual',
  scheduleDelaySec: 0,
  scheduleAtISO: '',
  macroEvents: [],
};

const DEFAULT_CONFIG = {
  version: 2,
  activeProfileId: 'default',
  profiles: [DEFAULT_PROFILE],
};

const MAX_LOGS = 250;
const LIFETIME_STATS_KEY = 'autoclickerLifetimeStats';

let config = { ...DEFAULT_CONFIG };
let activeProfile = { ...DEFAULT_PROFILE };
let mousePos = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) };
let templateIndex = 0;
let boundUrlAtStart = '';

const engine = {
  state: 'stopped',
  clickTimeoutId: null,
  schedulerTimeoutId: null,
  overlayIntervalId: null,
  startedAtMs: 0,
  clickCount: 0,
  pauseStartedAtMs: 0,
  totalPausedMs: 0,
  stopReason: 'manual',
};

const macro = {
  recording: false,
  playing: false,
  events: [],
  startedAtMs: 0,
  playbackTimers: [],
};

let logs = [];
let lifetimeStats = {
  totalClicks: 0,
  sessions: 0,
  totalRunMs: 0,
};

const overlay = createOverlay();

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function normalizeHotkey(code, fallback) {
  return typeof code === 'string' && code.length > 0 ? code : fallback;
}

function normalizePoint(raw) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  return {
    x: Number.isFinite(x) ? Math.round(x) : 0,
    y: Number.isFinite(y) ? Math.round(y) : 0,
  };
}

function normalizeSafeArea(raw) {
  const point = normalizePoint(raw);
  const width = Number(raw?.width);
  const height = Number(raw?.height);
  return {
    x: point.x,
    y: point.y,
    width: Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0,
    height: Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0,
  };
}

function normalizeMacroEvent(event) {
  const whenMs = Number(event?.whenMs);
  const type = event?.type === 'key' ? 'key' : 'click';

  if (!Number.isFinite(whenMs) || whenMs < 0) {
    return null;
  }

  if (type === 'key') {
    const code = typeof event.code === 'string' ? event.code : '';
    if (!code) {
      return null;
    }

    return {
      type,
      whenMs: Math.round(whenMs),
      code,
    };
  }

  return {
    type,
    whenMs: Math.round(whenMs),
    x: normalizePoint(event).x,
    y: normalizePoint(event).y,
    button: ['left', 'middle', 'right'].includes(event?.button) ? event.button : 'left',
    clickType: event?.clickType === 'double' ? 'double' : 'single',
  };
}

function normalizeProfile(raw = {}) {
  const cps = Number(raw.cps);
  const jitter = Number(raw.jitter);
  const maxClicks = Number(raw.maxClicks);
  const maxDurationSec = Number(raw.maxDurationSec);
  const scheduleDelaySec = Number(raw.scheduleDelaySec);
  const stopColorTolerance = Number(raw.stopColorTolerance);
  const templatePoints = Array.isArray(raw.templatePoints)
    ? raw.templatePoints.map(normalizePoint).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];

  const macroEvents = Array.isArray(raw.macroEvents)
    ? raw.macroEvents.map(normalizeMacroEvent).filter(Boolean)
    : [];

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `profile-${Date.now()}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Profile',
    cps: Number.isFinite(cps) ? clamp(cps, 0.2, 100) : DEFAULT_PROFILE.cps,
    jitter: Number.isFinite(jitter) ? clamp(Math.round(jitter), 0, 95) : DEFAULT_PROFILE.jitter,
    clickType: raw.clickType === 'double' ? 'double' : 'single',
    mouseButton: ['left', 'middle', 'right'].includes(raw.mouseButton) ? raw.mouseButton : 'left',
    startHotkey: normalizeHotkey(raw.startHotkey, DEFAULT_PROFILE.startHotkey),
    pauseHotkey: normalizeHotkey(raw.pauseHotkey, DEFAULT_PROFILE.pauseHotkey),
    stopHotkey: normalizeHotkey(raw.stopHotkey, DEFAULT_PROFILE.stopHotkey),
    maxClicks: Number.isFinite(maxClicks) ? Math.max(0, Math.round(maxClicks)) : 0,
    maxDurationSec: Number.isFinite(maxDurationSec) ? Math.max(0, maxDurationSec) : 0,
    useTemplate: Boolean(raw.useTemplate),
    templatePoints,
    stopOnColorEnabled: Boolean(raw.stopOnColorEnabled),
    stopColorHex: typeof raw.stopColorHex === 'string' ? raw.stopColorHex : DEFAULT_PROFILE.stopColorHex,
    stopColorTolerance: Number.isFinite(stopColorTolerance) ? clamp(Math.round(stopColorTolerance), 0, 255) : DEFAULT_PROFILE.stopColorTolerance,
    stopColorPoint: normalizePoint(raw.stopColorPoint),
    stopOnSelectorEnabled: Boolean(raw.stopOnSelectorEnabled),
    stopSelector: typeof raw.stopSelector === 'string' ? raw.stopSelector.trim() : '',
    stopOnWindowBlur: raw.stopOnWindowBlur !== false,
    bindToTabUrl: raw.bindToTabUrl !== false,
    safeAreaEnabled: Boolean(raw.safeAreaEnabled),
    safeArea: normalizeSafeArea(raw.safeArea),
    overlayEnabled: raw.overlayEnabled !== false,
    scheduleMode: ['manual', 'delay', 'at'].includes(raw.scheduleMode) ? raw.scheduleMode : 'manual',
    scheduleDelaySec: Number.isFinite(scheduleDelaySec) ? Math.max(0, scheduleDelaySec) : 0,
    scheduleAtISO: typeof raw.scheduleAtISO === 'string' ? raw.scheduleAtISO : '',
    macroEvents,
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CONFIG, profiles: [normalizeProfile(DEFAULT_PROFILE)] };
  }

  if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
    const profiles = raw.profiles.map(normalizeProfile);
    const activeProfileId = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : profiles[0].id;
    return {
      version: 2,
      profiles,
      activeProfileId,
    };
  }

  const legacy = normalizeProfile(raw);
  return {
    version: 2,
    activeProfileId: legacy.id,
    profiles: [legacy],
  };
}

function applyConfig(nextConfig) {
  config = normalizeConfig(nextConfig);
  const matched = config.profiles.find((profile) => profile.id === config.activeProfileId) || config.profiles[0];
  activeProfile = { ...matched };

  if (!engine.state || engine.state === 'stopped') {
    templateIndex = 0;
  }

  ensureOverlayVisibility();
  renderOverlay();
}

function logEvent(level, message) {
  logs.push({
    ts: new Date().toISOString(),
    level,
    message,
  });

  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
}

function getRunningMs() {
  if (engine.state === 'stopped' || !engine.startedAtMs) {
    return 0;
  }

  const now = Date.now();
  const paused = engine.totalPausedMs + (engine.state === 'paused' ? now - engine.pauseStartedAtMs : 0);
  return Math.max(0, now - engine.startedAtMs - paused);
}

function getCurrentCps() {
  const runningMs = getRunningMs();
  if (runningMs <= 0) {
    return 0;
  }

  return engine.clickCount / (runningMs / 1000);
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

function buttonToMask(index) {
  if (index === 1) {
    return 4;
  }

  if (index === 2) {
    return 2;
  }

  return 1;
}

function dispatchMouseEvent(type, x, y, buttonIndex) {
  const target = document.elementFromPoint(x, y);
  if (!target) {
    return false;
  }

  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: buttonIndex,
    buttons: buttonToMask(buttonIndex),
  }));

  return true;
}

function performClick(x, y, button, clickType) {
  const buttonIndex = buttonToIndex(button);
  const primaryDone = dispatchMouseEvent('mousedown', x, y, buttonIndex)
    && dispatchMouseEvent('mouseup', x, y, buttonIndex);

  if (!primaryDone) {
    return false;
  }

  if (buttonIndex === 2) {
    dispatchMouseEvent('contextmenu', x, y, buttonIndex);
  } else {
    dispatchMouseEvent('click', x, y, buttonIndex);
  }

  if (clickType === 'double' && button === 'left') {
    dispatchMouseEvent('mousedown', x, y, 0);
    dispatchMouseEvent('mouseup', x, y, 0);
    dispatchMouseEvent('click', x, y, 0);
    dispatchMouseEvent('dblclick', x, y, 0);
  }

  return true;
}

function pointInsideSafeArea(point) {
  if (!activeProfile.safeAreaEnabled) {
    return true;
  }

  const area = activeProfile.safeArea;
  if (area.width <= 0 || area.height <= 0) {
    return false;
  }

  const x2 = area.x + area.width;
  const y2 = area.y + area.height;
  return point.x >= area.x && point.x <= x2 && point.y >= area.y && point.y <= y2;
}

function getNextClickPoint() {
  if (activeProfile.useTemplate && activeProfile.templatePoints.length > 0) {
    const point = activeProfile.templatePoints[templateIndex % activeProfile.templatePoints.length];
    templateIndex += 1;
    return point;
  }

  return { ...mousePos };
}

function hexToRgb(hex) {
  if (typeof hex !== 'string') {
    return null;
  }

  const cleaned = hex.trim().replace('#', '');
  const full = cleaned.length === 3
    ? cleaned.split('').map((ch) => `${ch}${ch}`).join('')
    : cleaned;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function parseRgbFromCss(cssValue) {
  if (typeof cssValue !== 'string') {
    return null;
  }

  const match = cssValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) {
    return null;
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function colorDistance(a, b) {
  return Math.sqrt(((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2));
}

function checkStopConditions() {
  if (activeProfile.maxClicks > 0 && engine.clickCount >= activeProfile.maxClicks) {
    return 'max-clicks';
  }

  if (activeProfile.maxDurationSec > 0 && getRunningMs() >= activeProfile.maxDurationSec * 1000) {
    return 'max-duration';
  }

  if (activeProfile.stopOnWindowBlur && !document.hasFocus()) {
    return 'window-blur';
  }

  if (activeProfile.bindToTabUrl && boundUrlAtStart && location.href !== boundUrlAtStart) {
    return 'url-changed';
  }

  if (activeProfile.stopOnSelectorEnabled && activeProfile.stopSelector) {
    try {
      if (document.querySelector(activeProfile.stopSelector)) {
        return 'selector-found';
      }
    } catch (error) {
      return 'selector-invalid';
    }
  }

  if (activeProfile.stopOnColorEnabled) {
    const targetColor = hexToRgb(activeProfile.stopColorHex);
    if (targetColor) {
      const point = activeProfile.stopColorPoint;
      const element = document.elementFromPoint(point.x, point.y);
      if (element) {
        const styleColor = parseRgbFromCss(window.getComputedStyle(element).backgroundColor);
        if (styleColor && colorDistance(styleColor, targetColor) <= activeProfile.stopColorTolerance) {
          return 'color-match';
        }
      }
    }
  }

  return null;
}

function getBaseDelayMs() {
  return Math.max(10, Math.round(1000 / activeProfile.cps));
}

function getNextDelayMs() {
  const base = getBaseDelayMs();
  const spread = base * (activeProfile.jitter / 100);
  const delay = base + ((Math.random() * 2 - 1) * spread);
  return Math.max(10, Math.round(delay));
}

function clearClickTimeout() {
  if (engine.clickTimeoutId) {
    window.clearTimeout(engine.clickTimeoutId);
    engine.clickTimeoutId = null;
  }
}

function clearSchedulerTimeout() {
  if (engine.schedulerTimeoutId) {
    window.clearTimeout(engine.schedulerTimeoutId);
    engine.schedulerTimeoutId = null;
  }
}

function finalizeRunStats() {
  const runMs = getRunningMs();
  if (runMs <= 0 && engine.clickCount <= 0) {
    return;
  }

  lifetimeStats.totalClicks += engine.clickCount;
  lifetimeStats.sessions += 1;
  lifetimeStats.totalRunMs += runMs;
  chrome.storage.local.set({ [LIFETIME_STATS_KEY]: lifetimeStats });
}

function stopEngine(reason = 'manual') {
  clearSchedulerTimeout();
  clearClickTimeout();

  if (engine.state !== 'stopped') {
    finalizeRunStats();
  }

  engine.state = 'stopped';
  engine.pauseStartedAtMs = 0;
  engine.totalPausedMs = 0;
  engine.startedAtMs = 0;
  templateIndex = 0;
  engine.stopReason = reason;

  logEvent('info', `Stopped: ${reason}`);
  renderOverlay();
}

function setPaused(paused) {
  if (paused && engine.state === 'running') {
    clearClickTimeout();
    engine.state = 'paused';
    engine.pauseStartedAtMs = Date.now();
    logEvent('info', 'Paused');
    renderOverlay();
    return;
  }

  if (!paused && engine.state === 'paused') {
    engine.totalPausedMs += Date.now() - engine.pauseStartedAtMs;
    engine.pauseStartedAtMs = 0;
    engine.state = 'running';
    logEvent('info', 'Resumed');
    scheduleClickTick();
    renderOverlay();
  }
}

function clickTick() {
  if (engine.state !== 'running') {
    return;
  }

  const stopReason = checkStopConditions();
  if (stopReason) {
    stopEngine(stopReason);
    return;
  }

  const point = getNextClickPoint();

  if (!pointInsideSafeArea(point)) {
    stopEngine('safety-area');
    return;
  }

  if (performClick(point.x, point.y, activeProfile.mouseButton, activeProfile.clickType)) {
    engine.clickCount += 1;
  }

  renderOverlay();

  const postClickReason = checkStopConditions();
  if (postClickReason) {
    stopEngine(postClickReason);
    return;
  }

  scheduleClickTick();
}

function scheduleClickTick() {
  clearClickTimeout();

  if (engine.state !== 'running') {
    return;
  }

  engine.clickTimeoutId = window.setTimeout(clickTick, getNextDelayMs());
}

function startMainLoop() {
  engine.state = 'running';
  engine.startedAtMs = Date.now();
  engine.clickCount = 0;
  engine.totalPausedMs = 0;
  engine.pauseStartedAtMs = 0;
  boundUrlAtStart = location.href;

  logEvent('info', `Started profile: ${activeProfile.name}`);
  scheduleClickTick();
  renderOverlay();
}

function runSelfTest() {
  const errors = [];
  const warnings = [];

  if (!Number.isFinite(mousePos.x) || !Number.isFinite(mousePos.y)) {
    errors.push('mouse-position-unavailable');
  }

  if (activeProfile.safeAreaEnabled) {
    if (activeProfile.safeArea.width <= 0 || activeProfile.safeArea.height <= 0) {
      errors.push('invalid-safe-area');
    }
  }

  if (activeProfile.useTemplate && activeProfile.templatePoints.length === 0) {
    errors.push('template-enabled-without-points');
  }

  if (activeProfile.bindToTabUrl && !location.href) {
    errors.push('url-unavailable');
  }

  if (!document.hasFocus()) {
    warnings.push('tab-not-focused');
  }

  if (activeProfile.stopOnSelectorEnabled && activeProfile.stopSelector) {
    try {
      document.querySelector(activeProfile.stopSelector);
    } catch (error) {
      errors.push('invalid-stop-selector');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

function startEngineWithSchedule() {
  if (engine.state === 'running' || engine.state === 'paused') {
    return { ok: true, scheduled: false, reason: 'already-running' };
  }

  const check = runSelfTest();
  if (!check.ok) {
    logEvent('error', `Self-test failed: ${check.errors.join(', ')}`);
    return { ok: false, selfTest: check };
  }

  clearSchedulerTimeout();

  if (activeProfile.scheduleMode === 'delay' && activeProfile.scheduleDelaySec > 0) {
    engine.state = 'scheduled';
    const delayMs = Math.round(activeProfile.scheduleDelaySec * 1000);
    engine.schedulerTimeoutId = window.setTimeout(() => {
      engine.schedulerTimeoutId = null;
      startMainLoop();
    }, delayMs);

    logEvent('info', `Scheduled start in ${activeProfile.scheduleDelaySec}s`);
    renderOverlay();
    return { ok: true, scheduled: true, delayMs };
  }

  if (activeProfile.scheduleMode === 'at' && activeProfile.scheduleAtISO) {
    const startAt = Date.parse(activeProfile.scheduleAtISO);
    if (Number.isFinite(startAt) && startAt > Date.now()) {
      engine.state = 'scheduled';
      const delayMs = startAt - Date.now();
      engine.schedulerTimeoutId = window.setTimeout(() => {
        engine.schedulerTimeoutId = null;
        startMainLoop();
      }, delayMs);

      logEvent('info', `Scheduled start at ${activeProfile.scheduleAtISO}`);
      renderOverlay();
      return { ok: true, scheduled: true, delayMs };
    }
  }

  startMainLoop();
  return { ok: true, scheduled: false };
}

function isEditableElement(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function createOverlay() {
  const el = document.createElement('div');
  el.id = '__autoclicker_overlay';
  el.style.position = 'fixed';
  el.style.right = '12px';
  el.style.bottom = '12px';
  el.style.zIndex = '2147483647';
  el.style.background = 'rgba(16, 24, 40, 0.85)';
  el.style.color = '#f8fafc';
  el.style.padding = '8px 10px';
  el.style.borderRadius = '8px';
  el.style.fontFamily = 'Consolas, monospace';
  el.style.fontSize = '12px';
  el.style.lineHeight = '1.4';
  el.style.pointerEvents = 'none';
  el.style.whiteSpace = 'pre';
  el.style.maxWidth = '360px';
  el.style.display = 'none';
  document.documentElement.appendChild(el);
  return el;
}

function ensureOverlayVisibility() {
  if (!overlay) {
    return;
  }

  overlay.style.display = activeProfile.overlayEnabled ? 'block' : 'none';
}

function renderOverlay() {
  if (!overlay) {
    return;
  }

  ensureOverlayVisibility();
  if (overlay.style.display === 'none') {
    return;
  }

  const runningMs = getRunningMs();
  const statusLabel = engine.state.toUpperCase();
  const timerSec = Math.floor(runningMs / 1000);
  const avgCps = getCurrentCps();

  overlay.textContent = [
    `AutoClicker: ${statusLabel}`,
    `Profile: ${activeProfile.name}`,
    `Clicks: ${engine.clickCount}`,
    `Avg CPS: ${avgCps.toFixed(2)}`,
    `Timer: ${timerSec}s`,
    `Last stop: ${engine.stopReason}`,
  ].join('\n');
}

function startOverlayTicker() {
  if (engine.overlayIntervalId) {
    return;
  }

  engine.overlayIntervalId = window.setInterval(renderOverlay, 500);
}

function loadLifetimeStats() {
  chrome.storage.local.get({ [LIFETIME_STATS_KEY]: lifetimeStats }, (stored) => {
    lifetimeStats = {
      ...lifetimeStats,
      ...(stored[LIFETIME_STATS_KEY] || {}),
    };
  });
}

function startMacroRecording() {
  if (macro.recording) {
    return { ok: false, reason: 'already-recording' };
  }

  macro.recording = true;
  macro.events = [];
  macro.startedAtMs = performance.now();
  logEvent('info', 'Macro recording started');
  return { ok: true };
}

function stopMacroRecording() {
  if (!macro.recording) {
    return { ok: false, reason: 'not-recording', events: [] };
  }

  macro.recording = false;
  logEvent('info', `Macro recording stopped, events: ${macro.events.length}`);
  return { ok: true, events: [...macro.events] };
}

function clearMacroPlaybackTimers() {
  for (const timerId of macro.playbackTimers) {
    window.clearTimeout(timerId);
  }

  macro.playbackTimers = [];
  macro.playing = false;
}

function playbackMacro(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { ok: false, reason: 'empty-macro' };
  }

  clearMacroPlaybackTimers();
  macro.playing = true;

  events.forEach((event) => {
    const timerId = window.setTimeout(() => {
      if (event.type === 'click') {
        performClick(event.x, event.y, event.button || 'left', event.clickType || 'single');
      }

      if (event.type === 'key' && event.code) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          code: event.code,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          cancelable: true,
          code: event.code,
        }));
      }
    }, event.whenMs);

    macro.playbackTimers.push(timerId);
  });

  const maxTime = events.reduce((max, event) => Math.max(max, event.whenMs), 0);
  const finishTimer = window.setTimeout(() => {
    macro.playing = false;
    macro.playbackTimers = [];
    logEvent('info', 'Macro playback finished');
  }, maxTime + 20);

  macro.playbackTimers.push(finishTimer);
  logEvent('info', `Macro playback started, events: ${events.length}`);
  return { ok: true };
}

function mapStopReason(reason) {
  const map = {
    manual: 'Manual stop',
    'max-clicks': 'Click limit reached',
    'max-duration': 'Time limit reached',
    'window-blur': 'Window/tab changed',
    'url-changed': 'URL changed',
    'selector-found': 'Stop selector found',
    'selector-invalid': 'Stop selector invalid',
    'color-match': 'Color condition matched',
    'safety-area': 'Click left safe area',
  };

  return map[reason] || reason;
}

function getStatus() {
  return {
    state: engine.state,
    running: engine.state === 'running',
    paused: engine.state === 'paused',
    scheduled: engine.state === 'scheduled',
    profile: activeProfile,
    profileName: activeProfile.name,
    clickCount: engine.clickCount,
    avgCps: getCurrentCps(),
    runningMs: getRunningMs(),
    stopReason: mapStopReason(engine.stopReason),
    logs: logs.slice(-50),
    lifetimeStats,
    macro: {
      recording: macro.recording,
      playing: macro.playing,
      eventsCount: activeProfile.macroEvents.length,
    },
  };
}

function mergeSettingsIntoActiveProfile(settingsPatch = {}) {
  const nextProfile = normalizeProfile({
    ...activeProfile,
    ...settingsPatch,
  });

  activeProfile = nextProfile;
  config = {
    ...config,
    profiles: config.profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile)),
  };

  renderOverlay();
}

document.addEventListener(
  'mousemove',
  (event) => {
    mousePos = {
      x: event.clientX,
      y: event.clientY,
    };
  },
  { passive: true },
);

document.addEventListener(
  'click',
  (event) => {
    if (!macro.recording || !event.isTrusted) {
      return;
    }

    macro.events.push({
      type: 'click',
      whenMs: Math.round(performance.now() - macro.startedAtMs),
      x: event.clientX,
      y: event.clientY,
      button: event.button === 1 ? 'middle' : event.button === 2 ? 'right' : 'left',
      clickType: event.detail >= 2 ? 'double' : 'single',
    });
  },
  true,
);

document.addEventListener(
  'keydown',
  (event) => {
    if (!event.isTrusted) {
      return;
    }

    if (macro.recording && !event.repeat) {
      macro.events.push({
        type: 'key',
        whenMs: Math.round(performance.now() - macro.startedAtMs),
        code: event.code,
      });
    }

    if (event.repeat || isEditableElement(event.target)) {
      return;
    }

    if (event.code === 'Escape') {
      stopEngine('manual');
      return;
    }

    if (event.code === activeProfile.startHotkey) {
      startEngineWithSchedule();
      return;
    }

    if (event.code === activeProfile.pauseHotkey) {
      if (engine.state === 'running') {
        setPaused(true);
      } else if (engine.state === 'paused') {
        setPaused(false);
      }
      return;
    }

    if (event.code === activeProfile.stopHotkey) {
      stopEngine('manual');
    }
  },
  true,
);

document.addEventListener('visibilitychange', () => {
  if (activeProfile.stopOnWindowBlur && document.visibilityState === 'hidden' && engine.state !== 'stopped') {
    stopEngine('window-blur');
  }
});

window.addEventListener('blur', () => {
  if (activeProfile.stopOnWindowBlur && engine.state !== 'stopped') {
    stopEngine('window-blur');
  }
});

chrome.storage.sync.get({ autoclickerConfig: null }, (stored) => {
  if (stored.autoclickerConfig) {
    applyConfig(stored.autoclickerConfig);
    return;
  }

  chrome.storage.sync.get(DEFAULT_PROFILE, (legacySettings) => {
    applyConfig({
      version: 2,
      activeProfileId: 'default',
      profiles: [
        {
          ...DEFAULT_PROFILE,
          ...legacySettings,
          id: 'default',
          name: 'Default',
        },
      ],
    });
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  if (changes.autoclickerConfig) {
    applyConfig(changes.autoclickerConfig.newValue);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request?.config) {
    applyConfig(request.config);
  }

  if (request?.settings) {
    mergeSettingsIntoActiveProfile(request.settings);
  }

  if (request?.action === 'start') {
    sendResponse(startEngineWithSchedule());
    return;
  }

  if (request?.action === 'pause') {
    setPaused(true);
    sendResponse({ ok: true, state: engine.state });
    return;
  }

  if (request?.action === 'resume') {
    setPaused(false);
    sendResponse({ ok: true, state: engine.state });
    return;
  }

  if (request?.action === 'togglePause') {
    if (engine.state === 'paused') {
      setPaused(false);
    } else if (engine.state === 'running') {
      setPaused(true);
    }

    sendResponse({ ok: true, state: engine.state });
    return;
  }

  if (request?.action === 'stop') {
    stopEngine('manual');
    sendResponse({ ok: true, state: engine.state });
    return;
  }

  if (request?.action === 'updateSettings') {
    if (request.config) {
      applyConfig(request.config);
    } else {
      mergeSettingsIntoActiveProfile(request.settings || {});
    }

    sendResponse({ ok: true });
    return;
  }

  if (request?.action === 'selfTest') {
    sendResponse(runSelfTest());
    return;
  }

  if (request?.action === 'macroStartRecord') {
    sendResponse(startMacroRecording());
    return;
  }

  if (request?.action === 'macroStopRecord') {
    sendResponse(stopMacroRecording());
    return;
  }

  if (request?.action === 'macroPlay') {
    const events = Array.isArray(request.events) ? request.events : activeProfile.macroEvents;
    sendResponse(playbackMacro(events));
    return;
  }

  if (request?.action === 'macroStop') {
    clearMacroPlaybackTimers();
    sendResponse({ ok: true });
    return;
  }

  if (request?.action === 'getStatus') {
    sendResponse(getStatus());
  }
});

startOverlayTicker();
loadLifetimeStats();
renderOverlay();
