// A small web challenge: the flag is tucked into the site's JavaScript
// as a base64 string, so reading the source is only half the job — it
// still has to be decoded. The flag comes from the FLAG environment
// variable — it is never baked into the image.
import { createServer } from "node:http";

const FLAG = process.env.FLAG;
if (!FLAG) {
  console.error("FLAG is not set — refusing to start without a flag");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const encoded = Buffer.from(FLAG, "utf8").toString("base64");

const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Source Leak</title></head>
<body>
<h1>Source Leak</h1>
<p>This page looks plain — but the JavaScript it loads carries more than
it needs to. Have a read through it.</p>
<script src="/app.js"></script>
</body>
</html>`;

const appJs = `// Site script — handles the greeting on the page.
function greet(name) {
  return "Hello, " + name + "!";
}

// Build info, left in by mistake:
// ${encoded}
document.addEventListener("DOMContentLoaded", () => {
  const heading = document.querySelector("h1");
  if (heading) heading.textContent += " — " + greet("player");
});
`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("User-agent: *\nAllow: /\n");
    return;
  }
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(appJs);
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(page);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found\n");
});

server.listen(PORT, () => {
  console.log(`Source-leak challenge running on port ${PORT}`);
});
