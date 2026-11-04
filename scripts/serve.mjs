import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4181);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
http
  .createServer(async (req, res) => {
    try {
      const name =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/^\//, "") || "index.html";
      const allowed = [
        "index.html",
        "styles.css",
        "app.js",
        "domain.js",
        "persistence.js",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md",
      ];
      if (
        !allowed.includes(name) &&
        !/^vendor\/[A-Za-z0-9._-]+$|^creator-pack\/[A-Za-z0-9._-]+$|^docs\/[A-Za-z0-9._-]+$/.test(name)
      )
        throw Error("not public");
      const data = await readFile(path.join(root, name));
      res.writeHead(200, {
        "Content-Type":
          types[path.extname(name)] || "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Pocket Pause: http://127.0.0.1:${port}`),
  );
