const assert = require("node:assert/strict");
const http = require("node:http");
const { before, after, test } = require("node:test");
const server = require("../deploy/nosqlreg-redirect/redirect-server");

before(() => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)));
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

for (const path of ["/", "/login", "/events/example?code=a%2Bb&source=old", "//other.example/path"]) {
  test(`permanently redirects ${path} to the fixed EventIQ host`, async () => {
    const response = await request(path);
    assert.equal(response.statusCode, 308);
    assert.equal(response.headers.location, `https://eventiq.azurewebsites.net${path}`);
  });
}

test("uses a method-preserving redirect for POST requests", async () => {
  const response = await request("/register?event=example", "POST");
  assert.equal(response.statusCode, 308);
  assert.equal(response.headers.location, "https://eventiq.azurewebsites.net/register?event=example");
});

function request(path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: server.address().port,
      path,
      method
    }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    });
    req.on("error", reject);
    req.end();
  });
}
