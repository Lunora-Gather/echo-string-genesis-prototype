import fs from "node:fs";

const html = fs.readFileSync("prototype/index.html", "utf8");
const app = fs.readFileSync("prototype/app.js", "utf8");
const runtimeConfig = fs.readFileSync("prototype/core/runtime-config.js", "utf8");
const progression = fs.readFileSync("prototype/core/progression.js", "utf8");
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

if (!html.includes("core/runtime-config.js?v=1.1.1")) fail("runtime config module is missing");
if (!html.includes("core/progression.js?v=1.1.1")) fail("progression module is missing");
if (!html.includes("app.js?v=1.1.1")) fail("index.html script cache key is not 1.1.1");
if (!html.includes("regression.js?v=1.1.1")) fail("index.html regression cache key is not 1.1.1");
if (!html.includes("1.1.1 Chronicle Expedition")) fail("index.html build pill is not 1.1.1");
if (app.includes('window.location.search.includes("mode=")')) fail("playable mode query must not trigger regression layout");
if (!html.includes('<body class="theme-light">')) fail("first visit should render in light theme");
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
