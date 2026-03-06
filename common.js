(() => {
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
    overlayEnabled: false,
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

  function normalizeSafeArea(raw) {
    return {
      x: Math.round(toNumber(raw?.x, 0)),
      y: Math.round(toNumber(raw?.y, 0)),
      width: Math.max(0, Math.round(toNumber(raw?.width, 0))),
      height: Math.max(0, Math.round(toNumber(raw?.height, 0))),
    };
  }

  function normalizeMacroEvent(event) {
    const whenMs = toNumber(event?.whenMs, NaN);
    if (!Number.isFinite(whenMs) || whenMs < 0) {
      return null;
    }

    if (event?.type === 'key') {
      const code = typeof event.code === 'string' ? event.code : '';
      if (!code) {
        return null;
      }

      return {
        type: 'key',
        whenMs: Math.round(whenMs),
        code,
      };
    }

    return {
      type: 'click',
      whenMs: Math.round(whenMs),
      x: normalizePoint(event).x,
      y: normalizePoint(event).y,
      button: ['left', 'middle', 'right'].includes(event?.button) ? event.button : 'left',
      clickType: event?.clickType === 'double' ? 'double' : 'single',
    };
  }

  function normalizeProfile(raw = {}) {
    const profile = { ...DEFAULT_PROFILE, ...raw };

    return {
      ...profile,
      id: typeof profile.id === 'string' && profile.id ? profile.id : `profile-${Date.now()}`,
      name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Profile',
      cps: clamp(toNumber(profile.cps, DEFAULT_PROFILE.cps), 0.2, 100),
      jitter: clamp(Math.round(toNumber(profile.jitter, DEFAULT_PROFILE.jitter)), 0, 95),
      clickType: profile.clickType === 'double' ? 'double' : 'single',
      mouseButton: ['left', 'middle', 'right'].includes(profile.mouseButton) ? profile.mouseButton : 'left',
      startHotkey: typeof profile.startHotkey === 'string' && profile.startHotkey ? profile.startHotkey : DEFAULT_PROFILE.startHotkey,
      pauseHotkey: typeof profile.pauseHotkey === 'string' && profile.pauseHotkey ? profile.pauseHotkey : DEFAULT_PROFILE.pauseHotkey,
      stopHotkey: typeof profile.stopHotkey === 'string' && profile.stopHotkey ? profile.stopHotkey : DEFAULT_PROFILE.stopHotkey,
      maxClicks: Math.max(0, Math.round(toNumber(profile.maxClicks, 0))),
      maxDurationSec: Math.max(0, toNumber(profile.maxDurationSec, 0)),
      useTemplate: Boolean(profile.useTemplate),
      templatePoints: Array.isArray(profile.templatePoints) ? profile.templatePoints.map(normalizePoint) : [],
      stopOnColorEnabled: Boolean(profile.stopOnColorEnabled),
      stopColorHex: typeof profile.stopColorHex === 'string' && profile.stopColorHex ? profile.stopColorHex : DEFAULT_PROFILE.stopColorHex,
      stopColorTolerance: clamp(Math.round(toNumber(profile.stopColorTolerance, DEFAULT_PROFILE.stopColorTolerance)), 0, 255),
      stopColorPoint: normalizePoint(profile.stopColorPoint),
      stopOnSelectorEnabled: Boolean(profile.stopOnSelectorEnabled),
      stopSelector: typeof profile.stopSelector === 'string' ? profile.stopSelector.trim() : '',
      stopOnWindowBlur: profile.stopOnWindowBlur !== false,
      bindToTabUrl: profile.bindToTabUrl !== false,
      safeAreaEnabled: Boolean(profile.safeAreaEnabled),
      safeArea: normalizeSafeArea(profile.safeArea),
      overlayEnabled: typeof profile.overlayEnabled === 'boolean' ? profile.overlayEnabled : DEFAULT_PROFILE.overlayEnabled,
      scheduleMode: ['manual', 'delay', 'at'].includes(profile.scheduleMode) ? profile.scheduleMode : 'manual',
      scheduleDelaySec: Math.max(0, toNumber(profile.scheduleDelaySec, 0)),
      scheduleAtISO: typeof profile.scheduleAtISO === 'string' ? profile.scheduleAtISO : '',
      macroEvents: Array.isArray(profile.macroEvents)
        ? profile.macroEvents.map(normalizeMacroEvent).filter(Boolean)
        : [],
    };
  }

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        ...DEFAULT_CONFIG,
        profiles: [normalizeProfile(DEFAULT_PROFILE)],
      };
    }

    if (Array.isArray(raw.profiles) && raw.profiles.length > 0) {
      const profiles = raw.profiles.map(normalizeProfile);
      const activeProfileId = typeof raw.activeProfileId === 'string' && profiles.some((profile) => profile.id === raw.activeProfileId)
        ? raw.activeProfileId
        : profiles[0].id;

      return {
        version: 2,
        activeProfileId,
        profiles,
      };
    }

    const legacyProfile = normalizeProfile(raw);
    return {
      version: 2,
      activeProfileId: legacyProfile.id,
      profiles: [legacyProfile],
    };
  }

  function getActiveProfile(config) {
    if (!config || !Array.isArray(config.profiles) || config.profiles.length === 0) {
      return normalizeProfile(DEFAULT_PROFILE);
    }

    return config.profiles.find((profile) => profile.id === config.activeProfileId) || config.profiles[0];
  }

  function formatHotkey(code) {
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
    return String(text || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [xRaw = '0', yRaw = '0'] = line.split(',').map((value) => value.trim());
        return {
          x: Math.round(toNumber(xRaw, 0)),
          y: Math.round(toNumber(yRaw, 0)),
        };
      });
  }

  function formatTemplatePoints(points) {
    return (Array.isArray(points) ? points : []).map((point) => `${point.x},${point.y}`).join('\n');
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

  function parseCliArgs(text) {
    const tokens = String(text || '').match(/(?:[^\s\"]+|\"[^\"]*\")+/g) || [];
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
      }
    }

    return args;
  }

  globalThis.AutoClickerShared = {
    DEFAULT_PROFILE,
    DEFAULT_CONFIG,
    clamp,
    toNumber,
    normalizePoint,
    normalizeSafeArea,
    normalizeMacroEvent,
    normalizeProfile,
    normalizeConfig,
    getActiveProfile,
    formatHotkey,
    parseTemplatePoints,
    formatTemplatePoints,
    mapStopReason,
    parseCliArgs,
  };
})();
