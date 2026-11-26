import fs from "node:fs";

const html = fs.readFileSync("prototype/index.html", "utf8");
const css = fs.readFileSync("prototype/styles.css", "utf8");
const app = fs.readFileSync("prototype/app.js", "utf8");
const runtimeConfig = fs.readFileSync("prototype/core/runtime-config.js", "utf8");
const progression = fs.readFileSync("prototype/core/progression.js", "utf8");
const version = fs.readFileSync("VERSION", "utf8").trim();
const failures = [];

function fail(message) {
  failures.push(message);
}

const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const ids = new Set(idMatches);
const duplicateIds = idMatches.filter((id, index) => idMatches.indexOf(id) !== index);
if (duplicateIds.length) fail(`duplicate html ids: ${[...new Set(duplicateIds)].join(", ")}`);

const boundIds = [...app.matchAll(/document\.getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
for (const id of boundIds) {
  if (!ids.has(id)) fail(`app binds missing html id: ${id}`);
}

for (const mode of ["guided", "low", "expedition", "debug"]) {
  if (!html.includes(`data-mode="${mode}"`)) fail(`missing mode button: ${mode}`);
}

for (const language of ["zh-Hans", "zh-Hant"]) {
  const count = [...html.matchAll(new RegExp(`data-language="${language}"`, "g"))].length;
  if (count !== 2) fail(`expected two ${language} language buttons, found ${count}`);
}
if (html.includes('data-language="en"')) fail("English language mode should not be exposed");

for (const file of ["styles.css", "core/runtime-config.js", "core/progression.js", "app.js", "regression.js"]) {
  if (!html.includes(`"./${file}?v=${version}"`)) fail(`missing current cache key for ${file}`);
}
if (!html.includes(`${version} Chronicle Expedition`)) fail(`index.html build pill is not ${version}`);

const sceneImages = new Set(Array.from(`${html}\n${css}`.matchAll(/["']\.\/([^"']+\.jpg)["']/g), (match) => match[1]));
for (const image of sceneImages) {
  if (image.includes("/") || !fs.existsSync(`prototype/${image}`)) {
    fail(`scene image missing from Pages source: ${image}`);
  }
}
if (app.includes('window.location.search.includes("mode=")')) fail("playable mode query must not trigger regression layout");
if (!html.includes("<body>") || !app.includes('theme: "dark"')) fail("first visit should render in dark theme");
if (!runtimeConfig.includes('themePreferenceKey: "echo_string_theme_preference_v1"')) fail("theme preference key missing");
if (!app.includes("setItem(THEME_PREFERENCE_KEY, state.theme)")) fail("manual theme preference is not persisted");
if (!progression.includes("purchaseUpgrade")) fail("long-term upgrade system missing");
if (!ids.has("decisionStrip")) fail("decision strip node missing");
if (!ids.has("resultPulse")) fail("result pulse node missing");
if (!ids.has("checkpointBtn")) fail("checkpoint button missing");
if (!ids.has("mapBackdrop")) fail("map backdrop node missing");
if (!app.includes("function setMapOpen(open)")) fail("map drawer state controller missing");
if (!/<button\b[^>]*id="travelMapBtn"[^>]*aria-controls="zonePanel"[^>]*aria-expanded="false"/.test(html)) fail("map button expansion state missing");

if (failures.length) {
  console.error(failures.map((item) => `[FAIL] ${item}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  ids: ids.size,
  boundIds: boundIds.length,
  modes: 4
}, null, 2));
