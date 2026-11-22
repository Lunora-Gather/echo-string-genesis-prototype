import { openSafari } from "./safari.mjs";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_URL = process.argv[2] || "http://127.0.0.1:4174/index.html";
const OUTPUT_PATH = path.resolve(ROOT, process.argv[3] || "artifacts/browser/visual_smoke_report.json");
const SCREENSHOT_DIR = path.join(path.dirname(OUTPUT_PATH), "screenshots");

const scenarios = [
  {
    name: "desktop-expedition",
    mode: "expedition",
    width: 1440,
    height: 960,
    mobile: false,
    screenshot: "desktop-expedition.png"
  },
  {
    name: "desktop-guided",
    mode: "guided",
    width: 1280,
    height: 900,
    mobile: false,
    screenshot: "desktop-guided.png"
  },
  {
    name: "mobile-low",
    mode: "low",
    width: 390,
    height: 844,
    mobile: true,
    screenshot: "mobile-low.png"
  },
  {
    name: "mobile-expedition",
    mode: "expedition",
    width: 390,
    height: 844,
    mobile: true,
    screenshot: "mobile-expedition.png"
  }
];

async function navigate(session, url) {
  await session.goto(url);
  await waitForReady(session);
  await waitForAppReady(session);
}

async function enterGame(session) {
  const entered = () => evalPage(session, 'document.querySelector("#prologueOverlay").classList.contains("hidden")');
  for (let attempt = 0; attempt < 2 && !await entered(); attempt += 1) {
    await session.click("#startPrologueBtn");
  }
  if (!await entered()) throw new Error("The start button did not dismiss the prologue.");
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
    const canPressInViewport = (element, rect) => {
      if (!rect || element.disabled) return false;
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      return right - left >= 24 && bottom - top >= 24 &&
        element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2));
    };
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
      width: window.innerWidth,
      height: window.innerHeight,
      prologueHidden: Boolean(document.querySelector("#prologueOverlay")?.classList.contains("hidden")),
      objectTokens,
      actionButtons: document.querySelectorAll(".action-button").length,
      overflowX,
      firstActionVisible: Boolean(actionRect && actionRect.top < window.innerHeight && actionRect.bottom > 0),
      firstActionEnabled: Boolean(action && !action.disabled),
      firstObjectVisible: Boolean(firstObjectRect && firstObjectRect.top < window.innerHeight && firstObjectRect.bottom > 0),
      firstObjectEnabled: Boolean(firstObject && !firstObject.disabled),
      firstUsableStepVisible: canPressInViewport(action, actionRect) || canPressInViewport(firstObject, firstObjectRect),
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
    const screenshotPath = path.join(SCREENSHOT_DIR, scenario.screenshot);
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const failures = [];
    if (inspection.uxBuild !== "1.1.1") failures.push("build label is not 1.1.1");
    if (inspection.mode !== scenario.mode) failures.push(`mode expected ${scenario.mode}, got ${inspection.mode}`);
    if (inspection.zone !== "Z1") failures.push(`initial zone expected Z1, got ${inspection.zone}`);
    if (scenario.mobile && inspection.width > 520) failures.push(`viewport width ${inspection.width}px did not reach the phone breakpoint`);
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
      viewport: { width: inspection.width, height: inspection.height, mobile: scenario.mobile },
      screenshot: path.relative(ROOT, screenshotPath),
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
const failures = [];
for (const scenario of scenarios) {
  try {
    const result = await captureScenario(scenario);
    results.push(result);
    failures.push(...result.failures.map((failure) => `${scenario.name}: ${failure}`));
  } catch (error) {
    failures.push(`${scenario.name}: ${error.message}`);
    break;
  }
}
const output = {
  build: "1.1.1",
  browser: "Safari",
  url: APP_URL,
  passed: failures.length === 0,
  scenarios: results,
  failures
};
console.log(JSON.stringify(output, null, 2));
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
if (failures.length) process.exit(1);
