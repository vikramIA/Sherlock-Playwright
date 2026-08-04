const { chromium } = require("@playwright/test");
const exploreFlow = require("./ExploreReport.js");
const PersonaFlow = require("./PersonaReport.js");
const Multilayerflow = require("./MultilayerReport.js");
const input = require("./input.json");
const fs = require("fs");
const path = require("path");
const { loginAndNavigate, safeWait } = require("./functions");
const envConfig = require("./Environments.json");
const { initLogger, getSessionHeader, getLastSessionNumber, logSession } = require("./Logger");
const NetworkLogger = require("./networkLogger.js");
const RecordingManager = require("./Recording.js"); 

const { exec } = require("child_process");

const cliEnvs = process.argv.slice(2);
const allEnvs = Object.keys(envConfig);

// ✅ Case 1: No env → run all in parallel
if (cliEnvs.length === 0) {
  console.log("🚀 No ENV passed → Running ALL envs in parallel...\n");

  allEnvs.forEach(env => {
    exec(`node HomeDashboard.spec.js ${env}`, (err, stdout, stderr) => {
      console.log(`\n================ ${env.toUpperCase()} =================`);
      console.log(stdout);
      if (err) console.error(stderr);
    });
  });

  return; // ✅ FIXED (removed process.exit)
}

// ✅ Only runs when env is provided
const env = cliEnvs[0];

if (!envConfig[env]) {
  throw new Error(`❌ Environment "${env}" not found. Use: ${allEnvs.join(", ")}`);
}

const { baseUrl, email, password, secret } = envConfig[env];
initLogger(env); // ✅ initialize env-based logging


function cleanupOldSessions(baseDir, keepLast = 5, foldersList = null) {
  if (!fs.existsSync(baseDir)) return;

  const folders = foldersList
    ? foldersList.map(name => ({
        name,
        time: fs.statSync(path.join(baseDir, name)).birthtimeMs
      }))
    : fs.readdirSync(baseDir).map(name => ({
        name,
        time: fs.statSync(path.join(baseDir, name)).birthtimeMs
      }));

  const sorted = folders.sort((a, b) => b.time - a.time);
  const oldFolders = sorted.slice(keepLast);

  for (const folder of oldFolders) {
    const fullPath = path.join(baseDir, folder.name);
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`🗑️ Deleted old session folder: ${fullPath}`);
    logSession(`🗑️ Deleted old session folder: ${fullPath}`);
  }
}

function createSessionFolder() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
  const sessionDir = path.join(__dirname, "session_artifacts", `${env}_Session_${timestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

async function main() {
  const sessionBaseDir = path.join(__dirname, "session_artifacts");

  // ✅ Filter only current env folders
  const envFolders = fs.existsSync(sessionBaseDir)
    ? fs.readdirSync(sessionBaseDir).filter(f => f.startsWith(env))
    : [];
  
  cleanupOldSessions(sessionBaseDir, 5, envFolders);  

  const newSession = getLastSessionNumber() + 1;
  logSession(getSessionHeader(newSession), true);

  let browser, context, page, recording;
  const sessionDir = createSessionFolder();
  const tracePath = path.join(sessionDir, 'trace.zip');

  try {
    const isHeadless = input.headless?.toUpperCase() === "YES";

    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--start-maximized', '--force-device-scale-factor=1', '--high-dpi-support=1'],
    });

    context = await browser.newContext({
      viewport: null,
      recordVideo: {
        dir: sessionDir,
        size: { width: 1920, height: 1080 },
      },
    });

    page = await context.newPage();
    recording = new RecordingManager(context, page, sessionDir);

    await recording.start();

    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true
    });

    new NetworkLogger(page, sessionDir);

   try {
    await loginAndNavigate(
        page,
        baseUrl,
        email,
        password,
        secret
    );

    console.log("✅ Login completed.");
    logSession("✅ Login completed.");

} catch (err) {
    console.error("❌ Login failed:", err);
    logSession(`❌ Login failed: ${err.message}`);
    throw err;
}

    

    // // Explore Flow
    // for (const report of input.explore || []) await exploreFlow(page, report);
    // await safeWait(page, 10000);

    // Persona Flow
    for (const report of input.Persona || []) await PersonaFlow(page, report);
    await safeWait(page, 10000);

    // // Multilayer Flow
    // if (input.Multilayer?.length > 0) {
    //   const multilayerReportsMap = new Map();
    //   const requiredReports = new Set(input.Multilayer.flatMap(m => m.Report_TO_Merge));

    //   for (const report of input.ReportForMultilayer || []) {
    //     if (requiredReports.has(report.ReportNumber)) {
    //       await exploreFlow(page, report, true, multilayerReportsMap);
    //     }
    //   }

    //   console.log("📂 multilayerReportsMap before multilayer:", Array.from(multilayerReportsMap.entries()));
    //   logSession("📂 multilayerReportsMap before multilayer:", Array.from(multilayerReportsMap.entries()));

    //   for (const report of input.Multilayer) {
    //     await Multilayerflow(page, report.reportName, report.Report_TO_Merge, report.MergeType, multilayerReportsMap);
    //   }
    // }
    // await safeWait(page, 10000);

  } catch (err) {
    console.error(`❌ Script failed: ${err.message}`);
    logSession(`❌ SCRIPT FAILED: ${err.message}\n${err.stack}`);
  } finally {
    if (context && page) {
      await context.tracing.stop({ path: tracePath });

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