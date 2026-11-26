const RUNTIME_CONFIG = globalThis.EchoRuntimeConfig || {
  version: "1.1.2",
  name: "Chronicle Expedition",
  saveSchema: 3,
  saveKey: "echo_string_save_v1.1",
  profileKey: "echo_string_profile_v1.1",
  themePreferenceKey: "echo_string_theme_preference_v1"
};
const PROGRESSION = globalThis.EchoProgression;
const PAGE_PARAMS = new URLSearchParams(window.location.search);
const REGRESSION_AUTORUNS = ["guided-regression", "low-regression", "suite-regression"];

if (!PROGRESSION) {
  throw new Error("EchoProgression core module failed to load.");
}

function isRegressionSession() {
  return window.__echoRuntimeIsTesting || document.body?.dataset?.domClickMode ||
    PAGE_PARAMS.has("regression") || REGRESSION_AUTORUNS.includes(PAGE_PARAMS.get("autorun"));
}

const TAGS = {
  "Semantic.Structure.Closed": { name: "封闭", slot: "Structure", color: "#B88CFF", extract: 4, inject: 2, compatible: ["Door", "Gate", "Mechanism", "Enemy", "Boss"] },
  "Semantic.Structure.Solid": { name: "坚固", slot: "Structure", color: "#9AA5B1", extract: 1, inject: 2, compatible: ["Door", "Stone", "Enemy", "Boss", "Mechanism", "Water"] },
  "Semantic.Structure.Fragile": { name: "脆弱", slot: "Structure", color: "#F2D36B", extract: 1, inject: 2, compatible: ["Door", "Stone", "Enemy", "Boss", "Mechanism", "Debris"] },
  "Semantic.Mass.Heavy": { name: "沉重", slot: "Mass", color: "#6B5B4A", extract: 1, inject: 2, compatible: ["Stone", "Enemy", "Boss", "Platform", "Mechanism", "Debris"] },
  "Semantic.Mass.Light": { name: "轻盈", slot: "Mass", color: "#9EE7FF", extract: 1, inject: 2, compatible: ["Stone", "Enemy", "Boss", "Platform", "Mechanism", "Debris"] },
  "Semantic.Temperature.Overheated": { name: "过热", slot: "Temperature", color: "#FF7043", extract: 1, inject: 3, compatible: ["Enemy", "Boss", "Water", "Ice", "Door", "Mechanism", "FireSource", "Stone"] },
  "Semantic.Temperature.Frozen": { name: "冻结", slot: "Temperature", color: "#72C9FF", extract: 1, inject: 3, compatible: ["Enemy", "Boss", "Water", "Mechanism", "Platform", "Door"] },
  "Semantic.Medium.Wet": { name: "潮湿", slot: "Medium", color: "#3FA7D6", extract: 1, inject: 2, compatible: ["Enemy", "Boss", "Stone", "Door", "Mechanism", "Water", "Debris"] },
  "Semantic.Field.Attract": { name: "吸引", slot: "Field", color: "#8A7CFF", extract: 1, inject: 3, compatible: ["FieldPillar", "Enemy", "Boss", "Mechanism", "Debris", "Stone"] },
  "Semantic.Field.Repel": { name: "排斥", slot: "Field", color: "#47D18C", extract: 1, inject: 3, compatible: ["FieldPillar", "Enemy", "Boss", "Mechanism", "Debris", "Stone"] }
};

const BOSS_COUNTERS = {
  3: {
    reaction: "Reaction.SteamBurst",
    tags: ["Semantic.Temperature.Overheated", "Semantic.Medium.Wet"],
    hint: "第一层护文响应过热与潮湿。"
  },
  2: {
    reaction: "Reaction.FractureWindow",
    tags: ["Semantic.Temperature.Frozen", "Semantic.Structure.Fragile"],
    hint: "第二层护文需要冻结后写入脆弱，再用重击扩开裂隙。"
  },
  1: {
    reaction: "Reaction.FieldPulse",
    tags: ["Semantic.Field.Attract", "Semantic.Field.Repel"],
    hint: "第三层护文需要让吸引和排斥在守卫身上相撞。"
  },
  0: {
    reaction: "",
    tags: ["Semantic.Structure.Fragile"],
    hint: "结构槽开放，写入脆弱后重击核心。"
  }
};

/* ==========================================================================
   Echo Audio Engine (Web Audio API Synthesizer)
   ========================================================================== */
class EchoAudioEngine {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.masterGain = null;
    this.sfxVolume = 0.7;
    this.bgmVolume = 0.5;
    this.initialized = false;
    this.isMuted = false;
    this.bgmTimeout = null;
  }

  init() {
    if (this.initialized) return;
    if (window.navigator?.webdriver || isRegressionSession()) {
      this.isMuted = true;
      this.initialized = true;
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.isMuted = true;
        this.initialized = true;
        return;
      }
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      this.initialized = true;
      this.startBgm();
    } catch (e) {
      this.isMuted = true;
      this.initialized = true;
      console.warn("Web Audio Context initialization failed:", e);
    }
  }

  setSfxVolume(vol) {
    this.sfxVolume = vol;
  }

  setBgmVolume(vol) {
    this.bgmVolume = vol;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(vol * 0.15, this.ctx.currentTime);
    }
  }

  playSfx(type) {
    if (!this.initialized || this.isMuted || !this.ctx) return;
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain);

      if (type === "scan") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.35);
        gain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === "extract") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(580, now + 0.22);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(this.sfxVolume * 0.3, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "inject") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.18);
        gain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);

        // Add mechanical click noise
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(150, now);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(this.sfxVolume * 0.15, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.1);
      } else if (type === "reaction") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.6);
        gain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(660, now);
        osc2.frequency.linearRampToValueAtTime(220, now + 0.45);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        gain2.gain.setValueAtTime(this.sfxVolume * 0.2, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc.start(now);
        osc.stop(now + 0.6);
        osc2.start(now);
        osc2.stop(now + 0.45);
      } else if (type === "strike") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.15);
        gain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(850, now);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        gain2.gain.setValueAtTime(this.sfxVolume * 0.08, now);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.start(now);
        osc.stop(now + 0.18);
        osc2.start(now);
        osc2.stop(now + 0.08);
      } else if (type === "parry") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.linearRampToValueAtTime(650, now + 0.25);
        gain.gain.setValueAtTime(this.sfxVolume * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === "error") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(120, now + 0.18);
        gain.gain.setValueAtTime(this.sfxVolume * 0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
      } else if (type === "success") {
        const sequence = [440, 554.37, 659.25, 880]; // A4 C#5 E5 A5
        sequence.forEach((freq, idx) => {
          const sOsc = this.ctx.createOscillator();
          const sGain = this.ctx.createGain();
          sOsc.type = "sine";
          sOsc.frequency.setValueAtTime(freq, now + idx * 0.08);
          sOsc.connect(sGain);
          sGain.connect(this.masterGain);
          sGain.gain.setValueAtTime(this.sfxVolume * 0.18, now + idx * 0.08);
          sGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
          sOsc.start(now + idx * 0.08);
          sOsc.stop(now + idx * 0.08 + 0.25);
        });
      } else if (type === "hover") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.025);
        gain.gain.setValueAtTime(this.sfxVolume * 0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        osc.start(now);
        osc.stop(now + 0.025);
      }
    } catch (e) {
      console.warn("SFX play failed:", e);
    }
  }

  startBgm() {
    if (!this.initialized || this.isMuted || !this.ctx) return;
    try {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.masterGain);
      this.bgmGain.gain.setValueAtTime(this.bgmVolume * 0.15, this.ctx.currentTime);

      const playPad = () => {
        if (!this.ctx || this.isMuted) return;
        try {
          const padNow = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const padGain = this.ctx.createGain();

          osc.type = "triangle";
          const chord = [73.42, 87.31, 110.00, 130.81]; // D2 F2 A2 C3 (Low Dm7)
          const baseFreq = chord[Math.floor(Math.random() * chord.length)];
          osc.frequency.setValueAtTime(baseFreq, padNow);
          osc.frequency.linearRampToValueAtTime(baseFreq * 1.008, padNow + 5.5);

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(200, padNow);
          filter.frequency.exponentialRampToValueAtTime(350, padNow + 2.5);
          filter.frequency.exponentialRampToValueAtTime(200, padNow + 5.5);

          padGain.gain.setValueAtTime(0, padNow);
          padGain.gain.linearRampToValueAtTime(0.5, padNow + 1.8);
          padGain.gain.linearRampToValueAtTime(0.5, padNow + 3.8);
          padGain.gain.linearRampToValueAtTime(0, padNow + 5.5);

          osc.connect(filter);
          filter.connect(padGain);
          padGain.connect(this.bgmGain);

          osc.start(padNow);
          osc.stop(padNow + 5.6);
        } catch (err) {}

        this.bgmTimeout = setTimeout(playPad, 5000);
      };

      playPad();
    } catch (e) {
      console.warn("BGM start failed:", e);
    }
  }

  stopBgm() {
    if (this.bgmTimeout) clearTimeout(this.bgmTimeout);
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch (e) {}
      this.bgmGain = null;
    }
  }
}

const audio = new EchoAudioEngine();

if (typeof window !== "undefined") {
  window.addEventListener("click", () => {
    audio.init();
  }, { once: true });
}

/* ==========================================================================
   Save & Load (LocalStorage)
   ========================================================================== */
let savedGameRaw = null;
let resumedGame = false;

function getGameStorage() {
  if (window.navigator?.webdriver || isRegressionSession()) return null;
  return window.localStorage;
}

function saveGameToLocal() {
  try {
    const storage = getGameStorage();
    if (!storage) return;
    if (storage.getItem(RUNTIME_CONFIG.saveKey) !== savedGameRaw) {
      state.storageConflict = true;
      return;
    }
    const raw = JSON.stringify({
      schema: RUNTIME_CONFIG.saveSchema,
      version: BUILD_LABEL,
      sessionId: state.sessionId,
      zone: state.zone,
      testMode: state.testMode,
      ink: state.ink,
      inventory: state.inventory,
      travelWord: state.travelWord,
      selectedInventoryIndex: state.selectedInventoryIndex,
      flags: state.flags,
      unlockedZones: state.unlockedZones,
      language: state.language,
      run: state.run,
      profile: state.profile,
      objects: Object.fromEntries(state.zones.map(({ id, objects }) => [id, objects])),
      elapsedSec: state.metrics.completedAt ?? elapsedSeconds(),
      metrics: state.metrics,
      mastery: state.mastery,
      checkpoints: state.checkpoints,
      undoStack: state.undoStack
    });
    storage.setItem(RUNTIME_CONFIG.saveKey, raw);
    savedGameRaw = raw;
    state.storageConflict = false;
    state.storageNotice = "";
  } catch (error) {
    state.storageNotice = "浏览器未能保存进度。此窗口仍可继续，本次改动可能丢失。";
    console.warn("LocalStorage save failed:", error);
  }
}

function restoreObjects(zoneConfig, savedObjects) {
  const byId = new Map((Array.isArray(savedObjects) ? savedObjects : [])
    .filter((object) => object && typeof object.id === "string")
    .map((object) => [object.id, object]));
  return zoneConfig.objects.map((template) => {
    const saved = byId.get(template.id);
    const obj = structuredClone(template);
    if (!saved) return obj;
    if (Array.isArray(saved.currentTags)) {
      obj.currentTags = [...new Set(saved.currentTags.filter((id) => Object.hasOwn(TAGS, id)))];
    }
    if (Number.isFinite(saved.hp) && obj.maxHp) obj.hp = Math.max(0, Math.min(obj.maxHp, saved.hp));
    if (obj.id === "warden" && Number.isInteger(saved.shieldLayers)) {
      obj.shieldLayers = Math.max(0, Math.min(template.shieldLayers, saved.shieldLayers));
      if (obj.shieldLayers === 0) obj.lockedSlots = [];
    }
    for (const key of ["scanned", "breach", "destroyed", "defeated", "fractureWindow", "fell"]) {
      if (typeof saved[key] === "boolean") obj[key] = saved[key];
    }
    closeInvalidFracture(obj);
    if (obj.type === "Enemy") {
      obj.combatBeat = saved.combatBeat === 1 ? 1 : 0;
      obj.combatOpening = obj.defeated ? "" : Object.hasOwn(ENEMY_OPENINGS, saved.combatOpening)
        ? saved.combatOpening : saved.parryPrimed === true ? "parry" : "";
      obj.breach = Boolean(obj.combatOpening);
    }
    if (saved.reactionHistory && typeof saved.reactionHistory === "object") obj.reactionHistory = saved.reactionHistory;
    return obj;
  });
}

function restoreInventory(inventory) {
  return Array.isArray(inventory) ? inventory.filter((id) => Object.hasOwn(TAGS, id)).slice(0, inventoryCapacity()) : [];
}

function restoreMetrics(saved, elapsedSec) {
  const metrics = createMetrics(state.testMode);
  for (const [key, value] of Object.entries(metrics)) {
    const incoming = saved?.[key];
    if (Array.isArray(value) && Array.isArray(incoming)) {
      metrics[key] = incoming.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    }
    else if (typeof value === "number" && Number.isFinite(incoming)) metrics[key] = Math.max(0, incoming);
    else if (value === null && Number.isFinite(incoming)) metrics[key] = Math.max(0, incoming);
    else if (value && typeof value === "object" && incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
      metrics[key] = { ...value, ...Object.fromEntries(Object.entries(incoming).filter(([, count]) => Number.isFinite(count) && count >= 0)) };
    }
  }
  metrics.startedAt = Date.now() - 1000 * (Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0);
  return metrics;
}

function restoreHistory(saved) {
  const readSnapshot = (snapshot) => {
    if (!Number.isInteger(snapshot?.zone)) return null;
    const config = ZONES[snapshot?.zone];
    if (!config || !Array.isArray(snapshot.objects) || !Number.isFinite(snapshot.ink)) return null;
    return {
      ...snapshot,
      label: typeof snapshot.label === "string" ? snapshot.label : config.id,
      ink: Math.max(0, Math.min(state.maxInk, snapshot.ink)),
      objects: restoreObjects(config, snapshot.objects),
      flags: snapshot.flags || {},
      inventory: restoreInventory(snapshot.inventory)
    };
  };
  state.undoStack = (Array.isArray(saved.undoStack) ? saved.undoStack : [])
    .map(readSnapshot).filter((item) => item?.zone === state.zone).slice(0, 3);
  state.checkpoints = {};
  for (const [index, config] of ZONES.entries()) {
    const checkpoint = readSnapshot(saved.checkpoints?.[config.id]);
    if (checkpoint?.zone === index) state.checkpoints[config.id] = checkpoint;
  }
}

function loadGameFromLocal() {
  try {
    const storage = getGameStorage();
    if (!storage) return;
    const legacyProfile = storage.getItem(RUNTIME_CONFIG.profileKey);
    if (legacyProfile) {
      try {
        state.profile = PROGRESSION.createProfile(JSON.parse(legacyProfile));
      } catch (error) {
        console.warn("Legacy profile load failed:", error);
      }
    }
    const preferredTheme = storage.getItem(THEME_PREFERENCE_KEY);
    savedGameRaw = storage.getItem(RUNTIME_CONFIG.saveKey);
    let saved = null;
    if (savedGameRaw) {
      try {
        saved = JSON.parse(savedGameRaw);
      } catch (error) {
        state.storageNotice = "这份存档无法读取。庭院从入口开始。";
        console.warn("Game save is invalid:", error);
      }
    }
    const savedTheme = preferredTheme ?? saved?.theme;
    if (savedTheme === "dark" || savedTheme === "light") state.theme = savedTheme;
    if (saved?.profile) state.profile = PROGRESSION.createProfile(saved.profile);
    if (!PAGE_PARAMS.has("lang") && Object.hasOwn(LANGUAGES, saved?.language)) state.language = saved.language;
    const savedMode = Object.hasOwn(TEST_MODES, saved?.testMode) ? saved.testMode : "guided";
    const requestedMode = PAGE_PARAMS.get("mode");
    const hasRequestedMode = Object.hasOwn(TEST_MODES, requestedMode);
    if (!hasRequestedMode) state.testMode = savedMode;
    const sameRunType = runType(state.testMode) === runType(savedMode);
    const canResume = sameRunType && Number.isInteger(saved?.zone) && saved.zone >= 0 && saved.zone < ZONES.length;
    state.run = PROGRESSION.createRun(state.profile, state.testMode, canResume ? saved.run : null);
    state.maxInk = PROGRESSION.maxInk(state.profile, state.run);
    state.ink = state.maxInk;
    if (!canResume) return;

    resumedGame = true;
    state.zone = saved.zone;
    const hasObjectState = saved.schema === RUNTIME_CONFIG.saveSchema && saved.objects;
    state.unlockedZones = ZONES
      .filter(({ id }, index) => index <= state.zone || (hasObjectState && Array.isArray(saved.unlockedZones) && saved.unlockedZones.includes(id)))
      .map(({ id }) => id);
    state.flags = { ...saved.flags };
    if (!hasObjectState) {
      // Older saves recorded resources and flags without the objects they came from.
      // Resume at a playable area entrance, keeping the long-term record.
      if (!isFinalZone()) {
        for (const flag of Object.keys(state.flags)) {
          if (zoneFlagBelongsToCurrentZone(flag)) delete state.flags[flag];
        }
        return;
      }
      state.metrics.completedAt = 0;
      return;
    }

    if (typeof saved.sessionId === "string" && /^DUANJU-[a-z0-9-]+$/i.test(saved.sessionId)) state.sessionId = saved.sessionId;
    state.zones = ZONES.map((config) => ({ ...config, objects: restoreObjects(config, saved.objects[config.id]) }));
    state.ink = Number.isFinite(saved.ink) ? Math.max(0, Math.min(state.maxInk, saved.ink)) : state.maxInk;
    state.inventory = restoreInventory(saved.inventory);
    const index = saved.selectedInventoryIndex;
    state.selectedInventoryIndex = Number.isInteger(index) && index >= 0 && index < state.inventory.length ? index : null;
    state.travelWord = hasInventory(saved.travelWord) ? saved.travelWord : "";
    state.metrics = restoreMetrics(saved.metrics, saved.elapsedSec);
    state.log = state.metrics.timeline.slice(0, 9);
    state.lastFeedback = state.metrics.feedbackEvents[0] || null;
    state.mastery = {
      earned: { ...saved.mastery?.earned },
      zoneMistakeBaseline: { ...state.mastery.zoneMistakeBaseline, ...saved.mastery?.zoneMistakeBaseline }
    };
    restoreHistory(saved);
  } catch (error) {
    state.storageNotice = "浏览器未能读取存档。本次进度可能无法保留。";
    console.warn("LocalStorage load failed:", error);
  } finally {
    applyTheme();
  }
}

function saveAndRender() {
  saveGameToLocal();
  render();
}

function applyTheme() {
  if (typeof document === "undefined") return;
  if (state.theme === "light") {
    document.body.classList.add("theme-light");
    if (el.themeToggleBtn) el.themeToggleBtn.textContent = "亮色";
  } else {
    document.body.classList.remove("theme-light");
    if (el.themeToggleBtn) el.themeToggleBtn.textContent = "暗色";
  }
}

function triggerScreenShake(intensity = 'medium') {
  if (window.navigator?.webdriver || isRegressionSession()) return;
  const target = document.querySelector(".app-shell") || document.body;
  if (!target) return;
  target.classList.remove("screen-shake-medium", "screen-shake-heavy");
  void target.offsetWidth; // force reflow
  target.classList.add(`screen-shake-${intensity}`);
  setTimeout(() => {
    target.classList.remove(`screen-shake-${intensity}`);
  }, 400);
}

/* ==========================================================================
   VFX & VFX Utilities (Floating Damage and Reaction Ripples)
   ========================================================================== */
function spawnFloatingDamage(amount, targetId, isCritical = false, isParry = false) {
  if (typeof document === "undefined") return;
  const container = document.getElementById("effectsContainer");
  if (!container) return;
  const elCard = document.querySelector(`[data-object-id="${targetId}"]`);
  if (!elCard) return;
  const rect = elCard.getBoundingClientRect();
  
  const dam = document.createElement("div");
  dam.className = `floating-damage${isCritical ? " critical" : ""}${isParry ? " parry-text" : ""}`;
  dam.style.left = `${rect.left + rect.width / 2 + (Math.random() * 40 - 20)}px`;
  dam.style.top = `${rect.top + rect.height / 2 - 20}px`;
  dam.textContent = amount;
  container.appendChild(dam);
  setTimeout(() => {
    dam.remove();
  }, 800);
}

function triggerVisualRipple(reactionId, targetId) {
  if (typeof document === "undefined") return;
  const container = document.getElementById("effectsContainer");
  if (!container) return;
  
  const elCard = document.querySelector(`[data-object-id="${targetId}"]`);
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (elCard) {
    const rect = elCard.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }

  const overlay = document.createElement("div");
  overlay.className = "reaction-ripple-overlay";
  
  const circle = document.createElement("div");
  let cls = "field";
  if (reactionId === "Reaction.SteamBurst") cls = "steam";
  else if (reactionId === "Reaction.FractureWindow") cls = "fracture";
  circle.className = `ripple-circle ${cls}`;
  circle.style.left = `${x}px`;
  circle.style.top = `${y}px`;
  circle.style.transform = "translate(-50%, -50%)";

  overlay.appendChild(circle);
  container.appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
  }, 1300);
}

const TEST_MODES = {
  guided: "引导",
  low: "探索",
  expedition: "远征",
  debug: "沙盒"
};

const BUILD_LABEL = RUNTIME_CONFIG.version;
const THEME_PREFERENCE_KEY = RUNTIME_CONFIG.themePreferenceKey;
const INSPECTOR_DRAWER_QUERY = "(max-width: 980px)";
const BUILD_NAME = RUNTIME_CONFIG.name;
const BUILD_ROLLOUT = [
  { version: "UX11", focus: "低引导自动回归" },
  { version: "UX12", focus: "卡点与软锁审计" },
  { version: "UX13", focus: "通关质量评分" },
  { version: "UX14", focus: "Boss反制路线账本" },
  { version: "UX15", focus: "检查点恢复" },
  { version: "UX16", focus: "回归套件入口" },
  { version: "UX17", focus: "报告结构增强" },
  { version: "UX18", focus: "完成面板复盘增强" },
  { version: "UX19", focus: "验证脚本加严" },
  { version: "UX20", focus: "生产文档收口" },
  { version: "UX21", focus: "真人试玩反馈硬化" },
  { version: "1.0.0", focus: "公开发布与圆润视觉系统" },
  { version: "1.1.0", focus: "远征压力、永久铭文与长期纪行" },
  { version: "1.1.1", focus: "游戏主界面重构与真实模式布局修复" },
  { version: "1.1.2", focus: "场景式关卡布局、跨区携词与战斗反馈" }
];

const TAG_CAUSES = {
  "Semantic.Structure.Closed": "封住通路或机关。",
  "Semantic.Structure.Solid": "让目标更难破坏，战斗中优先考虑剥离。",
  "Semantic.Structure.Fragile": "让结构更容易被重击破坏。",
  "Semantic.Mass.Heavy": "增加重量，可压机关但移动困难。",
  "Semantic.Mass.Light": "让石块易推，也让敌人容易被击离立足处。",
  "Semantic.Temperature.Overheated": "提供热源，可融冰并触发蒸汽。",
  "Semantic.Temperature.Frozen": "冻结目标，也能制造破裂窗口。",
  "Semantic.Medium.Wet": "自身不强，主要用于和过热组合。",
  "Semantic.Field.Attract": "把碎片或敌人拉向中心。",
  "Semantic.Field.Repel": "把碎片或敌人推离中心。"
};

const LOW_OBJECTIVES = {
  Z1: "打开被封住的庭院入口。",
  Z2: "让地面机关获得足够重量。",
  Z3: "清理断廊游兵，观察防御状态怎么影响伤害。",
  Z4: "解冻升降台，处理挡在通路上的缀刺兽。",
  Z5: "让碎片按正确方向移动，形成临时桥面。",
  Z6: "逐层拆开守卫护文，再处理裸露核心。",
  Z7: "沿书廊进入修正文库。"
};

const REACTION_DISCOVERIES = [
  { key: "SteamBurst", name: "蒸汽爆发", tags: BOSS_COUNTERS[3].tags, clue: "温度与介质会彼此放大。" },
  { key: "FractureWindow", name: "破裂窗口", tags: BOSS_COUNTERS[2].tags, clue: "低温会让脆弱结构进一步开裂。" },
  { key: "FieldPulse", name: "力场震荡", tags: BOSS_COUNTERS[1].tags, clue: "相反方向在同一目标上无法共存。" }
];

