const fs = require("fs");
const path = require("path");

class NetworkLogger {
  constructor(page, sessionDir) {
    this.page = page;
    this.sessionDir = sessionDir;
    this.networkLogPath = path.join(sessionDir, "network.log");
    this.requestMap = new Map();
    this.setupListeners();
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
        const minutes = Math.floor(durationMs / 60000);
        const seconds = ((durationMs % 60000) / 1000).toFixed(2);
        const durationStr = `${minutes}m:${seconds}s`;

        let responseText = "";
        try {
          responseText = await res.text();
          if (responseText.length > 500) responseText = responseText.substring(0, 500) + "...";
        } catch {
          responseText = "[Unable to read response body]";
        }

        const logEntry = `
➡️ ${method} ${url}
   Payload: ${postData || "-"}
⬅️ Status: ${res.status()}, Time: ${durationStr}
   Response: ${responseText}
----------------------------------------------------------
`;
        fs.appendFileSync(this.networkLogPath, logEntry);
        this.requestMap.delete(req);
      }
    });

    // Track failed requests
    page.on("requestfailed", req => {
      if (this.requestMap.has(req)) {
        const { url, method } = this.requestMap.get(req);
        const failureText = req.failure()?.errorText || "Unknown";
        const logEntry = `❌ Failed: ${method} ${url}, Reason: ${failureText}\n`;
        fs.appendFileSync(this.networkLogPath, logEntry);
        this.requestMap.delete(req);
      }
    });
  }
}

module.exports = NetworkLogger;
