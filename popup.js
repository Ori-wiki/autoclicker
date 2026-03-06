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

const el = {
  status: document.getElementById('status'),
  profileSelect: document.getElementById('profileSelect'),
  profileName: document.getElementById('profileName'),
  addProfile: document.getElementById('addProfile'),
  deleteProfile: document.getElementById('deleteProfile'),
  cps: document.getElementById('cps'),
  jitter: document.getElementById('jitter'),
  mouseButton: document.getElementById('mouseButton'),
  clickType: document.getElementById('clickType'),
  startHotkey: document.getElementById('startHotkey'),
  pauseHotkey: document.getElementById('pauseHotkey'),
  stopHotkey: document.getElementById('stopHotkey'),
  overlayEnabled: document.getElementById('overlayEnabled'),
  maxClicks: document.getElementById('maxClicks'),
  maxDurationSec: document.getElementById('maxDurationSec'),
  scheduleMode: document.getElementById('scheduleMode'),
  scheduleDelaySec: document.getElementById('scheduleDelaySec'),
  scheduleAtISO: document.getElementById('scheduleAtISO'),
  templatePoints: document.getElementById('templatePoints'),
  useTemplate: document.getElementById('useTemplate'),
  bindToTabUrl: document.getElementById('bindToTabUrl'),
  safeAreaEnabled: document.getElementById('safeAreaEnabled'),
  stopOnWindowBlur: document.getElementById('stopOnWindowBlur'),
  safeX: document.getElementById('safeX'),
  safeY: document.getElementById('safeY'),
  safeW: document.getElementById('safeW'),
  safeH: document.getElementById('safeH'),
  stopOnColorEnabled: document.getElementById('stopOnColorEnabled'),
  stopOnSelectorEnabled: document.getElementById('stopOnSelectorEnabled'),
  stopColorHex: document.getElementById('stopColorHex'),
  stopColorTolerance: document.getElementById('stopColorTolerance'),
  stopColorX: document.getElementById('stopColorX'),
  stopColorY: document.getElementById('stopColorY'),
  stopSelector: document.getElementById('stopSelector'),
  save: document.getElementById('save'),
  start: document.getElementById('start'),
  pause: document.getElementById('pause'),
  stop: document.getElementById('stop'),
  recordMacro: document.getElementById('recordMacro'),
  stopRecordMacro: document.getElementById('stopRecordMacro'),
  playMacro: document.getElementById('playMacro'),
  selfTest: document.getElementById('selfTest'),
  cliArgs: document.getElementById('cliArgs'),
  runCli: document.getElementById('runCli'),
  copyCli: document.getElementById('copyCli'),
  exportConfig: document.getElementById('exportConfig'),
  importConfig: document.getElementById('importConfig'),
  stats: document.getElementById('stats'),
  logView: document.getElementById('logView'),
};

let config = normalizeConfig(DEFAULT_CONFIG);
let autoSaveTimer = null;

