const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const LOCAL_STATE_FILE = path.join(ROOT, ".local-dev-state.json");

loadEnv(path.join(ROOT, ".env"));

const apiHandlers = {
  "/api/teacher-login": require("./api/teacher-login"),
  "/api/teacher-session": require("./api/teacher-session"),
  "/api/teacher-logout": require("./api/teacher-logout"),
  "/api/managers": require("./api/managers"),
  "/api/penalties": require("./api/penalties"),
  "/api/reset-student-registration": require("./api/reset-student-registration"),
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/local-state") {
      await handleLocalState(req, res);
      return;
    }
    const handler = apiHandlers[url.pathname];
    if (handler) {
      await runApiHandler(handler, req, res);
      return;
    }
    serveStatic(url.pathname, res);
  })
  .listen(PORT, () => {
    console.log(`Local dev server running at http://localhost:${PORT}/`);
  });

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separator = trimmed.indexOf("=");
    if (separator < 1) return;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
}

async function handleLocalState(req, res) {
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!fs.existsSync(LOCAL_STATE_FILE)) {
      res.end(JSON.stringify({ ok: true, exists: false, state: null }));
      return;
    }
    const state = JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, "utf8") || "null");
    res.end(JSON.stringify({ ok: true, exists: true, state }));
    return;
  }

  if (req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(body.state || {}, null, 2));
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, { Allow: "GET, POST" });
  res.end(JSON.stringify({ ok: false }));
}

async function runApiHandler(handler, req, res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };

  try {
    await handler(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: "local_server_error" }));
  }
}

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const absolutePath = path.resolve(ROOT, "." + safePath);
  if (!absolutePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(absolutePath)] || "application/octet-stream" });
    res.end(data);
  });
}
