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

// Overall run status shown in the header. Warnings don't fail a run — a
// report that loaded with data is a success — they only soften the status.
function runStatus({ error, failure, successWithWarnings }) {
  if (error) return { emoji: "🔥", label: "Script error" };
  if (failure > 0) return { emoji: "🔴", label: "Failures found" };
  if (successWithWarnings > 0) return { emoji: "🟡", label: "Passed with warnings" };
  return { emoji: "🟢", label: "All passed" };
}

// Splunk is fed from the fixed log path on the VM that runs these checks
// (one file per env: dev_log.txt / qa_log.txt / prod_log.txt), so the only
// part of the dashboard URL that changes per run is which source file to filter to.
const SPLUNK_BASE_URL = "https://splunk.infiniteanalytics.com/en-GB/app/search/sherlock_automation_dashboard";
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
// Reasons can carry a whole WatsonAI reply or a Playwright call log; keep the
// first line and trim it so each report stays on one readable line.
const MAX_REASON_LENGTH = 120;

// Slack mrkdwn treats &, < and > as control characters.
function escapeSlack(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortenReason(reason) {
  const oneLine = String(reason).split("\n")[0].replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_REASON_LENGTH
    ? `${oneLine.slice(0, MAX_REASON_LENGTH - 1)}…`
    : oneLine;
}

function formatReportList(title, items) {
  if (!items || items.length === 0) return null;

  const shown = items.slice(0, MAX_LISTED_REPORTS).map(({ report, reason }) => {
    const name = `\`${escapeSlack(report)}\``;
    return reason ? `• ${name}\n      _${escapeSlack(shortenReason(reason))}_` : `• ${name}`;
  });

  const remaining = items.length - shown.length;
  if (remaining > 0) shown.push(`_…and ${remaining} more (see Splunk)_`);

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*${title} (${items.length})*\n${shown.join("\n")}` },
  };
}

const OUTCOME_ICONS = { success: "✅", warning: "⚠️", failure: "❌", skipped: "⏭️" };

// Rolls one report's per-category upload rows up to one mark per platform
// (e.g. "Meta ✓ · Google pending"): any failed category fails the platform,
// otherwise any still-Pending one leaves it pending.
function summarizeUploadsByPlatform(uploads) {
  const byPlatform = new Map();
  for (const { platform, status } of uploads) {
    if (!byPlatform.has(platform)) byPlatform.set(platform, []);
    byPlatform.get(platform).push(String(status).toLowerCase());
  }

  return Array.from(byPlatform, ([platform, statuses]) => {
    if (statuses.some(s => s === "unsuccessful" || s === "error")) return `${platform} ✗`;
    if (statuses.some(s => s !== "successful" && s !== "completed")) return `${platform} pending`;
    return `${platform} ✓`;
  }).join(" · ");
}

function describePersonaStatus(result) {
  const status = String(result.status).toLowerCase();
  if (status === "not_found") return "Not found in Explore";
  if (status !== "complete") return result.reason?.startsWith("status_check_error") ? "Status check error" : `Still ${result.status}`;

  const parts = [result.validation === "passed" ? "Complete · validated" : `Complete · validation ${result.validation}`];
  if (result.audienceExport === "failed") parts.push("audience export failed");
  if (result.audienceUploadStatus?.length > 0) parts.push(summarizeUploadsByPlatform(result.audienceUploadStatus));
  return parts.join(" · ");
}

// The Persona reports a daily run checked from the previous run. They get their own section
// because a Persona report shares its source report's name, so in the general lists yesterday's
// Persona check can't be told apart from today's report. Passes are listed too, so it's visible
// which reports were checked (and dropped from tracking).
function formatPersonaStatusList(results) {
  if (!results || results.length === 0) return null;

  const shown = results.slice(0, MAX_LISTED_REPORTS).map(result => {
    const icon = OUTCOME_ICONS[result.outcome] || "•";
    const line = `• ${icon} \`${escapeSlack(result.reportName)}\` — ${escapeSlack(describePersonaStatus(result))}`;
    return result.reason ? `${line}\n      _${escapeSlack(shortenReason(result.reason))}_` : line;
  });

  const remaining = results.length - shown.length;
  if (remaining > 0) shown.push(`_…and ${remaining} more (see Splunk)_`);

  return {
    type: "section",
    text: { type: "mrkdwn", text: `*🧬 Persona reports from previous run (${results.length})*\n${shown.join("\n")}` },
  };
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
    successWithWarnings = 0,
    failure,
    skipped,
    warnings,
    failures,
    skippedReports,
    personaStatusResults = [],
    totalDuration,
    error,
  } = summary;

  const webhookUrl = resolveWebhookUrl(env);
  if (!webhookUrl) {
    console.warn("⚠️ No Slack webhook configured (set SLACK_WEBHOOK_URL or Environments.json[env].slackWebhookUrl) — skipping Slack notification.");
    return;
  }

  const status = runStatus({ error, failure, successWithWarnings });
  const envLabel = env.toUpperCase();
  const unixNow = Math.floor(Date.now() / 1000);

  const passedText = successWithWarnings > 0
    ? `✅ *${success}* passed _(${successWithWarnings} with warnings)_`
    : `✅ *${success}* passed`;

  const contextParts = [
    `Session *${session}*`,
    `<!date^${unixNow}^{date_short_pretty} {time}|${new Date().toISOString()}>`,
  ];
  if (totalDuration) contextParts.push(`⏱️ ${totalDuration}`);

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${status.emoji} Sherlock ${envLabel} · ${checkType} — ${status.label}`, emoji: true },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: contextParts.join("  ·  ") }] },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `${passedText}    ❌ *${failure}* failed    ⏭️ *${skipped}* skipped\n` +
          `Ran *${reportsAttempted}* of *${reportsPlanned}* planned` +
          (reportsNotRun > 0 ? `  ·  🚫 *${reportsNotRun}* not run` : ""),
      },
    },
  ];

  if (error) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `🔥 *Script error*\n\`\`\`${escapeSlack(shortenReason(error))}\`\`\`` },
    });
  }

  // Persona status checks still count in the totals above, but are listed only in their own section.
  const personaReportNames = new Set(personaStatusResults.map(r => r.reportName));
  const withoutPersonaChecks = items => (items || []).filter(({ report }) => !personaReportNames.has(report));

  // Most actionable first: what broke, what didn't get to run, then minor issues.
  const lists = [
    formatReportList("❌ Failed", withoutPersonaChecks(failures)),
    formatReportList("⏭️ Skipped", withoutPersonaChecks(skippedReports)),
    formatPersonaStatusList(personaStatusResults),
    formatReportList("⚠️ Passed with warnings", withoutPersonaChecks(warnings)),
  ].filter(Boolean);

  if (lists.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push(...lists);
  }

  blocks.push({
    type: "actions",
    elements: [{
      type: "button",
      text: { type: "plain_text", text: "View logs in Splunk", emoji: true },
      url: buildSplunkUrl(env),
    }],
  });

  // Plain-text fallback used for the push notification / channel preview.
  const text = `${status.emoji} Sherlock ${envLabel} (${checkType}) — ${success} passed, ${failure} failed, ${skipped} skipped`;

  try {
    await axios.post(webhookUrl, { text, blocks }, { timeout: 10000 });
    console.log("📣 Slack notification sent.");
  } catch (err) {
    console.error("❌ Failed to send Slack notification:", err.message);
  }
}

module.exports = { sendSlackStatus };
