import fs from "node:fs";
import { loadAppContext, readAppMetadata, releaseVersion } from "./app_vm_harness.mjs";

const tagsDoc = JSON.parse(fs.readFileSync("data/semantic_tags_mvp.json", "utf8"));
const reactionsDoc = JSON.parse(fs.readFileSync("data/semantic_reactions_mvp.json", "utf8"));
const objectsDoc = JSON.parse(fs.readFileSync("data/semantic_objects_mvp.json", "utf8"));
const { context } = loadAppContext();
const app = readAppMetadata(context);
const failures = [];

function fail(message) {
  failures.push(message);
}

function compareList(actual, expected, label) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) fail(label);
}

const dataTagIds = new Set(tagsDoc.tags.map((item) => item.tagId));
const appTagIds = new Set(app.tags.map((item) => item.id));
for (const id of dataTagIds) {
  if (!appTagIds.has(id)) fail(`data tag missing from app: ${id}`);
}
for (const id of appTagIds) {
  if (!dataTagIds.has(id)) fail(`app tag missing from data: ${id}`);
}

const dataTagById = Object.fromEntries(tagsDoc.tags.map((item) => [item.tagId, item]));
for (const appTag of app.tags) {
  const dataTag = dataTagById[appTag.id];
  if (!dataTag) continue;
  if (appTag.name !== dataTag.displayName) fail(`tag display name drift: ${appTag.id}`);
  if (appTag.slot !== dataTag.slotType) fail(`tag slot drift: ${appTag.id}`);
  if (appTag.extract !== dataTag.extractCost) fail(`tag extract cost drift: ${appTag.id}`);
  if (appTag.inject !== dataTag.injectCost) fail(`tag inject cost drift: ${appTag.id}`);
  compareList(appTag.compatible, dataTag.compatibleObjectTypes, `tag compatible types drift: ${appTag.id}`);
}

const allAppObjects = app.zones.flatMap((zone) => zone.objects.map((object) => ({ ...object, zone: zone.id })));
for (const object of allAppObjects) {
  for (const tagId of [...object.currentTags, ...object.providesTags]) {
    if (!dataTagIds.has(tagId)) fail(`app object ${object.name} references unknown tag: ${tagId}`);
  }
}

const dataDisplayNames = new Set(objectsDoc.objects.map((item) => item.displayName));
const missingDataNames = allAppObjects
  .filter((object) => object.id !== "archive")
  .filter((object) => !dataDisplayNames.has(object.name))
  .map((object) => `${object.zone}/${object.name}`);
if (missingDataNames.length) fail(`app objects missing from data table: ${missingDataNames.join(", ")}`);
for (const item of objectsDoc.objects) {
  const object = allAppObjects.find(({ name }) => name === item.displayName);
  if (!object) {
    fail(`data table object missing from app: ${item.displayName}`);
    continue;
  }
  if (object.type !== item.objectType) fail(`object type drift: ${item.displayName}`);
  compareList(object.currentTags, item.defaultTags, `object default tags drift: ${item.displayName}`);
  compareList(object.providesTags, item.providesTags, `object source tags drift: ${item.displayName}`);
  compareList(object.openSlots, item.openSlots, `object open slots drift: ${item.displayName}`);
  compareList(object.lockedSlots, item.lockedSlots, `object locked slots drift: ${item.displayName}`);
}

const reactionIds = reactionsDoc.reactions.map((item) => item.reactionId);
compareList(app.reactions.map(({ id }) => id), reactionIds, "reaction ids drift");
for (const reaction of reactionsDoc.reactions) {
  const rule = app.reactions.find(({ id }) => id === reaction.reactionId);
  if (!rule) continue;
  if (rule.name !== reaction.displayName) fail(`reaction display name drift: ${rule.id}`);
  compareList(rule.tags, reaction.requiredTags, `reaction ingredients drift: ${rule.id}`);
}

if (app.build !== releaseVersion) fail(`app build expected ${releaseVersion}, got ${app.build}`);
if (app.rollout.at(-1)?.version !== releaseVersion) fail(`release notes missing ${releaseVersion}`);

if (failures.length) {
  console.error(failures.map((item) => `[FAIL] ${item}`).join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  build: app.build,
  tags: app.tags.length,
  zones: app.zones.length,
  objects: allAppObjects.length,
  reactions: reactionIds.length,
  rollout: app.rollout.length,
  status: "passed"
}, null, 2));
