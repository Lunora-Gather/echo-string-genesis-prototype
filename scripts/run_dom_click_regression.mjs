import { openSafari } from "./safari.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_URL = process.argv[2] || "http://127.0.0.1:4174/index.html";
const OUTPUT_PATH = path.resolve(ROOT, process.argv[3] || "artifacts/browser/dom_click_report.json");

async function openPageTarget(url, { width = 1440, height = 960 } = {}) {
  const session = await openSafari(width, height);
  try {
    await session.goto(url);
    await waitForAppReady(session);
    return session;
  } catch (error) { await session.close(); throw error; }
}

async function waitForAppReady(session) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const ready = await evalPage(session, `(() => {
      const report = document.querySelector("#reportData")?.textContent || "";
      return Boolean(document.querySelector(".object-token") && window.__echoString && report.includes('"uxBuild"'));
    })()`);
    if (ready) return;
    await wait(80);
  }
  throw new Error("Echo String app did not render object tokens.");
}

function evalPage(session, expression) {
  return session.evaluate(expression);
}

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function click(session, kind, value) {
  const encoded = JSON.stringify(value);
  const selectors = {
    object: `[data-object-id=${encoded}]`,
    tag: `.tag-chip[data-tag=${encoded}]`,
    inventory: `.inventory-token[data-tag=${encoded}]`,
    action: `[data-action=${encoded}]`
  };
  if (kind === "object") {
    const inspectorOpen = await evalPage(session, 'Boolean(document.querySelector("#inspectorActions [data-action]"))');
    if (inspectorOpen) {
      const sameTarget = await evalPage(session, `document.querySelector(${JSON.stringify(selectors.object)})?.getAttribute("aria-pressed") === "true"`);
      if (sameTarget) return;
      await session.click("#closeInspectorBtn");
    }
  }
  await session.click(selectors[kind]);
}

async function isScanned(session, id) {
  return evalPage(session, `(() => {
    const card = document.querySelector('[data-object-id=' + CSS.escape(${JSON.stringify(id)}) + ']');
    return Boolean(card && card.textContent.includes("已扫描"));
  })()`);
}

async function scan(session, id) {
  await click(session, "object", id);
  if (!(await isScanned(session, id))) await click(session, "action", "扫描");
}

async function extract(session, id, tagId) {
  await scan(session, id);
  await click(session, "tag", tagId);
  await click(session, "action", "剥离选中词");
  await assertPage(session, `Boolean(document.querySelector('.inventory-token[data-tag=' + CSS.escape(${JSON.stringify(tagId)}) + ']'))`, `inventory has ${tagId}`);
}

async function inject(session, id, tagId) {
  await scan(session, id);
  await click(session, "inventory", tagId);
  await click(session, "action", "注入选中词");
}

async function strike(session, id, limit = 1) {
  for (let i = 0; i < limit; i += 1) {
    await scan(session, id);
    const canStrike = await evalPage(session, `(() => {
      const button = [...document.querySelectorAll('.action-button')]
        .find((item) => item.textContent.trim() === "重击");
      return Boolean(button && !button.disabled);
    })()`);
    if (!canStrike) return;
    await click(session, "action", "重击");
  }
}

async function nextZone(session) {
  await click(session, "action", "进入下一区域");
}

async function assertPage(session, expression, label) {
  const passed = await evalPage(session, `Boolean(${expression})`);
  if (!passed) throw new Error(`DOM click assertion failed: ${label}`);
}

async function enterGame(session) {
  const entered = () => evalPage(session, 'document.querySelector("#prologueOverlay").classList.contains("hidden")');
  for (let attempt = 0; attempt < 2 && !await entered(); attempt += 1) {
    await session.click("#startPrologueBtn");
  }
  if (!await entered()) throw new Error("The start button did not dismiss the prologue.");
}