const ZONE_MASTERY = {
  Z1: { name: "一笔破门", detail: "不触发无效操作，完成第一次语义改写。" },
  Z2: { name: "质量回环", detail: "不触发无效操作，让同一石块先轻后重。" },
  Z3: { name: "借势穿廊", detail: "用弹反或击落解决游兵，不触发无效操作。" },
  Z4: { name: "雾中火花", detail: "发现蒸汽爆发，并完成温室目标。" },
  Z5: { name: "双路造桥", detail: "直接调度机关，或把相反力场写入碎片制造震荡。" },
  Z6: { name: "三重校对", detail: "用三种不同反应拆完全部护文。" },
  Z7: { name: "修正者", detail: "抵达文库并完成本轮复盘。" }
};

const LANGUAGES = {
  "zh-Hans": { label: "简", htmlLang: "zh-CN", title: "语弦生态：断句庭院" },
  "zh-Hant": { label: "繁", htmlLang: "zh-Hant", title: "語弦生態：斷句庭院" }
};

const TRADITIONAL_PHRASES = {
  "断句庭院": "斷句庭院",
  "语弦生态": "語弦生態",
  "创世纪": "創世紀",
  "原初作者": "原初作者",
  "携": "攜",
  "链接": "連結",
  "复制": "複製",
  "权限": "權限",
  "丢失": "遺失",
  "重词污染": "重詞污染",
  "语义冲突": "語義衝突",
  "异墨者": "異墨者",
  "原墨": "原墨",
  "词库": "詞庫",
  "区域": "區域",
  "用时": "用時",
  "共鸣": "共鳴",
  "地图": "地圖",
  "日志": "日誌",
  "配置": "設定",
  "引导": "引導",
  "探索": "探索",
  "沙盒": "沙盒",
  "扫描": "掃描",
  "剥离": "剝離",
  "注入": "注入",
  "重击": "重擊",
  "弹反": "彈反",
  "检查点": "檢查點",
  "当前": "當前",
  "目标": "目標",
  "词缀": "詞綴",
  "临时": "臨時",
  "清空": "清空",
  "流程": "流程",
  "重置": "重設",
  "机关": "機關",
  "推进": "推進",
  "反应": "反應",
  "质量": "品質",
  "误操作": "誤操作",
  "最长区": "最長區",
  "封文大门": "封文大門",
  "压机关庭": "壓機關庭",
  "断廊遭遇": "斷廊遭遇",
  "冻水温室": "凍水溫室",
  "碎桥力场": "碎橋力場",
  "残章中庭": "殘章中庭",
  "修正文库门槛": "修正文庫門檻",
  "裂纹": "裂紋",
  "轻盈": "輕盈",
  "过热": "過熱",
  "冻结": "凍結",
  "潮湿": "潮濕",
  "场景": "場景",
  "开放": "開放",
  "锁定": "鎖定",
  "进入": "進入",
  "已达成": "已達成",
  "进行中": "進行中",
  "还没有事件": "還沒有事件",
  "系统配置": "系統設定",
  "环境背景垫音": "環境背景墊音",
  "快速旅行": "快速旅行",
  "关卡直接跳转": "關卡直接跳轉",
  "建立同步链路": "建立同步鏈路",
  "世界由原初作者写就": "世界由原初作者寫就",
  "失去维护后分崩离析": "失去維護後分崩離析",
  "疯狂蚕食": "瘋狂蠶食",
  "物体": "物體",
  "底层语义": "底層語義",
  "完成原初修复考验": "完成原初修復考驗",
  "重塑万物法则": "重塑萬物法則"
};

const TRADITIONAL_CHARACTERS = {
  "语": "語", "义": "義", "词": "詞", "缀": "綴", "图": "圖", "谱": "譜", "区": "區", "时": "時",
  "过": "過", "冻": "凍", "湿": "濕", "轻": "輕", "场": "場", "桥": "橋", "残": "殘", "门": "門",
  "开": "開", "关": "關", "闭": "閉", "进": "進", "达": "達", "远": "遠", "锁": "鎖", "扫": "掃", "击": "擊",
  "弹": "彈", "离": "離", "显": "顯", "临": "臨", "库": "庫", "体": "體", "态": "態", "写": "寫",
  "这": "這", "个": "個", "为": "為", "与": "與", "并": "並", "将": "將", "让": "讓", "会": "會",
  "从": "從", "后": "後", "还": "還", "没": "沒", "经": "經", "对": "對", "应": "應", "动": "動",
  "机": "機", "压": "壓", "调": "調", "发": "發", "现": "現", "层": "層", "护": "護", "览": "覽",
  "选": "選", "择": "擇", "当": "當", "归": "歸", "档": "檔", "复": "復", "验": "驗", "测": "測",
  "数": "數", "据": "據", "设": "設", "声": "聲", "确": "確", "认": "認", "则": "則", "万": "萬",
  "维": "維", "护": "護", "丧": "喪", "断": "斷", "冲": "衝", "蚀": "蝕", "仅": "僅", "读": "讀",
  "码": "碼", "线": "線", "级": "級", "历": "歷", "览": "覽", "质": "質", "敌": "敵", "败": "敗",
  "长": "長", "总": "總", "结": "結", "历": "歷", "启": "啟", "间": "間", "转": "轉", "换": "換",
  "题": "題", "游": "遊", "戏": "戲", "状": "狀", "试": "試", "炼": "煉", "话": "話", "议": "議",
  "撤": "撤", "销": "銷", "轮": "輪", "误": "誤", "笔": "筆", "触": "觸", "无": "無", "构": "構",
  "强": "強", "组": "組", "载": "載", "欢": "歡", "来": "來", "寻": "尋", "变": "變", "观": "觀",
  "战": "戰", "斗": "鬥", "绽": "綻", "里": "裡", "证": "證", "环": "環", "见": "見", "标": "標",
  "补": "補", "报": "報", "告": "告", "择": "擇", "处": "處", "应": "應", "阶": "階", "续": "續",
  "释": "釋", "览": "覽", "这": "這", "备": "備", "须": "須", "难": "難", "够": "夠", "绳": "繩",
  "胜": "勝", "录": "錄", "坏": "壞", "规": "規", "简": "簡", "块": "塊", "练": "練", "获": "獲",
  "横": "橫", "势": "勢", "热": "熱", "侧": "側", "闪": "閃", "损": "損", "缝": "縫",
  "带": "帶", "护": "護", "余": "餘", "悬": "懸", "坠": "墜"
};

const traditionalPhrases = Object.entries(TRADITIONAL_PHRASES).sort((a, b) => b[0].length - a[0].length);
let renderedLanguage = "";
const i18nTextState = new WeakMap();
const i18nAttributeState = new WeakMap();

function toTraditional(source) {
  let output = source;
  traditionalPhrases.forEach(([from, to]) => {
      output = output.split(from).join(to);
    });
  output = [...output].map((character) => TRADITIONAL_CHARACTERS[character] || character).join("");
  return output;
}

function localizeText(source) {
  if (!source || state.language === "zh-Hans") return source;
  return toTraditional(source);
}

function setLanguage(language) {
  if (!Object.hasOwn(LANGUAGES, language) || state.language === language) return;
  state.language = language;
  saveAndRender();
}

function applyLanguageToDocument() {
  const language = LANGUAGES[state.language] || LANGUAGES["zh-Hans"];
  const languageChanged = renderedLanguage !== state.language;
  if (languageChanged) {
    if (document.documentElement) document.documentElement.lang = language.htmlLang;
    document.title = language.title;
    document.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === state.language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    renderedLanguage = state.language;
  }
  if (state.language === "zh-Hans" && !languageChanged) return;
  if (!document.createTreeWalker || typeof NodeFilter === "undefined") return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!["SCRIPT", "STYLE"].includes(node.parentElement?.tagName) && node.nodeValue.trim()) {
      const current = node.nodeValue;
      const previous = i18nTextState.get(node);
      const source = !previous || current !== previous.rendered ? current : previous.source;
      const leading = source.match(/^\\s*/)?.[0] || "";
      const trailing = source.match(/\\s*$/)?.[0] || "";
      const core = source.trim();
      const rendered = core ? `${leading}${localizeText(core)}${trailing}` : source;
      if (current !== rendered) node.nodeValue = rendered;
      i18nTextState.set(node, { source, rendered });
    }
    node = walker.nextNode();
  }
  document.querySelectorAll("[aria-label], [title]").forEach((element) => {
    const prior = i18nAttributeState.get(element) || {};
    const next = { ...prior };
    ["aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) return;
      const current = element.getAttribute(attribute);
      const previous = prior[attribute];
      const source = !previous || current !== previous.rendered ? current : previous.source;
      const rendered = localizeText(source);
      if (current !== rendered) element.setAttribute(attribute, rendered);
      next[attribute] = { source, rendered };
    });
    i18nAttributeState.set(element, next);
  });
}

const ZONES = [
  {
    id: "Z1",
    name: "封文大门",
    objective: "取走封印，或削弱石门后重击。",
    reflection: "石像的裂纹在雨里格外清楚。庭院里的词，未必永远留在原处。",
    objects: [
      object("gate", "封文大门", "Door", "门", ["Semantic.Structure.Closed", "Semantic.Structure.Solid"], ["Semantic.Structure.Closed"], ["Structure"], []),
      object("statue", "裂纹石像", "Stone", "像", ["Semantic.Structure.Fragile"], ["Semantic.Structure.Fragile"], ["Structure", "Mass"], [])
    ],
    complete: (s) => s.flags.gateDestroyed || s.flags.gateUnsealed
  },
  {
    id: "Z2",
    name: "压机关庭",
    objective: "让机关板下沉。可以搬石，也可以改写机关本身。",
    reflection: "石块的重量会改变。雨水落在机关板上，却不足以让它下沉。",
    objects: [
      object("block", "压机关石", "Stone", "石", ["Semantic.Mass.Heavy"], ["Semantic.Mass.Heavy"], ["Mass", "Structure"], []),
      object("tablet", "浮字碑", "Mechanism", "轻", ["Semantic.Mass.Light"], ["Semantic.Mass.Light"], ["Mass", "Structure"], []),
      object("plate", "地面机关", "Mechanism", "机", [], [], ["Mass"], [])
    ],
    complete: (s) => s.flags.platePressed
  },
  {
    id: "Z3",
    name: "断廊遭遇",
    objective: "清退两名游兵。观察来势，创造改写甲片的机会。",
    reflection: "招式落空时，游兵的甲片会露出缝隙。断廊外侧没有护栏，变轻的东西也站不稳。",
    objects: [
      enemy("guardA", "字壳游兵A", ["Semantic.Structure.Solid"], 38),
      enemy("guardB", "字壳游兵B", ["Semantic.Structure.Fragile"], 28)
    ],
    complete: (s) => zoneObjects(s).every((o) => o.defeated)
  },
  {
    id: "Z4",
    name: "冻水温室",
    objective: "解冻升降台。用蒸汽遮住通路，或击败缀刺兽。",
    reflection: "窗前结着冰，暖处升起水汽。这里的温度和水分会彼此改变。",
    objects: [
      object("lift", "冰封升降台", "Mechanism", "台", ["Semantic.Temperature.Frozen"], [], ["Temperature"], []),
      object("pool", "冻结水池", "Water", "水", ["Semantic.Temperature.Frozen", "Semantic.Medium.Wet"], ["Semantic.Temperature.Frozen", "Semantic.Medium.Wet"], ["Temperature", "Medium", "Structure"], [], true),
      object("brazier", "火盆", "FireSource", "火", ["Semantic.Temperature.Overheated"], ["Semantic.Temperature.Overheated"], ["Temperature"], ["Temperature"], true),
      enemy("beast", "缀刺兽", ["Semantic.Mass.Heavy", "Semantic.Temperature.Overheated"], 48)
    ],
    complete: (s) => Boolean(s.flags.liftMelted) && (s.flags.icePath || s.flags.steamBurst || zoneObjects(s).some((obj) => obj.id === "beast" && obj.defeated))
  },
  {
    id: "Z5",
    name: "碎桥力场",
    objective: "用吸引聚拢碎片，再用排斥推入锚点形成桥面。",
    reflection: "断桥碎片没有坠入山谷。两侧立柱仍在牵动它们。",
    objects: [
      object("pullPillar", "吸引力场柱", "FieldPillar", "引", ["Semantic.Field.Attract"], ["Semantic.Field.Attract"], ["Field"], []),
      object("pushPillar", "排斥力场柱", "FieldPillar", "斥", ["Semantic.Field.Repel"], ["Semantic.Field.Repel"], ["Field"], []),
      object("debris", "桥面碎片", "Debris", "桥", ["Semantic.Mass.Light"], [], ["Mass", "Field"], [])
    ],
    complete: (s) => s.flags.bridgeFormed
  },
  {
    id: "Z6",
    name: "残章中庭",
    objective: "用环境词缀削掉三层护文，结构槽开放后注入脆弱并重击核心。",
    reflection: "守卫外有三层护文，每层回应不同的语义反应。",
    objects: [
      boss("warden", "残章守卫", ["Semantic.Structure.Solid", "Semantic.Mass.Heavy"]),
      object("bossPool", "潮湿水纹", "Water", "水", ["Semantic.Medium.Wet"], ["Semantic.Medium.Wet"], ["Medium"], [], true),
      object("bossFire", "过热火盆", "FireSource", "火", ["Semantic.Temperature.Overheated"], ["Semantic.Temperature.Overheated"], ["Temperature"], ["Temperature"], true),
      object("bossIce", "冻结残页", "Mechanism", "冰", ["Semantic.Temperature.Frozen"], ["Semantic.Temperature.Frozen"], ["Temperature"], [], true),
      object("bossPull", "吸引残柱", "FieldPillar", "引", ["Semantic.Field.Attract"], ["Semantic.Field.Attract"], ["Field"], [], true),
      object("bossPush", "排斥残柱", "FieldPillar", "斥", ["Semantic.Field.Repel"], ["Semantic.Field.Repel"], ["Field"], [], true),
      object("bossTablet", "裂纹石碑", "Stone", "裂", ["Semantic.Structure.Fragile"], ["Semantic.Structure.Fragile"], ["Structure"], [], true)
    ],
    complete: (s) => s.flags.bossDefeated
  },
  {
    id: "Z7",
    name: "修正文库门槛",
    objective: "沿书廊进入修正文库。",
    reflection: "天色渐明。本轮改写与回声已在文库留下记录。",
    objects: [
      object("archive", "未授权文库", "Mechanism", "库", [], [], [], [])
    ],
    complete: () => true
  }
];

function freshZones() {
  return ZONES.map((zoneConfig) => ({
    ...zoneConfig,
    objects: zoneConfig.objects.map((item) => structuredClone(item))
  }));
}

function object(id, name, type, glyph, tags, provides, openSlots, lockedSlots, persistentSource = false) {
  return {
    id,
    name,
    type,
    glyph,
    currentTags: [...tags],
    providesTags: [...provides],
    openSlots: [...openSlots],
    lockedSlots: [...lockedSlots],
    persistentSource,
    scanned: false,
    hp: null,
    breach: false
  };
}

function enemy(id, name, tags, hp) {
  const e = object(id, name, "Enemy", "敌", tags, tags.filter((tag) => tag !== "Semantic.Structure.Fragile"), ["Structure", "Mass", "Temperature", "Medium", "Field"], []);
  e.hp = hp;
  e.maxHp = hp;
  return e;
}

function boss(id, name, tags) {
  const b = object(id, name, "Boss", "守", tags, ["Semantic.Structure.Solid", "Semantic.Mass.Heavy"], ["Structure", "Mass", "Temperature", "Medium", "Field"], ["Structure"]);
  b.hp = 90;
  b.maxHp = 90;
  b.shieldLayers = 3;
  return b;
}

const INITIAL_PROFILE = PROGRESSION.createProfile();

const state = {
  sessionId: createSessionId(),
  zone: 0,
  testMode: "guided",
  ink: 12,
  maxInk: 12,
  inventory: [],
  travelWord: "",
  selectedObjectId: null,
  selectedTagId: null,
  selectedInventoryIndex: null,
  zones: freshZones(),
  flags: {},
  metrics: createMetrics(),
  undoStack: [],
  checkpoints: {},
  mastery: {
    earned: {},
    zoneMistakeBaseline: { Z1: 0 }
  },
  log: [],
  lastFeedback: null,
  unlockedZones: ["Z1"],
  completionSfxPlayed: false,
  storageConflict: false,
  storageNotice: "",
  theme: "dark",
  language: "zh-Hans",
  chronicleExpanded: false,
  profile: INITIAL_PROFILE,
  run: PROGRESSION.createRun(INITIAL_PROFILE, "guided")
};

