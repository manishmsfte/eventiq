function htmlErrorPages(req, res, next) {
  const send = res.send;
  let renderingError = false;
  res.send = function sendWithErrorPage(body) {
    const contentType = String(res.getHeader("Content-Type") || "");
    const browserRequest = req.accepts(["html", "json"]) === "html"
      && !req.path.startsWith("/api/")
      && req.get("X-Requested-With") !== "fetch";
    if (
      !renderingError
      && browserRequest
      && res.statusCode >= 400
      && typeof body === "string"
      && (!contentType || /^text\/(?:plain|html)(?:;|$)/i.test(contentType))
      && !/^\s*<!doctype html|^\s*<html[\s>]/i.test(body)
    ) {
      renderingError = true;
      res.removeHeader("Content-Type");
      return res.render("error", { title: "Request could not be completed", error: body });
    }
    return send.call(this, body);
  };
  next();
}

module.exports = { htmlErrorPages };