async function runControlAudit() {
  const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}mode=guided&controls=1`;
  const session = await openPageTarget(url);
  const checks = [];
  const check = (label, passed, detail = "") => checks.push({ label, passed: Boolean(passed), detail });
  try {
    await enterGame(session);

    const mapInitial = await evalPage(session, `(() => ({
      hidden: getComputedStyle(document.querySelector(".zone-panel")).display === "none",
      expanded: document.querySelector("#travelMapBtn").getAttribute("aria-expanded")
    }))()`);
    check("map starts closed", mapInitial.hidden && mapInitial.expanded === "false");

    await session.click("#travelMapBtn");
    const mapOpen = await evalPage(session, `(() => {
      const panel = document.querySelector(".zone-panel");
      const rect = panel.getBoundingClientRect();
      return {
        open: panel.classList.contains("open"),
        visible: rect.width > 0 && rect.height > 0,
        backdrop: document.querySelector("#mapBackdrop").classList.contains("open"),
        expanded: document.querySelector("#travelMapBtn").getAttribute("aria-expanded")
      };
    })()`);
    check("map opens as visible drawer", mapOpen.open && mapOpen.visible && mapOpen.backdrop && mapOpen.expanded === "true");

    await session.click(".zone-item.active");
    const mapClosesOnSelection = await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open") && document.querySelector("#travelMapBtn").getAttribute("aria-expanded") === "false"`);
    check("map closes after zone selection", mapClosesOnSelection);

    await session.click("#travelMapBtn");
    await session.click("#closeTravelBtn");
    check("map close button works", await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open")`));
    await session.click("#travelMapBtn");
    await session.click("#mapBackdrop");
    check("map backdrop closes drawer", await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open")`));

    await session.click("#toggleLogsBtn");
    check("log drawer opens", await evalPage(session, `document.querySelector(".bottom-panel").classList.contains("open")`));
    await session.click("#closeLogsBtn");
    check("log drawer closes", await evalPage(session, `!document.querySelector(".bottom-panel").classList.contains("open")`));

    await session.click("#settingsBtn");
    const settingsOpen = await evalPage(session, `(() => ({
      visible: !document.querySelector("#settingsPanel").classList.contains("hidden"),
      zones: document.querySelectorAll(".settings-zone-btn").length,
      bgm: document.querySelector("#bgmVolumeSlider").value,
      sfx: document.querySelector("#sfxVolumeSlider").value
    }))()`);
    check("settings opens with controls", settingsOpen.visible && settingsOpen.zones === 7 && settingsOpen.bgm === "50" && settingsOpen.sfx === "70");
    await session.click("#closeSettingsBtn");
    check("settings closes", await evalPage(session, `document.querySelector("#settingsPanel").classList.contains("hidden")`));

    const themeBefore = await evalPage(session, `document.body.classList.contains("theme-light")`);
    await session.click("#themeToggleBtn");
    const themeChanged = await evalPage(session, `document.body.classList.contains("theme-light") !== ${JSON.stringify(themeBefore)}`);
    check("object cards follow the theme", await evalPage(session, `getComputedStyle(document.querySelector(".object-token")).backgroundColor === getComputedStyle(document.querySelector("#inspector")).backgroundColor`));
    await session.click("#themeToggleBtn");
    const themeRestored = await evalPage(session, `document.body.classList.contains("theme-light") === ${JSON.stringify(themeBefore)}`);
    check("theme toggles and restores", themeChanged && themeRestored);

    await session.click('.playbar [data-language="zh-Hant"]');
    check("traditional locale applies", await evalPage(session, `document.documentElement.lang === "zh-Hant" && document.querySelector("h1").textContent.includes("斷句庭院") && document.querySelector('[data-mode="expedition"]').textContent === "遠征"`));
    await session.click('.playbar [data-language="zh-Hans"]');
    check("simplified locale restores", await evalPage(session, `document.documentElement.lang === "zh-CN" && document.querySelector("h1").textContent.includes("断句庭院")`));

    for (const mode of ["guided", "low", "debug", "expedition"]) {
      await session.click(`[data-testid="mode-${mode}"]`);
      const applied = await evalPage(session, `(() => {
        const report = JSON.parse(document.querySelector("#reportData").textContent);
        const active = document.querySelector(".mode-button.active");
        return report.testMode === ${JSON.stringify(mode)} && active?.dataset.mode === ${JSON.stringify(mode)} && active?.getAttribute("aria-pressed") === "true";
      })()`);
      check(`${mode} mode applies`, applied);
    }

    await session.click('[data-chronicle-action="toggle-inscriptions"]');
    check("inscriptions expand", await evalPage(session, `document.querySelector("#chroniclePanel").classList.contains("mobile-expanded") && getComputedStyle(document.querySelector(".inscription-grid")).display === "grid"`));
    await session.click('[data-chronicle-action="toggle-inscriptions"]');
    check("inscriptions collapse", await evalPage(session, `!document.querySelector("#chroniclePanel").classList.contains("mobile-expanded") && getComputedStyle(document.querySelector(".inscription-grid")).display === "none"`));

    const checkpointBefore = await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).metrics.checkpointRestores`);
    await session.click("#checkpointBtn");
    const checkpointAfter = await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).metrics.checkpointRestores`);
    check("checkpoint restores", checkpointAfter === checkpointBefore + 1);

    await session.click("#shareLinkBtn");
    await wait(80);
    check("share gives feedback", await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).latestLog.some((item) => item.includes("试玩链接"))`));

    await session.click("#restartSessionBtn");
    const restarted = await evalPage(session, `(() => {
      const report = JSON.parse(document.querySelector("#reportData").textContent);
      return report.currentZone === "Z1" && !report.completed;
    })()`);
    check("restart returns to Z1", restarted);
    check("report download control exists", await evalPage(session, `Boolean(document.querySelector("#downloadReportBtn") && !document.querySelector("#downloadReportBtn").disabled)`));

    return {
      passed: checks.every((item) => item.passed),
      checks
    };
  } finally {
    await session.close();
  }
}

async function route(session, mode) {
  await evalPage(session, `document.body.dataset.domClickMode = ${JSON.stringify(mode)}`);

  await extract(session, "statue", "Semantic.Structure.Fragile");
  await inject(session, "gate", "Semantic.Structure.Fragile");
  await strike(session, "gate");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.gateDestroyed`, "Z1 gate destroyed");
  await nextZone(session);

  await extract(session, "tablet", "Semantic.Mass.Light");
  await inject(session, "block", "Semantic.Mass.Light");
  await click(session, "action", "推动石块");
  await inject(session, "block", "Semantic.Mass.Heavy");
  await click(session, "action", "压住机关");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.platePressed`, "Z2 plate pressed");
  await nextZone(session);

  await scan(session, "guardA");
  await click(session, "action", "弹反破绽");
  await click(session, "tag", "Semantic.Structure.Solid");
  await click(session, "action", "剥离选中词");
  await strike(session, "guardA", 5);
  await strike(session, "guardB", 3);
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).currentZone === "Z3" && JSON.parse(document.querySelector("#reportData").textContent).currentSteps.every((item) => item.done)`, "Z3 enemies defeated");
  await nextZone(session);

  await extract(session, "brazier", "Semantic.Temperature.Overheated");
  await inject(session, "lift", "Semantic.Temperature.Overheated");
  await extract(session, "pool", "Semantic.Medium.Wet");
  await inject(session, "beast", "Semantic.Medium.Wet");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.liftMelted && JSON.parse(document.querySelector("#reportData").textContent).flags.steamBurst`, "Z4 steam and lift complete");
  await nextZone(session);

  await scan(session, "pullPillar");
  await click(session, "action", "聚拢碎片");
  await scan(session, "pushPillar");
  await click(session, "action", "形成桥面");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.bridgeFormed`, "Z5 bridge formed");
  await nextZone(session);

  await extract(session, "bossFire", "Semantic.Temperature.Overheated");
  await inject(session, "warden", "Semantic.Temperature.Overheated");
  await extract(session, "bossPool", "Semantic.Medium.Wet");
  await inject(session, "warden", "Semantic.Medium.Wet");
  await extract(session, "bossIce", "Semantic.Temperature.Frozen");
  await inject(session, "warden", "Semantic.Temperature.Frozen");
  await extract(session, "bossTablet", "Semantic.Structure.Fragile");
  await inject(session, "warden", "Semantic.Structure.Fragile");
  await strike(session, "warden");
  await extract(session, "bossPull", "Semantic.Field.Attract");
  await inject(session, "warden", "Semantic.Field.Attract");
  await extract(session, "bossPush", "Semantic.Field.Repel");
  await inject(session, "warden", "Semantic.Field.Repel");
  await assertPage(session, `(() => {
    const report = JSON.parse(document.querySelector("#reportData").textContent);
    const wardenText = document.querySelector('[data-object-id="warden"]')?.textContent || "";
    return report.metrics.bossPhaseCounters.some((counter) => counter.reaction === "Reaction.FieldPulse" && counter.layerAfter === 0) &&
      !report.flags.bossDefeated && !wardenText.includes("耐久 0");
  })()`, "Boss exposed core with positive HP after field pulse");
  await extract(session, "bossTablet", "Semantic.Structure.Fragile");
  await inject(session, "warden", "Semantic.Structure.Fragile");
  await strike(session, "warden");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.bossDefeated`, "Z6 boss defeated");
  if (mode === "low") {
    if (await evalPage(session, 'Boolean(document.querySelector("#inspectorActions [data-action]"))')) {
      await session.click("#closeInspectorBtn");
    }
    await session.click("#travelMapBtn");
    await session.click('#zoneList [data-zone="Z7"]');
  } else {
    await nextZone(session);
  }

  return evalPage(session, `(() => {
    const report = JSON.parse(document.querySelector("#reportData").textContent);
    return {
      mode: report.testMode,
      completed: report.completed,
      currentZone: report.currentZone,
      scans: report.metrics.scans,
      extracts: report.metrics.extracts,
      injects: report.metrics.injects,
      reactions: report.metrics.reactions,
      mistakes: report.summary.totalMistakes,
      feedbackEvents: report.metrics.feedbackEvents.length,
      failureEvents: report.metrics.failureEvents.length,
      bossCounters: report.metrics.bossPhaseCounters.length,
      experienceStatus: report.experience.status,
      collapses: report.run?.collapses || 0,
      integrity: report.run?.integrity ?? 3,
      runFailed: Boolean(report.run?.failed),
      reward: report.run?.lastReward || 0
    };
  })()`);
}

async function runMode(mode, viewport) {
  const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}mode=${mode}`;
  const session = await openPageTarget(url, viewport);
  try {
    await enterGame(session);
    return await route(session, mode);
  } finally {
    await session.close();
  }
}

