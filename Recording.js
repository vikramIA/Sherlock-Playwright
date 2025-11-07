// recording.js
const fs = require("fs");
const path = require("path");

class RecordingManager {
  constructor(context, page, sessionDir) {
    this.context = context;
    this.page = page;
    this.sessionDir = sessionDir;
    this.videoPath = null;
  }

  async start() {
    console.log("🎥 Starting video recording...");
    // nothing to do here — Playwright starts recording automatically when context is created with recordVideo
  }

  async stop(customName = "session_recording.webm") {
    try {
      if (!this.page) {
        console.warn("⚠️ No page found for video capture.");
        return;
      }

      const rawVideoPath = await this.page.video().path();
      const finalVideoPath = path.join(this.sessionDir, customName);
      fs.renameSync(rawVideoPath, finalVideoPath);

      console.log(`✅ Video saved: ${finalVideoPath}`);
      return finalVideoPath;
    } catch (err) {
      console.error("❌ Failed to save video recording:", err);
    }
  }
}

module.exports = RecordingManager;
