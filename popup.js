const shared = globalThis.AutoClickerShared;
const {
  DEFAULT_PROFILE,
  normalizeProfile,
  normalizeConfig,
  getActiveProfile,
  formatHotkey,
  parseTemplatePoints,
  formatTemplatePoints,
  parseCliArgs,
} = shared;

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

const autoSaveInputs = [
  'profileName', 'cps', 'jitter', 'mouseButton', 'clickType', 'overlayEnabled',
  'maxClicks', 'maxDurationSec', 'scheduleMode', 'scheduleDelaySec', 'scheduleAtISO',
  'templatePoints', 'useTemplate', 'bindToTabUrl', 'safeAreaEnabled', 'stopOnWindowBlur',
  'safeX', 'safeY', 'safeW', 'safeH', 'stopOnColorEnabled', 'stopOnSelectorEnabled',
  'stopColorHex', 'stopColorTolerance', 'stopColorX', 'stopColorY', 'stopSelector',
];

let config = normalizeConfig(null);
let autoSaveTimer = null;

function setStatus(kind, text) {
  el.status.className = `status ${kind}`;
  el.status.textContent = text;
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
      callback(response, chrome.runtime.lastError || null);
    });
  });
}

function persistConfig(onDone) {
  chrome.storage.sync.set({ autoclickerConfig: config }, () => {
    sendToActiveTab({ action: 'updateSettings', config }, () => onDone?.());
  });
}

function updateActiveProfile(mutator) {
  const current = getActiveProfile(config);
  const updated = normalizeProfile(mutator(current));
  config = {
    ...config,
    profiles: config.profiles.map((profile) => (profile.id === updated.id ? updated : profile)),
  };
}

