const { chromium } = require("@playwright/test");
const exploreFlow = require("./ExploreReport.js");
const PersonaFlow = require("./PersonaReport.js");
const { MultilayerBatchFlow } = require("./MultilayerReport.js");
const watsonAIReportFlow = require("./WatsonAIFlow.js");
const csAgentFlow = require("./CSAgentFlow.js");
const fs = require("fs");
const path = require("path");
const { loginAndNavigate, safeWait } = require("./functions");
const envConfig = require("./Environments.json");
const { initLogger, getSessionHeader, getLastSessionNumber, logSession, getRunSummary } = require("./Logger");
const NetworkLogger = require("./networkLogger.js");
const RecordingManager = require("./Recording.js");
const { sendSlackStatus } = require("./SlackNotifier");

const { exec } = require("child_process");

const cliArgs = process.argv.slice(2);
const allEnvs = Object.keys(envConfig);
const checkTypes = ["daily", "detail"];

// checkType is an optional 2nd CLI arg — "daily" (fast smoke check, input-daily.json)
// or "detail" (full check, input.json). Defaults to "detail" to preserve prior behavior.
const isCheckType = (arg) => checkTypes.includes((arg || "").toLowerCase());

// ✅ Case 1: No env → run all in parallel (an optional lone checkType arg is passed through)
if (cliArgs.length === 0 || (cliArgs.length === 1 && isCheckType(cliArgs[0]))) {
  const checkType = cliArgs[0] ? cliArgs[0].toLowerCase() : "detail";
  console.log(`🚀 No ENV passed → Running ALL envs in parallel (${checkType} check)...\n`);

  allEnvs.forEach(env => {
    exec(`node HomeDashboard.spec.js ${env} ${checkType}`, (err, stdout, stderr) => {
      console.log(`\n================ ${env.toUpperCase()} (${checkType}) =================`);
      console.log(stdout);
      if (err) console.error(stderr);
    });
  });

  return; // ✅ FIXED (removed process.exit)
}

// ✅ Only runs when env is provided
const env = cliArgs[0];
const checkType = isCheckType(cliArgs[1]) ? cliArgs[1].toLowerCase() : "detail";

if (!envConfig[env]) {
  throw new Error(`❌ Environment "${env}" not found. Use: ${allEnvs.join(", ")}`);
}

if (cliArgs[1] && !isCheckType(cliArgs[1])) {
  throw new Error(`❌ Unknown check type "${cliArgs[1]}". Use: ${checkTypes.join(", ")}`);
}

const inputFile = checkType === "daily" ? "./input-daily.json" : "./input.json";
const input = require(inputFile);

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

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function countPlannedReports(input) {
  const explore = input.explore?.length || 0;
  const persona = input.Persona?.length || 0;
  const personaPostUpload = (input.Persona || []).reduce(
    (sum, p) => sum + (p.postUploadReports?.length || 0),
    0
  );

  // Mirrors the actual filter in main(): ReportForMultilayer only runs
  // when Multilayer is non-empty, and only for reports it actually references.
  const multilayer = input.Multilayer?.length || 0;
  let reportForMultilayer = 0;
  if (multilayer > 0) {
    const requiredReports = new Set(input.Multilayer.flatMap(m => m.Report_TO_Merge));
    reportForMultilayer = (input.ReportForMultilayer || []).filter(r =>
      requiredReports.has(r.ReportNumber)
    ).length;
  }

  const watsonAI = input.WatsonAI?.length || 0;
  const csAgent = input.CSAgent?.length > 0 ? input.CSAgent.length : 0;

  const totalReportsPlanned =
    explore + persona + personaPostUpload + reportForMultilayer + multilayer + watsonAI + csAgent;

  return {
    explore,
    persona,
    persona_post_upload: personaPostUpload,
    report_for_multilayer: reportForMultilayer,
    multilayer,
    watson_ai: watsonAI,
    cs_agent: csAgent,
    total_reports_planned: totalReportsPlanned,
  };
}

