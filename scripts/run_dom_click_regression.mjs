import { openSafari } from "./safari.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_URL = process.argv[2] || "http://127.0.0.1:4174/index.html";
const OUTPUT_PATH = process.argv[3] || "";

async function openPageTarget(url) {
  const session = await openSafari(1440, 960);
  try {
    await session.goto(url);
    await waitForAppReady(session);
    return session;
  } catch (error) { await session.close(); throw error; }
}

async function waitForReady(session) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await evalPage(session, `document.readyState`);
    if (state === "complete" || state === "interactive") return;
    await wait(80);
  }
  throw new Error("Page did not become ready.");
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

function clickExpr(kind, value) {
  const encoded = JSON.stringify(value);
  return `(() => {
    const fail = (message) => { throw new Error(message); };
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const byText = (selector, text) => [...document.querySelectorAll(selector)]
      .find((element) => element.textContent.trim() === text && visible(element));
    let element;
    if (${JSON.stringify(kind)} === "object") element = document.querySelector('[data-object-id=' + CSS.escape(${encoded}) + ']');
    if (${JSON.stringify(kind)} === "tag") element = document.querySelector('.tag-chip[data-tag=' + CSS.escape(${encoded}) + ']');
    if (${JSON.stringify(kind)} === "inventory") element = document.querySelector('.inventory-token[data-tag=' + CSS.escape(${encoded}) + ']');
    if (${JSON.stringify(kind)} === "action") element = byText('.action-button', ${encoded});
    if (!element) fail('Missing DOM target: ${kind} ' + ${encoded});
    if (!visible(element)) fail('DOM target is not visible: ${kind} ' + ${encoded});
    if (element.disabled) fail('DOM target is disabled: ${kind} ' + ${encoded});
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return true;
  })()`;
}

