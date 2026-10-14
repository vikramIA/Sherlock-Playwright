// Helpers that turn a bare failure ("locator timed out", "Target page,
// context or browser has been closed") into the actual reason: a
// screenshot of what was on screen, and WHY the browser went away.

const fs = require("fs");
const path = require("path");
const { logSession } = require("./Logger");

let artifactsDir = null;
let browserCloseReason = null;
let expectedShutdown = false;

// Call once with the session_artifacts folder so screenshots land next to
// the trace/video/network log of the same run.
function setArtifactsDir(dir) {
    artifactsDir = dir;
}

// Saves a screenshot of the current page for a failed report and returns its
// path (or null). Never throws — callers are already handling a failure.
async function captureFailureScreenshot(page, label) {
    if (!artifactsDir || !page || page.isClosed()) return null;

    try {
        const dir = path.join(artifactsDir, "failures");
        fs.mkdirSync(dir, { recursive: true });

        const safeLabel = String(label).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80);
        const time = new Date().toISOString().replace(/[:.]/g, "-");
        const filePath = path.join(dir, `${time}_${safeLabel}.png`);

        await page.screenshot({ path: filePath, timeout: 15000 });
        return filePath;
    } catch {
        return null;
    }
}

// Records why the browser/tab went away. Without this, every step after it
// just fails with "Target page, context or browser has been closed" and
// nothing says whether the tab crashed or the browser was closed externally.
// `browser` is undefined for a persistent profile (launchPersistentContext
// has no Browser object), so the context's close event is watched instead.
function watchBrowserHealth(browser, context, page) {
    // Only the first event is the cause — a crash or a closed tab is
    // followed by the browser disconnecting too.
    const record = reason => {
        if (expectedShutdown || browserCloseReason) return;
        browserCloseReason = reason;
        console.error(`❌ ${reason}`);
        logSession(`❌ Browser health: ${reason}`);
    };

    page.on("crash", () => record(
        "the browser tab crashed (renderer process died — usually out of memory on a long run)"
    ));

    page.on("close", () => record(
        "the browser tab was closed while the run was still in progress (not by a test step — closed manually or by the OS/scheduler)"
    ));

    const browserExited = () => record(
        "the browser process exited while the run was still in progress (closed manually, killed, or crashed)"
    );

    if (browser) browser.on("disconnected", browserExited);
    else context.on("close", browserExited);
}

// Call right before the script closes the browser itself, so that close is
// not reported as unexpected.
function markExpectedShutdown() {
    expectedShutdown = true;
}

function getBrowserCloseReason() {
    return browserCloseReason;
}

// First line of the error, plus the browser-close reason when the error is
// only a symptom of the browser having gone away.
function explainError(error) {
    const firstLine = String(error?.message || error).split("\n")[0].trim();

    if (/has been closed|Target closed|Browser closed|crashed/i.test(firstLine)) {
        return `${firstLine} — cause: ${browserCloseReason || "the browser/tab was closed outside the script"}`;
    }

    return firstLine;
}

module.exports = {
    setArtifactsDir,
    captureFailureScreenshot,
    watchBrowserHealth,
    markExpectedShutdown,
    getBrowserCloseReason,
    explainError,
};
