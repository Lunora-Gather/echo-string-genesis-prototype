import assert from "node:assert/strict";
import vm from "node:vm";
import { loadAppContext } from "./app_vm_harness.mjs";

function openEncounter(zoneId, storage) {
  const { context } = loadAppContext(undefined, { storage });
  const play = (source) => vm.runInContext(source, context);
  if (zoneId) play(`setRouteZone(${JSON.stringify(zoneId)});`);
  return play;
}

{
  const play = openEncounter("Z3");
  play(`routeScan("guardA"); selectTag("Semantic.Structure.Solid");`);
  assert.equal(play("canExtract().enabled"), false, "an active armored guard does not expose its structure");
  play("extractSelectedTag();");
  assert.equal(play("state.ink"), 12, "a blocked rewrite costs no ink");
  assert.equal(play("canParry().enabled"), true, "the guard's first sweep can be parried");
  play("parry();");
  assert.equal(play("canExtract().enabled"), true, "parrying exposes the guard's armor");
  play("extractSelectedTag(); heavyStrike();");
  assert.equal(play("selectedObject().hp"), 14, "rewriting the armor still leaves time for one riposte");
  assert.equal(play("state.ink"), 11, "the armor rewrite is the only ink cost on the safe route");
  play("heavyStrike();");
  assert.equal(play("selectedObject().defeated"), true, "a lethal strike prevents the next sweep");
  assert.equal(play("state.ink"), 11);
}

{
  const play = openEncounter("Z3");
  play(`routeScan("guardA"); heavyStrike();`);
  assert.equal(play("state.ink"), 10, "ignoring the first sweep costs ink");
  assert.equal(play("canParry().enabled"), false, "the armored guard braces instead of attacking next");
  play(`heavyStrike(); selectTag("Semantic.Structure.Solid");`);
  assert.equal(play("state.ink"), 10, "striking a braced guard draws no counterattack");
  assert.equal(play("canExtract().enabled"), true, "a heavy strike breaks the stance and exposes the armor");
  play(`routeScan("guardB"); heavyStrike();`);
  assert.equal(play("selectedObject().defeated"), true, "the fragile guard falls to a direct strike");
  assert.equal(play("state.ink"), 10);
}

{
  const play = openEncounter("Z4");
  play(`routeScan("beast");`);
  assert.equal(play("canParry().enabled"), false, "a heavy beast's charge cannot be parried");
  assert.equal(play("canSidestep().enabled"), true, "the charge can be sidestepped");
  assert.equal(play("el.combatReadout.dataset.intent"), "charge", "the charge is telegraphed in the action dock");
  assert.match(play("canHeavyStrike().reason"), /4 原墨/, "a nonlethal heavy strike previews charge damage");
  play("heavyStrike();");
  assert.equal(play("state.ink"), 8, "the charge takes four ink if not avoided");
  assert.equal(play("canParry().enabled"), true, "the beast follows the charge with a parryable attack");
  play("parry(); heavyStrike(); heavyStrike();");
  assert.equal(play("selectedObject().defeated"), true);
  assert.equal(play("state.ink"), 8, "riposte and a finishing blow take no additional ink");
}

{
  const items = new Map();
  const storage = { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
  const play = openEncounter("Z4", storage);
  play(`routeScan("beast"); sidestep(); routeScan("pool"); selectObject("beast");`);
  assert.equal(play("el.combatReadout.dataset.intent"), "sidestep", "scanning the environment does not consume the opening");
  const resumed = openEncounter(null, storage);
  resumed(`selectObject("beast");`);
  assert.equal(resumed("el.combatReadout.dataset.intent"), "sidestep", "refresh preserves the dodge and upcoming attack");
  resumed("heavyStrike();");
  assert.equal(resumed("selectedObject().hp"), 32, "sidestepping does not grant the parry damage bonus");
  assert.equal(resumed("el.combatReadout.dataset.intent"), "tail", "the opening expires after the next strike");
  assert.equal(resumed("state.ink"), 12, "evading the charge costs no ink");
  resumed("restoreZoneCheckpoint(); selectObject('beast');");
  assert.equal(resumed("el.combatReadout.dataset.intent"), "charge", "the entrance checkpoint resets the encounter");
}

{
  const play = openEncounter("Z4");
  play(`routeExtract("pool", "Semantic.Medium.Wet"); routeInject("beast", "Semantic.Medium.Wet");`);
  assert.equal(play("state.flags.steamBurst"), true, "steam still opens a route around the beast");
  assert.equal(play("selectedObject().hp"), 36);
  assert.equal(play("el.combatReadout.dataset.intent"), "stagger", "steam interrupts the charge");
  play("heavyStrike();");
  assert.equal(play("state.ink"), 9, "steam makes the optional follow-up safe; only the rewrite spends ink");
}

{
  const play = openEncounter("Z4");
  play(`routeExtract("pool", "Semantic.Temperature.Frozen"); routeInject("beast", "Semantic.Temperature.Frozen");`);
  assert.equal(play("el.combatReadout.dataset.intent"), "stagger", "replacing the beast's heat with cold stops the charged attack");
  play("heavyStrike();");
  assert.equal(play("state.ink"), 8, "the frozen interruption gives one safe strike");
  assert.equal(play("el.combatReadout.dataset.intent"), "tail");
}

{
  const play = openEncounter("Z6");
  // One inkwell upgrade funds the extra hot/cold overwrite in this scenario.
  play(`state.profile.echo = 6; buyChronicleUpgrade("inkwell"); routeScan("warden");`);
  assert.equal(play("canParry().enabled"), false, "a dry mirror cannot catch the warden's fire wave");
  play(`routeExtract("bossPool", "Semantic.Medium.Wet"); routeInject("warden", "Semantic.Medium.Wet");`);
  assert.equal(play("canParry().enabled"), true, "water can prime the warden's fire reflection");
  play("parry();");
  assert.equal(play("selectedObject().shieldLayers"), 2, "reflected fire still breaks exactly one shield through the steam reaction");
  assert.equal(play(`objectById("bossFire").scanned`), false, "the reflection does not need a separate visit to the brazier");
  assert.equal(play("canParry().enabled"), false, "the fire wave cannot be farmed after the first layer");
  play(`routeExtract("bossIce", "Semantic.Temperature.Frozen"); routeInject("warden", "Semantic.Temperature.Frozen");
    routeExtract("bossTablet", "Semantic.Structure.Fragile"); routeInject("warden", "Semantic.Structure.Fragile");
    routeExtract("bossFire", "Semantic.Temperature.Overheated"); routeInject("warden", "Semantic.Temperature.Overheated");
    heavyStrike();`);
  assert.equal(play("selectedObject().shieldLayers"), 2, "overwriting the cold cancels the stored fracture; no stale second-layer bypass");
  assert.equal(play('hasInventory("Semantic.Temperature.Frozen")'), true, "overwriting cold returns it to the player");
  play(`routeInject("warden", "Semantic.Temperature.Frozen"); heavyStrike();`);
  assert.equal(play("selectedObject().shieldLayers"), 1, "renewing the cold reforms the valid fracture window");
}

console.log("Encounter regression passed: stances, charge and tail, dodge, three interruptions, fire reflection, fracture validity and persistence.");
