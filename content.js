const shared = globalThis.AutoClickerShared;
const {
  DEFAULT_PROFILE,
  normalizeProfile,
  normalizeConfig,
  normalizePoint,
  normalizeMacroEvent,
  getActiveProfile,
  mapStopReason,
} = shared;

const LIFETIME_STATS_KEY = 'autoclickerLifetimeStats';
const MAX_LOGS = 250;

const runtime = {
  config: normalizeConfig(null),
  activeProfile: normalizeProfile(DEFAULT_PROFILE),
  mousePos: { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) },
  templateIndex: 0,
  boundUrlAtStart: '',
  logs: [],
  lifetimeStats: {
    totalClicks: 0,
    sessions: 0,
    totalRunMs: 0,
  },
};

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
  startedAtMs: 0,
  events: [],
  playbackTimers: [],
};

const overlay = createOverlay();

function logEvent(level, message) {
  runtime.logs.push({
    ts: new Date().toISOString(),
    level,
    message,
  });

  if (runtime.logs.length > MAX_LOGS) {
    runtime.logs = runtime.logs.slice(-MAX_LOGS);
  }
}

function applyConfig(nextConfig) {
  runtime.config = normalizeConfig(nextConfig);
  runtime.activeProfile = { ...getActiveProfile(runtime.config) };

  if (engine.state === 'stopped') {
    runtime.templateIndex = 0;
  }

  renderOverlay();
}

function updateActiveProfile(patch) {
  const next = normalizeProfile({
    ...runtime.activeProfile,
    ...patch,
  });

  runtime.activeProfile = next;
  runtime.config = {
    ...runtime.config,
    profiles: runtime.config.profiles.map((profile) => (profile.id === next.id ? next : profile)),
  };

  renderOverlay();
}

function getRunningMs() {
  if (engine.state === 'stopped' || !engine.startedAtMs) {
    return 0;
  }

  const now = Date.now();
  const pausedMs = engine.totalPausedMs + (engine.state === 'paused' ? now - engine.pauseStartedAtMs : 0);
  return Math.max(0, now - engine.startedAtMs - pausedMs);
}

function getCurrentCps() {
  const runMs = getRunningMs();
  return runMs > 0 ? engine.clickCount / (runMs / 1000) : 0;
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

function dispatchMouse(type, point, buttonIndex) {
  const target = document.elementFromPoint(point.x, point.y);
  if (!target) {
    return false;
  }

  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: point.x,
    clientY: point.y,
    button: buttonIndex,
    buttons: buttonToMask(buttonIndex),
  }));

  return true;
}

function performClick(point, button, clickType) {
  const buttonIndex = buttonToIndex(button);

  if (!dispatchMouse('mousedown', point, buttonIndex) || !dispatchMouse('mouseup', point, buttonIndex)) {
    return false;
  }

  if (buttonIndex === 2) {
    dispatchMouse('contextmenu', point, buttonIndex);
  } else {
    dispatchMouse('click', point, buttonIndex);
  }

  if (clickType === 'double' && button === 'left') {
    dispatchMouse('mousedown', point, 0);
    dispatchMouse('mouseup', point, 0);
    dispatchMouse('click', point, 0);
    dispatchMouse('dblclick', point, 0);
  }

  return true;
}

function nextClickPoint() {
  const profile = runtime.activeProfile;
  if (profile.useTemplate && profile.templatePoints.length > 0) {
    const point = profile.templatePoints[runtime.templateIndex % profile.templatePoints.length];
    runtime.templateIndex += 1;
    return point;
  }

  return { ...runtime.mousePos };
}

