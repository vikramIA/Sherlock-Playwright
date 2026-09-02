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

  try {
    await axios.post(webhookUrl, { text: lines.join("\n") }, { timeout: 10000 });
    console.log("📣 Slack notification sent.");
  } catch (err) {
    console.error("❌ Failed to send Slack notification:", err.message);
  }
}

module.exports = { sendSlackStatus };
