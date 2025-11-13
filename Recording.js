// recording.js
const fs = require("fs");
const path = require("path");

class RecordingManager {
  constructor(context, page, sessionDir) {
    this.context = context;
    this.page = page;
    this.sessionDir = sessionDir;
  }

  async start() {
    console.log("🎥 Starting video recording...");
    // Nothing extra — Playwright automatically starts recording
  }

  async stop() {
    try {
      if (!this.page) {
        console.warn("⚠️ No page found for video capture.");
        return;
      }

      const video = this.page.video();
      if (!video) {
        console.warn("⚠️ No video object found for this page.");
        return;
      }

      // ✅ Close the page first to finalize the recording
      await this.page.close();

      const rawVideoPath = await video.path();

      console.log(`✅ Video recording completed: ${rawVideoPath}`);
      return rawVideoPath;
    } catch (err) {
      console.error("❌ Failed to save video recording:", err);
      return null;
    }
  }
}

module.exports = RecordingManager;