const el = {
  inkValue: document.getElementById("inkValue"),
  inventoryCount: document.getElementById("inventoryCount"),
  zoneIndex: document.getElementById("zoneIndex"),
  elapsedValue: document.getElementById("elapsedValue"),
  resonanceValue: document.getElementById("resonanceValue"),
  masteryPanel: document.getElementById("masteryPanel"),
  zoneList: document.getElementById("zoneList"),
  zoneTitle: document.getElementById("zoneTitle"),
  zoneObjective: document.getElementById("zoneObjective"),
  stageHero: document.getElementById("stageHero"),
  stageRunStatus: document.getElementById("stageRunStatus"),
  combatReadout: document.getElementById("combatReadout"),
  travelLoadout: document.getElementById("travelLoadout"),
  nextHint: document.getElementById("nextHint"),
  resultPulse: document.getElementById("resultPulse"),
  decisionStrip: document.getElementById("decisionStrip"),
  stepList: document.getElementById("stepList"),
  sceneMap: document.getElementById("sceneMap"),
  contextActions: document.getElementById("contextActions"),
  actionHelp: document.getElementById("actionHelp"),
  tacticalDeck: document.getElementById("tacticalDeck"),
  inspectorActions: document.getElementById("inspectorActions"),
  selectedHint: document.getElementById("selectedHint"),
  inspector: document.getElementById("inspector"),
  inventoryList: document.getElementById("inventoryList"),
  eventLog: document.getElementById("eventLog"),
  reflectionBox: document.getElementById("reflectionBox"),
  metricsBox: document.getElementById("metricsBox"),
  sessionStatus: document.getElementById("sessionStatus"),
  chroniclePanel: document.getElementById("chroniclePanel"),
  undoBtn: document.getElementById("undoBtn"),
  checkpointBtn: document.getElementById("checkpointBtn"),
  shareLinkBtn: document.getElementById("shareLinkBtn"),
  restartSessionBtn: document.getElementById("restartSessionBtn"),
  completionPanel: document.getElementById("completionPanel"),
  reportData: document.getElementById("reportData"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  resetBtn: document.getElementById("resetBtn"),
  clearInventoryBtn: document.getElementById("clearInventoryBtn"),
  refillInkBtn: document.getElementById("refillInkBtn"),
  resetZoneBtn: document.getElementById("resetZoneBtn"),
  downloadReportBtn: document.getElementById("downloadReportBtn"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  travelMapBtn: document.getElementById("travelMapBtn"),
  mapBackdrop: document.getElementById("mapBackdrop"),
  inspectorBackdrop: document.getElementById("inspectorBackdrop"),
  toggleLogsBtn: document.getElementById("toggleLogsBtn"),
  closeLogsBtn: document.getElementById("closeLogsBtn"),
  closeTravelBtn: document.getElementById("closeTravelBtn"),
  closeInspectorBtn: document.getElementById("closeInspectorBtn"),
  zonePanel: document.querySelector(".zone-panel"),
  inspectorPanel: document.getElementById("inspectorPanel"),
  bottomPanel: document.querySelector(".bottom-panel")
};

function inventoryCapacity() {
  return PROGRESSION.inventoryCapacity(state.profile);
}

function extractCost(definition) {
  return definition?.extract ?? 0;
}

function injectCost(definition) {
  return PROGRESSION.injectCost(definition?.inject ?? 0, state.run);
}

function inkForRewrites(tagIds) {
  return tagIds.reduce((cost, id) => cost + extractCost(tag(id)) + injectCost(tag(id)), 0);
}

function restoreInk(bonus, minimum = 0) {
  const previous = state.ink;
  state.ink = Math.min(state.maxInk, Math.max(state.ink + bonus, minimum));
  return state.ink - previous;
}

function minimumEntryInk(zoneId) {
  if (zoneId === "Z2") return inkForRewrites(["Semantic.Mass.Light"]) + injectCost(tag("Semantic.Mass.Heavy"));
  if (zoneId === "Z4") return inkForRewrites(["Semantic.Temperature.Overheated", "Semantic.Medium.Wet"]);
  if (zoneId === "Z6") return inkForRewrites(BOSS_COUNTERS[3].tags);
  return 0;
}

function isExpedition() {
  return state.testMode === "expedition";
}

function usesLowGuidance() {
  return state.testMode === "low" || isExpedition();
}

function runIsFailed() {
  return Boolean(isExpedition() && state.run?.failed);
}

function isRevisiting() {
  return state.unlockedZones.includes(state.zones[state.zone + 1]?.id);
}

function actionBlockedByRun() {
  if (isCompleted() || isRevisiting()) return true;
  if (!runIsFailed()) return false;
  log("本轮远征已经崩解，请先重新整备。", "warn");
  render();
  return true;
}

function advanceThreat(base, source) {
  if (!isExpedition() || runIsFailed() || isCompleted()) return;
  const gain = PROGRESSION.threatGain(base, state.profile, state.run);
  if (!gain) return;
  state.run.threat = Math.min(100, state.run.threat + gain);
  if (state.run.threat < 100) return;

  state.run.collapses += 1;
  state.run.integrity -= 1;
  state.profile.totalCollapses += 1;
  if (state.run.integrity <= 0) {
    state.run.integrity = 0;
    state.run.failed = true;
    log(`第 ${state.run.cycle} 轮远征在${source}后彻底崩解。保留永久铭文，可重新整备。`, "bad", "expedition-failed");
  } else {
    state.run.threat = 35;
    log(`语义崩解吞噬了一层稳定度：剩余 ${state.run.integrity}/3。威胁回落，本轮仍可继续。`, "warn", "semantic-collapse");
  }
}

function recoverThreatOnAdvance() {
  if (!isExpedition()) return;
  state.run.threat = Math.max(0, state.run.threat - PROGRESSION.threatRecovery(state.run));
}

function finalizeRunProgression() {
  if (!isCompleted() || state.testMode === "debug" || runIsFailed() || state.run.rewardClaimed) return 0;
  const result = PROGRESSION.applyCompletion(state.profile, state.run, currentAudit().score);
  state.run.lastReward = result.reward;
  return result.reward;
}

function buyChronicleUpgrade(upgradeId) {
  const result = PROGRESSION.purchaseUpgrade(state.profile, upgradeId);
  if (!result.ok) {
    log(result.reason, "warn");
    return render();
  }
  state.maxInk = PROGRESSION.maxInk(state.profile, state.run);
  state.ink = Math.min(state.maxInk, state.ink + (upgradeId === "inkwell" ? 2 : 0));
  log(`铭文“${result.upgrade.name}”提升至 ${result.level} 级，消耗 ${result.cost} 枚回声残片。`, "good");
  saveAndRender();
}

function zone() {
  return state.zones[state.zone];
}

function zoneObjects(s = state) {
  return s.zones[s.zone].objects;
}

function selectedObject() {
  return zoneObjects().find((o) => o.id === state.selectedObjectId) || null;
}

function tag(id) {
  return TAGS[id];
}

function tagName(id) {
  return TAGS[id]?.name || id;
}

function tagCause(id) {
  return TAG_CAUSES[id] || "观察它能作用的槽位和对象。";
}

function isFinalZone() {
  return state.zone === state.zones.length - 1;
}

function isCompleted() {
  return state.metrics.completedAt != null;
}

function createSessionId() {
  const time = new Date();
  const stamp = [
    time.getFullYear(),
    String(time.getMonth() + 1).padStart(2, "0"),
    String(time.getDate()).padStart(2, "0"),
    String(time.getHours()).padStart(2, "0"),
    String(time.getMinutes()).padStart(2, "0"),
    String(time.getSeconds()).padStart(2, "0")
  ].join("");
  return `DUANJU-${stamp}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMetrics(testMode = "guided") {
  return {
    testMode,
    startedAt: Date.now(),
    completedAt: null,
    zoneVisitStartSec: 0,
    firstScanSec: null,
    firstExtractSec: null,
    firstInjectSec: null,
    scans: 0,
    extracts: 0,
    injects: 0,
    reactions: 0,
    reactionCounts: {
      SteamBurst: 0,
      FractureWindow: 0,
      FieldPulse: 0
    },
    warnings: 0,
    blockedActions: 0,
    heavyStrikes: 0,
    parries: 0,
    sidesteps: 0,
    bossSemanticActions: 0,
    bossPhaseCounters: [],
    checkpointSaves: 0,
    checkpointRestores: 0,
    routeAssertions: [],
    regressionRuns: [],
    debugRecoveries: 0,
    shortcutsUsed: 0,
    undoUses: 0,
    failureCounts: {},
    failureEvents: [],
    feedbackEvents: [],
    playtestNotes: [],
    zoneVisits: { Z1: 1 },
    zoneCompletions: [],
    wordCrossings: [],
    zoneDurations: [],
    modeChanges: [{ mode: testMode, label: TEST_MODES[testMode], t: 0, zone: "Z1" }],
    timeline: []
  };
}

function elapsedSeconds() {
  return Math.max(0, Math.round((Date.now() - state.metrics.startedAt) / 1000));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function markFirst(key) {
  if (state.metrics[key] == null) state.metrics[key] = elapsedSeconds();
}

function currentModeLabel() {
  return TEST_MODES[state.testMode] || state.testMode;
}

function runType(mode) {
  return mode === "guided" || mode === "low" ? "standard" : mode;
}

function setTestMode(mode) {
  if (!Object.hasOwn(TEST_MODES, mode) || state.testMode === mode) return;
  const changesRunType = runType(mode) !== runType(state.testMode);
  state.testMode = mode;
  if (changesRunType) return resetGame();
  state.metrics.testMode = mode;
  state.metrics.modeChanges.push({
    mode,
    label: TEST_MODES[mode],
    t: elapsedSeconds(),
    zone: zone().id
  });
  log(`已切换至${TEST_MODES[mode]}模式。`);
  saveAndRender();
}

function applyInitialModeFromUrl() {
  const mode = PAGE_PARAMS.get("mode");
  const language = PAGE_PARAMS.get("lang");
  if (language) state.language = Object.hasOwn(LANGUAGES, language) ? language : "zh-Hans";
  if (!Object.hasOwn(TEST_MODES, mode) || state.testMode === mode) return;
  state.testMode = mode;
  state.run = PROGRESSION.createRun(state.profile, mode);
  state.maxInk = PROGRESSION.maxInk(state.profile, state.run);
  state.ink = state.maxInk;
  state.metrics.testMode = mode;
  state.metrics.modeChanges = [{ mode, label: TEST_MODES[mode], t: 0, zone: "Z1" }];
}

function recordZoneDuration(outcome) {
  const start = state.metrics.zoneVisitStartSec ?? 0;
  const end = elapsedSeconds();
  state.metrics.zoneDurations.push({
    zone: zone().id,
    mode: state.testMode,
    startedAtSec: start,
    endedAtSec: end,
    durationSec: Math.max(0, end - start),
    outcome
  });
  state.metrics.zoneVisitStartSec = end;
}

function zoneDurationsSnapshot() {
  const durations = structuredClone(state.metrics.zoneDurations);
  const end = state.metrics.completedAt ?? elapsedSeconds();
  const start = state.metrics.zoneVisitStartSec ?? 0;
  durations.push({
    zone: zone().id,
    mode: state.testMode,
    startedAtSec: start,
    endedAtSec: end,
    durationSec: Math.max(0, end - start),
    outcome: isCompleted() ? "slice-complete" : "active"
  });
  return durations;
}

function activeZoneElapsedSec() {
  return Math.max(0, elapsedSeconds() - (state.metrics.zoneVisitStartSec ?? 0));
}

function reportSummary(durations = zoneDurationsSnapshot()) {
  const completedDurations = durations.filter((item) => item.outcome !== "active");
  const longestZone = durations.reduce((longest, item) => {
    if (!longest || item.durationSec > longest.durationSec) return item;
    return longest;
  }, null);
  return {
    mode: state.testMode,
    modeLabel: currentModeLabel(),
    totalMistakes: state.metrics.warnings + state.metrics.blockedActions,
    completedZones: completedDurations.length,
    activeZoneElapsedSec: activeZoneElapsedSec(),
    longestZone
  };
}

function reactionLedger() {
  return Object.entries(state.metrics.reactionCounts).map(([key, count]) => ({
    reaction: key,
    label: reactionName(`Reaction.${key}`),
    count
  }));
}

function discoveredReactionCount() {
  return REACTION_DISCOVERIES.filter((item) => state.metrics.reactionCounts[item.key] > 0).length;
}

function zoneMistakes(zoneId = zone().id) {
  const baseline = state.mastery.zoneMistakeBaseline[zoneId] ?? 0;
  return Math.max(0, state.metrics.warnings + state.metrics.blockedActions - baseline);
}

function masteryEligible(zoneId = zone().id) {
  if (!zone().complete(state)) return false;
  if (zoneId === "Z2") return Boolean(state.flags.blockMoved) && zoneMistakes(zoneId) === 0;
  if (zoneId === "Z3") return (state.metrics.parries > 0 || zoneObjects().some((item) => item.fell)) && zoneMistakes(zoneId) === 0;
  if (zoneId === "Z4") return state.metrics.reactionCounts.SteamBurst > 0 && zoneMistakes(zoneId) === 0;
  if (zoneId === "Z5") return zoneMistakes(zoneId) === 0;
  if (zoneId === "Z6") {
    return new Set(state.metrics.bossPhaseCounters.map((item) => item.reaction)).size >= 3 && zoneMistakes(zoneId) === 0;
  }
  return zoneMistakes(zoneId) === 0;
}

function awardZoneMastery(zoneId = zone().id) {
  if (state.mastery.earned[zoneId] || !masteryEligible(zoneId)) return false;
  state.mastery.earned[zoneId] = true;
  state.ink = Math.min(state.maxInk, state.ink + 2);
  log(`区域精通：${ZONE_MASTERY[zoneId]?.name || zoneId}。奖励 2 点原墨。`, "good", "mastery");
  return true;
}

function failureLabel(category) {
  const labels = {
    "tag-unavailable": "目标不提供该词",
    "inventory-full": "词库已满",
    "slot-missing": "目标缺槽",
    "slot-locked": "槽位锁定",
    "combat-guarded": "战斗破绽未开",
    "ink-low": "原墨不足",
    incompatible: "对象不兼容",
    regression: "回归异常",
    general: "一般阻塞"
  };
  return labels[category] || category;
}

function failureLedger() {
  return Object.entries(state.metrics.failureCounts)
    .map(([category, count]) => ({
      category,
      label: failureLabel(category),
      count,
      latest: state.metrics.failureEvents.find((item) => item.category === category)?.message || ""
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function experienceAudit(summary = reportSummary()) {
  const failureItems = failureLedger();
  const latestFailure = state.metrics.failureEvents[0] || null;
  const frictions = [];
  const strengths = [];
  const nextFixes = [];
  const mistakes = state.metrics.warnings + state.metrics.blockedActions;

  if (state.metrics.firstScanSec != null) strengths.push(`首扫 ${formatTime(state.metrics.firstScanSec)}，玩家能进入扫描闭环。`);
  if (Object.values(state.metrics.reactionCounts).filter((count) => count > 0).length >= 3) strengths.push("组合反应覆盖完整。");
  if (state.metrics.bossPhaseCounters.length >= 3) strengths.push("Boss三层护文都被不同反制击破。");
  if (state.metrics.feedbackEvents.length >= 8) strengths.push("操作反馈事件充足，可复盘关键路径。");

  if (latestFailure) {
    frictions.push(`最近阻塞：${failureLabel(latestFailure.category)} / ${latestFailure.message}`);
    nextFixes.push("优先检查最近阻塞对应的按钮禁用原因和扫描器预览。");
  }
  failureItems
    .filter((item) => item.count > 0)
    .slice(0, 3)
    .forEach((item) => frictions.push(`${item.label}出现 ${item.count} 次。`));
  if (summary.longestZone?.durationSec >= 90) {
    frictions.push(`${summary.longestZone.zone} 停留超过90秒。`);
    nextFixes.push("复查最长区域的下一步提示、对象高亮和行动反馈。");
  }
  if (state.testMode === "low" && mistakes > 0) {
    frictions.push("低引导模式出现误操作，需要判断是探索成本还是提示缺口。");
    nextFixes.push("低引导只补结果反馈，不直接暴露完整解法。");
  }
  if (state.metrics.checkpointRestores > 0) {
    frictions.push(`本轮依赖检查点恢复 ${state.metrics.checkpointRestores} 次。`);
  }
  if (!state.metrics.feedbackEvents.length) {
    frictions.push("尚无操作反馈事件。");
    nextFixes.push("先完成一次扫描，确认第一屏是否建立输入预期。");
  }

  const headline = frictions.length
    ? "存在可定位体验摩擦"
    : isCompleted()
      ? "路径稳定，适合真人低引导复测"
      : "当前体验暂无明显阻塞";

  return {
    headline,
    status: frictions.length ? "watch" : "clear",
    strengths: strengths.slice(0, 4),
    frictions: [...new Set(frictions)].slice(0, 5),
    nextFixes: [...new Set(nextFixes)].slice(0, 4),
    latestFailure,
    failureLedger: failureItems
  };
}

function playtestPackage(summary, zoneDurations) {
  const z5Duration = zoneDurations.find((item) => item.zone === "Z5")?.durationSec ?? 0;
  const bossCounters = state.metrics.bossPhaseCounters.map((item) => ({
    reaction: item.reaction,
    label: reactionName(item.reaction),
    t: item.t,
    zone: item.zone
  }));
  const risks = [];
  if (state.testMode !== "low") risks.push("当前不是低引导模式，真人理解质量只能作为参考。");
  if (summary.longestZone?.durationSec >= 90) risks.push(`${summary.longestZone.zone} 停留超过90秒，需记录卡点假设。`);
  if (z5Duration >= 90) risks.push("Z5 碎桥力场停留较久，重点确认玩家是否把机关动作误解为普通取词。");
  if (state.metrics.failureEvents.length) risks.push("本轮出现失败事件，需对照失败账本询问玩家当时的预期。");
  if (isCompleted() && bossCounters.length < 3) risks.push("Boss通关但护文反制不足，需确认是否绕过语义考核。");
  return {
    purpose: "验证玩家是否真正理解扫描、取词、写词、组合反应，而不是照着提示完成。",
    privacy: "只记录匿名编号、设备和观察结果；不要记录姓名、账号、联系方式或其他身份信息。",
    entry: "线上入口可使用 ?mode=low；本地入口可使用 /index.html?mode=low。",
    observerRules: [
      "不提前解释正确路线。",
      "只回答界面操作问题，不解释谜题答案。",
      "卡住超过90秒时先记录卡点，再允许读出当前结果反馈条。",
      "单人偏好先记录，不立即改规则；多人同类误解再改提示或交互。"
    ],
    comprehensionChecks: [
      { id: "first-intent", prompt: "第一次点击前，请玩家说出“我现在准备做什么”。", pass: "能指出要选择对象并扫描，或能合理说明正在观察对象。" },
      { id: "scan-difference", prompt: "完成Z1后询问：扫描前后你知道的信息有什么不同？", pass: "能说出扫描揭示词缀、槽位或取写成本。" },
      { id: "z5-mechanic", prompt: "完成Z5后询问：力场柱是在提供词，还是在驱动碎片？", pass: "能说出本段主要是用吸引/排斥机关移动碎片，不是反复剥离力场词。" },
      { id: "boss-layer-1", prompt: "Boss第一层为什么用蒸汽？", pass: "能把过热与潮湿组合成护文过载或蒸汽爆发。" },
      { id: "boss-layer-2", prompt: "Boss第二层为什么先冻结再打裂？", pass: "能说出冻结显出裂隙，脆弱/重击扩大破绽。" },
      { id: "boss-layer-3", prompt: "Boss第三层为什么用相反力场？", pass: "能说出吸引和排斥在守卫身上相撞造成力场震荡。" },
      { id: "world-examples", prompt: "通关后请玩家说出两个“词改变世界状态”的例子。", pass: "能举出门变脆、石头变轻/沉重、融冰、蒸汽、力场碎片或Boss护文等例子。" }
    ],
    triggerRules: [
      "主线软锁或真实点击不可达：出现1次即修。",
      "同一区同类误解达到3名玩家：修提示、对象命名或信息层级。",
      "Boss只能背配方不能解释原因：修阶段揭示，不先加新招式。",
      "Z5多人误取力场柱：继续强化机关动作表达，不增加碎片数量。"
    ],
    autoSignals: {
      sessionId: state.sessionId,
      mode: state.testMode,
      completed: isCompleted(),
      totalMistakes: summary.totalMistakes,
      longestZone: summary.longestZone,
      z5DurationSec: z5Duration,
      firstScanSec: state.metrics.firstScanSec,
      firstExtractSec: state.metrics.firstExtractSec,
      firstInjectSec: state.metrics.firstInjectSec,
      bossCounters,
      failureLedger: failureLedger()
    },
    observerMarkdown: playtestObserverMarkdown(summary, z5Duration, bossCounters, risks),
    risks
  };
}

function playtestObserverMarkdown(summary, z5Duration, bossCounters, risks) {
  const longest = summary.longestZone ? `${summary.longestZone.zone} / ${formatTime(summary.longestZone.durationSec)}` : "-";
  const bossText = bossCounters.length ? bossCounters.map((item) => item.label).join(" / ") : "-";
  const riskText = risks.length ? risks.map((item) => `- ${item}`).join("\n") : "- 暂无自动风险信号。";
  return [
    `# 低引导试玩观察记录 ${state.sessionId}`,
    "",
    `- 模式：${currentModeLabel()}`,
    `- 完成：${isCompleted() ? "是" : "否"}`,
    `- 总误操作：${summary.totalMistakes}`,
    `- 最长区域：${longest}`,
    `- Z5停留：${formatTime(z5Duration)}`,
    `- Boss反制：${bossText}`,
    `- 首扫/首取/首写：${timeOrDash(state.metrics.firstScanSec)} / ${timeOrDash(state.metrics.firstExtractSec)} / ${timeOrDash(state.metrics.firstInjectSec)}`,
    "",
    "## 观察者追问",
    "- 第一次点击前：你现在准备做什么？",
    "- Z1后：扫描前后你知道的信息有什么不同？",
    "- Z5后：力场柱是在提供词，还是在驱动碎片？",
    "- Boss后：三层护文分别为什么这样反制？",
    "- 通关后：说出两个词改变世界状态的例子。",
    "",
    "## 自动风险信号",
    riskText,
    "",
    "## 观察备注",
    "- 玩家复述：",
    "- 卡点原因：",
    "- 是否需要改规则/提示："
  ].join("\n");
}

function currentAudit(experience = experienceAudit()) {
  const mistakes = state.metrics.warnings + state.metrics.blockedActions;
  const reactionTypes = Object.values(state.metrics.reactionCounts).filter((count) => count > 0).length;
  const bossCounterTypes = new Set(state.metrics.bossPhaseCounters.map((item) => item.reaction)).size;
  const recovery = recoveryState();
  const risks = [...recovery.issues];
  const failedAssertions = state.metrics.routeAssertions.filter((item) => !item.passed);
  failedAssertions.forEach((item) => risks.push(`回归断言失败：${item.label}`));
  experience.frictions.slice(0, 2).forEach((item) => risks.push(item));
  if (state.inventory.length >= inventoryCapacity()) risks.push("词库已满。");
  if (!state.checkpoints[zone().id] && !isCompleted()) risks.push("当前区域缺少检查点。");
  if (state.zone >= 5 && bossCounterTypes < 3 && !state.flags.bossDefeated) risks.push("Boss反制覆盖不足。");
  const score = Math.max(0, Math.min(100,
    70 +
    reactionTypes * 4 +
    (bossCounterTypes >= 3 ? 12 : 0) +
    (isCompleted() ? 8 : 0) -
    mistakes * 8 -
    failedAssertions.length * 20 -
    state.metrics.undoUses * 3 -
    state.metrics.checkpointRestores * 5
  ));
  return {
    score,
    grade: score >= 90 ? "S" : score >= 78 ? "A" : score >= 64 ? "B" : "C",
    mistakes,
    reactionTypes,
    bossCounterTypes,
    risks: [...new Set(risks)].slice(0, 5)
  };
}

function log(message, type = "", category = "general") {
  const event = {
    message,
    type: type || "info",
    category,
    t: elapsedSeconds(),
    zone: zone().id,
    mode: state.testMode,
    selectedObjectId: state.selectedObjectId,
    selectedTagId: state.selectedTagId,
    selectedInventoryTag: state.inventory[state.selectedInventoryIndex] || null,
    ink: state.ink,
    inventoryCount: state.inventory.length
  };
  if (type === "warn" && category !== "semantic-collapse") state.metrics.warnings += 1;
  if (type === "bad") {
    state.metrics.blockedActions += 1;
    state.metrics.failureCounts[category] = (state.metrics.failureCounts[category] || 0) + 1;
    state.metrics.failureEvents.unshift(event);
    state.metrics.failureEvents = state.metrics.failureEvents.slice(0, 24);
    audio.playSfx("error");
  }
  state.lastFeedback = event;
  state.metrics.feedbackEvents.unshift(event);
  state.metrics.feedbackEvents = state.metrics.feedbackEvents.slice(0, 40);
  state.log.unshift({ message, type, t: event.t, zone: event.zone, category });
  state.log = state.log.slice(0, 9);
  state.metrics.timeline.unshift({
    t: event.t,
    zone: event.zone,
    type: type || "info",
    message,
    category
  });
  state.metrics.timeline = state.metrics.timeline.slice(0, 80);
}

function semanticSnapshot(label) {
  return {
    label,
    zone: state.zone,
    ink: state.ink,
    inventory: [...state.inventory],
    travelWord: state.travelWord,
    selectedObjectId: state.selectedObjectId,
    selectedTagId: state.selectedTagId,
    selectedInventoryIndex: state.selectedInventoryIndex,
    objects: structuredClone(zoneObjects()),
    flags: Object.fromEntries(Object.entries(state.flags).filter(([key]) => zoneFlagBelongsToCurrentZone(key)))
  };
}

function restoreSemanticSnapshot(snapshot) {
  state.ink = Math.min(state.maxInk, snapshot.ink);
  state.inventory = [...snapshot.inventory];
  state.travelWord = hasInventory(snapshot.travelWord) ? snapshot.travelWord : "";
  state.selectedObjectId = snapshot.selectedObjectId;
  state.selectedTagId = snapshot.selectedTagId;
  state.selectedInventoryIndex = snapshot.selectedInventoryIndex;
  state.zones[state.zone].objects = structuredClone(snapshot.objects);
  for (const flag of Object.keys(state.flags)) {
    if (zoneFlagBelongsToCurrentZone(flag)) delete state.flags[flag];
  }
  Object.assign(state.flags, snapshot.flags);
}

function pushUndo(label) {
  state.undoStack.unshift(semanticSnapshot(label));
  state.undoStack = state.undoStack.slice(0, 3);
}

function saveZoneCheckpoint(label = `检查点 ${zone().id}`) {
  state.checkpoints[zone().id] = semanticSnapshot(label);
  if (state.metrics) state.metrics.checkpointSaves += 1;
}

function canRestoreCheckpoint() {
  const zoneId = zone().id;
  return Boolean(state.checkpoints[zoneId] && state.unlockedZones.at(-1) === zoneId && !isCompleted() && !runIsFailed());
}

function restoreZoneCheckpoint() {
  const snapshot = state.checkpoints[zone().id];
  if (!canRestoreCheckpoint()) {
    log("当前区域没有可恢复的检查点。", "warn");
    render();
    return;
  }
  restoreSemanticSnapshot(snapshot);
  state.undoStack = [];
  state.metrics.checkpointRestores += 1;
  state.metrics.debugRecoveries += 1;
  log(`已回到${snapshot.label}。`, "warn");
  saveAndRender();
}

function canUndo() {
  return state.undoStack.length > 0 && !isCompleted() && !runIsFailed();
}

function undoLastSemanticAction() {
  if (!canUndo()) {
    log("没有可撤销的语义操作。", "warn");
    render();
    return;
  }
  const snapshot = state.undoStack.shift();
  restoreSemanticSnapshot(snapshot);
  state.metrics.undoUses += 1;
  log(`已撤销：${snapshot.label}。`);
  saveAndRender();
}

function selectObject(id) {
  state.selectedObjectId = id;
  state.selectedTagId = null;
  el.inspectorPanel?.classList.remove("inventory-open");
  render();
  setInspectorOpen(true);
  const scroll = el.inspectorPanel?.querySelector(".inspector-scroll");
  if (scroll) scroll.scrollTop = 0;
  if (window.matchMedia?.(INSPECTOR_DRAWER_QUERY).matches) el.closeInspectorBtn?.focus?.({ preventScroll: true });
}

function scanSelected() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  if (!obj) return log("先选择一个对象。", "warn");
  if (obj.fell) return;
  obj.scanned = true;
  state.metrics.scans += 1;
  markFirst("firstScanSec");
  audio.playSfx("scan");
  log(`扫描到 ${obj.name}：${obj.currentTags.map(tagName).join(" / ") || "无显性词缀"}。`, "good");
  advanceThreat(2, "扫描");
  saveAndRender();
  if (window.matchMedia?.(INSPECTOR_DRAWER_QUERY).matches && !el.inspectorPanel?.classList.contains("open")) {
    setInspectorOpen(true);
    el.closeInspectorBtn?.focus?.({ preventScroll: true });
  }
  if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    el.stageHero.querySelector(".scene-scan")?.animate?.(
      [{ top: "0%", opacity: 0 }, { opacity: 1, offset: .16 }, { top: "100%", opacity: 0 }],
      { duration: 630, easing: "ease-out" }
    );
  }
}

function selectTag(tagId) {
  state.selectedTagId = tagId;
  render();
}

function extractSelectedTag() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  const tagId = state.selectedTagId;
  if (!obj) return log("先选择对象。", "warn");
  if (obj.fell) return log("目标已坠落，无法接近。", "warn");
  if (obj.id === "gate" && zone().complete(state)) return log("石门已经打开。", "warn");
  if (!obj.scanned) return log("先扫描目标，再剥离词缀。", "warn");
  if (!tagId) return log("先点选一个词缀。", "warn");
  const mechanicHint = z5MechanicHint(obj);
  if (mechanicHint) return log(mechanicHint, "warn");
  if (state.inventory.length >= inventoryCapacity()) return log(`临时词库已满，最多携带${inventoryCapacity()}个词缀。`, "bad", "inventory-full");
  const def = tag(tagId);
  if (!def) return log("未知词缀，无法剥离。", "bad", "unknown-tag");
  const cost = extractCost(def);
  if (state.ink < cost) return log("原墨不足，无法剥离。", "bad", "ink-low");
  if (!canTakeVisibleTag(obj, tagId)) return log(`${obj.name} 当前没有可剥离的“${def.name}”。`, "bad", "tag-unavailable");
  if (enemyStructureGuarded(obj, tagId)) return log("敌人的结构槽还没有露出，先打出破绽。", "bad", "combat-guarded");
  pushUndo(`剥离“${def.name}”`);
  state.ink -= cost;
  state.inventory.push(tagId);
  state.selectedInventoryIndex = state.inventory.length - 1;
  state.metrics.extracts += 1;
  markFirst("firstExtractSec");
  audio.playSfx("extract");
  if (!obj.persistentSource && !obj.lockedSlots.includes(def.slot)) {
    obj.currentTags = obj.currentTags.filter((item) => item !== tagId);
    closeInvalidFracture(obj);
  }
  log(`剥离“${def.name}”，收入临时词库。`, "good");
  advanceThreat(4, "剥离");
  if (obj.id === "gate" && tagId === "Semantic.Structure.Closed") {
    state.flags.gateUnsealed = true;
    audio.playSfx("success");
    log("朱绦滑落，完整的石门向内打开。", "good");
    return finishGateOpening();
  }
  selectGuidedRecommendedTarget(obj.id);
  saveAndRender();
}

function selectInventory(index) {
  state.selectedInventoryIndex = index;
  saveAndRender();
}

