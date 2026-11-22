import assert from "node:assert/strict";
import vm from "node:vm";
import { loadAppContext } from "./app_vm_harness.mjs";

const SAVE_KEY = "echo_string_save_v1.1";
const PROFILE_KEY = "echo_string_profile_v1.1";

function createStorage(entries = {}) {
  const items = new Map(Object.entries(entries));
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value)
  };
}

function open(storage, search) {
  const { context } = loadAppContext(undefined, { storage, search });
  return (source) => vm.runInContext(source, context);
}

const storage = createStorage();
const first = open(storage);
first(`routeExtract("statue", "Semantic.Structure.Fragile");
  routeInject("gate", "Semantic.Structure.Fragile");`);
const continued = open(storage);
assert.equal(continued("state.ink"), 9);
assert.equal(continued("state.metrics.injects"), 1);
assert.equal(continued(`hasTag(objectById("gate"), "Semantic.Structure.Fragile")`), true);
assert.equal(continued(`hasTag(objectById("statue"), "Semantic.Structure.Fragile")`), false);
continued("el.undoBtn.click()");
assert.equal(open(storage)(`hasInventory("Semantic.Structure.Fragile")`), true);
continued("el.checkpointBtn.click()");
const restored = open(storage);
assert.equal(restored("state.ink"), 12);
assert.equal(restored(`hasTag(objectById("statue"), "Semantic.Structure.Fragile")`), true);

const completionStorage = createStorage();
const route = open(completionStorage);
route(`runRouteRegression("guided", () => {
  el.zoneList.children[6].click();
});`);
const completed = open(completionStorage);
assert.equal(completed("isCompleted() && isFinalZone()"), true);
assert.equal(completed("state.metrics.bossPhaseCounters.length"), 3);
assert.equal(completed("state.profile.completedRuns"), 1);
assert.equal(completed("state.profile.echo"), 8);
completed("el.zoneList.children[5].click(); el.zoneList.children[6].click();");
assert.equal(open(completionStorage)("state.profile.completedRuns"), 1);
completed(`setTestMode("expedition");`);
const expedition = open(completionStorage);
assert.equal(expedition(`state.testMode === "expedition" && zone().id === "Z1"`), true);
assert.equal(expedition("state.unlockedZones.length"), 1);
assert.equal(expedition("state.profile.echo"), 8);

const pressureStorage = createStorage();
open(pressureStorage, "?mode=expedition")(`state.run.threat = 99; state.run.integrity = 1;
  selectObject("gate"); scanSelected();`);
const failed = open(pressureStorage);
assert.equal(failed("runIsFailed() && state.run.threat === 100 && state.run.integrity === 0"), true);
assert.equal(failed("state.profile.totalCollapses"), 1);
failed("el.restartSessionBtn.click()");
assert.equal(open(pressureStorage)("!runIsFailed() && state.run.integrity === 3 && state.profile.totalCollapses === 1"), true);

const legacyStorage = createStorage({
  [SAVE_KEY]: JSON.stringify({ schema: 2, zone: 1, ink: 3, inventory: [], testMode: "low", flags: { gateDestroyed: true, blockMoved: true } }),
  [PROFILE_KEY]: JSON.stringify({ echo: 21, completedRuns: 4, upgrades: { inkwell: 1 } })
});
const migrated = open(legacyStorage);
assert.equal(migrated(`zone().id === "Z2" && state.testMode === "low"`), true);
assert.equal(migrated("state.profile.echo === 21 && state.ink === 14"), true);
assert.equal(migrated("state.flags.gateDestroyed && !state.flags.blockMoved"), true);
assert.equal(migrated(`hasTag(objectById("tablet"), "Semantic.Mass.Light")`), true);
const differentMode = open(legacyStorage, "?mode=expedition");
assert.equal(differentMode(`zone().id === "Z1" && state.testMode === "expedition" && state.profile.echo === 21`), true);

const stale = open(storage);
restored(`setLanguage("zh-Hant")`);
stale(`setTestMode("low")`);
assert.equal(stale("state.storageConflict"), true);
assert.equal(open(storage)(`state.language === "zh-Hant" && state.testMode === "guided"`), true);

const beforeAudit = storage.getItem(SAVE_KEY);
const audit = open(storage, "?autorun=suite-regression");
assert.equal(audit("document.body.dataset.regressionStatus"), "passed");
assert.equal(storage.getItem(SAVE_KEY), beforeAudit);

console.log("Persistence regression passed: object state, undo, checkpoint, map completion, settlement, restart, expedition failure, legacy migration, stale tabs, and query-driven regression isolation.");
