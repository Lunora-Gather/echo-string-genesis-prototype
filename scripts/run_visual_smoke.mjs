import { openSafari } from "./safari.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_URL = process.argv[2] || "http://127.0.0.1:4174/index.html";
const OUTPUT_PATH = process.argv[3] || "production/releases/1.1.1/visual_smoke_report.json";

const scenarios = [
  {
    name: "desktop-expedition",
    mode: "expedition",
    width: 1440,
    height: 960,
    mobile: false,
    screenshot: "production/releases/1.1.1/screenshots/desktop-expedition.png"
  },
  {
    name: "desktop-guided",
    mode: "guided",
    width: 1280,
    height: 900,
    mobile: false,
    screenshot: "production/releases/1.1.1/screenshots/desktop-guided.png"
  },
  {
    name: "mobile-low",
    mode: "low",
    width: 390,
    height: 844,
    mobile: true,
    screenshot: "production/releases/1.1.1/screenshots/mobile-low.png"
  },
  {
    name: "mobile-expedition",
    mode: "expedition",
    width: 390,
    height: 844,
    mobile: true,
    screenshot: "production/releases/1.1.1/screenshots/mobile-expedition.png"
  }
];

async function navigate(session, url) {
  await session.goto(url);
  await waitForReady(session);
  await waitForAppReady(session);
}

async function enterGame(session) {
  const entered = await evalPage(session, `(() => {
    const overlay = document.querySelector("#prologueOverlay");
    if (!overlay || overlay.classList.contains("hidden")) return true;
    const start = document.querySelector("#startPrologueBtn");
    if (!start) return false;
    start.click();
    return overlay.classList.contains("hidden");
  })()`);
  if (!entered) throw new Error("Could not dismiss the prologue before visual capture.");
}

async function waitForReady(session) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const state = await evalPage(session, "document.readyState");
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
  throw new Error("Echo String app did not render.");
}

function evalPage(session, expression) {
  return session.evaluate(expression);
}

async function inspectPage(session, scenario) {
  return evalPage(session, `(() => {
    const report = JSON.parse(document.querySelector("#reportData").textContent);
    const bodyText = document.body.innerText;
    const action = [...document.querySelectorAll(".action-button")].find((item) => item.textContent.trim().length > 0);
    const actionRect = action?.getBoundingClientRect();
    const firstObject = document.querySelector(".object-token");
    const firstObjectRect = firstObject?.getBoundingClientRect();
    const objectTokens = document.querySelectorAll(".object-token").length;
    const overflowX = Math.max(0, Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    const resultPulse = document.querySelector("#resultPulse");
    const resultRect = resultPulse?.getBoundingClientRect();
    const unscannedCards = [...document.querySelectorAll(".object-token")]
      .filter((item) => item.textContent.includes("未扫描"));
    const lowLeaks = ${JSON.stringify(scenario.mode)} === "low"
      ? unscannedCards.some((item) => item.textContent.includes("当前词缀") || item.textContent.includes("开放槽位") || item.textContent.includes("取词成本"))
      : false;
    return {
      uxBuild: report.uxBuild,
      mode: report.testMode,
      zone: report.currentZone,
      prologueHidden: Boolean(document.querySelector("#prologueOverlay")?.classList.contains("hidden")),
      objectTokens,
      actionButtons: document.querySelectorAll(".action-button").length,
      overflowX,
      firstActionVisible: Boolean(actionRect && actionRect.top < window.innerHeight && actionRect.bottom > 0),
      firstActionEnabled: Boolean(action && !action.disabled),
      firstObjectVisible: Boolean(firstObjectRect && firstObjectRect.top < window.innerHeight && firstObjectRect.bottom > 0),
      firstObjectEnabled: Boolean(firstObject && !firstObject.disabled),
      firstUsableStepVisible: Boolean(
        (actionRect && actionRect.top < window.innerHeight && actionRect.bottom > 0 && action && !action.disabled) ||
        (firstObjectRect && firstObjectRect.top < window.innerHeight && firstObjectRect.bottom > 0 && firstObject && !firstObject.disabled)
      ),
      resultPulseVisible: Boolean(resultRect && resultRect.top < window.innerHeight && resultRect.bottom > 0),
      hasTitle: bodyText.includes("断句庭院"),
      hasBuild: bodyText.includes("1.1.1 Chronicle Expedition"),
      lowUnscannedLeaks: lowLeaks
    };
  })()`);
}

async function captureScenario(scenario) {
  const session = await openSafari(scenario.width, scenario.height);
  try {
    const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}mode=${scenario.mode}`;
    await navigate(session, url);
    await enterGame(session);
    await wait(1200);
    const inspection = await inspectPage(session, scenario);
    const screenshot = { data: await session.screenshot() };
    const screenshotPath = path.join(ROOT, scenario.screenshot);
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const failures = [];
    if (inspection.uxBuild !== "1.1.1") failures.push("build label is not 1.1.1");
    if (inspection.mode !== scenario.mode) failures.push(`mode expected ${scenario.mode}, got ${inspection.mode}`);
    if (inspection.zone !== "Z1") failures.push(`initial zone expected Z1, got ${inspection.zone}`);
    if (!inspection.prologueHidden) failures.push("prologue still covers the game interface");
    if (inspection.objectTokens < 2) failures.push("fewer than two object cards rendered");
    if (inspection.actionButtons < 1) failures.push("no action buttons rendered");
    if (inspection.overflowX > 2) failures.push(`horizontal overflow ${inspection.overflowX}px`);
    if (!inspection.firstActionVisible) failures.push("first action button is not visible in the first viewport");
    if (scenario.mobile && !inspection.firstObjectVisible) failures.push("first object card is not visible in the first mobile viewport");
    if (!inspection.firstUsableStepVisible) failures.push("no usable first-step target is visible in the first viewport");
    if (!inspection.resultPulseVisible) failures.push("result feedback is not visible in the first viewport");
    if (!inspection.hasTitle || !inspection.hasBuild) failures.push("title or build label is missing");
    if (inspection.lowUnscannedLeaks) failures.push("low mode leaks hidden unscanned object details");

    return {
      name: scenario.name,
      url,
      viewport: { width: scenario.width, height: scenario.height, mobile: scenario.mobile },
      screenshot: scenario.screenshot,
      passed: failures.length === 0,
      inspection,
      failures
    };
  } finally {
    await session.close();
  }
}

function wait(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const results = [];
for (const scenario of scenarios) {
  results.push(await captureScenario(scenario));
}
const failures = results.flatMap((result) => result.failures.map((failure) => `${result.name}: ${failure}`));
const output = {
  build: "1.1.1",
  browser: "Safari",
  url: APP_URL,
  passed: failures.length === 0,
  scenarios: results,
  failures
};
console.log(JSON.stringify(output, null, 2));
if (OUTPUT_PATH) {
  const resolvedOutput = path.isAbsolute(OUTPUT_PATH) ? OUTPUT_PATH : path.join(ROOT, OUTPUT_PATH);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(resolvedOutput, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}
if (failures.length) process.exit(1);
