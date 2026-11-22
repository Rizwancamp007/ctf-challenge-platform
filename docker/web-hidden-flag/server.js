// A small web challenge: the flag is a file on this site, and the site
// tells crawlers where not to look. The flag comes from the FLAG
// environment variable — it is never baked into the image.
import { createServer } from "node:http";

const FLAG = process.env.FLAG;
if (!FLAG) {
  console.error("FLAG is not set — refusing to start without a flag");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);

const page = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Hidden Flag</title></head>
<body>
<h1>Hidden Flag</h1>
<p>Somewhere on this site hides a flag. The site even tells search
engines where not to look — maybe you should look there.</p>
<p><a href="/robots.txt">robots.txt</a></p>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("User-agent: *\nDisallow: /hidden/\n");
    return;
  }
  if (url.pathname === "/hidden/flag.txt") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`${FLAG}\n`);
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
  console.log(`Hidden-flag challenge running on port ${PORT}`);
});