function injectSelectedInventory() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  if (!obj) return log("先选择注入目标。", "warn");
  if (obj.fell) return log("目标已坠落，无法写入。", "warn");
  if (!obj.scanned) return log("先扫描目标，确认槽位。", "warn");
  if (obj.id === "gate" && zone().complete(state)) return log("石门已经打开。", "warn");
  const tagId = state.inventory[state.selectedInventoryIndex];
  if (!tagId) return log("先选择词库中的词缀。", "warn");
  const def = tag(tagId);
  if (!obj.openSlots.includes(def.slot)) return log(`${obj.name} 没有${slotName(def.slot)}，无法写入“${def.name}”。`, "bad", "slot-missing");
  if (slotLockedForTag(obj, tagId)) return log(`${obj.name} 的${slotName(def.slot)}被锁定。`, "bad", "slot-locked");
  if (enemyStructureGuarded(obj, tagId)) return log("敌人的结构槽还没有露出，先打出破绽。", "bad", "combat-guarded");
  if (!def.compatible.includes(obj.type)) return log(`“${def.name}”不能作用于${objectTypeName(obj.type)}。`, "bad", "incompatible");
  const cost = injectCost(def);
  if (state.ink < cost) return log("原墨不足，无法注入。", "bad", "ink-low");

  const collisionReaction = fieldCollisionReaction(obj, tagId);
  const suppressReplacementReturn = bossAllowsPhaseStructureWrite(obj, tagId);
  const replacedTags = obj.currentTags.filter((item) => tag(item)?.slot === def.slot && item !== tagId);
  pushUndo(`注入“${def.name}”`);
  state.ink -= cost;
  obj.currentTags = obj.currentTags.filter((item) => tag(item)?.slot !== def.slot);
  obj.currentTags.push(tagId);
  state.inventory.splice(state.selectedInventoryIndex, 1);
  if (replacedTags.length === 1 && state.inventory.length < inventoryCapacity() && !suppressReplacementReturn) {
    state.inventory.push(replacedTags[0]);
    state.selectedInventoryIndex = state.inventory.length - 1;
    log(`被替换的“${tagName(replacedTags[0])}”回流到词库。`, "good");
  } else if (suppressReplacementReturn && replacedTags.length) {
    state.selectedInventoryIndex = null;
    log("阶段护文吸收了被替换的结构词，没有回流到词库。", "good");
  } else {
    state.selectedInventoryIndex = null;
  }
  if (!hasInventory(state.travelWord)) state.travelWord = "";
  state.metrics.injects += 1;
  markFirst("firstInjectSec");
  if (obj.id === "warden") state.metrics.bossSemanticActions += 1;
  audio.playSfx("inject");
  log(`向 ${obj.name} 注入“${def.name}”。`, "good");
  closeInvalidFracture(obj);
  if (enemyIntent(obj)?.id === "charge" && !enemyOpening(obj) && tagId === "Semantic.Temperature.Frozen" && replacedTags.includes("Semantic.Temperature.Overheated")) {
    finishEnemyBeat(obj, "stagger");
    log("热刺凝霜，冲撞被打断。", "good");
  }
  applyImmediateEffects(obj, tagId);
  if (collisionReaction) triggerReaction(obj, collisionReaction);
  resolveReactions(obj);
  advanceThreat(6, "注入");
  saveAndRender();
}

function applyImmediateEffects(obj, tagId) {
  if (obj.id === "tablet" && tagId === "Semantic.Structure.Closed" && !state.flags.tabletDropped) {
    state.flags.tabletDropped = true;
    state.flags.platePressed = true;
    audio.playSfx("success");
    log("悬浮机关被封住，石碑落下压住了机关板。", "good");
  }
  if (obj.id === "pool") {
    state.flags.icePath = hasTag(obj, "Semantic.Structure.Solid") && hasTag(obj, "Semantic.Temperature.Frozen");
    if (state.flags.icePath) log("冰面足以承重，可以绕过缀刺兽抵达升降台。", "good");
  }
  if (obj.id === "lift" && tagId === "Semantic.Temperature.Overheated") {
    state.flags.liftMelted = true;
    log("冰封升降台被过热解冻，机关开始转动。", "good");
  }
  if (obj.id === "gate" && tagId === "Semantic.Structure.Fragile") {
    log("封文大门出现裂纹，需要重击破坏。", "good");
  }
  if (obj.id === "block" && tagId === "Semantic.Mass.Light") {
    log("压机关石变轻，可以推动。", "good");
  }
  if (obj.id === "block" && tagId === "Semantic.Mass.Heavy" && state.flags.blockMoved && !state.flags.platePressed) {
    state.flags.platePressed = true;
    audio.playSfx("success");
    log("压机关石恢复沉重，机关板随即下沉，出口栅门打开。", "good");
  }
  if (obj.id === "plate" && tagId === "Semantic.Mass.Heavy" && !state.flags.platePressed) {
    state.flags.platePressed = true;
    audio.playSfx("success");
    log("机关板被自身重量压下，出口栅门打开。", "good");
  }
  if (obj.id === "warden" && tagId === "Semantic.Structure.Fragile" && obj.shieldLayers === 0) {
    log("残章守卫核心变得脆弱，重击可终结。", "good");
  }
  if (obj.id === "warden" && tagId === "Semantic.Temperature.Frozen" && obj.shieldLayers === 2) {
    log("第二层护文结霜，裂隙开始显影。", "good");
  }
  if (obj.id === "warden" && tag(tagId)?.slot === "Field" && obj.shieldLayers === 1) {
    log("第三层护文被力场牵动，等待相反力场相撞。", "good");
  }
}

function closeInvalidFracture(obj) {
  if (obj.fractureWindow && !BOSS_COUNTERS[2].tags.every(id => hasTag(obj, id))) obj.fractureWindow = false;
}

function resolveReactions(obj) {
  for (const reaction of REACTION_DISCOVERIES) {
    if (reaction.tags.every((id) => hasTag(obj, id))) triggerReaction(obj, `Reaction.${reaction.key}`);
  }
}

function applyReactionHpDamage(obj, amount) {
  if (!obj.hp) return;
  const floor = obj.id === "warden" && !obj.defeated ? 1 : 0;
  obj.hp = Math.max(floor, obj.hp - amount);
  if (obj.hp === 0) defeatObject(obj);
}

function defeatObject(obj) {
  obj.defeated = true;
  if (obj.id === "warden") state.flags.bossDefeated = true;
  audio.playSfx("success");
  if (obj.fell) log(`${obj.name} 被击离断廊，坠入下方的雨幕。`, "good", "combat-knockback");
  else log(`${obj.name} 被击败。`, "good");
}

function triggerReaction(obj, reactionId) {
  const historyKey = reactionMetricKey(reactionId);
  obj.reactionHistory = obj.reactionHistory || {};
  if (reactionId !== "Reaction.FieldPulse" && obj.reactionHistory[reactionId] && obj.id !== "warden") return false;
  obj.reactionHistory[reactionId] = (obj.reactionHistory[reactionId] || 0) + 1;
  state.metrics.reactions += 1;
  state.metrics.reactionCounts[historyKey] += 1;

  if (reactionId === "Reaction.SteamBurst") {
    if (zone().id === "Z4") state.flags.steamBurst = true;
    obj.currentTags = obj.currentTags.filter((id) => id !== "Semantic.Medium.Wet");
    applyReactionHpDamage(obj, 12);
    if (enemyIntent(obj) && !enemyOpening(obj)) finishEnemyBeat(obj, "stagger");
    triggerVisualRipple(reactionId, obj.id);
    audio.playSfx("reaction");
    triggerScreenShake("medium");
    if (obj.id === "warden") reduceBossShield(obj, "蒸汽爆发撕开第一层护文。", reactionId);
    log("触发组合反应：蒸汽爆发。", "good");
    return true;
  }

  if (reactionId === "Reaction.FractureWindow") {
    obj.fractureWindow = true;
    triggerVisualRipple(reactionId, obj.id);
    audio.playSfx("reaction");
    triggerScreenShake("medium");
    log("触发组合反应：破裂窗口。下一次重击会造成高额破坏。", "good");
    return true;
  }

  if (reactionId === "Reaction.FieldPulse") {
    applyReactionHpDamage(obj, 8);
    triggerVisualRipple(reactionId, obj.id);
    audio.playSfx("reaction");
    triggerScreenShake("medium");
    if (obj.id === "warden") reduceBossShield(obj, "力场震荡打散第三层护文。", reactionId);
    if (zone().id === "Z5" && obj.id === "debris") {
      state.flags.fieldPulse = true;
      state.flags.debrisGathered = true;
      state.flags.bridgeFormed = true;
      log("相反力场在碎片内部坍缩并弹开，桥面一次成形。", "good", "alternate-route");
    }
    log("触发组合反应：力场震荡。", "good");
    return true;
  }

  return false;
}

function reduceBossShield(obj, reason, reactionId) {
  if (obj.shieldLayers > 0) {
    const expectedCounter = bossExpectedCounter(obj);
    if (expectedCounter !== reactionId) {
      log(`当前护文不响应该反应，需要${reactionName(expectedCounter)}。`, "warn");
      return false;
    }
    obj.shieldLayers -= 1;
    state.metrics.bossPhaseCounters.push({
      layerAfter: obj.shieldLayers,
      reaction: reactionId,
      t: elapsedSeconds()
    });
    const recovered = restoreInk(5, inkForRewrites(BOSS_COUNTERS[obj.shieldLayers].tags));
    log(reason, "good");
    if (recovered > 0) log(`护文碎片回流，恢复 ${recovered} 点原墨。`, "good");
    if (obj.shieldLayers === 0) {
      obj.lockedSlots = obj.lockedSlots.filter((slot) => slot !== "Structure");
      log("残章守卫结构槽开放。", "good");
    }
    return true;
  }
  return false;
}

function restoreBossGuardedStructure(obj) {
  if (obj.id !== "warden" || obj.shieldLayers <= 0) return;
  obj.currentTags = obj.currentTags.filter((item) => tag(item)?.slot !== "Structure" && item !== "Semantic.Temperature.Frozen");
  obj.currentTags.push("Semantic.Structure.Solid");
  if (!obj.lockedSlots.includes("Structure")) obj.lockedSlots.push("Structure");
  log("残章守卫结构护文重新闭合，冻结裂隙消散。", "good");
}

function finishGateOpening() {
  saveAndRender();
  if (!runIsFailed()) {
    setInspectorOpen(false);
    el.sceneMap.querySelector('[data-object-id="gate"]')?.focus({ preventScroll: true });
  }
}

const ENEMY_INTENTS = {
  sweep: { id: "sweep", name: "横扫", ink: 2, defense: "parry" },
  brace: { id: "brace", name: "架盾", ink: 0, defense: "" },
  charge: { id: "charge", name: "蓄力冲撞", ink: 4, defense: "sidestep" },
  tail: { id: "tail", name: "热刺甩尾", ink: 2, defense: "parry" }
};
const ENEMY_OPENINGS = {
  parry: "弹反破绽",
  sidestep: "冲撞落空",
  stagger: "敌人失衡"
};

function enemyIntent(obj) {
  if (obj?.type !== "Enemy" || obj.defeated) return null;
  if (obj.id === "beast") {
    return obj.combatBeat !== 1 && hasTag(obj, "Semantic.Mass.Heavy") ? ENEMY_INTENTS.charge : ENEMY_INTENTS.tail;
  }
  if (obj.id === "guardA" && obj.combatBeat === 1 && hasTag(obj, "Semantic.Structure.Solid")) return ENEMY_INTENTS.brace;
  return ENEMY_INTENTS.sweep;
}

function enemyOpening(obj) {
  return obj?.type === "Enemy" && !obj.defeated ? obj.combatOpening || "" : "";
}

function canKnockFromGallery(obj) {
  return zone().id === "Z3" && Boolean(enemyIntent(obj)) && hasTag(obj, "Semantic.Mass.Light");
}

function enemyStructureGuarded(obj, tagId) {
  return Boolean(enemyIntent(obj) && !enemyOpening(obj) && tag(tagId)?.slot === "Structure");
}

function finishEnemyBeat(obj, opening = "") {
  obj.combatBeat = obj.combatBeat === 1 ? 0 : 1;
  obj.combatOpening = opening;
  obj.breach = Boolean(opening);
}

function resolveEnemyStrike(obj, intent, opening) {
  obj.combatOpening = "";
  obj.breach = false;
  if (obj.defeated || opening) return;
  if (intent.id === "brace") {
    finishEnemyBeat(obj, "stagger");
    log("重击打偏盾面，露出甲片的接缝。", "good", "combat-opening");
    return;
  }
  const loss = Math.min(intent.ink, state.ink);
  state.ink -= loss;
  finishEnemyBeat(obj);
  log(loss ? `${obj.name} 以${intent.name}反击，损失 ${loss} 原墨。` : `${obj.name} 的${intent.name}掠过已干的墨池。`, "info", "counterattack");
}

function strikePower(obj) {
  let damage = 16;
  if (hasTag(obj, "Semantic.Structure.Fragile")) damage *= 1.8;
  if (hasTag(obj, "Semantic.Structure.Solid")) damage *= 0.55;
  if (obj.fractureWindow) damage *= 2.5;
  if (enemyOpening(obj) === "parry") damage *= 1.5;
  return damage;
}

function heavyStrike() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  if (!obj) return log("先选择目标。", "warn");
  state.metrics.heavyStrikes += 1;
  if (obj.id === "gate" && !zone().complete(state) && hasTag(obj, "Semantic.Structure.Fragile")) {
    obj.destroyed = true;
    state.flags.gateDestroyed = true;
    audio.playSfx("success");
    spawnFloatingDamage("击碎", "gate", true);
    triggerScreenShake("heavy");
    log("封文散开，门后亮起了灯。", "good");
    advanceThreat(6, "重击");
    return finishGateOpening();
  }
  if (obj.hp != null && !obj.defeated) {
    const damage = strikePower(obj);
    const intent = enemyIntent(obj);
    const opening = enemyOpening(obj);
    const hadFractureWindow = Boolean(obj.fractureWindow);
    if (obj.fractureWindow) {
      obj.fractureWindow = false;
      log("破裂窗口被重击引爆。", "good");
    }
    obj.breach = true;
    if (obj.id === "warden" && hadFractureWindow && obj.shieldLayers > 0) {
      const reduced = reduceBossShield(obj, "冻结裂隙被重击扩开，第二层护文破碎。", "Reaction.FractureWindow");
      if (reduced) restoreBossGuardedStructure(obj);
    }
    const guardedCore = obj.id === "warden" && (obj.shieldLayers > 0 || !hasTag(obj, "Semantic.Structure.Fragile"));
    const previousHp = obj.hp;
    const fell = canKnockFromGallery(obj);
    obj.hp = Math.max(guardedCore ? 1 : 0, Math.round(obj.hp - damage));
    if ((obj.id === "warden" && !guardedCore) || fell) obj.hp = 0;
    if (fell) obj.fell = true;
    const landedDamage = previousHp - obj.hp;
    const impact = fell || landedDamage > 16 || hadFractureWindow;

    audio.playSfx("strike");
    spawnFloatingDamage(fell ? localizeText("击落") : landedDamage, obj.id, impact);
    triggerScreenShake(impact ? "heavy" : "medium");

    if (!fell) log(`重击命中 ${obj.name}，造成 ${landedDamage} 点伤害。`, "good");
    if (guardedCore && obj.hp === 1) log("护文仍在保护核心：完成反制，写入脆弱后再重击。", "warn", "boss-core-guarded");
    if (obj.hp === 0) defeatObject(obj);
    if (intent) resolveEnemyStrike(obj, intent, opening);
    advanceThreat(6, "重击");
    return saveAndRender();
  }
  audio.playSfx("error");
  log("重击没有产生关键效果。", "warn");
  render();
}

function parry() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  const availability = canParry();
  if (!availability.enabled) return log(availability.reason, "warn");
  state.metrics.parries += 1;
  if (obj.id === "warden") {
    audio.playSfx("parry");
    log("水膜折回火浪，守卫被蒸汽吞没。", "good");
    triggerReaction(obj, "Reaction.SteamBurst");
    advanceThreat(4, "弹反");
    return saveAndRender();
  }
  obj.breach = true;
  obj.scanned = true;
  const intent = enemyIntent(obj);
  if (intent) finishEnemyBeat(obj, "parry");
  audio.playSfx("parry");
  spawnFloatingDamage(localizeText("弹反"), obj.id, false, true);
  triggerScreenShake("medium");
  log(intent ? `弹开${intent.name}，破绽已开。可以改写甲片，或用重击反打。` : `完美弹反 ${obj.name}，语义破绽打开。`, "good");
  advanceThreat(4, "弹反");
  saveAndRender();
}

function sidestep() {
  if (actionBlockedByRun()) return;
  const availability = canSidestep();
  if (!availability.enabled) return;
  const obj = selectedObject();
  state.metrics.sidesteps += 1;
  obj.scanned = true;
  finishEnemyBeat(obj, "sidestep");
  audio.playSfx("parry");
  spawnFloatingDamage(localizeText("避开"), obj.id, false, true);
  log("冲撞擦身而过。缀刺兽露出破绽，下一击不会被反击。", "good", "combat-opening");
  advanceThreat(3, "侧闪");
  saveAndRender();
}

function moveBlock() {
  if (actionBlockedByRun()) return;
  const obj = selectedObject();
  if (!obj || obj.id !== "block") return log("选择压机关石。", "warn");
  if (!obj.currentTags.includes("Semantic.Mass.Light")) return log("石头太沉，先写入“轻盈”。", "warn");
  state.flags.blockMoved = true;
  log("压机关石被推到机关板上。", "good");
  advanceThreat(3, "推动机关");
  saveAndRender();
}

function pressPlate() {
  if (actionBlockedByRun() || state.flags.platePressed) return;
  const obj = selectedObject();
  if (!obj || obj.id !== "block") return log("选择压机关石。", "warn");
  if (!state.flags.blockMoved) return log("先把石头推到机关板。", "warn");
  if (!obj.currentTags.includes("Semantic.Mass.Heavy")) return log("机关需要重量，给石头恢复“沉重”。", "warn");
  state.flags.platePressed = true;
  log("机关板被压住，出口栅门打开。", "good");
  advanceThreat(3, "启动机关");
  saveAndRender();
}

function gatherDebris() {
  if (actionBlockedByRun()) return;
  if (zone().id !== "Z5") return;
  const obj = selectedObject();
  if (!obj || obj.id !== "pullPillar") return log("选择吸引力场柱。", "warn");
  if (!obj.currentTags.includes("Semantic.Field.Attract")) return log("力场柱当前不是“吸引”。", "warn");
  state.flags.debrisGathered = true;
  log("碎片被吸引到桥中央。", "good");
  advanceThreat(3, "聚拢碎片");
  saveAndRender();
}

function formBridge() {
  if (actionBlockedByRun()) return;
  if (zone().id !== "Z5") return;
  const obj = selectedObject();
  if (!obj || obj.id !== "pushPillar") return log("选择排斥力场柱。", "warn");
  if (!obj.currentTags.includes("Semantic.Field.Repel") && !state.flags.fieldPulse) return log("需要“排斥”或力场震荡把碎片推入锚点。", "warn");
  if (!state.flags.debrisGathered && !state.flags.fieldPulse) return log("先聚拢碎片，或者触发力场震荡。", "warn");
  state.flags.bridgeFormed = true;
  log("碎片进入锚点，临时桥面形成。", "good");
  advanceThreat(3, "形成桥面");
  saveAndRender();
}

function canChooseTravelWord() {
  const next = state.zones[state.zone + 1];
  return Boolean(next && next.id !== "Z7" && !isCompleted() && !runIsFailed() &&
    !state.unlockedZones.includes(next.id) && zone().complete(state));
}

function chooseTravelWord(tagId) {
  if (!canChooseTravelWord() || (tagId && !hasInventory(tagId))) return;
  state.travelWord = tagId;
  saveAndRender();
}

function proceedFromZone() {
  if (canChooseTravelWord() && state.inventory.length && !hasInventory(state.travelWord)) {
    el.travelLoadout.querySelector("button")?.focus();
    return;
  }
  nextZone();
}

function nextZone() {
  if (runIsFailed() || isCompleted()) return;
  if (!zone().complete(state)) return log("当前目标还没完成。", "warn");
  if (isFinalZone()) return log("切片已经完成。", "good");
  if (state.unlockedZones.includes(state.zones[state.zone + 1].id)) {
    return travelToZone(state.zone + 1);
  }
  awardZoneMastery();
  if (!state.metrics.zoneCompletions.some((item) => item.zone === zone().id)) {
    state.metrics.zoneCompletions.push({ zone: zone().id, t: elapsedSeconds() });
  }
  recordZoneDuration("complete");
  if (state.zone < state.zones.length - 1) {
    const carried = canChooseTravelWord() && hasInventory(state.travelWord) ? state.travelWord : "";
    if (carried) state.metrics.wordCrossings.push({ from: zone().id, to: state.zones[state.zone + 1].id, tagId: carried });
    state.zone += 1;
    state.selectedObjectId = null;
    state.selectedTagId = null;
    state.selectedInventoryIndex = carried ? 0 : null;
    state.inventory = carried ? [carried] : [];
    state.travelWord = "";
    state.undoStack = [];
    restoreInk(4, minimumEntryInk(zone().id));
    recoverThreatOnAdvance();
    
    // Unlock next zone in progression
    const nextZoneId = zone().id;
    if (state.unlockedZones && !state.unlockedZones.includes(nextZoneId)) {
      state.unlockedZones.push(nextZoneId);
    }
    
    const zoneId = zone().id;
    state.metrics.zoneVisits[zoneId] = (state.metrics.zoneVisits[zoneId] || 0) + 1;
    state.mastery.zoneMistakeBaseline[zoneId] = state.metrics.warnings + state.metrics.blockedActions;
    if (isFinalZone()) {
      state.metrics.completedAt = elapsedSeconds();
      finalizeRunProgression();
    }
    saveZoneCheckpoint(`${zone().id}入口检查点`);
    setInspectorOpen(false);
    audio.playSfx("success");
    const crossing = carried ? `带来了「${tagName(carried)}」，其余词缀已归档。` : "临时词库已归档。";
    log(`进入 ${zone().id}：${zone().name}。原墨已补给。${crossing}`, "good");
    saveAndRender();
  }
}

function canTravelToZone(index) {
  return index === state.zone || state.unlockedZones.includes(state.zones[index].id) ||
    (index === state.zone + 1 && !runIsFailed() && zone().complete(state));
}

function travelToZone(index) {
  if (!canTravelToZone(index) || index === state.zone) return;
  if (!state.unlockedZones.includes(state.zones[index].id)) return proceedFromZone();
  if (!isCompleted()) recordZoneDuration("manual-switch");
  state.zone = index;
  state.selectedObjectId = null;
  state.selectedTagId = null;
  state.selectedInventoryIndex = null;
  state.undoStack = [];
  setInspectorOpen(false);
  if (!isCompleted()) {
    state.metrics.zoneVisits[zone().id] = (state.metrics.zoneVisits[zone().id] || 0) + 1;
    state.metrics.zoneVisitStartSec = elapsedSeconds();
  }
  saveAndRender();
}

function resetGame() {
  const mode = state.testMode;
  state.sessionId = createSessionId();
  state.zone = 0;
  state.testMode = mode;
  state.run = PROGRESSION.createRun(state.profile, mode);
  state.maxInk = PROGRESSION.maxInk(state.profile, state.run);
  state.ink = state.maxInk;
  state.inventory = [];
  state.travelWord = "";
  state.selectedObjectId = null;
  state.selectedTagId = null;
  state.selectedInventoryIndex = null;
  state.zones = freshZones();
  state.flags = {};
  state.unlockedZones = ["Z1"];
  state.metrics = createMetrics(mode);
  state.undoStack = [];
  state.checkpoints = {};
  state.mastery = {
    earned: {},
    zoneMistakeBaseline: { Z1: 0 }
  };
  state.log = [];
  state.lastFeedback = null;
  state.completionSfxPlayed = false;
  setInspectorOpen(false);
  log("已回到庭院入口。", "good");
  saveZoneCheckpoint("Z1入口检查点");
  saveAndRender();
}

function refillInk() {
  if (actionBlockedByRun()) return;
  state.ink = state.maxInk;
  state.metrics.debugRecoveries += 1;
  log("原墨已补满。", "good");
  saveAndRender();
}

function resetCurrentZone() {
  if (actionBlockedByRun()) return;
  const zoneIndex = state.zone;
  recordZoneDuration("reset");
  state.zones[zoneIndex] = {
    ...ZONES[zoneIndex],
    objects: ZONES[zoneIndex].objects.map((item) => structuredClone(item))
  };
  Object.keys(state.flags).forEach((key) => {
    if (zoneFlagBelongsToCurrentZone(key)) delete state.flags[key];
  });
  state.selectedObjectId = null;
  state.selectedTagId = null;
  state.selectedInventoryIndex = null;
  state.undoStack = [];
  state.metrics.debugRecoveries += 1;
  state.metrics.zoneVisits[zone().id] = (state.metrics.zoneVisits[zone().id] || 0) + 1;
  state.metrics.zoneVisitStartSec = elapsedSeconds();
  saveZoneCheckpoint(`${zone().id}重置检查点`);
  log(`已重新布置${zone().name}。`, "good");
  saveAndRender();
}

