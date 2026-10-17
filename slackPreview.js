// Preview the daily-run Slack message without running the flows and
// WITHOUT posting anything to Slack.
//
//   node slackPreview.js
//
// Builds the message with SlackNotifier from sample data, then prints a
// Block Kit Builder link that shows it rendered. Posting is blocked: the
// webhook is replaced by a dummy and the HTTP call is intercepted, so no
// key is needed and a key in .env is never used.
//
// The sample uses the reason formats the flows now write, so it shows how a
// real failure / warning will read.

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");

const sample = {
    env: "qa",
    checkType: "daily",
    session: "TEST-PREVIEW",
    reportsPlanned: 25,
    reportsAttempted: 6,
    reportsNotRun: 19,
    success: 4,
    successWithWarnings: 2,
    failure: 2,
    skipped: 0,
    totalDuration: "18m 23s",
    failures: [
        {
            report: "Dominos DLV Mumbai June 10-12 2026",
            reason: "Kepler validation failed (timeout): Kepler data did not render 30s after the report loaded (map found: true, Datasets (0): , sidebar label: '')."
        },
        {
            report: "Old World Hospitality",
            reason: "Phase 3: report creation: Multilayer review form for cohort 3 appeared, but its Submit button stayed disabled for 3 min | last chat reply: 'Please review and modify the following query parameters.'"
        }
    ],
    warnings: [
        {
            report: "Starbucks PLV Mumbai July 1-3 2026",
            reason: "field_mismatch: Places, Brands; summary_missing: no WatsonAI summary in the chat by the end of validation"
        },
        {
            report: "Old World Hospitality (resume)",
            reason: "phase3_visitation_short: 4/5"
        }
    ],
    skippedReports: [],
    personaStatusResults: [],
};

(async () => {

    // SlackNotifier only builds the message when a webhook is set: give it a
    // dummy one (set before SlackNotifier loads, so .env can't override it)
    // and catch the payload instead of sending it.
    process.env.SLACK_WEBHOOK_URL = "https://preview.invalid/webhook";

    let payload = null;
    axios.post = async (url, body) => {
        payload = body;
        return { status: 200 };
    };

    const { sendSlackStatus } = require("./SlackNotifier");

    // Hide SlackNotifier's "Slack notification sent." line — nothing was sent.
    const log = console.log;
    console.log = (...args) => String(args[0]).startsWith("📣") ? undefined : log(...args);
    await sendSlackStatus(sample);
    console.log = log;

    if (!payload) throw new Error("SlackNotifier did not build a message.");

    const out = path.join(os.tmpdir(), "slack-preview.json");
    fs.writeFileSync(out, JSON.stringify({ blocks: payload.blocks }, null, 2));

    const builderUrl = "https://app.slack.com/block-kit-builder#" +
        encodeURIComponent(JSON.stringify({ blocks: payload.blocks }));

    console.log("\nNothing was posted to Slack.");
    console.log(`Message JSON saved to ${out}`);
    console.log("\nOpen this link to see the message rendered (sign in to your Slack workspace if asked):\n");
    console.log(builderUrl + "\n");
})().catch(error => {
    console.error("Preview failed:", error.message);
    process.exit(1);
});
