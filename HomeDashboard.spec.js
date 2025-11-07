const { chromium } = require("@playwright/test");
const exploreFlow = require("./ExploreReport.js");
const PersonaFlow = require("./PersonaReport.js");
const Multilayerflow = require("./MultilayerReport.js");
const RepositoryFlow = require("./RepositoryReport.js");
const input = require("./input.json");
const { loginAndNavigate } = require("./functions");
const fs = require("fs");
const path = require("path");
const envConfig = require("./Environments.json");
const { getSessionHeader, getLastSessionNumber, logSession, logReport } = require("./Logger");
const NetworkLogger = require("./networkLogger.js");
const RecordingManager = require("./Recording.js"); // ✅ New import

const env = process.argv[2] || "dev";
if (!envConfig[env]) {
  throw new Error(`❌ Environment "${env}" not found. Use one of: ${Object.keys(envConfig).join(", ")}`);
}
const { baseUrl, email, password, secret, login } = envConfig[env];

function cleanupOldSessions(baseDir, keepLast = 5) {
  if (!fs.existsSync(baseDir)) return;
  const folders = fs.readdirSync(baseDir)
    .map(name => ({
      name,
      time: fs.statSync(path.join(baseDir, name)).birthtimeMs
    }))
    .sort((a, b) => b.time - a.time);
  const oldFolders = folders.slice(keepLast);
  for (const folder of oldFolders) {
    const fullPath = path.join(baseDir, folder.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`🗑️ Deleted old session folder: ${fullPath}`);
    logSession(`🗑️ Deleted old session folder: ${fullPath}`);
  }
}

function createSessionFolder() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
  const sessionDir = path.join(__dirname, "session_artifacts", `Session_${timestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

async function main() {
  const sessionBaseDir = path.join(__dirname, "session_artifacts");
  cleanupOldSessions(sessionBaseDir, 5);

  const newSession = getLastSessionNumber() + 1;
  logSession(getSessionHeader(newSession), true);
  logReport(getSessionHeader(newSession), true);

  let browser, context, page, recording;
  const sessionDir = createSessionFolder();
  const tracePath = path.join(sessionDir, 'trace.zip');

  try {
    const isHeadless = input.headless?.toUpperCase() === "YES";

    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--start-maximized', '--force-device-scale-factor=1', '--high-dpi-support=1'],
    });

    // ✅ Create context with recording enabled
    context = await browser.newContext({
      viewport: null,
      recordVideo: {
        dir: sessionDir,
        size: { width: 1920, height: 1080 },
      },
    });

    page = await context.newPage();
    recording = new RecordingManager(context, page, sessionDir);

    await recording.start(); // 🎥 Start recording

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });

    new NetworkLogger(page, sessionDir);

    try {
      const updatedLogin = await loginAndNavigate(page, baseUrl, login, email, password, secret);
      const envData = JSON.parse(fs.readFileSync(path.join(__dirname, "Environments.json"), "utf-8"));
      envData[env].login = updatedLogin;
      fs.writeFileSync(path.join(__dirname, "Environments.json"), JSON.stringify(envData, null, 2));
      console.log("💾 Login credentials updated");
      logSession("💾 Login credentials updated");
    } catch (err) {
      console.error("❌ Failed to update login credentials:", err);
      logSession("❌ Failed to update login credentials:", err);
    }

    //Explore Flow
    for (const report of input.explore || []) await exploreFlow(page, report);

    //Persona Flow
    for (const report of input.Persona || []) await PersonaFlow(page, report);

    //Multilayer Flow
    if (input.Multilayer?.length > 0) {
      const multilayerReportsMap = new Map();
      const requiredReports = new Set(input.Multilayer.flatMap(m => m.Report_TO_Merge));

      for (const report of input.ReportForMultilayer || []) {
        if (requiredReports.has(report.ReportNumber)) {
          await exploreFlow(page, report, true, multilayerReportsMap);
        }
      }

      console.log("📂 multilayerReportsMap before multilayer:", Array.from(multilayerReportsMap.entries()));
      logSession("📂 multilayerReportsMap before multilayer:", Array.from(multilayerReportsMap.entries()));

      for (const report of input.Multilayer) {
        await Multilayerflow(page, report.reportName, report.Report_TO_Merge, report.MergeType, multilayerReportsMap);
      }
    }

    //Repository Flow
    // for (const report of input.Repository || []) await RepositoryFlow(page, report);

  } catch (err) {
    console.error(`❌ Script failed: ${err.message}`);
    logSession(`❌ SCRIPT FAILED: ${err.message}\n${err.stack}`);
  } finally {
    if (context && page) {
      await context.tracing.stop({ path: tracePath });

      // ✅ Stop and save video
      const videoPath = await recording.stop("session_recording.webm");

      await context.close();
      console.log("📦 Session Artifacts Saved:");
      console.log(`   TRACE: ${tracePath}`);
      console.log(`   VIDEO: ${videoPath}`);
      console.log(`   Network Log: ${path.join(sessionDir, 'network.log')}`);

      logSession("📦 Session Artifacts Saved:");
      logSession(`   TRACE: ${tracePath}`);
      logSession(`   VIDEO: ${videoPath}`);
      logSession(`   Network Log: ${path.join(sessionDir, 'network.log')}`);
    }

    if (browser) await browser.close();
    console.log("✅ Browser closed, session complete.");
    logSession("✅ Browser closed, session complete.");
  }
}

main();