function profileToUi(profile) {
  el.profileName.value = profile.name;
  el.cps.value = String(profile.cps);
  el.jitter.value = String(profile.jitter);
  el.mouseButton.value = profile.mouseButton;
  el.clickType.value = profile.clickType;
  el.startHotkey.dataset.code = profile.startHotkey;
  el.startHotkey.value = formatHotkey(profile.startHotkey);
  el.pauseHotkey.dataset.code = profile.pauseHotkey;
  el.pauseHotkey.value = formatHotkey(profile.pauseHotkey);
  el.stopHotkey.dataset.code = profile.stopHotkey;
  el.stopHotkey.value = formatHotkey(profile.stopHotkey);
  el.overlayEnabled.checked = Boolean(profile.overlayEnabled);
  el.maxClicks.value = String(profile.maxClicks);
  el.maxDurationSec.value = String(profile.maxDurationSec);
  el.scheduleMode.value = profile.scheduleMode;
  el.scheduleDelaySec.value = String(profile.scheduleDelaySec);
  el.scheduleAtISO.value = profile.scheduleAtISO ? profile.scheduleAtISO.slice(0, 16) : '';
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

function uiToProfile(profile) {
  return normalizeProfile({
    ...profile,
    name: el.profileName.value,
    cps: el.cps.value,
    jitter: el.jitter.value,
    mouseButton: el.mouseButton.value,
    clickType: el.clickType.value,
    startHotkey: el.startHotkey.dataset.code,
    pauseHotkey: el.pauseHotkey.dataset.code,
    stopHotkey: el.stopHotkey.dataset.code,
    overlayEnabled: el.overlayEnabled.checked,
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

function renderProfileSelect() {
  const activeId = config.activeProfileId;
  el.profileSelect.innerHTML = '';

  for (const profile of config.profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    el.profileSelect.appendChild(option);
  }

  el.profileSelect.value = activeId;
}

function renderConfig() {
  renderProfileSelect();
  profileToUi(getActiveProfile(config));
}

function refreshStatus() {
  sendToActiveTab({ action: 'getStatus' }, (response, error) => {
    if (error || !response) {
      setStatus('error', 'NO ACCESS');
      return;
    }

    setStatus(response.state || 'stopped', String(response.state || 'stopped').toUpperCase());

    const clickCount = response.clickCount || 0;
    const avgCps = Number(response.avgCps || 0).toFixed(2);
    const runningSec = Math.floor((response.runningMs || 0) / 1000);
    const sessions = response.lifetimeStats?.sessions || 0;
    const totalClicks = response.lifetimeStats?.totalClicks || 0;
    const macroEvents = response.macro?.eventsCount || 0;

    el.stats.textContent = `Session: ${clickCount} clicks, ${avgCps} CPS, ${runningSec}s | Lifetime: ${totalClicks} clicks, ${sessions} runs | Macro events: ${macroEvents}`;

    if (Array.isArray(response.logs)) {
      el.logView.textContent = response.logs
        .slice(-12)
        .map((entry) => `${entry.ts} [${entry.level}] ${entry.message}`)
        .join('\n');
    }
  });
}

function saveFromUiAndPersist(onDone) {
  updateActiveProfile((profile) => uiToProfile(profile));
  persistConfig(() => {
    refreshStatus();
    onDone?.();
  });
}

function scheduleAutoSave() {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = window.setTimeout(() => {
    saveFromUiAndPersist();
  }, 220);
}

function bindHotkeyCapture(input) {
  input.addEventListener('keydown', (event) => {
    event.preventDefault();
    if (event.code === 'Tab') {
      return;
    }

    input.dataset.code = event.code;
    input.value = formatHotkey(event.code);
    scheduleAutoSave();
  });
}

function createProfile() {
  const base = getActiveProfile(config);
  const profile = normalizeProfile({
    ...base,
    id: `profile-${Date.now()}`,
    name: `Profile ${config.profiles.length + 1}`,
  });

  config = {
    ...config,
    activeProfileId: profile.id,
    profiles: [...config.profiles, profile],
  };

  renderConfig();
  persistConfig(refreshStatus);
}

function deleteProfile() {
  if (config.profiles.length <= 1) {
    return;
  }

  const profiles = config.profiles.filter((profile) => profile.id !== config.activeProfileId);
  config = {
    ...config,
    activeProfileId: profiles[0].id,
    profiles,
  };

  renderConfig();
  persistConfig(refreshStatus);
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
      config = normalizeConfig(JSON.parse(String(reader.result || '{}')));
      renderConfig();
      persistConfig(refreshStatus);
      setStatus('stopped', 'IMPORTED');
    } catch {
      setStatus('error', 'BAD JSON');
    }
  };

  reader.readAsText(file);
}

function copyActiveProfileJson() {
  const text = JSON.stringify(getActiveProfile(config), null, 2);
  navigator.clipboard.writeText(text)
    .then(() => setStatus('stopped', 'COPIED'))
    .catch(() => setStatus('error', 'COPY FAIL'));
}

function runCli() {
  const patch = parseCliArgs(el.cliArgs.value.trim());
  updateActiveProfile((profile) => ({ ...profile, ...patch }));
  renderConfig();
  persistConfig(() => {
    sendToActiveTab({ action: 'start' }, () => refreshStatus());
  });
}

function attachEvents() {
  el.profileSelect.addEventListener('change', () => {
    config = { ...config, activeProfileId: el.profileSelect.value };
    renderConfig();
    persistConfig(refreshStatus);
  });

  el.addProfile.addEventListener('click', createProfile);
  el.deleteProfile.addEventListener('click', deleteProfile);

  for (const key of autoSaveInputs) {
    el[key].addEventListener('change', scheduleAutoSave);
    el[key].addEventListener('input', scheduleAutoSave);
  }

  bindHotkeyCapture(el.startHotkey);
  bindHotkeyCapture(el.pauseHotkey);
  bindHotkeyCapture(el.stopHotkey);

  el.save.addEventListener('click', () => saveFromUiAndPersist());
  el.start.addEventListener('click', () => {
    saveFromUiAndPersist(() => sendToActiveTab({ action: 'start' }, () => refreshStatus()));
  });
  el.pause.addEventListener('click', () => sendToActiveTab({ action: 'togglePause' }, () => refreshStatus()));
  el.stop.addEventListener('click', () => sendToActiveTab({ action: 'stop' }, () => refreshStatus()));

  el.selfTest.addEventListener('click', () => {
    sendToActiveTab({ action: 'selfTest' }, (response) => {
      if (!response) {
        setStatus('error', 'NO TEST');
        return;
      }

      setStatus(response.ok ? 'stopped' : 'error', response.ok ? 'SELF-TEST OK' : `SELF-TEST FAIL (${response.errors.join(',')})`);
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

      updateActiveProfile((profile) => ({ ...profile, macroEvents: response.events }));
      persistConfig(refreshStatus);
    });
  });

  el.playMacro.addEventListener('click', () => {
    sendToActiveTab({ action: 'macroPlay', events: getActiveProfile(config).macroEvents }, () => refreshStatus());
  });

  el.runCli.addEventListener('click', runCli);
  el.copyCli.addEventListener('click', copyActiveProfileJson);
  el.exportConfig.addEventListener('click', exportConfig);
  el.importConfig.addEventListener('change', () => {
    importConfig(el.importConfig.files?.[0]);
    el.importConfig.value = '';
  });

  window.addEventListener('focus', refreshStatus);
  window.setInterval(refreshStatus, 1500);
}

function loadConfig() {
  chrome.storage.sync.get({ autoclickerConfig: null }, (stored) => {
    if (stored.autoclickerConfig) {
      config = normalizeConfig(stored.autoclickerConfig);
      renderConfig();
      refreshStatus();
      return;
    }

    chrome.storage.sync.get(DEFAULT_PROFILE, (legacy) => {
      config = normalizeConfig({
        version: 2,
        activeProfileId: 'default',
        profiles: [{ ...DEFAULT_PROFILE, ...legacy, id: 'default', name: 'Default' }],
      });
      renderConfig();
      persistConfig(refreshStatus);
    });
  });
}

attachEvents();
loadConfig();
