import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
for (const name of [
  "app.js",
  "domain.js",
  "persistence.js",
  "vendor/idb-keyval.js",
  "scripts/build.mjs",
  "scripts/serve.mjs",
]) {
  const result = spawnSync(process.execPath, ["--check", name], {
    stdio: "inherit",
  });
  if (result.status) process.exit(result.status);
}
const provenance = JSON.parse(await readFile("vendor/provenance.json", "utf8"));
const digest = createHash("sha256")
  .update(await readFile("vendor/idb-keyval.js"))
  .digest("hex");
if (digest !== provenance.vendored_file_sha256)
  throw Error("Vendored library differs from its recorded release.");
const html = await readFile("index.html", "utf8");
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const target = match[1];
  if (target === "./" || target.startsWith("#")) continue;
  if (/^https?:|^\/\//.test(target))
    throw Error("Runtime external resource: " + target);
  await readFile(target);
}
console.log("Syntax, local assets and pinned upstream file hash verified.");