function zoneFlagBelongsToCurrentZone(key) {
  const flagMap = {
    Z1: ["gateDestroyed", "gateUnsealed"],
    Z2: ["blockMoved", "platePressed", "tabletDropped"],
    Z4: ["liftMelted", "steamBurst", "icePath"],
    Z5: ["debrisGathered", "bridgeFormed", "fieldPulse"],
    Z6: ["bossDefeated"]
  };
  return (flagMap[zone().id] || []).includes(key);
}

function slotName(slot) {
  return {
    Structure: "结构槽",
    Mass: "质量槽",
    Temperature: "温度槽",
    Medium: "介质槽",
    Field: "力场槽"
  }[slot] || slot;
}

function objectTypeName(type) {
  return {
    Door: "门",
    Stone: "石质对象",
    Mechanism: "机关",
    Enemy: "敌人",
    Boss: "守卫",
    Water: "水体",
    FireSource: "火源",
    FieldPillar: "力场柱",
    Debris: "碎片"
  }[type] || type;
}

function objectById(id) {
  return zoneObjects().find((item) => item.id === id) || null;
}

function hasInventory(tagId) {
  return state.inventory.includes(tagId);
}

function hasTag(obj, tagId) {
  return Boolean(obj?.currentTags.includes(tagId));
}

function canTakeVisibleTag(obj, tagId) {
  return Boolean(obj?.currentTags.includes(tagId));
}

function reactionName(reactionId) {
  return REACTION_DISCOVERIES.find((item) => `Reaction.${item.key}` === reactionId)?.name || reactionId;
}

function reactionMetricKey(reactionId) {
  return reactionId.replace(/^Reaction\./, "");
}

function bossExpectedCounter(obj = objectById("warden")) {
  return obj?.id === "warden" ? BOSS_COUNTERS[obj.shieldLayers]?.reaction || "" : "";
}

function bossCounterHint(obj = objectById("warden")) {
  return BOSS_COUNTERS[obj?.shieldLayers ?? 0].hint;
}

function bossAllowsPhaseStructureWrite(obj, tagId) {
  return Boolean(
    obj?.id === "warden" &&
    obj.shieldLayers === 2 &&
    tagId === "Semantic.Structure.Fragile" &&
    hasTag(obj, "Semantic.Temperature.Frozen")
  );
}

function slotLockedForTag(obj, tagId) {
  const def = tag(tagId);
  if (!def) return false;
  return obj.lockedSlots.includes(def.slot) && !bossAllowsPhaseStructureWrite(obj, tagId);
}

function fieldCollisionReaction(obj, incomingTagId) {
  if (!obj || tag(incomingTagId)?.slot !== "Field") return "";
  if (incomingTagId === "Semantic.Field.Attract" && hasTag(obj, "Semantic.Field.Repel")) return "Reaction.FieldPulse";
  if (incomingTagId === "Semantic.Field.Repel" && hasTag(obj, "Semantic.Field.Attract")) return "Reaction.FieldPulse";
  return "";
}

function action(label, fn, cls, actionState, group = "语义") {
  return { label, fn, cls, state: actionState, group };
}

function allowed(enabled, reason) {
  return { enabled, reason };
}

function canScan() {
  const obj = selectedObject();
  if (!obj) return allowed(false, "先选择一个对象。");
  if (obj.fell) return allowed(false, "目标已坠落，无法接近。");
  if (obj.scanned) return allowed(false, `${obj.name} 已扫描。`);
  return allowed(true, `扫描 ${obj.name}`);
}

function canExtract(obj = selectedObject(), tagId = state.selectedTagId) {
  if (isRevisiting()) return allowed(false, "回访时仅可查看对象。");
  if (!obj) return allowed(false, "先选择对象。");
  if (obj.fell) return allowed(false, "目标已坠落，无法接近。");
  if (obj.id === "gate" && zone().complete(state)) return allowed(false, "石门已经打开。");
  if (!obj.scanned) return allowed(false, "先扫描目标。");
  if (!tagId) return allowed(false, "先点选目标身上的词缀。");
  const mechanicHint = z5MechanicHint(obj);
  if (mechanicHint) return allowed(false, mechanicHint);
  if (state.inventory.length >= inventoryCapacity()) return allowed(false, "临时词库已满。");
  const def = tag(tagId);
  if (!def) return allowed(false, "未知词缀。");
  if (state.ink < extractCost(def)) return allowed(false, "原墨不足。");
  if (!canTakeVisibleTag(obj, tagId)) return allowed(false, "目标当前没有这个可剥离词缀。");
  if (enemyStructureGuarded(obj, tagId)) return allowed(false, "结构槽未暴露，先打出破绽。");
  return allowed(true, `消耗${extractCost(def)}原墨剥离“${def.name}”。`);
}

function canInject() {
  if (isRevisiting() || selectedObject()?.fell) return allowed(false, "当前目标无法改写。");
  const obj = selectedObject();
  const tagId = state.inventory[state.selectedInventoryIndex];
  if (!obj) return allowed(false, "先选择注入目标。");
  if (obj.id === "gate" && zone().complete(state)) return allowed(false, "石门已经打开。");
  if (!obj.scanned) return allowed(false, "先扫描目标。");
  if (!tagId) return allowed(false, "先选择词库中的词缀。");
  const def = tag(tagId);
  if (!obj.openSlots.includes(def.slot)) return allowed(false, `${obj.name} 没有${slotName(def.slot)}。`);
  if (slotLockedForTag(obj, tagId)) return allowed(false, `${slotName(def.slot)}被锁定。`);
  if (enemyStructureGuarded(obj, tagId)) return allowed(false, "结构槽未暴露，先打出破绽。");
  if (!def.compatible.includes(obj.type)) return allowed(false, `“${def.name}”不能作用于${objectTypeName(obj.type)}。`);
  if (state.ink < injectCost(def)) return allowed(false, "原墨不足。");
  return allowed(true, `消耗${injectCost(def)}原墨注入“${def.name}”。`);
}

function canHeavyStrike() {
  const obj = selectedObject();
  if (!obj) return allowed(false, "先选择目标。");
  if (obj.id === "gate" && hasTag(obj, "Semantic.Structure.Fragile") && !zone().complete(state)) return allowed(true, "击碎已经脆弱的大门。");
  if (canKnockFromGallery(obj)) return allowed(true, "重击会将轻盈的游兵击离断廊。");
  const intent = enemyIntent(obj);
  if (intent) {
    const damage = Math.min(obj.hp, obj.hp - Math.round(obj.hp - strikePower(obj)));
    const inkLoss = Math.min(intent.ink, state.ink);
    let consequence = inkLoss ? `若未击倒敌人，${intent.name}会让你损失 ${inkLoss} 原墨。` : "";
    if (intent.id === "brace") consequence = "可撞开架盾，露出破绽。";
    if (enemyOpening(obj)) consequence = "趁破绽出手，不会被反击。";
    return allowed(true, obj.scanned
      ? `预计造成 ${damage} 点伤害。${damage < obj.hp ? consequence : "足以击倒目标。"}`
      : `重击试探防御。${consequence}`);
  }
  if (obj.hp != null && !obj.defeated) return allowed(true, "造成伤害并打开破绽。");
  return allowed(false, "当前目标不需要重击。");
}

function canParry() {
  const obj = selectedObject();
  if (!obj || obj.hp == null || obj.defeated) return allowed(false, "先选择仍在战斗的敌人。");
  if (obj.id === "warden") {
    const ready = obj.shieldLayers === 3 && hasTag(obj, "Semantic.Medium.Wet");
    return allowed(ready, ready ? "以水膜反射火浪，触发蒸汽反应。" : "第一层护文的火浪可用水膜反射。");
  }
  if (enemyOpening(obj)) return allowed(false, "破绽已经打开。下次重击会结束这个窗口。");
  const intent = enemyIntent(obj);
  if (intent?.id === "brace") return allowed(false, "敌人正在架盾，没有招式可以弹反。");
  if (intent?.defense === "sidestep") return allowed(false, "冲撞不能弹反，可以侧闪避开。");
  return allowed(true, intent ? `弹开${intent.name}。可改写结构，下次重击增伤且不会遭反击。` : "弹开守卫的攻势。");
}

function canSidestep() {
  const obj = selectedObject();
  if (!enemyOpening(obj) && enemyIntent(obj)?.defense === "sidestep") {
    return allowed(true, "避开冲撞。下次重击不会遭反击。");
  }
  return allowed(false, "仅用于避开冲撞。");
}

function canMoveBlock() {
  const obj = selectedObject();
  if (zone().id !== "Z2") return allowed(false, "当前区域不需要推动石块。");
  if (!obj || obj.id !== "block") return allowed(false, "选择压机关石。");
  if (!hasTag(obj, "Semantic.Mass.Light")) return allowed(false, "先把石头变轻。");
  if (state.flags.blockMoved) return allowed(false, "石头已经在机关板上。");
  return allowed(true, "推动轻盈石块。");
}

function canPressPlate() {
  const obj = selectedObject();
  if (zone().id !== "Z2") return allowed(false, "当前区域没有机关板操作。");
  if (!obj || obj.id !== "block") return allowed(false, "选择压机关石。");
  if (!state.flags.blockMoved) return allowed(false, "先推动石块。");
  if (!hasTag(obj, "Semantic.Mass.Heavy")) return allowed(false, "机关需要沉重。");
  if (state.flags.platePressed) return allowed(false, "机关已经打开。");
  return allowed(true, "压住机关板。");
}

function canGatherDebris() {
  const obj = selectedObject();
  if (zone().id !== "Z5") return allowed(false, "当前区域没有碎桥。");
  if (!obj || obj.id !== "pullPillar") return allowed(false, "选择吸引力场柱。");
  if (!hasTag(obj, "Semantic.Field.Attract")) return allowed(false, "力场柱需要吸引。");
  if (state.flags.debrisGathered) return allowed(false, "碎片已经聚拢。");
  return allowed(true, "把碎片拉到桥中央。");
}

function canFormBridge() {
  const obj = selectedObject();
  if (zone().id !== "Z5") return allowed(false, "当前区域没有碎桥。");
  if (!obj || obj.id !== "pushPillar") return allowed(false, "选择排斥力场柱。");
  if (!state.flags.debrisGathered && !state.flags.fieldPulse) return allowed(false, "先聚拢碎片。");
  if (!hasTag(obj, "Semantic.Field.Repel") && !state.flags.fieldPulse) return allowed(false, "需要排斥或力场震荡。");
  if (state.flags.bridgeFormed) return allowed(false, "桥面已经形成。");
  return allowed(true, "把碎片推入锚点。");
}

function z5MechanicHint(obj = selectedObject()) {
  if (zone().id !== "Z5" || !obj?.scanned) return "";
  if (usesLowGuidance()) return "";
  if (obj.id === "pullPillar" && !state.flags.debrisGathered) return "这是碎桥机关的吸引端：先用“聚拢碎片”驱动桥面，不需要把力场词当普通词源剥离。";
  if (obj.id === "pushPillar" && state.flags.debrisGathered && !state.flags.bridgeFormed) return "这是碎桥机关的排斥端：先用“形成桥面”把碎片推入锚点，不需要把力场词当普通词源剥离。";
  return "";
}

function nextHint() {
  if (usesLowGuidance()) return lowGuidance();
  if (isFinalZone()) return "本轮已完成，可在通关总结中回看旅程。";
  if (zone().complete(state)) return "当前目标已达成，进入下一区域。";

  const z = zone().id;
  const obj = selectedObject();
  if (obj && !obj.scanned) return `扫描 ${obj.name}，确认它的词缀和槽位。`;

  if (z === "Z1") {
    const gate = objectById("gate");
    const statue = objectById("statue");
    if (obj?.id === "gate" && hasTag(gate, "Semantic.Structure.Closed") && !hasInventory("Semantic.Structure.Fragile")) {
      return "剥离「封闭」能完整打开石门。原墨少时，可以从石像取「脆弱」来破门。";
    }
    if (!hasInventory("Semantic.Structure.Fragile") && !hasTag(gate, "Semantic.Structure.Fragile")) {
      return statue?.scanned ? "点选“脆弱”，剥离到临时词库。" : "选择裂纹石像并扫描，找到“脆弱”。";
    }
    if (!hasTag(gate, "Semantic.Structure.Fragile")) {
      return gate?.scanned ? "选择词库里的“脆弱”，注入封文大门。" : "选择封文大门并扫描，确认结构槽。";
    }
    return "重击封文大门，完成第一段。";
  }

  if (z === "Z2") {
    const block = objectById("block");
    const tablet = objectById("tablet");
    if (obj?.id === "plate") return "机关板有质量槽。它自身也可以变重。";
    if (!state.flags.blockMoved) {
      if (!hasTag(block, "Semantic.Mass.Light")) {
        if (!hasInventory("Semantic.Mass.Light")) return tablet?.scanned ? "从浮字碑剥离“轻盈”。" : "选择浮字碑并扫描，获取“轻盈”。";
        return block?.scanned ? "选择词库里的“轻盈”，注入压机关石。" : "选择压机关石并扫描。";
      }
      return "推动变轻的压机关石。";
    }
    if (!hasTag(block, "Semantic.Mass.Heavy")) {
      if (hasInventory("Semantic.Mass.Heavy")) return "选择词库里的“沉重”，写回压机关石。";
      return "把质量槽替换时，旧词会回流；需要找回“沉重”。";
    }
    return "压住机关板，打开出口。";
  }

  if (z === "Z3") {
    const target = zoneObjects().find((item) => item.hp != null && !item.defeated);
    if (!target) return "敌人已清理，进入下一区域。";
    if (state.selectedObjectId !== target.id) return `选择 ${target.name}。`;
    if (!enemyOpening(target)) {
      return enemyIntent(target)?.id === "brace" ? "盾面已经抬起，用重击撞开它。" : "可以弹开横扫，或冒着反击的风险先重击。";
    }
    if (hasTag(target, "Semantic.Structure.Solid")) return "趁破绽取下「坚固」，再重击。";
    return "重击敌人，利用破绽击败它。";
  }

  if (z === "Z4") {
    const lift = objectById("lift");
    const brazier = objectById("brazier");
    const pool = objectById("pool");
    const beast = objectById("beast");
    if (!state.flags.liftMelted) {
      if (!hasInventory("Semantic.Temperature.Overheated")) return brazier?.scanned ? "从火盆剥离“过热”。" : "选择火盆并扫描，获取“过热”。";
      return lift?.scanned ? "把“过热”注入冰封升降台。" : "选择冰封升降台并扫描。";
    }
    if (!state.flags.steamBurst) {
      if (obj?.id === "beast" && !hasInventory("Semantic.Medium.Wet")) return "冲撞可侧闪，甩尾可弹反；也可借水汽避战。";
      if (!hasInventory("Semantic.Medium.Wet")) return pool?.scanned ? "从冻结水池剥离“潮湿”。" : "选择冻结水池并扫描，获取“潮湿”。";
      return beast?.scanned ? "把“潮湿”注入带“过热”的缀刺兽，触发蒸汽爆发。" : "选择缀刺兽并扫描。";
    }
  }

  if (z === "Z5") {
    if (!state.flags.debrisGathered) return "选择吸引力场柱，扫描后聚拢碎片。";
    return "选择排斥力场柱，扫描后形成桥面。";
  }

  if (z === "Z6") {
    const warden = objectById("warden");
    const bossFire = objectById("bossFire");
    const bossPool = objectById("bossPool");
    const bossIce = objectById("bossIce");
    const bossPull = objectById("bossPull");
    const bossPush = objectById("bossPush");
    const bossTablet = objectById("bossTablet");
    if (warden?.shieldLayers === 3) {
      if (!hasTag(warden, "Semantic.Temperature.Overheated")) {
        if (!hasInventory("Semantic.Temperature.Overheated")) return bossFire?.scanned ? "从过热火盆剥离“过热”。" : "选择过热火盆并扫描。";
        return warden?.scanned ? "把“过热”注入残章守卫。" : "选择残章守卫并扫描。";
      }
      if (!hasInventory("Semantic.Medium.Wet")) return bossPool?.scanned ? "从潮湿水纹剥离“潮湿”。" : "选择潮湿水纹并扫描。";
      return "把“潮湿”注入过热的残章守卫，触发蒸汽爆发。";
    }
    if (warden?.shieldLayers === 2) {
      if (!hasTag(warden, "Semantic.Temperature.Frozen")) {
        if (!hasInventory("Semantic.Temperature.Frozen")) return bossIce?.scanned ? "从冻结残页剥离“冻结”。" : "选择冻结残页并扫描。";
        return warden?.scanned ? "把“冻结”注入残章守卫，让第二层护文显露裂隙。" : "选择残章守卫并扫描。";
      }
      if (!hasTag(warden, "Semantic.Structure.Fragile")) {
        if (!hasInventory("Semantic.Structure.Fragile")) return bossTablet?.scanned ? "从裂纹石碑剥离“脆弱”。" : "选择裂纹石碑并扫描。";
        return "把“脆弱”写入结霜裂隙，触发破裂窗口。";
      }
      return "重击残章守卫，打穿第二层护文。";
    }
    if (warden?.shieldLayers === 1) {
      const hasAnyField = hasTag(warden, "Semantic.Field.Attract") || hasTag(warden, "Semantic.Field.Repel");
      const hasAttract = hasTag(warden, "Semantic.Field.Attract");
      const hasRepel = hasTag(warden, "Semantic.Field.Repel");
      if (!hasAnyField) {
        if (!hasInventory("Semantic.Field.Attract")) return bossPull?.scanned ? "从吸引残柱剥离“吸引”。" : "选择吸引残柱并扫描。";
        return warden?.scanned ? "把“吸引”注入残章守卫，准备力场碰撞。" : "选择残章守卫并扫描。";
      }
      if (hasAttract && !hasInventory("Semantic.Field.Repel")) return bossPush?.scanned ? "从排斥残柱剥离“排斥”。" : "选择排斥残柱并扫描。";
      if (hasRepel && !hasInventory("Semantic.Field.Attract")) return bossPull?.scanned ? "从吸引残柱剥离“吸引”。" : "选择吸引残柱并扫描。";
      return `把相反力场注入残章守卫，触发${reactionName("Reaction.FieldPulse")}。`;
    }
    if (!hasTag(warden, "Semantic.Structure.Fragile")) {
      if (!hasInventory("Semantic.Structure.Fragile")) return bossTablet?.scanned ? "从裂纹石碑剥离“脆弱”。" : "选择裂纹石碑并扫描。";
      return "把“脆弱”注入结构槽已开放的残章守卫。";
    }
    return "重击残章守卫核心，完成Boss战。";
  }

  return obj ? "根据扫描结果选择剥离、注入或攻击。" : "选择一个场景对象开始。";
}

function lowGuidance() {
  if (isFinalZone()) return "切片完成。";
  if (zone().complete(state)) return "目标已达成。";
  const obj = selectedObject();
  if (obj && !obj.scanned) return "扫描当前对象，确认词缀与槽位。";
  const guidance = {
    Z1: "寻找能改变结构强度的词缀。",
    Z2: "质量会同时影响移动和机关压力。",
    Z3: "战斗目标需要先暴露可改写窗口。",
    Z4: "温度和介质的组合会改变场面。",
    Z5: "力场方向决定碎片移动结果。",
    Z6: "Boss护文会轮换响应不同组合反应。",
    Z7: "查看结果并复盘路径。"
  };
  return guidance[zone().id] || "观察对象词缀和开放槽位。";
}

function zoneSteps() {
  const z = zone().id;
  if (z === "Z1") {
    return [
      step("调查石像或封文大门", objectById("statue")?.scanned || objectById("gate")?.scanned),
      step("移除封印或击碎石门", zone().complete(state))
    ];
  }
  if (z === "Z2") {
    return [
      step("调查石块、浮字碑或机关板", zoneObjects().some((item) => item.scanned)),
      step("让机关板下沉", state.flags.platePressed)
    ];
  }
  if (z === "Z3") {
    return [
      step("清退披甲游兵", objectById("guardA")?.defeated),
      step("清退裂甲游兵", objectById("guardB")?.defeated)
    ];
  }
  if (z === "Z4") {
    return [
      step("用过热融冰", state.flags.liftMelted),
      step("穿过守兽把守的通路", state.flags.icePath || state.flags.steamBurst || objectById("beast")?.defeated)
    ];
  }
  if (z === "Z5") {
    return [
      step("扫描吸引柱", objectById("pullPillar")?.scanned),
      step("聚拢碎片", state.flags.debrisGathered),
      step("形成桥面", state.flags.bridgeFormed)
    ];
  }
  if (z === "Z6") {
    const warden = objectById("warden");
    return [
      step("蒸汽撕开第一层", warden && warden.shieldLayers <= 2),
      step("冻裂打穿第二层", warden && warden.shieldLayers <= 1),
      step("力场震掉第三层", warden && warden.shieldLayers === 0),
      step("脆弱终结核心", state.flags.bossDefeated)
    ];
  }
  if (z === "Z7") {
    return [
      step("抵达修正文库", true),
      step("后期系统只读", true),
      step("等待试玩复盘", true)
    ];
  }
  return [];
}

function step(label, done) {
  return { label, done: Boolean(done) };
}

function activeStepIndex(steps) {
  const index = steps.findIndex((item) => !item.done);
  return index === -1 ? steps.length - 1 : index;
}

function decisionSummary() {
  const steps = zoneSteps();
  const activeStep = steps[activeStepIndex(steps)];
  const audit = currentAudit();
  const selected = selectedObject();
  const inventoryText = state.inventory.length
    ? state.inventory.map(tagName).join(" / ")
    : "空";
  const pressure = state.ink <= 3
    ? "原墨偏紧"
    : state.inventory.length >= inventoryCapacity()
      ? "词库已满"
      : "资源稳定";
  const targetText = selected
    ? `${selected.name}${selected.scanned ? "已读" : "待扫"}`
    : "未选目标";
  return [
    { label: "意图", value: activeStep?.label || "观察对象" },
    { label: "目标", value: targetText },
    { label: "资源", value: `${state.ink}/${state.maxInk} · ${inventoryText} · ${pressure}` },
    { label: "审计", value: audit.risks[0] || `${audit.grade} ${audit.score}` }
  ];
}

function recommendedObjectIds() {
  if (usesLowGuidance()) return [];
  const z = zone().id;
  if (zone().complete(state)) return [];
  if (z === "Z1") {
    if (!hasInventory("Semantic.Structure.Fragile") && !hasTag(objectById("gate"), "Semantic.Structure.Fragile")) return ["statue"];
    if (!hasTag(objectById("gate"), "Semantic.Structure.Fragile")) return ["gate"];
    return ["gate"];
  }
  if (z === "Z2") {
    const block = objectById("block");
    if (!state.flags.blockMoved && !hasTag(block, "Semantic.Mass.Light") && hasInventory("Semantic.Mass.Heavy")) return ["plate"];
    if (!state.flags.blockMoved && !hasTag(block, "Semantic.Mass.Light") && !hasInventory("Semantic.Mass.Light")) return ["tablet"];
    return ["block"];
  }
  if (z === "Z3") {
    const target = zoneObjects().find((item) => item.hp != null && !item.defeated);
    return target ? [target.id] : [];
  }
  if (z === "Z4") {
    if (!state.flags.liftMelted && !hasInventory("Semantic.Temperature.Overheated")) return ["brazier"];
    if (!state.flags.liftMelted) return ["lift"];
    if (!state.flags.steamBurst && !hasInventory("Semantic.Medium.Wet")) return ["pool"];
    if (!state.flags.steamBurst) return ["beast"];
  }
  if (z === "Z5") {
    if (!state.flags.debrisGathered) return ["pullPillar"];
    return ["pushPillar"];
  }
  if (z === "Z6") {
    const warden = objectById("warden");
    if (warden?.shieldLayers === 3) {
      if (!hasTag(warden, "Semantic.Temperature.Overheated") && !hasInventory("Semantic.Temperature.Overheated")) return ["bossFire"];
      if (!hasTag(warden, "Semantic.Temperature.Overheated")) return ["warden"];
      if (!hasInventory("Semantic.Medium.Wet")) return ["bossPool"];
      return ["warden"];
    }
    if (warden?.shieldLayers === 2) {
      if (!hasTag(warden, "Semantic.Temperature.Frozen") && !hasInventory("Semantic.Temperature.Frozen")) return ["bossIce"];
      if (!hasTag(warden, "Semantic.Temperature.Frozen")) return ["warden"];
      if (!hasTag(warden, "Semantic.Structure.Fragile") && !hasInventory("Semantic.Structure.Fragile")) return ["bossTablet"];
      if (!hasTag(warden, "Semantic.Structure.Fragile")) return ["warden"];
      return ["warden"];
    }
    if (warden?.shieldLayers === 1) {
      const hasAnyField = hasTag(warden, "Semantic.Field.Attract") || hasTag(warden, "Semantic.Field.Repel");
      const hasAttract = hasTag(warden, "Semantic.Field.Attract");
      const hasRepel = hasTag(warden, "Semantic.Field.Repel");
      if (!hasAnyField && !hasInventory("Semantic.Field.Attract")) return ["bossPull"];
      if (!hasAnyField) return ["warden"];
      if (hasAttract && !hasInventory("Semantic.Field.Repel")) return ["bossPush"];
      if (hasRepel && !hasInventory("Semantic.Field.Attract")) return ["bossPull"];
      return ["warden"];
    }
    if (!hasTag(warden, "Semantic.Structure.Fragile") && !hasInventory("Semantic.Structure.Fragile")) return ["bossTablet"];
    if (!hasTag(warden, "Semantic.Structure.Fragile")) return ["warden"];
    return ["warden"];
  }
  return [];
}