const output = {
  build: "1.1.1",
  browser: "Safari",
  url: APP_URL,
  passed: false,
  controls: null,
  reports: {},
  failures: []
};
try {
  const controls = await runControlAudit();
  output.controls = controls;
  for (const check of controls.checks) {
    if (!check.passed) output.failures.push(`control: ${check.label}`);
  }

  const routes = [
    ["guided", "guided"],
    ["low", "low"],
    ["expedition", "expedition"],
    ["mobileExploration", "low", { width: 390, height: 844 }]
  ];
  for (const [name, mode, viewport] of routes) {
    const report = await runMode(mode, viewport);
    output.reports[name] = report;
    if (!report.completed || report.currentZone !== "Z7") output.failures.push(`${name} did not complete`);
    if (report.mistakes !== 0) output.failures.push(`${name} mistakes expected 0, got ${report.mistakes}`);
    if (report.failureEvents !== 0) output.failures.push(`${name} failure events expected 0, got ${report.failureEvents}`);
    if (report.bossCounters !== 3) output.failures.push(`${name} boss counters expected 3, got ${report.bossCounters}`);
    if (report.reactions !== 4) output.failures.push(`${name} reactions expected 4, got ${report.reactions}`);
    if (mode === "expedition" && (report.runFailed || report.integrity < 1 || report.collapses < 1 || report.reward < 1)) {
      output.failures.push("expedition long-term loop did not complete with pressure and reward");
    }
  }
} catch (error) {
  output.failures.push(error.message);
}
output.passed = output.failures.length === 0;
console.log(JSON.stringify(output, null, 2));
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
if (!output.passed) process.exitCode = 1;