function clamp(number, min, max) {
  return Math.min(max, Math.max(min, number));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePoint(raw) {
  return {
    x: Math.round(toNumber(raw?.x, 0)),
    y: Math.round(toNumber(raw?.y, 0)),
  };
}

function normalizeProfile(raw = {}) {
  const profile = {
    ...DEFAULT_PROFILE,
    ...raw,
  };

  return {
    ...profile,
    id: typeof profile.id === 'string' && profile.id ? profile.id : `profile-${Date.now()}`,
    name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Profile',
    cps: clamp(toNumber(profile.cps, 1), 0.2, 100),
    jitter: clamp(Math.round(toNumber(profile.jitter, 0)), 0, 95),
    clickType: profile.clickType === 'double' ? 'double' : 'single',
    mouseButton: ['left', 'middle', 'right'].includes(profile.mouseButton) ? profile.mouseButton : 'left',
    startHotkey: typeof profile.startHotkey === 'string' && profile.startHotkey ? profile.startHotkey : 'KeyQ',
    pauseHotkey: typeof profile.pauseHotkey === 'string' && profile.pauseHotkey ? profile.pauseHotkey : 'KeyE',
    stopHotkey: typeof profile.stopHotkey === 'string' && profile.stopHotkey ? profile.stopHotkey : 'KeyW',
    maxClicks: Math.max(0, Math.round(toNumber(profile.maxClicks, 0))),
    maxDurationSec: Math.max(0, toNumber(profile.maxDurationSec, 0)),
    useTemplate: Boolean(profile.useTemplate),
    templatePoints: Array.isArray(profile.templatePoints) ? profile.templatePoints.map(normalizePoint) : [],
    stopOnColorEnabled: Boolean(profile.stopOnColorEnabled),
    stopColorHex: typeof profile.stopColorHex === 'string' && profile.stopColorHex ? profile.stopColorHex : '#ff0000',
    stopColorTolerance: clamp(Math.round(toNumber(profile.stopColorTolerance, 12)), 0, 255),
    stopColorPoint: normalizePoint(profile.stopColorPoint),
    stopOnSelectorEnabled: Boolean(profile.stopOnSelectorEnabled),
    stopSelector: typeof profile.stopSelector === 'string' ? profile.stopSelector.trim() : '',
    stopOnWindowBlur: profile.stopOnWindowBlur !== false,
    bindToTabUrl: profile.bindToTabUrl !== false,
    safeAreaEnabled: Boolean(profile.safeAreaEnabled),
    safeArea: {
      x: Math.round(toNumber(profile.safeArea?.x, 0)),
      y: Math.round(toNumber(profile.safeArea?.y, 0)),
      width: Math.max(0, Math.round(toNumber(profile.safeArea?.width, 0))),
      height: Math.max(0, Math.round(toNumber(profile.safeArea?.height, 0))),
    },
    overlayEnabled: profile.overlayEnabled !== false,
    scheduleMode: ['manual', 'delay', 'at'].includes(profile.scheduleMode) ? profile.scheduleMode : 'manual',
    scheduleDelaySec: Math.max(0, toNumber(profile.scheduleDelaySec, 0)),
    scheduleAtISO: typeof profile.scheduleAtISO === 'string' ? profile.scheduleAtISO : '',
    macroEvents: Array.isArray(profile.macroEvents) ? profile.macroEvents : [],
  };
}

function normalizeConfig(raw) {
  const next = raw && typeof raw === 'object' ? raw : DEFAULT_CONFIG;
  const profiles = Array.isArray(next.profiles) && next.profiles.length > 0
    ? next.profiles.map(normalizeProfile)
    : [normalizeProfile(DEFAULT_PROFILE)];

  const activeProfileId = typeof next.activeProfileId === 'string' && profiles.some((p) => p.id === next.activeProfileId)
    ? next.activeProfileId
    : profiles[0].id;

  return {
    version: 2,
    activeProfileId,
    profiles,
  };
}

function getActiveProfile() {
  return config.profiles.find((profile) => profile.id === config.activeProfileId) || config.profiles[0];
}

function setStatus(kind, text) {
  el.status.className = `status ${kind}`;
  el.status.textContent = text;
}

function hotkeyLabel(code) {
  if (!code) {
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

function parseTemplatePoints(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((part) => part.trim());
      return {
        x: Math.round(toNumber(parts[0], 0)),
        y: Math.round(toNumber(parts[1], 0)),
      };
    });
}

function formatTemplatePoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join('\n');
}

function profileToUi(profile) {
  el.profileName.value = profile.name;
  el.cps.value = String(profile.cps);
  el.jitter.value = String(profile.jitter);
  el.mouseButton.value = profile.mouseButton;
  el.clickType.value = profile.clickType;
  el.startHotkey.dataset.code = profile.startHotkey;
  el.startHotkey.value = hotkeyLabel(profile.startHotkey);
  el.pauseHotkey.dataset.code = profile.pauseHotkey;
  el.pauseHotkey.value = hotkeyLabel(profile.pauseHotkey);
  el.stopHotkey.dataset.code = profile.stopHotkey;
  el.stopHotkey.value = hotkeyLabel(profile.stopHotkey);
  el.overlayEnabled.value = String(profile.overlayEnabled);
  el.maxClicks.value = String(profile.maxClicks);
  el.maxDurationSec.value = String(profile.maxDurationSec);
  el.scheduleMode.value = profile.scheduleMode;
  el.scheduleDelaySec.value = String(profile.scheduleDelaySec);

  if (profile.scheduleAtISO) {
    const parsed = new Date(profile.scheduleAtISO);
    if (!Number.isNaN(parsed.getTime())) {
      el.scheduleAtISO.value = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
    } else {
      el.scheduleAtISO.value = '';
    }
  } else {
    el.scheduleAtISO.value = '';
  }

  el.templatePoints.value = formatTemplatePoints(profile.templatePoints);
  el.useTemplate.checked = profile.useTemplate;
  el.bindToTabUrl.checked = profile.bindToTabUrl;
  el.safeAreaEnabled.checked = profile.safeAreaEnabled;
  el.stopOnWindowBlur.checked = profile.stopOnWindowBlur;
  el.safeX.value = String(profile.safeArea.x);
  el.safeY.value = String(profile.safeArea.y);
  el.safeW.value = String(profile.safeArea.width);
  el.safeH.value = String(profile.safeArea.height);
  el.stopOnColorEnabled.checked = profile.stopOnColorEnabled;
  el.stopOnSelectorEnabled.checked = profile.stopOnSelectorEnabled;
  el.stopColorHex.value = profile.stopColorHex;
  el.stopColorTolerance.value = String(profile.stopColorTolerance);
  el.stopColorX.value = String(profile.stopColorPoint.x);
  el.stopColorY.value = String(profile.stopColorPoint.y);
  el.stopSelector.value = profile.stopSelector;
}

