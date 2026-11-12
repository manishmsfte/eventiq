const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");
const express = require("express");
const { htmlErrorPages } = require("../services/web-errors");

test("shared browser errors preserve HTTP status and leave API, JSON, fetch, download, and success responses alone", async (t) => {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  Object.assign(app.locals, {
    assetVersion: "test",
    siteTitle: "Test",
    publicBaseUrl: "https://example.test",
    publisher: null,
    supervisor: null,
    registrant: null,
    facilitator: null,
    currentUser: null,
    partnerAgreement: null
  });
  app.use(htmlErrorPages);
  app.get("/plain/:status", (req, res) => res.status(Number(req.params.status)).send("Request was not accepted."));
  app.get("/markup", (req, res) => res.status(400).send("<script>doNotRun()</script>"));
  app.get("/rendered", (req, res) => res.status(400).send("<!DOCTYPE html><html><body>Existing page</body></html>"));
  app.get("/api/error", (req, res) => res.status(400).send("API error."));
  app.get("/json", (req, res) => res.status(409).json({ error: "Conflict" }));
  app.get("/download", (req, res) => res.status(400).type("text/csv").send("error,detail"));
  app.get("/buffer", (req, res) => res.status(400).send(Buffer.from("Binary data")));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await t.test("renders escaped HTML errors with the shared popup for every error status", async () => {
    for (const status of [400, 403, 404, 500]) {
      const response = await fetch(`${baseUrl}/plain/${status}`, { headers: { Accept: "text/html" } });
      const html = await response.text();
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(html, /Request was not accepted/);
      assert.match(html, /id="notificationDialog"/);
      assert.match(html, /notifications\.js/);
    }
    const markup = await fetch(`${baseUrl}/markup`, { headers: { Accept: "text/html" } }).then((response) => response.text());
    assert.match(markup, /&lt;script&gt;doNotRun\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(markup, /<script>doNotRun/);
  });

  await t.test("avoids recursive rendering and preserves existing error pages", async () => {
    const response = await fetch(`${baseUrl}/rendered`, { headers: { Accept: "text/html" } });
    assert.equal(await response.text(), "<!DOCTYPE html><html><body>Existing page</body></html>");
  });

  await t.test("does not wrap nonbrowser or typed responses", async () => {
    for (const [route, headers, expected] of [
      ["/plain/400", { Accept: "application/json" }, "Request was not accepted."],
      ["/plain/400", { Accept: "text/html", "X-Requested-With": "fetch" }, "Request was not accepted."],
      ["/api/error", { Accept: "text/html" }, "API error."],
      ["/download", { Accept: "text/html" }, "error,detail"],
      ["/buffer", { Accept: "text/html" }, "Binary data"],
      ["/plain/200", { Accept: "text/html" }, "Request was not accepted."]
    ]) {
      const response = await fetch(`${baseUrl}${route}`, { headers });
      assert.equal(await response.text(), expected, route);
    }
    const json = await fetch(`${baseUrl}/json`, { headers: { Accept: "text/html" } });
    assert.equal(json.status, 409);
    assert.deepEqual(await json.json(), { error: "Conflict" });
  });
});
