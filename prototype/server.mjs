import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve, isAbsolute, sep } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2] || 4173);
const root = fileURLToPath(new URL(".", import.meta.url));

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png"
};

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const filePath = resolve(root, pathname === "/" ? "index.html" : `.${pathname}`);
  const relativePath = relative(root, filePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    res.writeHead(404).end();
    return;
  }
  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[extname(filePath)] || "application/octet-stream",
    "Content-Length": file.size,
    "Cache-Control": "no-store"
  });
  if (req.method === "HEAD") res.end();
  else pipeline(createReadStream(filePath), res, () => {});
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Prototype server running at http://127.0.0.1:${server.address().port}`);
});
