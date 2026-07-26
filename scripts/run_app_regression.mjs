import { loadAppContext, summarizeSuite } from "./app_vm_harness.mjs";

const { context } = loadAppContext();
const suite = context.window.__echoString.runRegressionSuite();
const summary = summarizeSuite(suite);

console.log(JSON.stringify(summary, null, 2));

const failures = [];
if (!summary.passed) failures.push("regression suite did not pass");
if (summary.build !== "1.1.0") failures.push(`expected 1.1.0 build, got ${summary.build}`);
for (const mode of ["guided", "low"]) {
  const item = summary[mode];
  if (!item.completed) failures.push(`${mode} route did not complete`);
  if (item.grade !== "S") failures.push(`${mode} route grade expected S, got ${item.grade}`);
  if (item.assertions !== 6) failures.push(`${mode} route assertions expected 6, got ${item.assertions}`);
  if (item.mistakes !== 0) failures.push(`${mode} route mistakes expected 0, got ${item.mistakes}`);
  if (item.bossCounters !== 3) failures.push(`${mode} boss counters expected 3, got ${item.bossCounters}`);
  if (item.reactions !== 4) failures.push(`${mode} reactions expected 4, got ${item.reactions}`);
  if (item.feedbackEvents < 20) failures.push(`${mode} feedback events expected >= 20, got ${item.feedbackEvents}`);
  if (item.failureEvents !== 0) failures.push(`${mode} failure events expected 0, got ${item.failureEvents}`);
  if (item.experienceStatus !== "clear") failures.push(`${mode} experience status expected clear, got ${item.experienceStatus}`);
}
if (!summary.expedition.completed) failures.push("expedition route did not complete");
if (summary.expedition.failed) failures.push("expedition route collapsed completely");
if (summary.expedition.integrity < 1) failures.push("expedition route should retain at least one integrity");
if (summary.expedition.collapses < 1) failures.push("expedition route should exercise semantic collapse pressure");
if (summary.expedition.bossCounters !== 3) failures.push("expedition boss counters expected 3");
if (summary.expedition.reward <= 0 || summary.expedition.profileWins !== 1) failures.push("expedition completion did not advance profile");

if (failures.length) {
  console.error(failures.map((item) => `[FAIL] ${item}`).join("\n"));
  process.exit(1);
}