function objectCanAcceptSelectedInventory(obj) {
  const tagId = state.inventory[state.selectedInventoryIndex];
  if (!tagId || !obj) return false;
  const def = tag(tagId);
  return Boolean(!isRevisiting() && !obj.fell && obj.scanned && obj.openSlots.includes(def.slot) && !slotLockedForTag(obj, tagId) &&
    !enemyStructureGuarded(obj, tagId) && def.compatible.includes(obj.type));
}

function objectWriteReadiness(obj) {
  const tagId = state.inventory[state.selectedInventoryIndex];
  if (!tagId || !obj || isRevisiting() || obj.fell) return { status: "", label: "" };
  const def = tag(tagId);
  if (!obj.scanned) return { status: "needs-scan", label: "需扫描" };
  if (!obj.openSlots.includes(def.slot)) return { status: "blocked", label: "槽位不符" };
  if (slotLockedForTag(obj, tagId)) return { status: "blocked", label: "槽位锁定" };
  if (enemyStructureGuarded(obj, tagId)) return { status: "blocked", label: "破绽未开" };
  if (!def.compatible.includes(obj.type)) return { status: "blocked", label: "不可作用" };
  return { status: "compatible", label: "可写入" };
}

function objectStateLabel(obj, recommendedIds) {
  if (obj.fell) return "已坠落";
  if (obj.defeated) return "已击败";
  if (obj.id === "tablet" && state.flags.tabletDropped) return "已落在机关板上";
  if (obj.id === "pool" && state.flags.icePath) return "冰面可通行";
  if (obj.destroyed) return "已破坏";
  if (enemyOpening(obj)) return "破绽已开";
  const intent = enemyIntent(obj);
  if (intent) return intent.name;
  if (obj.id === "plate" && state.flags.platePressed) return "已压下";
  if (obj.id === "block" && state.flags.blockMoved) return "已就位";
  if (recommendedIds.includes(obj.id)) return "推荐目标";
  const readiness = objectWriteReadiness(obj);
  if (readiness.label) return readiness.label;
  if (!obj.scanned) return "可扫描";
  if (obj.providesTags.length) return obj.persistentSource ? "稳定词源" : "可取词";
  if (obj.hp != null) return obj.breach ? "破绽已开" : "可战斗";
  return "已读取";
}

function bossPhasePlanHtml(obj) {
  if (obj?.id !== "warden") return "";
  const low = usesLowGuidance();
  const phases = low
    ? [
      { layer: 3, label: "介质冲突", detail: "寻找会让护文过载的环境组合" },
      { layer: 2, label: "裂隙扩开", detail: "先显出裂隙，再用攻击扩开" },
      { layer: 1, label: "方向相撞", detail: "让相反方向在守卫身上冲突" }
    ]
    : [
      { layer: 3, label: "蒸汽", detail: "过热+潮湿" },
      { layer: 2, label: "冻裂", detail: "冻结+脆弱+重击" },
      { layer: 1, label: "力场", detail: "吸引+排斥" }
    ];
  const active = phases.find(phase => phase.layer === obj.shieldLayers);
  const items = phases.map(phase => {
    const done = obj.shieldLayers < phase.layer;
    return `<li class="${done ? "done" : ""}"${phase === active ? ' aria-current="step"' : ""}>
      ${done ? '<span aria-hidden="true">✓ </span><span class="sr-only">已完成</span>' : ""}${phase.label}
    </li>`;
  }).join("");
  const detail = active?.detail || (obj.defeated ? "守卫已被击败。" : "结构槽已开放。");
  return `<section class="boss-phase-plan" aria-label="守卫护文">
    <h4>护文 <span>${obj.shieldLayers} / 3</span></h4>
    <ol aria-label="护文反制顺序">${items}</ol><p>${detail}</p>
  </section>`;
}

function previewForSelectedObject() {
  const obj = selectedObject();
  if (!obj) return { tone: "", title: "未选择对象", lines: ["选择对象后，扫描器会显示可取词和写入预览。"] };
  if (!obj.scanned) return { tone: "warn", title: "需要扫描", lines: [`先扫描 ${obj.name}，再判断词缀和槽位。`] };

  const inventoryTag = state.inventory[state.selectedInventoryIndex];
  if (inventoryTag) {
    const preview = injectionPreview(obj, inventoryTag);
    if (!usesLowGuidance() || preview.tone === "bad") return preview;
    return {
      tone: "good",
      title: `写入检验：${tagName(inventoryTag)} -> ${obj.name}`,
      lines: ["槽位与对象兼容。写入后的具体结果需要亲自验证。"]
    };
  }
  const mechanicHint = z5MechanicHint(obj);
  if (mechanicHint && !state.selectedTagId) {
    return { tone: "warn", title: "机关解读", lines: [mechanicHint, "观察碎片是否向桥中央或锚点移动，再决定下一步。"] };
  }

  if (state.selectedTagId) {
    const def = tag(state.selectedTagId);
    if (!def) return { tone: "bad", title: "未知词缀", lines: ["这个词缀没有定义。"] };
    const canTake = canExtract();
    const lines = [
      `取词消耗：${extractCost(def)} 原墨。`,
      obj.persistentSource ? "这是稳定词源，剥离后不会耗尽。" : "剥离后会从目标身上移除该词缀。"
    ];
    if (!canTake.enabled) lines.unshift(canTake.reason);
    return { tone: canTake.enabled ? "good" : "bad", title: `剥离预览：${def.name}`, lines };
  }

  return { tone: "", title: "扫描结果", lines: ["点选目标身上的词缀可查看剥离预览；点选词库词缀可查看写入预览。"] };
}

function injectionPreview(obj, tagId) {
  const def = tag(tagId);
  const result = canInject();
  const lines = [];
  if (!result.enabled) {
    lines.push(result.reason);
    return { tone: "bad", title: `写入预览：${def.name}`, lines };
  }
  const replaced = obj.currentTags.filter((item) => tag(item)?.slot === def.slot && item !== tagId);
  lines.push(`写入槽位：${slotName(def.slot)}，消耗 ${injectCost(def)} 原墨。`);
  if (obj.id === "plate" && tagId === "Semantic.Mass.Heavy") lines.push("机关板会因自身重量下沉，打开出口。");
  if (bossAllowsPhaseStructureWrite(obj, tagId)) lines.push("冻结裂隙允许临时写入结构词，用于打穿第二层护文。");
  if (replaced.length) lines.push(`<span class="replacement-flow">${replaced.map(tagName).join(" / ")} -> ${def.name}</span> 被替换词会回流到词库。`);
  const reactions = reactionPreview(obj, tagId);
  if (reactions.length) lines.push(`<span class="reaction-callout">会触发：${reactions.join(" / ")}</span>`);
  return { tone: reactions.length ? "warn" : "good", title: `写入预览：${def.name} -> ${obj.name}`, lines };
}

function reactionPreview(obj, incomingTagId) {
  const def = tag(incomingTagId);
  const resulting = obj.currentTags.filter((item) => tag(item)?.slot !== def.slot);
  resulting.push(incomingTagId);
  const hasResult = (id) => resulting.includes(id);
  const reactions = [];
  const collision = fieldCollisionReaction(obj, incomingTagId);
  if (collision) reactions.push(reactionName(collision));
  if (hasResult("Semantic.Temperature.Overheated") && hasResult("Semantic.Medium.Wet")) reactions.push("蒸汽爆发");
  if (hasResult("Semantic.Temperature.Frozen") && hasResult("Semantic.Structure.Fragile")) reactions.push("破裂窗口");
  if (hasResult("Semantic.Field.Attract") && hasResult("Semantic.Field.Repel")) reactions.push("力场震荡");
  return [...new Set(reactions)];
}

function renderModeControls() {
  document.body.dataset.mode = state.testMode;
  el.modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.testMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  el.refillInkBtn.classList.toggle("hidden", state.testMode !== "debug");
  el.resetZoneBtn.classList.toggle("hidden", state.testMode !== "debug");
}

function renderStatusMeters() {
  const steps = zoneSteps();
  const stepPct = steps.length ? steps.filter((item) => item.done).length / steps.length : 0;
  const zonePct = state.zones.length ? (state.zone + stepPct) / state.zones.length : 0;
  const timePct = Math.min(1, elapsedSeconds() / 180);
  document.body.style.setProperty("--ink-pct", `${Math.max(0, Math.min(1, state.ink / state.maxInk)) * 100}%`);
  document.body.style.setProperty("--zone-pct", `${Math.max(0, Math.min(1, zonePct)) * 100}%`);
  document.body.style.setProperty("--time-pct", `${timePct * 100}%`);
  document.body.style.setProperty("--resonance-pct", `${discoveredReactionCount() / REACTION_DISCOVERIES.length * 100}%`);
}

function ensureGuidedSelection() {
  if (usesLowGuidance() || isCompleted()) return;
  if (state.selectedObjectId && objectById(state.selectedObjectId)) return;
  selectGuidedRecommendedTarget();
}

function selectGuidedRecommendedTarget(preferDifferentId = "") {
  if (usesLowGuidance() || isCompleted()) return false;
  const ids = recommendedObjectIds();
  const nextId = ids.find((id) => id !== preferDifferentId) || ids[0];
  if (!nextId || !objectById(nextId)) return false;
  state.selectedObjectId = nextId;
  state.selectedTagId = null;
  return true;
}

function recoveryState() {
  const issues = [];
  const obj = selectedObject();
  const inventoryTag = state.inventory[state.selectedInventoryIndex];
  if (runIsFailed()) {
    issues.push("远征稳定度耗尽，需要重新整备本轮。");
  } else if (isFinalZone() && isCompleted()) {
    issues.push("已抵达文库，可查看通关总结。");
  } else if (zone().complete(state)) {
    issues.push("当前目标已完成，可以进入下一区域。");
  } else {
    if (!obj) issues.push("先选择一个场景对象。");
    if (obj && !obj.scanned) issues.push("当前对象未扫描，先确认词缀和槽位。");
    const mechanicHint = z5MechanicHint(obj);
    if (mechanicHint) issues.push(mechanicHint);
    if (state.inventory.length >= inventoryCapacity()) issues.push("临时词库已满，需要写入、清空或重置区。");
    if (inventoryTag) {
      const compatibleTargets = zoneObjects().filter((item) => objectWriteReadiness(item).status === "compatible");
      if (!compatibleTargets.length) issues.push("当前选中词还没有明确可写入目标，先扫描候选对象。");
    }
    if (state.ink <= 1) issues.push("原墨不足时，可撤销上一步，或返回本区入口检查点。");
    if (activeZoneElapsedSec() >= 90) issues.push("本区停留较久，建议复查目标、扫描器和词库。");
  }
  return {
    primary: issues[0] || "",
    issues
  };
}

function renderSessionStatus() {
  const saveNotice = state.storageConflict ? "另一窗口更新了存档。刷新后可从最新进度继续。" : state.storageNotice;
  el.sessionStatus.classList.toggle("hidden", !saveNotice);
  el.sessionStatus.innerHTML = saveNotice
    ? `<div><strong>本地存档</strong><p>${escapeHtml(saveNotice)}</p></div>${state.storageConflict ? '<a href="">重新载入</a>' : ""}`
    : "";
  el.undoBtn.disabled = !canUndo();
  el.undoBtn.title = canUndo() ? state.undoStack[0].label : "没有可撤销的语义操作。";
  el.checkpointBtn.disabled = !canRestoreCheckpoint();
  el.checkpointBtn.title = el.checkpointBtn.disabled ? "检查点仅用于当前推进区域。" : "回到当前区域入口检查点。";
}

function renderChroniclePanel() {
  if (!el.chroniclePanel) return;
  const modifiers = PROGRESSION.modifierDetails(state.run);
  const cycle = isExpedition() ? state.run.cycle : state.profile.expeditionWins + 1;
  const mobileRulesOpen = el.chroniclePanel.querySelector(".mobile-modifiers")?.open;
  const mobileRules = modifiers.length ? `
    <details class="mobile-modifiers"${mobileRulesOpen ? " open" : ""}>
      <summary>本轮规则</summary>
      <div class="mobile-modifier-body">
        ${modifiers.map((item) => `<div><strong>${item.icon} ${item.name}</strong><small>${item.detail}</small></div>`).join("")}
      </div>
    </details>` : "";
  const upgradeHtml = PROGRESSION.UPGRADES.map((upgrade) => {
    const level = state.profile.upgrades[upgrade.id] || 0;
    const maxed = level >= upgrade.maxLevel;
    const cost = maxed ? 0 : upgrade.costs[level];
    const affordable = !maxed && state.profile.echo >= cost;
    return `
      <article class="inscription-card${maxed ? " maxed" : ""}">
        <span class="inscription-icon">${upgrade.icon}</span>
        <div>
          <strong>${upgrade.name}<em>Lv.${level}/${upgrade.maxLevel}</em></strong>
          <small>${upgrade.detail}</small>
        </div>
        <button type="button" data-upgrade="${upgrade.id}" ${maxed || !affordable ? "disabled" : ""} title="${maxed ? "已升满" : `消耗 ${cost} 枚回声残片`}">
          ${maxed ? "已满" : `${cost} ◈`}
        </button>
      </article>
    `;
  }).join("");
  const threat = isExpedition() ? state.run.threat : 0;
  const threatTone = threat >= 75 ? "danger" : threat >= 45 ? "warning" : "";
  const expeditionAction = isExpedition()
    ? `<button class="chronicle-primary" type="button" data-chronicle-action="restart-expedition">${runIsFailed() ? "重新整备" : "重开本轮"}</button>`
    : `<button class="chronicle-primary" type="button" data-chronicle-action="start-expedition">开启第 ${cycle} 轮远征</button>`;

  el.chroniclePanel.className = `chronicle-panel${isExpedition() ? " expedition-active" : " chronicle-idle"}${runIsFailed() ? " run-failed" : ""}${state.chronicleExpanded ? " mobile-expanded" : ""}`;
  el.chroniclePanel.innerHTML = `
    <div class="chronicle-summary">
      <div class="chronicle-title">
        <h2>${isExpedition() ? `第 ${state.run.cycle} 轮远征` : "修正者档案"}</h2>
      </div>
      <div class="chronicle-stats">
        <span><small>回声残片</small><strong>${state.profile.echo} ◈</strong></span>
        <span><small>完成轮次</small><strong>${state.profile.completedRuns}</strong></span>
        <span><small>远征胜场</small><strong>${state.profile.expeditionWins}</strong></span>
        <span><small>最高轮次</small><strong>${state.profile.highestCycle || "-"}</strong></span>
      </div>
      <div class="chronicle-action">
        ${expeditionAction}
        <button class="chronicle-toggle" type="button" data-chronicle-action="toggle-inscriptions">${state.chronicleExpanded ? "收起铭文" : "铭文升级"}</button>
      </div>
    </div>
    <div class="expedition-pressure ${threatTone}">
      <div>
        <span>语义威胁 <strong>${threat}/100</strong></span>
        <span>稳定度 <strong>${isExpedition() ? `${state.run.integrity}/3` : "安全"}</strong></span>
      </div>
      <i><b style="width:${threat}%"></b></i>
      ${mobileRules}
    </div>
    <div class="inscription-grid">${upgradeHtml}</div>
  `;
}

function render() {
  const active = document.activeElement;
  const focusAttribute = ["data-inspect", "data-travel-word", "data-index", "data-object-id", "data-action", "data-tag", "data-take-tag", "data-zone", "data-chronicle-action", "data-upgrade", "data-completion-action"]
    .find((attribute) => active?.hasAttribute(attribute));
  renderModeControls();
  ensureGuidedSelection();
  renderStatusMeters();
  el.inkValue.textContent = state.ink;
  el.inventoryCount.textContent = `${state.inventory.length}/${inventoryCapacity()}`;
  el.zoneIndex.textContent = `第${"一二三四五六七"[state.zone]}章`;
  document.getElementById("playModeBtn").textContent = TEST_MODES[state.testMode];
  el.elapsedValue.textContent = formatTime(state.metrics.completedAt ?? elapsedSeconds());
  if (el.resonanceValue) el.resonanceValue.textContent = `${discoveredReactionCount()}/${REACTION_DISCOVERIES.length}`;
  el.nextHint.textContent = nextHint();
  renderZones();
  renderSteps();
  renderResultPulse();
  renderDecisionStrip();
  renderMasteryPanel();
  renderChroniclePanel();
  renderStage();
  renderInspector();
  renderInventory();
  syncInspectorActions();
  renderLog();
  const report = buildReport();
  renderMetrics(report);
  renderSessionStatus();
  renderCompletionPanel(report);
  el.reflectionBox.textContent = zone().reflection;
  renderReportData(report);
  applyLanguageToDocument();
  if (focusAttribute && !active.isConnected) {
    const equivalent = document.querySelector(`button[${focusAttribute}="${CSS.escape(active.getAttribute(focusAttribute))}"]:enabled`);
    const nextAction = el.contextActions.querySelector("button:enabled");
    const nextTag = el.inspector.querySelector(".tag-chip:enabled");
    (equivalent || nextTag || nextAction)?.focus({ preventScroll: true });
  }
}

function renderMasteryPanel() {
  if (!el.masteryPanel) return;
  el.masteryPanel.classList.toggle("awaiting-first-scan", zone().id === "Z1" && state.metrics.scans === 0);
  const zoneId = zone().id;
  const challenge = ZONE_MASTERY[zoneId];
  const earned = Boolean(state.mastery.earned[zoneId]);
  const ready = masteryEligible(zoneId);
  const discoveries = REACTION_DISCOVERIES.map((item) => {
    const discovered = state.metrics.reactionCounts[item.key] > 0;
    const name = discovered ? item.name : "未解析共鸣";
    const detail = discovered
      ? item.tags.map(tagName).join(" + ")
      : state.testMode === "guided"
        ? item.clue
        : "让不同槽位的词在同一目标上发生冲突。";
    return `<span class="discovery-chip ${discovered ? "discovered" : "locked"}"><b>${discovered ? "◆" : "◇"}</b><i><strong>${name}</strong><small>${detail}</small></i></span>`;
  }).join("");
  const challengeState = earned ? "已精通" : ready ? "待结算" : `${zoneMistakes(zoneId)} 次失误`;
  el.masteryPanel.innerHTML = `
    <div class="mastery-challenge ${earned ? "earned" : ready ? "ready" : ""}">
      <span class="label">本区试炼 · ${challengeState}</span>
      <strong>${challenge?.name || "自由探索"}</strong>
      <small>${challenge?.detail || "观察语义反应并完成区域。"}</small>
    </div>
    <div class="discovery-ledger" aria-label="已发现组合反应">${discoveries}</div>
  `;
}

function renderDecisionStrip() {
  if (!el.decisionStrip) return;
  el.decisionStrip.innerHTML = decisionSummary().map((item) => `
    <div class="decision-chip">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderResultPulse() {
  if (!el.resultPulse) return;
  const feedback = state.lastFeedback || {
    message: "点选场景中的标记，调查庭院。",
    type: "info",
    category: "initial",
    zone: zone().id,
    mode: state.testMode
  };
  const titleMap = {
    good: "已生效",
    warn: "需调整",
    bad: "被阻塞",
    info: "线索"
  };
  const tone = ["good", "warn", "bad"].includes(feedback.type) ? feedback.type : "info";
  const recovery = recoveryState();
  const detail = tone === "bad"
    ? (recovery.primary || "可撤销、回检查点，或换一个对象/词缀再试。")
    : tone === "warn"
      ? (recovery.primary || "当前状态仍可继续，观察对象槽位和词库。")
      : zone().complete(state)
        ? "目标已达成，推进到下一段。"
        : usesLowGuidance() ? "" : nextHint();
  el.resultPulse.className = `result-pulse ${tone}`;
  el.resultPulse.innerHTML = `
    <span>${feedback.category === "counterattack" ? "反击" : titleMap[tone]}</span>
    <strong>${escapeHtml(feedback.message)}</strong>
    <small>${detail}</small>
  `;
}

function renderZones() {
  el.zoneList.innerHTML = "";
  state.zones.forEach((z, index) => {
    const active = index === state.zone;
    const unlocked = state.unlockedZones.includes(z.id);
    const complete = unlocked && (z.id === "Z7" ? isCompleted() : z.complete({ ...state, zone: index }));
    const button = document.createElement("button");
    button.className = `zone-item${active ? " active" : ""}${complete ? " complete" : ""}`;
    button.type = "button";
    button.dataset.zone = z.id;
    button.disabled = !canTravelToZone(index);
    if (active) button.setAttribute("aria-current", "location");
    const progress = complete ? "已达成" : active ? "进行中" : unlocked ? "可前往" : "未解锁";
    button.innerHTML = `
      <span class="zone-art" aria-hidden="true"></span>
      <span class="zone-name"><small>${z.id}</small><strong>${z.name}</strong></span>
      <span class="zone-progress">${progress}</span>
    `;
    button.addEventListener("click", () => {
      setMapOpen(false);
      travelToZone(index);
    });
    el.zoneList.appendChild(button);
  });
}

function renderSteps() {
  const steps = zoneSteps();
  const activeIndex = activeStepIndex(steps);
  el.stepList.innerHTML = steps.map((item, index) => {
    const cls = item.done ? "done" : index === activeIndex ? "active" : "";
    const prefix = item.done ? "完成" : index === activeIndex ? "当前" : "待办";
    return `<div class="step-item ${cls}"><strong>${prefix}</strong><br>${item.label}</div>`;
  }).join("");
}

function renderStage() {
  const currentZone = zone();
  const gateOpened = currentZone.id === "Z1" && currentZone.complete(state);
  if (el.stageHero.dataset.zone !== currentZone.id) {
    for (const animation of el.stageHero.querySelector(".scene-scan")?.getAnimations?.() ?? []) animation.cancel();
    document.getElementById("effectsContainer")?.replaceChildren?.();
  }
  el.zoneTitle.textContent = currentZone.name;
  el.stageHero.dataset.zone = currentZone.id;
  el.stageHero.dataset.landmarks = String(["Z1", "Z2", "Z3", "Z5", "Z7"].includes(currentZone.id));
  el.stageHero.dataset.complete = String(Boolean(currentZone.complete(state)));
  el.stageHero.dataset.failed = String(runIsFailed());
  el.stageRunStatus.classList.toggle("hidden", !isExpedition());
  el.stageRunStatus.textContent = isExpedition() ? `远征 ${state.run.cycle} · 威胁 ${state.run.threat}/100 · 稳定度 ${state.run.integrity}/3` : "";
  el.zoneObjective.textContent = gateOpened
    ? "门后的通路已经打开。"
    : usesLowGuidance() ? (LOW_OBJECTIVES[currentZone.id] || currentZone.objective) : currentZone.objective;
  el.sceneMap.innerHTML = "";
  const recommendedIds = recommendedObjectIds();
  zoneObjects().forEach((obj) => {
    const canEnterGate = gateOpened && obj.id === "gate" && !runIsFailed();
    const readiness = objectWriteReadiness(obj);
    const button = document.createElement("button");
    button.className = [
      "object-token",
      ...obj.currentTags.map((tagId) => `semantic-${tagId.split(".").slice(-1)[0].toLowerCase()}`),
      canEnterGate ? "passage" : obj.id === state.selectedObjectId ? "selected" : "",
      recommendedIds.includes(obj.id) ? "recommended" : "",
      objectCanAcceptSelectedInventory(obj) ? "compatible" : "",
      readiness.status === "blocked" ? "write-blocked" : "",
      readiness.status === "needs-scan" ? "needs-scan" : "",
      obj.defeated ? "defeated" : "",
      obj.destroyed ? "destroyed" : ""
    ].filter(Boolean).join(" ");
    button.type = "button";
    button.dataset.objectId = obj.id;
    if (!canEnterGate) button.setAttribute("aria-pressed", String(obj.id === state.selectedObjectId));
    const tags = obj.currentTags.map((tagId) => {
      const def = tag(tagId);
      if (obj.scanned) {
        return `<span class="mini-tag-label"><i style="background:${def?.color || "#ddd"}"></i>${def?.name || tagId}</span>`;
      }
      return `<i class="tag-dot unknown"></i>`;
    }).join("");
    const hp = obj.hp != null && !obj.defeated ? `<small>耐久 ${obj.hp}${obj.shieldLayers ? ` / 护文 ${obj.shieldLayers}` : ""}</small>` : "";
    const hpBar = obj.hp != null && !obj.defeated
      ? `<span class="hp-bar" aria-label="耐久"><span style="width:${Math.max(0, Math.min(100, obj.hp / (obj.maxHp || obj.hp || 1) * 100))}%"></span></span>`
      : "";
    const shieldPips = obj.shieldLayers != null && !obj.defeated
      ? `<span class="shield-pips" aria-label="护文">${[0, 1, 2].map((pip) => `<i class="${pip < obj.shieldLayers ? "on" : ""}"></i>`).join("")}</span>`
      : "";
    const stateLabel = canEnterGate ? "穿过石门 →" : objectStateLabel(obj, recommendedIds);
    button.dataset.idle = String(stateLabel === "可扫描");
    button.setAttribute("aria-label", `${obj.name}，${objectTypeName(obj.type)}，${stateLabel}`);
    button.innerHTML = `
      <span class="object-art" aria-hidden="true"></span>
      <span class="object-info">
        <span class="type-badge">${objectTypeName(obj.type)}</span>
        <strong>${obj.name}</strong>
        <span class="object-state">${stateLabel}</span>
        <span class="sr-only">${obj.scanned ? "已扫描" : "未扫描"}</span>
        ${hp}${hpBar}${shieldPips}
        <span class="mini-tags">${tags}</span>
      </span>
    `;
    button.addEventListener("click", canEnterGate ? proceedFromZone : () => selectObject(obj.id));
    el.sceneMap.appendChild(button);
  });
  renderActions();
}