function uiToProfile(oldProfile) {
  return normalizeProfile({
    ...oldProfile,
    name: el.profileName.value,
    cps: el.cps.value,
    jitter: el.jitter.value,
    mouseButton: el.mouseButton.value,
    clickType: el.clickType.value,
    startHotkey: el.startHotkey.dataset.code,
    pauseHotkey: el.pauseHotkey.dataset.code,
    stopHotkey: el.stopHotkey.dataset.code,
    overlayEnabled: el.overlayEnabled.value === 'true',
    maxClicks: el.maxClicks.value,
    maxDurationSec: el.maxDurationSec.value,
    scheduleMode: el.scheduleMode.value,
    scheduleDelaySec: el.scheduleDelaySec.value,
    scheduleAtISO: el.scheduleAtISO.value ? new Date(el.scheduleAtISO.value).toISOString() : '',
    templatePoints: parseTemplatePoints(el.templatePoints.value),
    useTemplate: el.useTemplate.checked,
    bindToTabUrl: el.bindToTabUrl.checked,
    safeAreaEnabled: el.safeAreaEnabled.checked,
    stopOnWindowBlur: el.stopOnWindowBlur.checked,
    safeArea: {
      x: el.safeX.value,
      y: el.safeY.value,
      width: el.safeW.value,
      height: el.safeH.value,
    },
    stopOnColorEnabled: el.stopOnColorEnabled.checked,
    stopOnSelectorEnabled: el.stopOnSelectorEnabled.checked,
    stopColorHex: el.stopColorHex.value,
    stopColorTolerance: el.stopColorTolerance.value,
    stopColorPoint: { x: el.stopColorX.value, y: el.stopColorY.value },
    stopSelector: el.stopSelector.value,
  });
}

function rerenderProfileSelect() {
  const current = config.activeProfileId;
  el.profileSelect.innerHTML = '';

  for (const profile of config.profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    el.profileSelect.appendChild(option);
  }

  el.profileSelect.value = current;
}

function withActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0] ? tabs[0] : null;
    if (!tab || typeof tab.id !== 'number') {
      setStatus('error', 'NO TAB');
      return;
    }

    callback(tab.id);
  });
}

function sendToActiveTab(message, callback) {
  withActiveTab((tabId) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      callback(response, error || null);
    });
  });
}

function saveConfig(callback) {
  chrome.storage.sync.set({ autoclickerConfig: config }, () => {
    sendToActiveTab({ action: 'updateSettings', config }, () => {
      callback?.();
    });
  });
}

function scheduleAutoSave() {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = window.setTimeout(() => {
    const active = getActiveProfile();
    const updated = uiToProfile(active);
    config.profiles = config.profiles.map((profile) => (profile.id === updated.id ? updated : profile));
    saveConfig(refreshStatus);
  }, 220);
}

function refreshUiFromConfig() {
  rerenderProfileSelect();
  profileToUi(getActiveProfile());
}