function pointInsideSafeArea(point) {
  const profile = runtime.activeProfile;
  if (!profile.safeAreaEnabled) {
    return true;
  }

  const area = profile.safeArea;
  if (area.width <= 0 || area.height <= 0) {
    return false;
  }

  return point.x >= area.x
    && point.y >= area.y
    && point.x <= area.x + area.width
    && point.y <= area.y + area.height;
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

function parseRgbColor(value) {
  const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
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
  const profile = runtime.activeProfile;

  if (profile.maxClicks > 0 && engine.clickCount >= profile.maxClicks) {
    return 'max-clicks';
  }

  if (profile.maxDurationSec > 0 && getRunningMs() >= profile.maxDurationSec * 1000) {
    return 'max-duration';
  }

  if (profile.stopOnWindowBlur && !document.hasFocus()) {
    return 'window-blur';
  }

  if (profile.bindToTabUrl && runtime.boundUrlAtStart && location.href !== runtime.boundUrlAtStart) {
    return 'url-changed';
  }

  if (profile.stopOnSelectorEnabled && profile.stopSelector) {
    try {
      if (document.querySelector(profile.stopSelector)) {
        return 'selector-found';
      }
    } catch {
      return 'selector-invalid';
    }
  }

  if (profile.stopOnColorEnabled) {
    const targetColor = hexToRgb(profile.stopColorHex);
    const point = profile.stopColorPoint;
    const element = document.elementFromPoint(point.x, point.y);

    if (targetColor && element) {
      const current = parseRgbColor(window.getComputedStyle(element).backgroundColor);
      if (current && colorDistance(current, targetColor) <= profile.stopColorTolerance) {
        return 'color-match';
      }
    }
  }

  return null;
}

function clickDelayMs() {
  const profile = runtime.activeProfile;
  const base = Math.max(10, Math.round(1000 / profile.cps));
  const spread = base * (profile.jitter / 100);
  return Math.max(10, Math.round(base + ((Math.random() * 2 - 1) * spread)));
}

function clearTimers() {
  if (engine.clickTimeoutId) {
    window.clearTimeout(engine.clickTimeoutId);
    engine.clickTimeoutId = null;
  }

  if (engine.schedulerTimeoutId) {
    window.clearTimeout(engine.schedulerTimeoutId);
    engine.schedulerTimeoutId = null;
  }
}

function saveLifetimeStats() {
  const runMs = getRunningMs();
  if (runMs <= 0 && engine.clickCount <= 0) {
    return;
  }

  runtime.lifetimeStats.totalClicks += engine.clickCount;
  runtime.lifetimeStats.sessions += 1;
  runtime.lifetimeStats.totalRunMs += runMs;
  chrome.storage.local.set({ [LIFETIME_STATS_KEY]: runtime.lifetimeStats });
}

function stopEngine(reason = 'manual') {
  clearTimers();

  if (engine.state !== 'stopped') {
    saveLifetimeStats();
  }

  engine.state = 'stopped';
  engine.startedAtMs = 0;
  engine.pauseStartedAtMs = 0;
  engine.totalPausedMs = 0;
  engine.stopReason = reason;
  runtime.templateIndex = 0;

  logEvent('info', `Stopped: ${reason}`);
  renderOverlay();
}

function scheduleTick() {
  if (engine.state !== 'running') {
    return;
  }

  engine.clickTimeoutId = window.setTimeout(clickTick, clickDelayMs());
}

function setPaused(paused) {
  if (paused && engine.state === 'running') {
    if (engine.clickTimeoutId) {
      window.clearTimeout(engine.clickTimeoutId);
      engine.clickTimeoutId = null;
    }

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
    renderOverlay();
    scheduleTick();
  }
}

function clickTick() {
  if (engine.state !== 'running') {
    return;
  }

  const reasonBefore = checkStopConditions();
  if (reasonBefore) {
    stopEngine(reasonBefore);
    return;
  }

  const point = nextClickPoint();
  if (!pointInsideSafeArea(point)) {
    stopEngine('safety-area');
    return;
  }

  if (performClick(point, runtime.activeProfile.mouseButton, runtime.activeProfile.clickType)) {
    engine.clickCount += 1;
  }

  const reasonAfter = checkStopConditions();
  if (reasonAfter) {
    stopEngine(reasonAfter);
    return;
  }

  renderOverlay();
  scheduleTick();
}

function runSelfTest() {
  const profile = runtime.activeProfile;
  const errors = [];
  const warnings = [];

  if (!Number.isFinite(runtime.mousePos.x) || !Number.isFinite(runtime.mousePos.y)) {
    errors.push('mouse-position-unavailable');
  }

  if (profile.safeAreaEnabled && (profile.safeArea.width <= 0 || profile.safeArea.height <= 0)) {
    errors.push('invalid-safe-area');
  }

  if (profile.useTemplate && profile.templatePoints.length === 0) {
    errors.push('template-enabled-without-points');
  }

  if (profile.bindToTabUrl && !location.href) {
    errors.push('url-unavailable');
  }

  if (!document.hasFocus()) {
    warnings.push('tab-not-focused');
  }

  if (profile.stopOnSelectorEnabled && profile.stopSelector) {
    try {
      document.querySelector(profile.stopSelector);
    } catch {
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

function startMainLoop() {
  engine.state = 'running';
  engine.startedAtMs = Date.now();
  engine.clickCount = 0;
  engine.totalPausedMs = 0;
  engine.pauseStartedAtMs = 0;
  runtime.boundUrlAtStart = location.href;

  logEvent('info', `Started profile: ${runtime.activeProfile.name}`);
  renderOverlay();
  scheduleTick();
}

function startEngine() {
  if (engine.state === 'running' || engine.state === 'paused') {
    return { ok: true, scheduled: false, reason: 'already-running' };
  }

  const selfTest = runSelfTest();
  if (!selfTest.ok) {
    logEvent('error', `Self-test failed: ${selfTest.errors.join(', ')}`);
    return { ok: false, selfTest };
  }

  clearTimers();

  const profile = runtime.activeProfile;
  if (profile.scheduleMode === 'delay' && profile.scheduleDelaySec > 0) {
    engine.state = 'scheduled';
    const delayMs = Math.round(profile.scheduleDelaySec * 1000);
    engine.schedulerTimeoutId = window.setTimeout(() => {
      engine.schedulerTimeoutId = null;
      startMainLoop();
    }, delayMs);

    logEvent('info', `Scheduled start in ${profile.scheduleDelaySec}s`);
    renderOverlay();
    return { ok: true, scheduled: true, delayMs };
  }

  if (profile.scheduleMode === 'at' && profile.scheduleAtISO) {
    const startAtMs = Date.parse(profile.scheduleAtISO);
    if (Number.isFinite(startAtMs) && startAtMs > Date.now()) {
      engine.state = 'scheduled';
      const delayMs = startAtMs - Date.now();
      engine.schedulerTimeoutId = window.setTimeout(() => {
        engine.schedulerTimeoutId = null;
        startMainLoop();
      }, delayMs);

      logEvent('info', `Scheduled start at ${profile.scheduleAtISO}`);
      renderOverlay();
      return { ok: true, scheduled: true, delayMs };
    }
  }

  startMainLoop();
  return { ok: true, scheduled: false };
}

function createOverlay() {
  const node = document.createElement('div');
  node.id = '__autoclicker_overlay';
  node.style.position = 'fixed';
  node.style.right = '12px';
  node.style.bottom = '12px';
  node.style.zIndex = '2147483647';
  node.style.background = 'rgba(16, 24, 40, 0.85)';
  node.style.color = '#f8fafc';
  node.style.padding = '8px 10px';
  node.style.borderRadius = '8px';
  node.style.fontFamily = 'Consolas, monospace';
  node.style.fontSize = '12px';
  node.style.lineHeight = '1.4';
  node.style.pointerEvents = 'none';
  node.style.whiteSpace = 'pre';
  node.style.maxWidth = '360px';
  node.style.display = 'none';
  document.documentElement.appendChild(node);
  return node;
}

function renderOverlay() {
  if (!overlay) {
    return;
  }

  overlay.style.display = runtime.activeProfile.overlayEnabled ? 'block' : 'none';
  if (overlay.style.display === 'none') {
    return;
  }

  overlay.textContent = [
    `AutoClicker: ${engine.state.toUpperCase()}`,
    `Profile: ${runtime.activeProfile.name}`,
    `Clicks: ${engine.clickCount}`,
    `Avg CPS: ${getCurrentCps().toFixed(2)}`,
    `Timer: ${Math.floor(getRunningMs() / 1000)}s`,
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
  chrome.storage.local.get({ [LIFETIME_STATS_KEY]: runtime.lifetimeStats }, (stored) => {
    runtime.lifetimeStats = {
      ...runtime.lifetimeStats,
      ...(stored[LIFETIME_STATS_KEY] || {}),
    };
  });
}

function clearMacroPlaybackTimers() {
  for (const timerId of macro.playbackTimers) {
    window.clearTimeout(timerId);
  }

  macro.playbackTimers = [];
  macro.playing = false;
}

function startMacroRecording() {
  if (macro.recording) {
    return { ok: false, reason: 'already-recording' };
  }

  macro.recording = true;
  macro.startedAtMs = performance.now();
  macro.events = [];
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

function playMacro(events) {
  const normalizedEvents = Array.isArray(events)
    ? events.map(normalizeMacroEvent).filter(Boolean)
    : [];

  if (normalizedEvents.length === 0) {
    return { ok: false, reason: 'empty-macro' };
  }

  clearMacroPlaybackTimers();
  macro.playing = true;

  for (const event of normalizedEvents) {
    const timerId = window.setTimeout(() => {
      if (event.type === 'click') {
        performClick({ x: event.x, y: event.y }, event.button, event.clickType);
        return;
      }

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
    }, event.whenMs);

    macro.playbackTimers.push(timerId);
  }

  const maxTimeMs = normalizedEvents.reduce((max, event) => Math.max(max, event.whenMs), 0);
  const finishTimer = window.setTimeout(() => {
    macro.playing = false;
    macro.playbackTimers = [];
    logEvent('info', 'Macro playback finished');
  }, maxTimeMs + 20);

  macro.playbackTimers.push(finishTimer);
  logEvent('info', `Macro playback started, events: ${normalizedEvents.length}`);
  return { ok: true };
}

function statusPayload() {
  return {
    state: engine.state,
    running: engine.state === 'running',
    paused: engine.state === 'paused',
    scheduled: engine.state === 'scheduled',
    profile: runtime.activeProfile,
    profileName: runtime.activeProfile.name,
    clickCount: engine.clickCount,
    avgCps: getCurrentCps(),
    runningMs: getRunningMs(),
    stopReason: mapStopReason(engine.stopReason),
    logs: runtime.logs.slice(-50),
    lifetimeStats: runtime.lifetimeStats,
    macro: {
      recording: macro.recording,
      playing: macro.playing,
      eventsCount: runtime.activeProfile.macroEvents.length,
    },
  };
}

function isEditable(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

function onMouseMove(event) {
  runtime.mousePos = { x: event.clientX, y: event.clientY };
}

function onClickCapture(event) {
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
}

function onKeyDown(event) {
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

  if (event.repeat || isEditable(event.target)) {
    return;
  }

  if (event.code === 'Escape') {
    stopEngine('manual');
    return;
  }

  if (event.code === runtime.activeProfile.startHotkey) {
    startEngine();
    return;
  }

  if (event.code === runtime.activeProfile.pauseHotkey) {
    if (engine.state === 'running') {
      setPaused(true);
    } else if (engine.state === 'paused') {
      setPaused(false);
    }
    return;
  }

  if (event.code === runtime.activeProfile.stopHotkey) {
    stopEngine('manual');
  }
}

function handleMessage(request, sender, sendResponse) {
  if (request?.config) {
    applyConfig(request.config);
  }

  if (request?.settings) {
    updateActiveProfile(request.settings);
  }

  if (request?.action === 'start') {
    sendResponse(startEngine());
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
    const events = Array.isArray(request.events) ? request.events : runtime.activeProfile.macroEvents;
    sendResponse(playMacro(events));
    return;
  }

  if (request?.action === 'macroStop') {
    clearMacroPlaybackTimers();
    sendResponse({ ok: true });
    return;
  }

  if (request?.action === 'getStatus') {
    sendResponse(statusPayload());
  }
}

function loadConfigFromStorage() {
  chrome.storage.sync.get({ autoclickerConfig: null }, (stored) => {
    if (stored.autoclickerConfig) {
      applyConfig(stored.autoclickerConfig);
      return;
    }

    chrome.storage.sync.get(DEFAULT_PROFILE, (legacy) => {
      applyConfig({
        version: 2,
        activeProfileId: 'default',
        profiles: [{ ...DEFAULT_PROFILE, ...legacy, id: 'default', name: 'Default' }],
      });
    });
  });
}

function attachListeners() {
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('keydown', onKeyDown, true);

  document.addEventListener('visibilitychange', () => {
    if (runtime.activeProfile.stopOnWindowBlur && document.visibilityState === 'hidden' && engine.state !== 'stopped') {
      stopEngine('window-blur');
    }
  });

  window.addEventListener('blur', () => {
    if (runtime.activeProfile.stopOnWindowBlur && engine.state !== 'stopped') {
      stopEngine('window-blur');
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.autoclickerConfig) {
      applyConfig(changes.autoclickerConfig.newValue);
    }
  });

  chrome.runtime.onMessage.addListener(handleMessage);
}

loadConfigFromStorage();
attachListeners();
loadLifetimeStats();
startOverlayTicker();
renderOverlay();