function renderCombatReadout() {
  const obj = selectedObject();
  const intent = enemyIntent(obj);
  const visible = Boolean(intent && !isRevisiting() && !runIsFailed() && !isCompleted());
  el.combatReadout.classList.toggle("hidden", !visible);
  const opening = visible && enemyOpening(obj);
  el.combatReadout.dataset.intent = visible ? opening || intent.id : "";
  if (!visible) {
    el.combatReadout.innerHTML = "";
    return;
  }
  const name = opening ? ENEMY_OPENINGS[opening] : intent.name;
  const move = opening ? "破绽" : "敌势";
  el.combatReadout.innerHTML = `<span>${move}</span><strong>${name}</strong><small>${canHeavyStrike().reason}</small>`;
}

function renderTravelLoadout() {
  const panel = el.travelLoadout;
  const visible = canChooseTravelWord() && state.inventory.length > 0;
  panel.classList.toggle("hidden", !visible);
  panel.innerHTML = "";
  if (!visible) return;
  panel.innerHTML = `<p><strong>选一个词带走</strong><small>前往${state.zones[state.zone + 1].name}</small></p>
    <div class="travel-words">${[...new Set(state.inventory)].map(id =>
      `<button type="button" class="travel-word quiet-button" data-travel-word="${id}" aria-pressed="${id === state.travelWord}">${tagName(id)}</button>`
    ).join("")}<button type="button" class="travel-skip" data-travel-skip>空手前往</button></div>`;
  panel.querySelectorAll("[data-travel-word]").forEach(button =>
    button.addEventListener("click", () => chooseTravelWord(button.dataset.travelWord)));
  panel.querySelector("[data-travel-skip]")?.addEventListener("click", () => {
    state.travelWord = "";
    nextZone();
  });
}

function renderActions() {
  renderTravelLoadout();
  renderCombatReadout();
  const heldTag = tag(state.inventory[state.selectedInventoryIndex]);
  const carriedWord = document.getElementById("carriedWord");
  if (carriedWord) {
    const canCarry = heldTag && !isCompleted() && !runIsFailed() && !zone().complete(state);
    const target = canCarry && canInject().enabled ? selectedObject() : null;
    carriedWord.classList.toggle("hidden", !canCarry);
    carriedWord.innerHTML = canCarry ? `<span>手持词缀</span><strong>${heldTag.name}</strong><small>${target ? `目标：${target.name}` : "点选要写入的目标"}</small>` : "";
  }
  if (isCompleted()) {
    el.contextActions.innerHTML = '<a class="action-button primary" href="#completionPanel">查看通关总结 ↘</a>';
    el.actionHelp.textContent = "可从地图回访已探索的区域。";
    return;
  }
  if (runIsFailed()) {
    el.contextActions.innerHTML = `
      <div class="run-ending">
        <div><p>第 ${state.run.cycle} 轮 · 稳定度 0/3</p><h3>远征止步于此</h3><p>回声残片和永久铭文已保留。</p></div>
        <button class="action-button primary ready expedition-restart" type="button">重新整备远征</button>
      </div>
    `;
    el.contextActions.querySelector(".expedition-restart")?.addEventListener("click", resetGame);
    el.actionHelp.textContent = "";
    return;
  }
  if (isRevisiting()) {
    el.contextActions.innerHTML = '<button type="button" class="action-button primary" data-return-frontier>返回当前进度</button>';
    el.contextActions.querySelector("button")?.addEventListener("click", () => travelToZone(state.zones.findIndex(z => z.id === state.unlockedZones.at(-1))));
    el.actionHelp.textContent = "正在回访已通过的区域。";
    return;
  }
  const canAdvance = zone().complete(state);
  if (!selectedObject() && !canAdvance) {
    el.contextActions.innerHTML = "";
    const openList = document.createElement("button");
    openList.type = "button";
    openList.className = "action-button open-investigation";
    openList.textContent = "调查对象";
    openList.addEventListener("click", () => {
      setInspectorOpen(true);
      el.inspector.querySelector("[data-inspect]")?.focus();
    });
    el.contextActions.appendChild(openList);
    el.actionHelp.textContent = "";
    return;
  }
  const scanState = canScan();
  const actions = [
    action("扫描", scanSelected, scanState.enabled ? "primary" : "", scanState, "观察"),
    action("剥离选中词", extractSelectedTag, "", canExtract(), "语义"),
    action("注入选中词", injectSelectedInventory, "", canInject(), "语义"),
    action("重击", heavyStrike, "", canHeavyStrike(), "战斗"),
    action("弹反破绽", parry, "", canParry(), "战斗")
  ];
  const sidestepState = canSidestep();
  if (sidestepState.enabled) actions.push(action("侧闪", sidestep, "", sidestepState, "战斗"));
  if (zone().id === "Z2") {
    actions.push(action("推动石块", moveBlock, "", canMoveBlock(), "机关"), action("压住机关", pressPlate, "", canPressPlate(), "机关"));
  }
  if (zone().id === "Z5") {
    const gatherState = canGatherDebris();
    const bridgeState = canFormBridge();
    actions.push(
      action("聚拢碎片", gatherDebris, gatherState.enabled ? "primary" : "", gatherState, "机关"),
      action("形成桥面", formBridge, bridgeState.enabled ? "primary" : "", bridgeState, "机关")
    );
  }
  const advanceLabel = isFinalZone() && canAdvance ? "切片完成" : canAdvance ? "进入下一区域" : "目标未完成";
  actions.push(action(advanceLabel, proceedFromZone, canAdvance && !isFinalZone() ? "primary" : "", { enabled: canAdvance && !isFinalZone(), reason: isFinalZone() ? "已经到达结尾。" : "完成当前目标后可进入下一段。" }, "推进"));
  el.contextActions.innerHTML = "";
  const disabledReasons = [];
  const visibleActions = actions.filter((item) => shouldShowAction(item));
  const preferred = visibleActions.find((item) => item.state.enabled && item.label === advanceLabel) ||
    visibleActions.find((item) => item.state.enabled && item.cls === "primary") ||
    visibleActions.find((item) => item.state.enabled);
  const groups = zone().id === "Z5"
    ? ["观察", "机关", "语义", "战斗", "推进"]
    : ["观察", "语义", "战斗", "机关", "推进"];
  groups.forEach((group) => {
    const groupActions = visibleActions.filter((item) => item.group === group);
    if (!groupActions.length) return;
    const wrapper = document.createElement("div");
    wrapper.className = `action-group${groupActions.some((item) => item.state.enabled) ? " has-ready" : ""}`;
    groupActions.forEach(({ label, fn, state: actionState }) => {
      const button = document.createElement("button");
      button.className = `action-button${label === preferred?.label ? " primary" : ""}${actionState.enabled ? " ready" : ""}`;
      button.type = "button";
      let visibleLabel = label;
      if (label === "注入选中词" && heldTag) visibleLabel = `写入「${heldTag.name}」`;
      if (label === "进入下一区域" && hasInventory(state.travelWord)) visibleLabel = `携「${tagName(state.travelWord)}」出发`;
      button.textContent = visibleLabel;
      button.dataset.action = label;
      button.disabled = !actionState.enabled;
      button.title = actionState.reason;
      button.setAttribute("aria-label", `${visibleLabel}：${actionState.reason}`);
      if (!actionState.enabled) disabledReasons.push(`${label}：${actionState.reason}`);
      button.addEventListener("click", fn);
      wrapper.appendChild(button);
    });
    el.contextActions.appendChild(wrapper);
  });
  el.actionHelp.textContent = !preferred && disabledReasons.length ? disabledReasons[0] : "";
}

function shouldShowAction(item) {
  if (item.group === "推进" && (!item.state.enabled || (canChooseTravelWord() && state.inventory.length && !hasInventory(state.travelWord)))) return false;
  if (zone().id === "Z1" && zone().complete(state) && item.group !== "推进") return false;
  if (!item.state.enabled && item.group !== "战斗") return false;
  if (item.group === "战斗" && !item.state.enabled && (selectedObject()?.hp == null || selectedObject()?.defeated)) return false;
  const anyScanned = zoneObjects().some((objectItem) => objectItem.scanned);
  const firstScanTeaching = state.testMode === "guided" && zone().id === "Z1" && !anyScanned;
  if (!firstScanTeaching) return true;
  return item.label === "扫描";
}

function renderInspector() {
  const obj = selectedObject();
  el.inspectorPanel.dataset.zone = zone().id;
  el.selectedHint.textContent = obj ? obj.name : "未选择对象";
  if (!obj) {
    el.inspector.className = "inspector-empty";
    el.inspector.innerHTML = "";
    if (!zone().complete(state) && !runIsFailed() && !isRevisiting()) {
      const list = document.createElement("div");
      list.className = "investigation-list";
      for (const item of zoneObjects()) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action-button inspect-choice";
        button.dataset.inspect = item.id;
        button.setAttribute("aria-label", `调查${item.name}`);
        button.innerHTML = `<span class="specimen-art" data-specimen="${item.id}" aria-hidden="true"></span>
          <span><small>${objectTypeName(item.type)}</small><strong>${item.name}</strong></span>`;
        button.addEventListener("click", () => {
          selectObject(item.id);
          if (!window.matchMedia?.(INSPECTOR_DRAWER_QUERY).matches) el.contextActions.querySelector("button:enabled")?.focus();
        });
        list.appendChild(button);
      }
      el.inspector.appendChild(list);
    }
    const observation = document.createElement("p");
    observation.className = "scene-observation";
    observation.textContent = zone().reflection;
    el.inspector.appendChild(observation);
    return;
  }
  el.inspector.className = "";
  const observations = {
    gate: "朱绦封着门闩。门闩和石门是两回事。",
    statue: "裂纹沿着石像胸口往下延伸。",
    plate: "机关板旁的配重槽空着。",
    tablet: "石碑悬在机关板上方，碑底的浮空机关仍在运转。",
    pool: "薄冰一直延伸到升降台。缀刺兽守在岸上。",
    block: "石块有提环，机关板就在对面。",
    beast: "它守在通路上。水汽可以遮断它的视线。"
  };
  const clue = observations[obj.id];
  const portrait = `<span class="specimen-art" data-specimen="${obj.id}" aria-hidden="true"></span>`;
  const combat = enemyIntent(obj)
    ? `<p class="combat-health">耐久 <strong>${obj.hp} / ${obj.maxHp}</strong></p>`
    : "";
  if (!obj.scanned) {
    el.inspector.innerHTML = `
      <div class="object-title-row">
        ${portrait}<div>
          <h3>${obj.name}</h3>
          <p class="hint">${objectTypeName(obj.type)}</p>
        </div>
        <span class="hint">未扫描</span>
      </div>
      <p class="scan-gate">${clue || "扫描后可查看词缀、槽位和取写成本。"}</p>
      ${combat}
    `;
    return;
  }
  const tagButtons = obj.currentTags.map((tagId) => {
    const def = tag(tagId);
    const detail = obj.id === "gate" && tagId === "Semantic.Structure.Closed"
      ? "取下封印，石门会完整开启。"
      : tagCause(tagId);
    const selected = tagId === state.selectedTagId ? " selected" : "";
    const take = canExtract(obj, tagId);
    const quickTake = !isCompleted() && !runIsFailed() && def && !(obj.id === "gate" && zone().complete(state))
      ? `<button class="quiet-button take-tag" data-take-tag="${tagId}" type="button" ${take.enabled ? "" : "disabled"} title="${take.reason}" aria-label="剥离${def.name}，消耗 ${extractCost(def)} 原墨">取词 · ${extractCost(def)}墨</button>`
      : "";
    return `<div class="tag-item"><button class="tag-chip${selected}" data-tag="${tagId}" type="button" title="${detail}"><span style="background:${def?.color || "#ddd"}"></span><strong>${def?.name || tagId}</strong><small>${detail}</small></button>${quickTake}</div>`;
  }).join("");
  const lockText = obj.lockedSlots.length ? ` · 锁定${obj.lockedSlots.map(slotName).join(" / ")}` : "";
  const preview = previewForSelectedObject();
  const showPreview = !obj.fell && !(obj.id === "gate" && zone().complete(state)) && (state.selectedTagId || state.inventory[state.selectedInventoryIndex]);
  const previewLines = preview.lines.map((line) => `<li>${line}</li>`).join("");
  const slotItems = obj.openSlots.map((slot) => {
    const guarded = slot === "Structure" && enemyIntent(obj) && !enemyOpening(obj);
    const locked = obj.lockedSlots.includes(slot) || guarded;
    return `<span class="slot-chip ${locked ? "locked" : ""}">${slotName(slot)}${guarded ? " / 等待破绽" : locked ? " / 锁定" : ""}</span>`;
  }).join("");
  const bossPhasePlan = bossPhasePlanHtml(obj);
  el.inspector.innerHTML = `
    <div class="object-title-row">
      ${portrait}<div>
        <h3>${obj.name}</h3>
        <p class="hint">${objectTypeName(obj.type)}${lockText}</p>
      </div>
      <span class="hint">${obj.scanned ? "已扫描" : "未扫描"}</span>
    </div>
    ${bossPhasePlan}
    ${combat}
    <div class="scan-section">
      <span class="section-label">当前词缀</span>
      <div class="tag-list">${tagButtons || "<span class='hint'>无显性词缀</span>"}</div>
    </div>
    <div class="scan-section">
      <span class="section-label">开放槽位</span>
      <div class="slot-list">${slotItems || "<span class='hint'>无开放槽位</span>"}</div>
      ${obj.breach ? "<p class='scan-note'>语义破绽已打开，可优先处理结构词。</p>" : ""}
    </div>
    ${showPreview ? `<div class="preview-box ${preview.tone}">
      <div class="preview-title">${preview.title}</div>
      <ul>${previewLines}</ul>
    </div>` : ""}
  `;
  el.inspector.querySelectorAll(".tag-chip").forEach((button) => {
    button.addEventListener("click", () => selectTag(button.dataset.tag));
  });
  el.inspector.querySelectorAll("[data-take-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTagId = button.dataset.takeTag;
      extractSelectedTag();
    });
  });
}

function renderInventory() {
  el.clearInventoryBtn.disabled = !state.inventory.length || isRevisiting() || isCompleted() || runIsFailed();
  el.inventoryList.innerHTML = "";
  if (!state.inventory.length) {
    el.inventoryList.innerHTML = `
      <div class="empty-state">
        <span>尚未收录词缀</span>
      </div>
    `;
    return;
  }
  state.inventory.forEach((tagId, index) => {
    const def = tag(tagId);
    const button = document.createElement("button");
    button.className = `inventory-token${index === state.selectedInventoryIndex ? " selected" : ""}`;
    button.type = "button";
    button.dataset.tag = tagId;
    button.dataset.index = String(index);
    button.title = tagCause(tagId);
    button.setAttribute("aria-pressed", index === state.selectedInventoryIndex ? "true" : "false");
    button.innerHTML = `<span style="background:${def.color}"></span><strong>${def.name}</strong><small>${inventoryRouteHint(tagId)}</small><em class="chip-cost">写${injectCost(def)}</em>`;
    button.addEventListener("click", () => selectInventory(index));
    el.inventoryList.appendChild(button);
  });
}

function inventoryRouteHint(tagId) {
  const def = tag(tagId);
  if (!def || usesLowGuidance()) return tagCause(tagId);
  const readyTargets = zoneObjects().filter((obj) => {
    return obj.scanned && obj.openSlots.includes(def.slot) && !slotLockedForTag(obj, tagId) &&
      !enemyStructureGuarded(obj, tagId) && def.compatible.includes(obj.type);
  });
  const target = selectedObject();
  if (readyTargets.includes(target)) return `可写：${target.name}`;
  const recommendedTargets = recommendedObjectIds()
    .map(objectById)
    .filter((obj) => obj && obj.openSlots.includes(def.slot) && def.compatible.includes(obj.type));
  if (recommendedTargets.length) {
    const scannedTargets = recommendedTargets.filter((obj) => obj.scanned && !obj.lockedSlots.includes(def.slot));
    const prefix = scannedTargets.length ? "可写" : "先扫描";
    return `${prefix}：${recommendedTargets.map((obj) => obj.name).slice(0, 2).join(" / ")}`;
  }
  if (readyTargets.length) return `可写：${readyTargets.map((obj) => obj.name).slice(0, 2).join(" / ")}`;
  const scanTargets = zoneObjects().filter((obj) => {
    return !obj.scanned && obj.openSlots.includes(def.slot) && def.compatible.includes(obj.type);
  });
  if (scanTargets.length) return `先扫描：${scanTargets.map((obj) => obj.name).slice(0, 2).join(" / ")}`;
  return tagCause(tagId);
}

function renderLog() {
  el.eventLog.innerHTML = state.log.map((item) => `
    <div class="event-line ${escapeHtml(item.type)}">
      <span>${formatTime(item.t ?? 0)} · ${escapeHtml(item.zone || zone().id)}</span>
      <strong>${escapeHtml(item.message)}</strong>
    </div>
  `).join("") || "<span class='hint'>还没有事件。</span>";
}

function renderMetrics(report) {
  const completeHtml = report.completed
    ? `<div class="completion-report">切片完成：${formatTime(report.elapsedSec)}。Boss语义操作 ${report.metrics.bossSemanticActions} 次，组合反应 ${report.metrics.reactions} 次。</div>`
    : "";
  const longestZone = report.summary.longestZone ? `${report.summary.longestZone.zone} ${formatTime(report.summary.longestZone.durationSec)}` : "-";
  el.metricsBox.innerHTML = `
    <div class="metrics-grid">
      ${metricHtml("模式", report.summary.modeLabel)}
      ${metricHtml("本区", formatTime(report.summary.activeZoneElapsedSec))}
      ${metricHtml("扫描", report.metrics.scans)}
      ${metricHtml("剥离", report.metrics.extracts)}
      ${metricHtml("注入", report.metrics.injects)}
      ${metricHtml("反应", report.metrics.reactions)}
      ${metricHtml("质量", `${report.audit.grade} ${report.audit.score}`)}
      ${metricHtml("误操作", report.metrics.warnings + report.metrics.blockedActions)}
      ${metricHtml("撤销", report.metrics.undoUses)}
      ${metricHtml("检查点", report.metrics.checkpointRestores)}
      ${metricHtml("Boss语义", report.metrics.bossSemanticActions)}
      ${metricHtml("护文反制", report.metrics.bossPhaseCounters?.length ?? 0)}
      ${metricHtml("首扫", timeOrDash(report.metrics.firstScanSec))}
      ${metricHtml("首取", timeOrDash(report.metrics.firstExtractSec))}
      ${metricHtml("首写", timeOrDash(report.metrics.firstInjectSec))}
      ${metricHtml("最长区", longestZone)}
    </div>
    ${completeHtml}
  `;
}

function calculateEndingBadges(report) {
  const badges = [];
  
  // Reaction Master
  const reactionTypes = new Set(Object.entries(report.metrics.reactionCounts).filter(([k,v]) => v > 0).map(([k,v]) => k)).size;
  if (reactionTypes >= 3 || report.metrics.reactions >= 4) {
    badges.push({
      name: "反应大师",
      desc: "成功触发了全部三种核心语义组合反应。"
    });
  }

  // Ink Efficiency
  if (report.ink >= 10) {
    badges.push({
      name: "省墨专家",
      desc: "通关时仍保留 10 点以上的充足原墨。"
    });
  }

  // Parry Master
  if (report.metrics.parries >= 2) {
    badges.push({
      name: "完美防卫者",
      desc: "在断廊战斗中成功执行了两次完美弹反。"
    });
  }

  // No Undo
  if (report.metrics.undoUses === 0 && report.metrics.checkpointRestores === 0) {
    badges.push({
      name: "无瑕修正者",
      desc: "没有使用任何撤销或检查点恢复通过全关。"
    });
  }

  if (badges.length === 0) {
    badges.push({
      name: "合格异墨者",
      desc: "成功克服故障谜题，跨入修正文库门槛。"
    });
  }

  return badges;
}