async function click(session, kind, value) {
  await evalPage(session, clickExpr(kind, value));
  await wait();
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

async function runControlAudit() {
  const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}mode=guided&controls=1`;
  const session = await openPageTarget(url);
  const checks = [];
  const check = (label, passed, detail = "") => checks.push({ label, passed: Boolean(passed), detail });
  try {
    await evalPage(session, `document.querySelector("#startPrologueBtn")?.click()`);

    const mapInitial = await evalPage(session, `(() => ({
      hidden: getComputedStyle(document.querySelector(".zone-panel")).display === "none",
      expanded: document.querySelector("#travelMapBtn").getAttribute("aria-expanded")
    }))()`);
    check("map starts closed", mapInitial.hidden && mapInitial.expanded === "false");

    await evalPage(session, `document.querySelector("#travelMapBtn").click()`);
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

    await evalPage(session, `document.querySelector(".zone-item.active").click()`);
    const mapClosesOnSelection = await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open") && document.querySelector("#travelMapBtn").getAttribute("aria-expanded") === "false"`);
    check("map closes after zone selection", mapClosesOnSelection);

    await evalPage(session, `document.querySelector("#travelMapBtn").click()`);
    await evalPage(session, `document.querySelector("#closeTravelBtn").click()`);
    check("map close button works", await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open")`));
    await evalPage(session, `document.querySelector("#travelMapBtn").click()`);
    await evalPage(session, `document.querySelector("#mapBackdrop").click()`);
    check("map backdrop closes drawer", await evalPage(session, `!document.querySelector(".zone-panel").classList.contains("open")`));

    await evalPage(session, `document.querySelector("#toggleLogsBtn").click()`);
    check("log drawer opens", await evalPage(session, `document.querySelector(".bottom-panel").classList.contains("open")`));
    await evalPage(session, `document.querySelector("#toggleLogsBtn").click()`);
    check("log drawer closes", await evalPage(session, `!document.querySelector(".bottom-panel").classList.contains("open")`));

    await evalPage(session, `document.querySelector("#settingsBtn").click()`);
    const settingsOpen = await evalPage(session, `(() => ({
      visible: !document.querySelector("#settingsPanel").classList.contains("hidden"),
      zones: document.querySelectorAll(".settings-zone-btn").length,
      bgm: document.querySelector("#bgmVolumeSlider").value,
      sfx: document.querySelector("#sfxVolumeSlider").value
    }))()`);
    check("settings opens with controls", settingsOpen.visible && settingsOpen.zones === 7 && settingsOpen.bgm === "50" && settingsOpen.sfx === "70");
    await evalPage(session, `document.querySelector("#closeSettingsBtn").click()`);
    check("settings closes", await evalPage(session, `document.querySelector("#settingsPanel").classList.contains("hidden")`));

    const themeBefore = await evalPage(session, `document.body.classList.contains("theme-light")`);
    await evalPage(session, `document.querySelector("#themeToggleBtn").click()`);
    const themeChanged = await evalPage(session, `document.body.classList.contains("theme-light") !== ${JSON.stringify(themeBefore)}`);
    await evalPage(session, `document.querySelector("#themeToggleBtn").click()`);
    const themeRestored = await evalPage(session, `document.body.classList.contains("theme-light") === ${JSON.stringify(themeBefore)}`);
    check("theme toggles and restores", themeChanged && themeRestored);

    await evalPage(session, `document.querySelector('.topbar [data-language="zh-Hant"]').click()`);
    check("traditional locale applies", await evalPage(session, `document.documentElement.lang === "zh-Hant" && document.querySelector("h1").textContent.includes("斷句庭院")`));
    await evalPage(session, `document.querySelector('.topbar [data-language="zh-Hans"]').click()`);
    check("simplified locale restores", await evalPage(session, `document.documentElement.lang === "zh-CN" && document.querySelector("h1").textContent.includes("断句庭院")`));

    for (const mode of ["guided", "low", "debug", "expedition"]) {
      await evalPage(session, `document.querySelector('[data-testid="mode-${mode}"]').click()`);
      const applied = await evalPage(session, `(() => {
        const report = JSON.parse(document.querySelector("#reportData").textContent);
        const active = document.querySelector(".mode-button.active");
        return report.testMode === ${JSON.stringify(mode)} && active?.dataset.mode === ${JSON.stringify(mode)} && active?.getAttribute("aria-pressed") === "true";
      })()`);
      check(`${mode} mode applies`, applied);
    }

    await evalPage(session, `document.querySelector('[data-chronicle-action="toggle-inscriptions"]').click()`);
    check("inscriptions expand", await evalPage(session, `document.querySelector("#chroniclePanel").classList.contains("mobile-expanded") && getComputedStyle(document.querySelector(".inscription-grid")).display === "grid"`));
    await evalPage(session, `document.querySelector('[data-chronicle-action="toggle-inscriptions"]').click()`);
    check("inscriptions collapse", await evalPage(session, `!document.querySelector("#chroniclePanel").classList.contains("mobile-expanded") && getComputedStyle(document.querySelector(".inscription-grid")).display === "none"`));

    const checkpointBefore = await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).metrics.checkpointRestores`);
    await evalPage(session, `document.querySelector("#checkpointBtn").click()`);
    const checkpointAfter = await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).metrics.checkpointRestores`);
    check("checkpoint restores", checkpointAfter === checkpointBefore + 1);

    await evalPage(session, `document.querySelector("#shareLinkBtn").click()`);
    await wait(80);
    check("share gives feedback", await evalPage(session, `JSON.parse(document.querySelector("#reportData").textContent).latestLog.some((item) => item.includes("试玩链接"))`));

    await evalPage(session, `document.querySelector("#restartSessionBtn").click()`);
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
    return report.flags.fieldPulse && !report.flags.bossDefeated && !wardenText.includes("耐久 0");
  })()`, "Boss exposed core with positive HP after field pulse");
  await extract(session, "bossTablet", "Semantic.Structure.Fragile");
  await inject(session, "warden", "Semantic.Structure.Fragile");
  await strike(session, "warden");
  await assertPage(session, `JSON.parse(document.querySelector("#reportData").textContent).flags.bossDefeated`, "Z6 boss defeated");
  await nextZone(session);

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

async function runMode(mode) {
  const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}mode=${mode}`;
  const session = await openPageTarget(url);
  try {
    return await route(session, mode);
  } finally {
    await session.close();
  }
}

const controls = await runControlAudit();
const reports = {
  guided: await runMode("guided"),
  low: await runMode("low"),
  expedition: await runMode("expedition")
};
const failures = [];
controls.checks.filter((item) => !item.passed).forEach((item) => failures.push(`control: ${item.label}`));
for (const [mode, report] of Object.entries(reports)) {
  if (!report.completed || report.currentZone !== "Z7") failures.push(`${mode} did not complete`);
  if (mode !== "expedition" && report.mistakes !== 0) failures.push(`${mode} mistakes expected 0, got ${report.mistakes}`);
  if (mode !== "expedition" && report.failureEvents !== 0) failures.push(`${mode} failure events expected 0, got ${report.failureEvents}`);
  if (report.bossCounters !== 3) failures.push(`${mode} boss counters expected 3, got ${report.bossCounters}`);
  if (report.reactions !== 4) failures.push(`${mode} reactions expected 4, got ${report.reactions}`);
  if (mode === "expedition" && (report.runFailed || report.integrity < 1 || report.collapses < 1 || report.reward < 1)) {
    failures.push("expedition long-term loop did not complete with pressure and reward");
  }
}
const output = {
  build: "1.1.1",
  browser: "Safari",
  url: APP_URL,
  passed: failures.length === 0,
  controls,
  reports,
  failures
};
console.log(JSON.stringify(output, null, 2));
if (OUTPUT_PATH) {
  const resolvedOutput = path.isAbsolute(OUTPUT_PATH) ? OUTPUT_PATH : path.join(ROOT, OUTPUT_PATH);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
if (failures.length) process.exit(1);
