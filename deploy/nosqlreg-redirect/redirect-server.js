const http = require("node:http");

const server = http.createServer((req, res) => {
  const path = req.url.startsWith("/") ? req.url : `/${req.url}`;
  res.writeHead(308, {
    Location: `https://eventiq.azurewebsites.net${path}`,
    "Content-Length": "0"
  });
  res.end();
});

if (require.main === module) {
  server.listen(process.env.PORT || 8080, "0.0.0.0");
}

module.exports = server;