function renderCompletionPanel(report) {
  if (!el.completionPanel) return;
  if (!report.completed) {
    el.completionPanel.className = "completion-panel hidden";
    el.completionPanel.innerHTML = "";
    return;
  }
  
  if (!state.completionSfxPlayed) {
    audio.playSfx("success");
    state.completionSfxPlayed = true;
  }

  const longestDuration = Math.max(1, ...report.zoneDurations.map((item) => item.durationSec));
  const detailsOpen = el.completionPanel.querySelector(".completion-details")?.open;
  const verdict = completionVerdict(report);
  const zoneRows = report.zoneDurations.map((item) => `
    <tr>
      <td>${escapeHtml(item.zone)}</td>
      <td>${escapeHtml(item.mode)}</td>
      <td><span class="duration-cell"><i style="width:${Math.max(4, item.durationSec / longestDuration * 100)}%"></i><b>${formatTime(item.durationSec)}</b></span></td>
      <td>${escapeHtml(item.outcome)}</td>
    </tr>
  `).join("");
  const reactionRows = report.reactionLedger.map((item) => `<span>${item.label}<strong>${item.count}</strong></span>`).join("");
  const frictionRows = report.experience.frictions.length
    ? report.experience.frictions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>本轮未记录明显体验摩擦。</li>";
  const fixRows = report.experience.nextFixes.length
    ? report.experience.nextFixes.map((item) => `<li>${item}</li>`).join("")
    : "<li>保持低引导真人复测。</li>";
  const failureRows = report.experience.failureLedger.length
    ? report.experience.failureLedger.map((item) => `<span>${escapeHtml(item.label)}<strong>${item.count}</strong></span>`).join("")
    : "<span>无阻塞<strong>0</strong></span>";
  const playtestPrompts = report.playtest.comprehensionChecks
    .slice(0, 5)
    .map((item) => `<li><strong>${item.prompt}</strong><span>${item.pass}</span></li>`)
    .join("");
  const playtestRisks = report.playtest.risks.length
    ? report.playtest.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>暂无自动风险信号，仍需真人复述确认理解质量。</li>";
  const auditRisks = report.audit.risks.length
    ? report.audit.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>未发现明显阻塞。</li>";
    
  const badges = calculateEndingBadges(report);
  const badgeHtml = badges.map(b => `
    <div class="ending-badge">
      <span class="icon" aria-hidden="true">${b.name[0]}</span>
      <span class="name">${b.name}</span>
      <span class="desc">${b.desc}</span>
    </div>
  `).join("");

  el.completionPanel.className = "completion-panel";
  el.completionPanel.innerHTML = `
    <div class="completion-head" data-zone="Z7">
      <div class="completion-title">
        <p class="label">通关总结</p>
        <h2>抵达修正文库</h2>
        <p>本轮用时 ${formatTime(report.elapsedSec)} · 获得 ${state.run.lastReward || 0} 枚回声残片</p>
      </div>
      <div class="completion-grade" aria-label="评级 ${report.audit.grade}，总分 ${report.audit.score}">
        <strong>${report.audit.grade}</strong><span>${report.audit.score} 分</span>
      </div>
    </div>
    <div class="completion-actions">
      <button class="quiet-button expedition-launch" type="button" data-completion-action="start-expedition">下一轮远征</button>
      <button class="quiet-button" type="button" data-completion-action="restart-guided">引导重开</button>
      <button class="quiet-button" type="button" data-completion-action="restart-low">探索重开</button>
      <button class="quiet-button" type="button" data-completion-action="report">导出报告</button>
    </div>
    <div class="completion-badges-section">
      <h3>异墨勋章</h3>
      <div class="ending-badge-list">${badgeHtml}</div>
    </div>
    <details class="completion-details"${detailsOpen ? " open" : ""}>
      <summary>本轮复盘与明细</summary>
      <div class="completion-details-body">
        <div class="summary-grid">
          ${metricHtml("总用时", formatTime(report.elapsedSec))}
          ${metricHtml("最长区", `${report.summary.longestZone.zone} ${formatTime(report.summary.longestZone.durationSec)}`)}
          ${metricHtml("误操作", report.summary.totalMistakes)}
          ${metricHtml("质量", `${report.audit.grade} ${report.audit.score}`)}
          ${metricHtml("组合反应", report.metrics.reactions)}
          ${metricHtml("Boss语义", report.metrics.bossSemanticActions)}
          ${metricHtml("护文反制", report.metrics.bossPhaseCounters?.length ?? 0)}
          ${metricHtml("检查点", report.metrics.checkpointRestores)}
          ${metricHtml("撤销", report.metrics.undoUses)}
          ${metricHtml("本轮残片", `+${state.run.lastReward || 0} ◈`)}
        </div>

        <div class="completion-verdict ${verdict.tone}">
          <strong>${verdict.title}</strong>
          <span>${verdict.detail}</span>
        </div>
        <div class="completion-audit">
          <div>
            <p class="label">反应覆盖</p>
            <div class="reaction-ledger">${reactionRows}</div>
          </div>
          <div>
            <p class="label">审计提示</p>
            <ul>${auditRisks}</ul>
          </div>
        </div>
        <div class="completion-audit experience-review">
          <div>
            <p class="label">体验摩擦</p>
            <ul>${frictionRows}</ul>
          </div>
          <div>
            <p class="label">整改线索</p>
            <ul>${fixRows}</ul>
          </div>
          <div>
            <p class="label">失败账本</p>
            <div class="reaction-ledger">${failureRows}</div>
          </div>
        </div>
        <div class="completion-audit playtest-review">
          <div>
            <p class="label">真人试玩追问</p>
            <ul>${playtestPrompts}</ul>
          </div>
          <div>
            <p class="label">自动风险信号</p>
            <ul>${playtestRisks}</ul>
          </div>
        </div>
    
        <table class="zone-summary-table">
          <thead><tr><th>区域</th><th>模式</th><th>耗时</th><th>结果</th></tr></thead>
          <tbody>${zoneRows}</tbody>
        </table>
      </div>
    </details>
  `;
}

function completionVerdict(report) {
  if (report.audit.score >= 92 && report.metrics.bossPhaseCounters?.length >= 3) {
    return { tone: "good", title: "路径稳定", detail: "本轮覆盖三种组合反应；自动路线只能证明规则可达，仍需真人点击复测。" };
  }
  if (report.summary.totalMistakes === 0 && report.metrics.undoUses === 0) {
    return { tone: "good", title: "路径稳定", detail: "本轮没有误操作和撤销，主线理解负担较低。" };
  }
  if (report.summary.totalMistakes <= 2) {
    return { tone: "warn", title: "路径可用", detail: "存在少量停顿或试错，适合继续观察对应区域的提示强度。" };
  }
  return { tone: "bad", title: "需要复盘", detail: "误操作偏多，优先查看最长区域和最近事件，定位卡点。" };
}

function renderReportData(report = buildReport()) {
  if (!el.reportData) return;
  el.reportData.textContent = JSON.stringify(report, null, 2);
}

function escapeHtml(value) {
  const escapes = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return String(value ?? "").replace(/[&<>"]/g, (character) => escapes[character]);
}

function metricHtml(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function timeOrDash(value) {
  return value == null ? "-" : formatTime(value);
}

function buildReport() {
  const completed = isCompleted();
  const zoneDurations = zoneDurationsSnapshot();
  const summary = reportSummary(zoneDurations);
  const experience = experienceAudit(summary);
  const report = {
    project: "Echo-String: Genesis",
    prototype: "Duanju Courtyard",
    uxBuild: BUILD_LABEL,
    uxBuildName: BUILD_NAME,
    rollout: structuredClone(BUILD_ROLLOUT),
    sessionId: state.sessionId,
    testMode: state.testMode,
    testModeLabel: currentModeLabel(),
    language: state.language,
    profile: structuredClone(state.profile),
    run: structuredClone(state.run),
    completed,
    elapsedSec: state.metrics.completedAt ?? elapsedSeconds(),
    activeZoneElapsedSec: activeZoneElapsedSec(),
    currentZone: zone().id,
    ink: state.ink,
    inventory: state.inventory.map(tagName),
    flags: { ...state.flags },
    metrics: structuredClone(state.metrics),
    zoneDurations,
    summary,
    audit: currentAudit(experience),
    experience,
    failureLedger: failureLedger(),
    reactionLedger: reactionLedger(),
    recovery: recoveryState(),
    currentHint: nextHint(),
    currentSteps: zoneSteps(),
    latestLog: state.log.map((item) => item.message)
  };
  report.playtest = playtestPackage(summary, zoneDurations);
  return report;
}

function downloadReport() {
  const link = document.createElement("a");
  let url;
  try {
    const blob = new Blob([JSON.stringify(buildReport(), null, 2)], { type: "application/json" });
    url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `duanju-courtyard-report-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    log("试玩报告已生成。", "good");
  } catch (error) {
    log("试玩报告未能导出，可以再试一次。", "bad");
    console.warn("Report export failed:", error);
  } finally {
    link.remove();
    if (url) URL.revokeObjectURL(url);
  }
  render();
}

async function sharePlayableLink() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  const playableUrl = url.toString();
  if (await copyPlayableLink(playableUrl)) {
    log("试玩链接已复制。", "good");
  } else {
    const dialog = document.getElementById("shareDialog");
    const field = document.getElementById("shareUrl");
    field.value = playableUrl;
    document.getElementById("shareStatus").textContent = "浏览器未能复制链接。你可以手动复制下方网址。";
    if (!dialog.open) dialog.showModal();
    field.focus();
    field.select();
    log("试玩链接可手动复制。");
  }
  render();
}

async function copyPlayableLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function runShortcut(key) {
  const shortcutMap = { s: "扫描", e: "剥离选中词", i: "注入选中词", h: "重击", p: "弹反破绽", d: "侧闪", n: "进入下一区域" };
  const actionName = shortcutMap[key.toLowerCase()];
  if (!actionName) return false;
  if (key.toLowerCase() === "n" && canChooseTravelWord() && state.inventory.length && !hasInventory(state.travelWord)) {
    proceedFromZone();
    return true;
  }
  const button = el.contextActions.querySelector(`[data-action="${actionName}"]:enabled`);
  if (!button) return false;
  state.metrics.shortcutsUsed += 1;
  button.click();
  return true;
}

function initSettings() {
  if (typeof document === "undefined") return;
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const bgmVolumeSlider = document.getElementById("bgmVolumeSlider");
  const bgmVolumeVal = document.getElementById("bgmVolumeVal");
  const sfxVolumeSlider = document.getElementById("sfxVolumeSlider");
  const sfxVolumeVal = document.getElementById("sfxVolumeVal");
  const resetSaveDataBtn = document.getElementById("resetSaveDataBtn");
  const saveDialog = document.getElementById("clearSaveDialog");
  const confirmClearSaveBtn = document.getElementById("confirmClearSaveBtn");

  if (settingsBtn && settingsPanel && closeSettingsBtn) {
    let settingsOpener = settingsBtn;
    function openSettings(event) {
      settingsOpener = event.currentTarget;
      settingsPanel.classList.remove("hidden");
      renderSettingsZones();
      closeSettingsBtn.focus?.();
    }
    settingsBtn.addEventListener("click", openSettings);
    document.getElementById("playModeBtn").addEventListener("click", openSettings);
    closeSettingsBtn.addEventListener("click", () => {
      settingsPanel.classList.add("hidden");
      settingsOpener.focus?.();
    });
  }

  if (bgmVolumeSlider && bgmVolumeVal) {
    bgmVolumeSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      bgmVolumeVal.textContent = `${val}%`;
      audio.setBgmVolume(val / 100);
    });
  }

  if (sfxVolumeSlider && sfxVolumeVal) {
    sfxVolumeSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      sfxVolumeVal.textContent = `${val}%`;
      audio.setSfxVolume(val / 100);
    });
  }

  if (resetSaveDataBtn && saveDialog && confirmClearSaveBtn) {
    const clearError = document.getElementById("clearSaveError");
    resetSaveDataBtn.addEventListener("click", () => {
      clearError.textContent = "";
      saveDialog.showModal();
    });
    saveDialog.addEventListener("close", () => {
      if (!settingsPanel?.classList.contains("hidden")) resetSaveDataBtn.focus?.({ preventScroll: true });
    });
    confirmClearSaveBtn.addEventListener("click", () => {
      try {
        const storage = getGameStorage();
        if (storage && storage.getItem(RUNTIME_CONFIG.saveKey) !== savedGameRaw) {
          state.storageConflict = true;
          renderSessionStatus();
          clearError.textContent = localizeText("另一窗口更新了存档。请刷新后重新确认。");
          return;
        }
      } catch (error) {
        clearError.textContent = localizeText("无法读取本地存档。请检查浏览器的存储权限后再试。");
        return;
      }
      saveDialog.close();
      state.profile = PROGRESSION.createProfile();
      state.testMode = "guided";
      settingsPanel?.classList.add("hidden");
      resetGame();
      settingsBtn?.focus?.({ preventScroll: true });
    });
  }
}

function initLanguageControls() {
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.language));
  });
}

function renderSettingsZones() {
  const container = document.getElementById("settingsZoneSelect");
  if (!container) return;
  container.innerHTML = "";
  
  state.zones.forEach((z, index) => {
    const isUnlocked = state.unlockedZones.includes(z.id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `settings-zone-btn ${isUnlocked ? "unlocked" : "locked"} ${index === state.zone ? "active" : ""}`;
    btn.textContent = z.id;
    if (index === state.zone) {
      btn.title = "当前所在区域";
    } else if (isUnlocked) {
      btn.addEventListener("click", () => {
        audio.playSfx("success");
        const settingsPanel = document.getElementById("settingsPanel");
        if (settingsPanel) settingsPanel.classList.add("hidden");
        travelToZone(index);
      });
    } else {
      btn.className += " locked";
      btn.disabled = true;
      btn.title = "通关前置关卡解锁";
    }
    container.appendChild(btn);
  });
  applyLanguageToDocument();
}

function initPrologue() {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById("prologueOverlay");
  const startBtn = document.getElementById("startPrologueBtn");
  
  if (resumedGame && overlay) overlay.classList.add("hidden");
  if (isRegressionSession()) {
    if (overlay) overlay.classList.add("hidden");
    audio.isMuted = true;
    return;
  }

  if (startBtn && overlay) {
    startBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
      const firstTarget = selectedObject() ? el.contextActions.querySelector("button:enabled") : el.sceneMap.querySelector("button");
      firstTarget?.focus({ preventScroll: true });
      audio.init();
      audio.playSfx("success");
    });
  }
}

el.resetBtn.addEventListener("click", resetGame);
el.undoBtn.addEventListener("click", undoLastSemanticAction);
el.checkpointBtn.addEventListener("click", restoreZoneCheckpoint);
el.shareLinkBtn.addEventListener("click", sharePlayableLink);
document.getElementById("shareDialog")?.addEventListener("close", () => el.shareLinkBtn.focus?.({ preventScroll: true }));
document.getElementById("copyShareBtn")?.addEventListener("click", async () => {
  const field = document.getElementById("shareUrl");
  const copied = await copyPlayableLink(field.value);
  document.getElementById("shareStatus").textContent = localizeText(copied
    ? "试玩链接已复制。"
    : "链接已选中，可使用系统复制。");
  if (!copied) {
    field.focus();
    field.select();
  }
});
el.restartSessionBtn.addEventListener("click", resetGame);
el.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setTestMode(button.dataset.mode));
});
if (el.chroniclePanel) {
  el.chroniclePanel.addEventListener("click", (event) => {
    const upgradeId = event.target?.closest?.("[data-upgrade]")?.dataset?.upgrade;
    if (upgradeId) return buyChronicleUpgrade(upgradeId);
    const actionName = event.target?.closest?.("[data-chronicle-action]")?.dataset?.chronicleAction;
    if (!actionName) return;
    if (actionName === "toggle-inscriptions") {
      state.chronicleExpanded = !state.chronicleExpanded;
      return renderChroniclePanel();
    }
    if (actionName === "start-expedition" || actionName === "restart-expedition") {
      state.testMode = "expedition";
      resetGame();
    }
  });
}
if (el.themeToggleBtn) {
  el.themeToggleBtn.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    try {
      getGameStorage()?.setItem(THEME_PREFERENCE_KEY, state.theme);
    } catch (error) {
      console.warn("Theme preference save failed:", error);
    }
    applyTheme();
    applyLanguageToDocument();
    if (typeof audio !== "undefined" && audio.playSfx) {
      audio.playSfx("success");
    }
  });
}
el.clearInventoryBtn.addEventListener("click", () => {
  if (actionBlockedByRun()) return;
  if (state.inventory.length) pushUndo("清空临时词库");
  state.travelWord = "";
  state.inventory = [];
  state.selectedInventoryIndex = null;
  log("临时词库已清空。", "warn");
  saveAndRender();
});
el.refillInkBtn.addEventListener("click", refillInk);
el.resetZoneBtn.addEventListener("click", resetCurrentZone);
el.downloadReportBtn.addEventListener("click", downloadReport);
el.completionPanel.addEventListener("click", (event) => {
  const actionName = event.target?.dataset?.completionAction;
  if (!actionName) return;
  if (actionName === "report") return downloadReport();
  if (actionName === "start-expedition") {
    state.testMode = "expedition";
    return resetGame();
  }
  if (actionName === "restart-guided") {
    state.testMode = "guided";
    return resetGame();
  }
  if (actionName === "restart-low") {
    state.testMode = "low";
    return resetGame();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target?.closest?.("input, textarea, select, [contenteditable]")) return;
  if (document.querySelector('.utility-dialog[open], .zone-panel.open, .bottom-panel[aria-modal="true"], .settings-panel:not(.hidden), .prologue-overlay:not(.hidden)')) return;
  if (runShortcut(event.key)) event.preventDefault();
});
setInterval(() => {
  if (!isCompleted()) {
    el.elapsedValue.textContent = formatTime(elapsedSeconds());
    const report = buildReport();
    if (el.bottomPanel?.classList.contains("open") || document.body.classList.contains("regression-mode")) {
      renderMetrics(report);
      applyLanguageToDocument();
    }
    renderReportData(report);
  }
}, 1000);
window.__echoRuntime = { state, el, BUILD_LABEL, TEST_MODES };

window.__echoString = {
  buildReport,
  setTestMode,
  setLanguage,
  buyChronicleUpgrade,
  currentState: () => ({
    zone: zone().id,
    testMode: state.testMode,
    language: state.language,
    hint: nextHint(),
    profile: structuredClone(state.profile),
    run: structuredClone(state.run),
    metrics: structuredClone(state.metrics),
    flags: { ...state.flags }
  })
};

applyInitialModeFromUrl();
loadGameFromLocal();
if (resumedGame && finalizeRunProgression()) saveGameToLocal();
initPrologue();
initSettings();
initLanguageControls();
initLayoutInteractive();
if (!state.checkpoints[zone().id] && !isCompleted()) saveZoneCheckpoint();
if (!state.log.length) {
  log("选择封文大门或裂纹石像开始。");
}
render();
const startPrologueBtn = document.getElementById("startPrologueBtn");
if (startPrologueBtn) {
  startPrologueBtn.disabled = false;
  const startupStatus = document.getElementById("startupStatus");
  if (startupStatus) startupStatus.textContent = "";
  if (!resumedGame && !isRegressionSession()) startPrologueBtn.focus?.({ preventScroll: true });
}

// Global Hover Sound Effect Delegation
if (typeof document !== "undefined") {
  document.body.addEventListener("mouseover", (e) => {
    const target = e.target.closest("button, .tag-pill, .object-card, .inventory-item, .settings-zone-btn");
    if (target && target !== window.__lastHoveredElement) {
      window.__lastHoveredElement = target;
      if (typeof audio !== "undefined" && audio.playSfx) {
        audio.playSfx("hover");
      }
    }
  });
  document.body.addEventListener("mouseout", (e) => {
    const target = e.target.closest("button, .tag-pill, .object-card, .inventory-item, .settings-zone-btn");
    if (target && (!e.relatedTarget || !e.relatedTarget.closest || e.relatedTarget.closest("button, .tag-pill, .object-card, .inventory-item, .settings-zone-btn") !== target)) {
      window.__lastHoveredElement = null;
    }
  });
}

function initLayoutInteractive() {
  if (typeof document === "undefined") return;

  if (isRegressionSession()) {
    document.body.classList.add("regression-mode");
    const metrics = el.bottomPanel?.querySelector(".metrics-panel");
    if (metrics) metrics.open = true;
  }

  if (el.travelMapBtn && el.zonePanel) {
    el.travelMapBtn.addEventListener("click", () => {
      setMapOpen(!el.zonePanel.classList.contains("open"));
    });
  }
  if (el.closeTravelBtn && el.zonePanel) {
    el.closeTravelBtn.addEventListener("click", () => {
      setMapOpen(false);
    });
  }
  if (el.mapBackdrop) {
    el.mapBackdrop.addEventListener("click", () => {
      setMapOpen(false);
    });
  }

  if (el.toggleLogsBtn && el.bottomPanel) {
    el.toggleLogsBtn.addEventListener("click", () => setLogsOpen(!el.bottomPanel.classList.contains("open")));
    el.closeLogsBtn?.addEventListener("click", () => setLogsOpen(false));
    document.getElementById("logBackdrop")?.addEventListener("click", () => setLogsOpen(false));
  }

  if (el.closeInspectorBtn && el.inspectorPanel) {
    const inventoryBtn = document.getElementById("openInventoryBtn");
    inventoryBtn?.addEventListener("click", () => {
      el.inspectorPanel.classList.add("inventory-open");
      setInspectorOpen(true);
      const word = el.inventoryList.querySelector("button[aria-pressed=true]") || el.inventoryList.querySelector("button");
      const inventory = el.inventoryList.closest(".inventory");
      inventory?.scrollIntoView({ block: "nearest" });
      (word || inventory)?.focus({ preventScroll: true });
    });
    el.closeInspectorBtn.addEventListener("click", () => {
      const fromInventory = el.inspectorPanel.classList.contains("inventory-open");
      setInspectorOpen(false);
      (fromInventory ? inventoryBtn : el.sceneMap.querySelector("[aria-pressed=true]") || el.contextActions.querySelector(".open-investigation"))?.focus({ preventScroll: true });
    });
  }
  el.inspectorBackdrop?.addEventListener("click", () => el.closeInspectorBtn.click());
  syncInspectorActions();
  window.matchMedia?.(INSPECTOR_DRAWER_QUERY).addEventListener("change", syncInspectorActions);

  document.addEventListener?.("keydown", (event) => {
    if (document.querySelector(".utility-dialog[open]")) return;
    const modal = document.querySelector('.settings-panel:not(.hidden), .prologue-overlay:not(.hidden)') ||
      document.querySelector('.zone-panel.open, .inspector-panel[aria-modal="true"], .bottom-panel[aria-modal="true"]');
    if (event.key === "Tab" && modal) keepFocusInDialog(event, modal);
    if (event.key !== "Escape") return;
    if (modal?.id === "settingsPanel") document.getElementById("closeSettingsBtn").click();
    else if (modal?.id === "zonePanel") setMapOpen(false);
    else if (modal?.id === "inspectorPanel") el.closeInspectorBtn.click();
    else if (modal?.id === "bottomPanel") setLogsOpen(false);
  });
}

function keepFocusInDialog(event, dialog) {
  const buttons = Array.from(dialog.querySelectorAll('button:enabled:not([tabindex="-1"]), input:enabled, summary'))
    .filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");
  const current = buttons.indexOf(document.activeElement);
  if (current === -1 || (event.shiftKey ? current === 0 : current === buttons.length - 1)) {
    event.preventDefault();
    buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus();
  }
}

function setLogsOpen(open) {
  el.bottomPanel.classList.toggle("open", open);
  el.toggleLogsBtn.setAttribute("aria-expanded", String(open));
  const backdrop = document.getElementById("logBackdrop");
  backdrop?.classList.toggle("open", open);
  backdrop?.setAttribute("aria-hidden", String(!open));
  if (open) {
    el.bottomPanel.setAttribute("role", "dialog");
    el.bottomPanel.setAttribute("aria-modal", "true");
    renderMetrics(buildReport());
    applyLanguageToDocument();
    el.closeLogsBtn?.focus?.();
  } else {
    el.bottomPanel.removeAttribute("role");
    el.bottomPanel.removeAttribute("aria-modal");
    el.toggleLogsBtn.focus?.();
  }
}

function setInspectorOpen(open) {
  el.inspectorPanel?.classList.toggle("open", open);
  if (!open) el.inspectorPanel?.classList.remove("inventory-open");
  syncInspectorActions();
}

function syncInspectorActions() {
  if (!window.matchMedia) return;
  const wide = !window.matchMedia(INSPECTOR_DRAWER_QUERY).matches;
  const inInspector = !wide && el.inspectorPanel?.classList.contains("open");
  el.inspectorBackdrop?.classList.toggle("open", inInspector);
  el.inspectorBackdrop?.setAttribute("aria-hidden", String(!inInspector));
  if (inInspector) {
    el.inspectorPanel.setAttribute("role", "dialog");
    el.inspectorPanel.setAttribute("aria-modal", "true");
  } else {
    el.inspectorPanel?.removeAttribute("role");
    el.inspectorPanel?.removeAttribute("aria-modal");
  }
  const dock = wide || inInspector ? el.inspectorActions : el.tacticalDeck;
  if (el.contextActions.parentElement !== dock) {
    const carriedWord = document.getElementById("carriedWord");
    const actions = [el.combatReadout, carriedWord, el.travelLoadout, el.contextActions, el.actionHelp];
    dock.append(...actions.filter(Boolean));
  }
  const feedbackDock = inInspector || (wide && selectedObject()) ? el.inspectorActions : el.tacticalDeck;
  if (el.resultPulse.parentElement !== feedbackDock) feedbackDock.append(el.resultPulse);
  const runDock = inInspector ? el.inspectorActions : el.tacticalDeck;
  if (el.stageRunStatus.parentElement !== runDock) runDock.prepend(el.stageRunStatus);
}

function setMapOpen(open) {
  if (!el.zonePanel) return;
  el.zonePanel.classList.toggle("open", open);
  el.mapBackdrop?.classList.toggle("open", open);
  el.mapBackdrop?.setAttribute("aria-hidden", String(!open));
  el.travelMapBtn?.setAttribute("aria-expanded", String(open));
  if (open) el.closeTravelBtn?.focus?.();
  else el.travelMapBtn?.focus?.();
}
