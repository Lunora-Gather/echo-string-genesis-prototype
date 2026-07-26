import fs from "node:fs";
import vm from "node:vm";

const context = { console };
context.globalThis = context;
vm.runInNewContext(
  fs.readFileSync("prototype/core/progression.js", "utf8"),
  context,
  { filename: "prototype/core/progression.js" }
);

const progression = context.EchoProgression;
const checks = [];

function check(label, passed, detail = "") {
  checks.push({ label, passed: Boolean(passed), detail });
}

const profile = progression.createProfile();
const standardRun = progression.createRun(profile, "guided");
check("new profile starts with three lexicon slots", progression.inventoryCapacity(profile) === 3);
check("new profile starts with twelve max ink", progression.maxInk(profile, standardRun) === 12);
check("upgrade purchase rejects insufficient currency", !progression.purchaseUpgrade(profile, "inkwell").ok);

profile.echo = 100;
const inkwell = progression.purchaseUpgrade(profile, "inkwell");
const lexicon = progression.purchaseUpgrade(profile, "lexicon");
const grounding = progression.purchaseUpgrade(profile, "grounding");
check("inkwell upgrade raises max ink", inkwell.ok && progression.maxInk(profile, standardRun) === 14);
check("lexicon upgrade raises capacity", lexicon.ok && progression.inventoryCapacity(profile) === 4);

const expedition = progression.createRun(profile, "expedition");
check("first expedition starts at cycle one", expedition.cycle === 1);
check("expedition receives a deterministic modifier", expedition.modifiers.length === 1);
const baseThreat = progression.threatGain(20, progression.createProfile(), expedition);
const groundedThreat = progression.threatGain(20, profile, expedition);
check("grounding upgrade reduces threat gain", grounding.ok && groundedThreat < baseThreat, `${groundedThreat} < ${baseThreat}`);

const reward = progression.applyCompletion(profile, expedition, 96);
check("expedition completion grants echo", reward.reward > 0 && profile.echo > 0);
check("expedition completion advances long-term record", profile.completedRuns === 1 && profile.expeditionWins === 1 && profile.highestCycle === 1);
check("completion reward cannot be claimed twice", progression.applyCompletion(profile, expedition, 96).reward === 0);

const nextExpedition = progression.createRun(profile, "expedition");
check("next expedition advances cycle", nextExpedition.cycle === 2);

const failed = checks.filter((item) => !item.passed);
console.log(JSON.stringify({
  build: "1.1.0",
  passed: failed.length === 0,
  checks
}, null, 2));

if (failed.length) process.exit(1);