function refreshStatus() {
  sendToActiveTab({ action: 'getStatus' }, (response, error) => {
    if (error || !response) {
      setStatus('error', 'NO ACCESS');
      return;
    }

    const state = response.state || 'stopped';
    setStatus(state, state.toUpperCase());

    const clickCount = response.clickCount || 0;
    const avgCps = Number(response.avgCps || 0).toFixed(2);
    const runningSec = Math.floor((response.runningMs || 0) / 1000);
    const sessions = response.lifetimeStats?.sessions || 0;
    const totalClicks = response.lifetimeStats?.totalClicks || 0;

    el.stats.textContent = `Session: ${clickCount} clicks, ${avgCps} CPS, ${runningSec}s | Lifetime: ${totalClicks} clicks, ${sessions} runs | Macro events: ${response.macro?.eventsCount || 0}`;

    if (Array.isArray(response.logs)) {
      el.logView.textContent = response.logs
        .slice(-12)
        .map((entry) => `${entry.ts} [${entry.level}] ${entry.message}`)
        .join('\n');
    }
  });
}

function newProfile() {
  const id = `profile-${Date.now()}`;
  const base = getActiveProfile();
  const profile = normalizeProfile({
    ...base,
    id,
    name: `Profile ${config.profiles.length + 1}`,
  });

  config.profiles.push(profile);
  config.activeProfileId = id;
  refreshUiFromConfig();
  saveConfig(refreshStatus);
}

function deleteProfile() {
  if (config.profiles.length <= 1) {
    return;
  }

  config.profiles = config.profiles.filter((profile) => profile.id !== config.activeProfileId);
  config.activeProfileId = config.profiles[0].id;
  refreshUiFromConfig();
  saveConfig(refreshStatus);
}

function bindHotkeyInput(input) {
  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    if (event.code === 'Tab') {
      return;
    }

    input.dataset.code = event.code;
    input.value = hotkeyLabel(event.code);
    scheduleAutoSave();
  });
}

function parseCliArgs(text) {
  const tokens = text.match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || [];
  const args = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i].replace(/^\"|\"$/g, '');
    const next = (tokens[i + 1] || '').replace(/^\"|\"$/g, '');

    if (token === '--cps') {
      args.cps = Number(next);
      i += 1;
      continue;
    }

    if (token === '--jitter') {
      args.jitter = Number(next);
      i += 1;
      continue;
    }

    if (token === '--duration') {
      args.maxDurationSec = Number(next);
      i += 1;
      continue;
    }

    if (token === '--clicks') {
      args.maxClicks = Number(next);
      i += 1;
      continue;
    }

    if (token === '--left' || token === '--middle' || token === '--right') {
      args.mouseButton = token.replace('--', '');
      continue;
    }

    if (token === '--double') {
      args.clickType = 'double';
      continue;
    }

    if (token === '--single') {
      args.clickType = 'single';
      continue;
    }

    if (token === '--start-now') {
      args.scheduleMode = 'manual';
      continue;
    }

    if (token === '--delay') {
      args.scheduleMode = 'delay';
      args.scheduleDelaySec = Number(next);
      i += 1;
      continue;
    }
  }

  return args;
}

