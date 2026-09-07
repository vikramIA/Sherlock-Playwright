const fs = require("fs");
const path = require("path");
const axios = require("axios");
const envConfig = require("./Environments.json");

// Minimal ".env" loader so SLACK_WEBHOOK_URL doesn't have to live in a
// git-tracked file. Doesn't override a value already set in the real
// environment (e.g. by CI secrets), and silently no-ops if .env is absent.
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

// Resolve per-env first (Environments.json[env].slackWebhookUrl) so different
// envs can post to different channels, falling back to a single shared webhook
// via SLACK_WEBHOOK_URL for setups that don't need per-env routing.
function resolveWebhookUrl(env) {
  return envConfig[env]?.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
}

function statusEmoji({ error, failure }) {
  if (error) return "🔥";
  if (failure > 0) return "⚠️";
  return "✅";
}

// Splunk is fed from the fixed log path on the VM that runs these checks
// (one file per env: dev_log.txt / qa_log.txt / prod_log.txt), so the only
// part of the dashboard URL that changes per run is which source file to filter to.
const SPLUNK_BASE_URL = "https://splunk.infiniteanalytics.com/en-GB/app/search/sherlock";
const SPLUNK_LOG_DIR = "/home/azureuser/Sherlock-Playwright/logs";

function buildSplunkUrl(env) {
  const params = new URLSearchParams({
    "form.time_field.earliest": "-24h@h",
    "form.time_field.latest": "now",
    "form.index": "*",
    "form.host_field": "splunk",
    "form.source_field": `${SPLUNK_LOG_DIR}/${env}_log.txt`,
    "form.env_filter": "*",
    "form.session_filter": "*",
    "form.flow_filter": "*",
    "form.level_filter": "*",
    "form.outcome_filter": "*",
    "form.report_type_filter": "*",
    "form.input_file_filter": "*",
  });
  return `${SPLUNK_BASE_URL}?${params.toString()}`;
}

// Caps how many individual reports get named per outcome so a run with a lot
// of failures doesn't blow up into a wall of text — the Splunk link covers the rest.
const MAX_LISTED_REPORTS = 10;

function formatReportList(label, items) {
  if (!items || items.length === 0) return null;

  const shown = items
    .slice(0, MAX_LISTED_REPORTS)
    .map(({ report, reason }) => `• ${report}${reason ? ` — ${reason}` : ""}`);

  const remaining = items.length - shown.length;
  const lines = [`*${label} (${items.length}):*`, ...shown];
  if (remaining > 0) lines.push(`…and ${remaining} more`);
  return lines.join("\n");
}

async function sendSlackStatus(summary) {
  const {
    env,
    checkType,
    session,
    reportsPlanned,
    reportsAttempted,
    reportsNotRun,
    success,
    failure,
    skipped,
    failures,
    skippedReports,
    error,
  } = summary;

  const webhookUrl = resolveWebhookUrl(env);
  if (!webhookUrl) {
    console.warn("⚠️ No Slack webhook configured (set SLACK_WEBHOOK_URL or Environments.json[env].slackWebhookUrl) — skipping Slack notification.");
    return;
  }

  const emoji = statusEmoji({ error, failure });
  const lines = [
    `${emoji} *Sherlock ${env.toUpperCase()}* (${checkType}) — Session ${session}`,
    `Planned: ${reportsPlanned}  Attempted: ${reportsAttempted}  Not Run: ${reportsNotRun}`,
    `Success: ${success}  Failure: ${failure}  Skipped: ${skipped}`,
  ];
  if (error) lines.push(`Script Error: ${error}`);

  const failureBlock = formatReportList("Failures", failures);
  if (failureBlock) lines.push(failureBlock);

  const skippedBlock = formatReportList("Skipped", skippedReports);
  if (skippedBlock) lines.push(skippedBlock);

  lines.push(`<${buildSplunkUrl(env)}|View full logs in Splunk>`);

  try {
    await axios.post(webhookUrl, { text: lines.join("\n") }, { timeout: 10000 });
    console.log("📣 Slack notification sent.");
  } catch (err) {
    console.error("❌ Failed to send Slack notification:", err.message);
  }
}

module.exports = { sendSlackStatus };
