const fs = require('fs');
const path = require('path');

let sessionLogPath;
let currentEnv;
let currentSession = 0;
let currentFlow;
let currentReportStartedAt;
// Keyed by report name (or a synthetic key when no report= was given) so a report
// logged more than once — e.g. a build-success followed by a later upload-failure
// for the same report — is counted once, under its most recent outcome. Keeps
// success+failure+skipped in sync with total_reports.
let runStats = { byReport: new Map(), unnamedSeq: 0 };

// Matches emoji used across the codebase to mark severity (✅/❌/⚠️/etc.) so they
// can be stripped from the persisted message and mapped to a real level= field.
const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2300}-\u{27BF}\u{FE0F}]/gu;
// Arrows (e.g. "X → Y") are separators, not decoration — keep the meaning, drop the glyph.
const ARROW_REGEX = /[\u{2190}-\u{21FF}]/gu;

function collapseWhitespace(value) {
    return String(value).replace(/\s+/g, ' ').trim();
}

function detectLevel(rawMessage) {
    if (rawMessage.includes('❌') || /\bfail(ed|ure)?\b/i.test(rawMessage)) return 'error';
    if (rawMessage.includes('⚠️')) return 'warn';
    return 'info';
}

function escapeValue(value) {
    const str = String(value);
    if (str === '') return '""';
    return /[\s"=]/.test(str) ? `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : str;
}

function toLogfmt(fields) {
    return Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${escapeValue(v)}`)
        .join(' ');
}

// Many existing log calls prefix the message with "[reportName] ..." — lift that
// into its own context= field so it becomes filterable instead of buried in msg.
function splitContext(cleanedMessage) {
    const match = cleanedMessage.match(/^\[([^\]]+)\]\s*(.*)$/);
    return match ? { context: match[1], msg: match[2] } : { context: undefined, msg: cleanedMessage };
}

// Call once per report-processing entry point (top of exploreFlow/PersonaFlow/etc.).
// Tags every subsequent logSession call with flow= until the next beginFlow() call,
// and lets outcome-tagged lines auto-report how long that report took.
function beginFlow(flow) {
    currentFlow = flow;
    currentReportStartedAt = Date.now();
}

function getRunSummary() {
    const counts = { success: 0, failure: 0, skipped: 0 };
    for (const outcome of runStats.byReport.values()) {
        counts[outcome] = (counts[outcome] || 0) + 1;
    }
    return {
        total_reports: runStats.byReport.size,
        success: counts.success,
        failure: counts.failure,
        skipped: counts.skipped,
    };
}

function initLogger(env) {
    const logDir = path.join(__dirname, 'logs');

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }

    sessionLogPath = path.join(logDir, `${env}_log.txt`);
    currentEnv = env;
}

function getSessionHeader(sessionNumber) {
    currentSession = sessionNumber;
    runStats = { byReport: new Map(), unnamedSeq: 0 };
    return toLogfmt({
        ts: new Date().toISOString(),
        level: 'info',
        event: 'session_start',
        env: currentEnv,
        session: sessionNumber,
    }) + '\n';
}

function getLastSessionNumber() {
    if (!fs.existsSync(sessionLogPath)) return 0;
    const logData = fs.readFileSync(sessionLogPath, 'utf-8');

    const numbers = [];
    for (const m of logData.matchAll(/event=session_start\b[^\n]*\bsession=(\d+)/g)) numbers.push(parseInt(m[1]));
    for (const m of logData.matchAll(/========= Session (\d+) \|/g)) numbers.push(parseInt(m[1]));

    return numbers.length ? Math.max(...numbers) : 0;
}

function logToFile(filePath, message, isSessionStart = false, meta) {
    if (isSessionStart === true) {
        fs.appendFileSync(filePath, message, 'utf-8');
        return;
    }

    const cleaned = collapseWhitespace(String(message).replace(ARROW_REGEX, ' -> ').replace(EMOJI_REGEX, ''));
    const { context, msg } = splitContext(cleaned);

    const fields = {
        ts: new Date().toISOString(),
        level: detectLevel(String(message)),
        env: currentEnv,
        session: currentSession,
        flow: currentFlow,
        context,
        msg,
    };

    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
        Object.assign(fields, meta);
    }

    if (fields.outcome !== undefined) {
        if (fields.duration_ms === undefined && currentReportStartedAt !== undefined) {
            fields.duration_ms = Date.now() - currentReportStartedAt;
        }
        const reportKey = fields.report || `__unnamed_${runStats.unnamedSeq++}`;
        runStats.byReport.set(reportKey, fields.outcome);
    }

    fs.appendFileSync(filePath, toLogfmt(fields) + '\n', 'utf-8');
}

function logSession(message, isSessionStart = false, meta) {
    logToFile(sessionLogPath, message, isSessionStart, meta);
}

function getContext() {
    return { env: currentEnv, session: currentSession };
}

module.exports = {
    initLogger,
    getSessionHeader,
    getLastSessionNumber,
    logSession,
    toLogfmt,
    escapeValue,
    collapseWhitespace,
    getContext,
    beginFlow,
    getRunSummary,
};