function createSessionFolder() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
  const sessionDir = path.join(__dirname, "session_artifacts", `${env}_${checkType}_Session_${timestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

async function main() {
  const sessionBaseDir = path.join(__dirname, "session_artifacts");

  // ✅ Filter only current env+checkType folders so daily/detail histories don't clobber each other
  const envFolders = fs.existsSync(sessionBaseDir)
    ? fs.readdirSync(sessionBaseDir).filter(f => f.startsWith(`${env}_${checkType}`))
    : [];

  cleanupOldSessions(sessionBaseDir, 5, envFolders);

  const runStartedAt = Date.now();
  const newSession = getLastSessionNumber() + 1;
  logSession(getSessionHeader(newSession), true);

  const plannedReports = countPlannedReports(input);
  logSession("Planned run scope", false, {
    flow: "run_plan",
    check_type: checkType,
    cadence: checkType === "daily" ? "daily" : "weekly",
    input_file: inputFile,
    ...plannedReports,
  });

  let browser, context, page, recording;
  let scriptError = null;
  const sessionDir = createSessionFolder();
  const tracePath = path.join(sessionDir, 'trace.zip');

  try {
    const isHeadless = input.headless?.toUpperCase() === "YES";

    // Safe on any machine: maximize the window and pin DPI scaling so
    // screenshots/videos come out consistent regardless of the host display.
    const launchArgs = ['--start-maximized', '--force-device-scale-factor=1', '--high-dpi-support=1'];

    // VMs/CI runners often have no real GPU, so Chromium needs to fall back to
    // software rendering (SwiftShader). Forcing that on a machine with a real
    // GPU is unnecessary and can hurt rendering, so only add these when told
    // we're on a VM via RUN_ON_VM=true.
    const isVM = process.env.RUN_ON_VM?.toUpperCase() === "TRUE";
    if (isVM) {
      launchArgs.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
    }

    browser = await chromium.launch({
      headless: isHeadless,
      args: launchArgs,
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



    // Explore Flow
    for (const report of input.explore || []) await exploreFlow(page, report, false, false, env);
    await safeWait(page, 10000);

    // Persona Flow
    for (const report of input.Persona || []) await PersonaFlow(page, report, env);
    await safeWait(page, 10000);

    // Multilayer Flow
    if (input.Multilayer?.length > 0) {
      const multilayerReportsMap = new Map();
      const requiredReports = new Set(input.Multilayer.flatMap(m => m.Report_TO_Merge));

      for (const report of input.ReportForMultilayer || []) {
        if (requiredReports.has(report.ReportNumber)) {
          await exploreFlow(page, report, true, multilayerReportsMap, env);
        }
      }

      console.log("📂 multilayerReportsMap before multilayer:", Array.from(multilayerReportsMap.entries()));
      logSession("multilayerReportsMap before multilayer", false, {
        multilayerReportsMap: JSON.stringify(Array.from(multilayerReportsMap.entries())),
      });

      await MultilayerBatchFlow(page, input.Multilayer, multilayerReportsMap, env);
    }
    // watsonAI Flow
    await watsonAIReportFlow(
      page,
      input.WatsonAI || []
    );
    await safeWait(page, 10000);

    // CS Agent Flow
    if (input.CSAgent?.length > 0) {
      await csAgentFlow(page, input.CSAgent);
      await safeWait(page, 10000);
    }

  } catch (err) {
    console.error(`❌ Script failed: ${err.message}`);
    logSession(`❌ SCRIPT FAILED: ${err.message}\n${err.stack}`);
    scriptError = err.message;
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

    const summary = getRunSummary();
    const reportsPlanned = plannedReports.total_reports_planned;
    const reportsAttempted = summary.total_reports;
    const reportsNotRun = reportsPlanned - reportsAttempted;
    const totalDurationMs = Date.now() - runStartedAt;
    console.log("🏁 Run Summary:", summary);
    logSession("Run Summary", false, {
      flow: "run_summary",
      ...summary,
      reports_planned: reportsPlanned,
      reports_attempted: reportsAttempted,
      reports_not_run: reportsNotRun,
      total_duration_ms: totalDurationMs,
      total_duration: formatDuration(totalDurationMs),
    });

    await sendSlackStatus({
      env,
      checkType,
      session: newSession,
      reportsPlanned,
      reportsAttempted,
      reportsNotRun,
      success: summary.success,
      failure: summary.failure,
      skipped: summary.skipped,
      error: scriptError,
    });
  }
}

main();