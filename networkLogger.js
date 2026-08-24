const fs = require("fs");
const path = require("path");
const { toLogfmt, collapseWhitespace, getContext } = require("./Logger");

class NetworkLogger {
  constructor(page, sessionDir) {
    this.page = page;
    this.sessionDir = sessionDir;
    this.networkLogPath = path.join(sessionDir, "network.log");
    this.requestMap = new Map();
    this.setupListeners();
  }

  writeLine(fields) {
    const { env, session } = getContext();
    const line = toLogfmt({ ts: new Date().toISOString(), env, session, ...fields });
    fs.appendFileSync(this.networkLogPath, line + '\n');
  }

  setupListeners() {
    const page = this.page;

    // Track request start
    page.on("request", req => {
      if (!req.url().startsWith("data:")) {
        this.requestMap.set(req, {
          url: req.url(),
          method: req.method(),
          startTime: Date.now(),
          postData: req.postData()
        });
      }
    });

    // Track response
    page.on("response", async res => {
      const req = res.request();
      if (this.requestMap.has(req)) {
        const { url, method, startTime, postData } = this.requestMap.get(req);
        const durationMs = Date.now() - startTime;

        let responseText = "";
        try {
          responseText = await res.text();
          if (responseText.length > 500) responseText = responseText.substring(0, 500) + "...";
        } catch {
          responseText = "[Unable to read response body]";
        }

        this.writeLine({
          level: res.status() >= 400 ? 'error' : 'info',
          event: 'http_response',
          method,
          url,
          status: res.status(),
          duration_ms: durationMs,
          payload: postData ? collapseWhitespace(postData) : undefined,
          response: collapseWhitespace(responseText),
        });

        this.requestMap.delete(req);
      }
    });

    // Track failed requests
    page.on("requestfailed", req => {
      if (this.requestMap.has(req)) {
        const { url, method } = this.requestMap.get(req);
        const failureText = req.failure()?.errorText || "Unknown";

        this.writeLine({
          level: 'error',
          event: 'http_request_failed',
          method,
          url,
          reason: failureText,
        });

        this.requestMap.delete(req);
      }
    });
  }
}

module.exports = NetworkLogger;
