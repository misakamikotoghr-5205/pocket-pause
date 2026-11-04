import { mkdir, copyFile, cp, rm } from "node:fs/promises";
const output = new URL("../dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of [
  "index.html",
  "styles.css",
  "app.js",
  "domain.js",
  "persistence.js",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
])
  await copyFile(new URL("../" + name, import.meta.url), new URL(name, output));
for (const name of ["vendor", "creator-pack", "docs"])
  await cp(
    new URL("../" + name + "/", import.meta.url),
    new URL(name + "/", output),
    { recursive: true },
  );
console.log(
  "Built offline app, creator pack and open-source notices in dist/.",
);
