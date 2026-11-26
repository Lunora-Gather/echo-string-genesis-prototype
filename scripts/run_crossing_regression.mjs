import assert from "node:assert/strict";
import vm from "node:vm";
import { loadAppContext } from "./app_vm_harness.mjs";

const LIGHT = "Semantic.Mass.Light";
const SOLID = "Semantic.Structure.Solid";
const SEAL = "Semantic.Structure.Closed";

function createGame() {
  const entries = new Map();
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  return () => {
    const { context } = loadAppContext(undefined, { storage, search: "?mode=low" });
    return (source) => vm.runInContext(source, context);
  };
}

const refresh = createGame();
const play = refresh();
play(`routeExtract("gate", "${SEAL}");`);
assert.equal(play("Boolean(el.travelLoadout && !el.travelLoadout.classList.contains('hidden'))"), true, "a completed room offers a choice for words you actually hold");
play("nextZone();");
assert.equal(play("state.inventory.length"), 0, "proceeding without choosing a word still leaves the lexicon behind");
play(`routeExtract("tablet", "${LIGHT}"); routeInject("block", "${LIGHT}"); moveBlock();
  routeInject("block", "Semantic.Mass.Heavy");`);
assert.equal(play(`state.flags.blockMoved && state.flags.platePressed && hasInventory("${LIGHT}")`), true, "restored weight instantly presses the plate and releases Light");
play("undoLastSemanticAction();");
assert.equal(play(`!state.flags.platePressed && state.flags.blockMoved && hasInventory("Semantic.Mass.Heavy") && !hasInventory("${LIGHT}")`), true, "undo restores the unpressed plate, positioned stone and returned weight");
play(`routeInject("block", "Semantic.Mass.Heavy"); chooseTravelWord("${LIGHT}"); chooseTravelWord("${SOLID}");`);
assert.equal(play("state.travelWord"), LIGHT, "words you do not have cannot replace the crossing selection");
const resumed = refresh();
assert.equal(resumed("state.travelWord"), LIGHT, "the word selected at the exit survives a refresh");
resumed("travelToZone(2);");
assert.equal(resumed("zone().id"), "Z3", "the map opens the same passage as the advance button");
assert.equal(resumed("state.inventory.join()"), LIGHT);
assert.equal(resumed("state.inventory[state.selectedInventoryIndex]"), LIGHT, "the carried word is already in hand on arrival");
assert.equal(resumed("state.travelWord"), "", "passing through spends the carry selection, not the word");
resumed(`routeInject("guardA", "${LIGHT}");`);
assert.equal(resumed(`hasTag(selectedObject(), "${LIGHT}") && selectedObject().hp === 38`), true, "a mass rewrite does not require the armor opening");
assert.match(resumed("canHeavyStrike().reason"), /击离断廊/, "the preview explains the positional payoff");
const beforeStrike = resumed("state.ink");
resumed("heavyStrike();");
assert.equal(resumed("selectedObject().fell && selectedObject().defeated"), true, "a light foe can be knocked off the ledge without breaking the armor");
assert.equal(resumed("state.ink"), beforeStrike, "a foe knocked off the ledge cannot counterattack");
resumed(`selectTag("${SOLID}");`);
assert.equal(resumed("canExtract().enabled"), false, "armor on a fallen foe cannot be retrieved");
const afterFall = refresh();
afterFall(`selectObject("guardA");`);
assert.equal(afterFall("selectedObject().fell"), true, "falling is preserved too");
afterFall("restoreZoneCheckpoint();");
assert.equal(afterFall("state.inventory.join()"), LIGHT, "the entry checkpoint restores the carried word for another attempt");
assert.equal(afterFall(`objectById("guardA").defeated`), undefined);

const twoWords = createGame()();
twoWords(`routeExtract("statue", "Semantic.Structure.Fragile"); routeExtract("gate", "${SEAL}");
  chooseTravelWord("Semantic.Structure.Fragile"); chooseTravelWord("${SEAL}"); nextZone();`);
assert.equal(twoWords("state.inventory.join()"), SEAL, "exactly one last-selected word survives; the other is left behind");

const chain = createGame();
let linked = chain();
linked(`routeExtract("gate", "${SEAL}");`);
linked(`proceedFromZone();`);
assert.equal(linked("zone().id"), "Z1", "an exit with held words exposes a choice before discarding them");
linked(`chooseTravelWord("${SEAL}"); proceedFromZone();`);
assert.equal(linked("zone().id"), "Z2");
assert.equal(linked(`state.inventory[state.selectedInventoryIndex]`), SEAL);
linked = chain();
assert.equal(linked(`state.inventory[state.selectedInventoryIndex]`), SEAL, "the carried word stays ready even after refreshing the arrival");
linked(`travelToZone(0);`);
assert.equal(linked(`canExtract(objectById("statue"), "Semantic.Structure.Fragile").enabled`), false, "visiting an earlier room is observation only");
linked(`selectObject("statue"); scanSelected(); selectTag("Semantic.Structure.Fragile"); extractSelectedTag();`);
assert.equal(linked("state.inventory.join()"), SEAL, "the map cannot bypass the carry cap by looting behind the frontier");
linked(`travelToZone(1); routeInject("tablet", "${SEAL}");`);
assert.equal(linked(`state.flags.tabletDropped && state.flags.platePressed && !state.flags.blockMoved`), true, "the previous room's seal drops the tablet and opens a third pressure-plate route");
linked(`nextZone(); routeScan("guardA"); parry(); routeExtract("guardA", "${SOLID}");
  routeStrikeUntilDefeated("guardA"); routeStrikeUntilDefeated("guardB");
  chooseTravelWord("${SOLID}"); nextZone(); routeInject("pool", "${SOLID}");`);
assert.equal(linked("zone().complete(state)"), false, "reinforced ice does not replace the lift");
linked(`routeExtract("brazier", "Semantic.Temperature.Overheated"); routeInject("lift", "Semantic.Temperature.Overheated");`);
assert.equal(linked(`zone().complete(state) && !state.flags.steamBurst && !objectById("beast").defeated`), true, "reinforced ice opens a genuine way around the living beast");
assert.equal(chain()(`zone().complete(state) && !objectById("beast").defeated`), true, "the ice route survives refresh");
assert.equal(linked("state.metrics.wordCrossings.map(({tagId}) => tagId).join()"), `${SEAL},${SOLID}`, "run history records which words made each crossing");

console.log("Crossing regression passed: one-word cap, map and dashboard arrival, seal relay, positional combat, safe ice, refresh and checkpoint.");
