import { loadAppContext, releaseVersion } from "./app_vm_harness.mjs";

const { context } = loadAppContext();
const audit = context.window.__echoString.runFailureAudit();

console.log(JSON.stringify(audit, null, 2));

const expectedCategories = [
  "tag-unavailable",
  "inventory-full",
  "slot-missing",
  "slot-locked",
  "ink-low"
];
const failures = [];

if (!audit.passed) failures.push("failure audit did not pass");
if (audit.build !== releaseVersion) failures.push(`expected ${releaseVersion} build, got ${audit.build}`);
for (const category of expectedCategories) {
  if (!audit.failureCounts[category]) failures.push(`missing failure category: ${category}`);
}
if (audit.checks.length !== expectedCategories.length) {
  failures.push(`expected ${expectedCategories.length} checks, got ${audit.checks.length}`);
}
if (!audit.failureEvents || audit.failureEvents.length < expectedCategories.length) {
  failures.push(`expected failure event context for ${expectedCategories.length} categories`);
}

if (failures.length) {
  console.error(failures.map((item) => `[FAIL] ${item}`).join("\n"));
  process.exit(1);
}