function exportConfig() {
  const payload = JSON.stringify(config, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `autoclicker-config-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importConfig(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || '{}'));
      config = normalizeConfig(parsed);
      refreshUiFromConfig();
      saveConfig(refreshStatus);
      setStatus('stopped', 'IMPORTED');
    } catch (error) {
      setStatus('error', 'BAD JSON');
    }
  };

  reader.readAsText(file);
}

function copyCurrentProfileJson() {
  const profile = getActiveProfile();
  const text = JSON.stringify(profile, null, 2);
  navigator.clipboard.writeText(text)
    .then(() => setStatus('stopped', 'COPIED'))
    .catch(() => setStatus('error', 'COPY FAIL'));
}

function runCliStart() {
  const patch = parseCliArgs(el.cliArgs.value.trim());
  const active = getActiveProfile();
  const updated = normalizeProfile({ ...active, ...patch });
  config.profiles = config.profiles.map((profile) => (profile.id === updated.id ? updated : profile));
  profileToUi(updated);

  saveConfig(() => {
    sendToActiveTab({ action: 'start' }, () => {
      refreshStatus();
    });
  });
}

function loadConfig() {
  chrome.storage.sync.get({ autoclickerConfig: null }, (stored) => {
    if (stored.autoclickerConfig) {
      config = normalizeConfig(stored.autoclickerConfig);
      refreshUiFromConfig();
      refreshStatus();
      return;
    }

    chrome.storage.sync.get(DEFAULT_PROFILE, (legacy) => {
      config = normalizeConfig({
        version: 2,
        activeProfileId: 'default',
        profiles: [{ ...DEFAULT_PROFILE, ...legacy, id: 'default', name: 'Default' }],
      });
      refreshUiFromConfig();
      saveConfig(refreshStatus);
    });
  });
}

el.profileSelect.addEventListener('change', () => {
  config.activeProfileId = el.profileSelect.value;
  refreshUiFromConfig();
  saveConfig(refreshStatus);
});

el.addProfile.addEventListener('click', newProfile);
el.deleteProfile.addEventListener('click', deleteProfile);

for (const input of [
  el.profileName,
  el.cps,
  el.jitter,
  el.mouseButton,
  el.clickType,
  el.overlayEnabled,
  el.maxClicks,
  el.maxDurationSec,
  el.scheduleMode,
  el.scheduleDelaySec,
  el.scheduleAtISO,
  el.templatePoints,
  el.useTemplate,
  el.bindToTabUrl,
  el.safeAreaEnabled,
  el.stopOnWindowBlur,
  el.safeX,
  el.safeY,
  el.safeW,
  el.safeH,
  el.stopOnColorEnabled,
  el.stopOnSelectorEnabled,
  el.stopColorHex,
  el.stopColorTolerance,
  el.stopColorX,
  el.stopColorY,
  el.stopSelector,
]) {
  input.addEventListener('change', scheduleAutoSave);
  input.addEventListener('input', scheduleAutoSave);
}

bindHotkeyInput(el.startHotkey);
bindHotkeyInput(el.pauseHotkey);
bindHotkeyInput(el.stopHotkey);

el.save.addEventListener('click', () => {
  const updated = uiToProfile(getActiveProfile());
  config.profiles = config.profiles.map((profile) => (profile.id === updated.id ? updated : profile));
  saveConfig(refreshStatus);
});

el.start.addEventListener('click', () => {
  const updated = uiToProfile(getActiveProfile());
  config.profiles = config.profiles.map((profile) => (profile.id === updated.id ? updated : profile));
  saveConfig(() => {
    sendToActiveTab({ action: 'start' }, () => refreshStatus());
  });
});

el.pause.addEventListener('click', () => {
  sendToActiveTab({ action: 'togglePause' }, () => refreshStatus());
});

el.stop.addEventListener('click', () => {
  sendToActiveTab({ action: 'stop' }, () => refreshStatus());
});

el.selfTest.addEventListener('click', () => {
  sendToActiveTab({ action: 'selfTest' }, (response) => {
    if (!response) {
      setStatus('error', 'NO TEST');
      return;
    }

    if (response.ok) {
      setStatus('stopped', 'SELF-TEST OK');
    } else {
      setStatus('error', `SELF-TEST FAIL (${response.errors.join(',')})`);
    }
  });
});

el.recordMacro.addEventListener('click', () => {
  sendToActiveTab({ action: 'macroStartRecord' }, (response) => {
    if (response?.ok) {
      setStatus('running', 'REC MACRO');
    }
  });
});

el.stopRecordMacro.addEventListener('click', () => {
  sendToActiveTab({ action: 'macroStopRecord' }, (response) => {
    if (!response?.ok || !Array.isArray(response.events)) {
      return;
    }

    const active = getActiveProfile();
    const updated = normalizeProfile({ ...active, macroEvents: response.events });
    config.profiles = config.profiles.map((profile) => (profile.id === updated.id ? updated : profile));
    saveConfig(refreshStatus);
  });
});

el.playMacro.addEventListener('click', () => {
  const active = getActiveProfile();
  sendToActiveTab({ action: 'macroPlay', events: active.macroEvents }, () => refreshStatus());
});

el.runCli.addEventListener('click', runCliStart);
el.copyCli.addEventListener('click', copyCurrentProfileJson);

el.exportConfig.addEventListener('click', exportConfig);
el.importConfig.addEventListener('change', () => {
  importConfig(el.importConfig.files?.[0]);
  el.importConfig.value = '';
});

window.addEventListener('focus', refreshStatus);
window.setInterval(refreshStatus, 1500);

loadConfig();
