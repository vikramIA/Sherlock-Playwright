const { logSession } = require('./Logger');
const { safeWait } = require('./functions');
const {
    loadTracking,
    saveTracking,
    isTerminalStatus,
    checkSinglePersonaStatus,
    validatePersonaReport,
    exportPersonaAudience,
    checkPersonaAudienceUploadStatus
} = require('./PersonaStatusFunctions.js');

// The daily run checks every tracked report in one sitting, so it can't afford the full 30-minute
// wait per report for the Uploaded Audience rows - anything still Pending after this is a warning.
const DAILY_UPLOAD_STATUS_WAIT_MINUTES = 5;

// Checks one tracked report's status once and records the results on the entry (mutates it) -
// if Complete, runs validation and then the audience export/upload check.
// Returns the raw status-check result, so callers can tell a check error apart from a real status.
async function processTrackedEntry(page, entry, { uploadStatusWaitMinutes } = {}) {
    const result = await checkSinglePersonaStatus(page, entry.reportName);
    entry.lastCheckedAt = new Date().toISOString();
    delete entry.reason;

    if (result.status === 'error') {
        entry.reason = `Check error: ${result.error}`;
        // keep prior status so it gets retried next run

    } else {
        entry.status = result.status; // exact app status: Queued / In Progress / Incomplete / Complete, or not_found

        if (result.status.toLowerCase() === 'complete') {
            const validation = await validatePersonaReport(page, entry.reportName, result.reportContainer);
            entry.validation = validation.validation;

            if (entry.uploadAudience?.length > 0 && validation.validation === 'passed') {
                const exportResult = await exportPersonaAudience(page, entry.reportName, entry.uploadAudience);
                entry.audienceExport = exportResult.passed ? 'passed' : 'failed';

                // Only check status for platforms that actually triggered (toast-validated) -
                // a platform whose export toast failed never produces a real row, so checking
                // it here would just poll until the timeout waiting for a status that never comes.
                const triggeredPlatforms = Object.keys(exportResult.platforms)
                    .filter(platform => exportResult.platforms[platform].passed);

                if (exportResult.categoryNames?.length > 0 && triggeredPlatforms.length > 0) {
                    try {
                        entry.audienceUploadStatus = await checkPersonaAudienceUploadStatus(
                            page,
                            entry.reportName,
                            exportResult.categoryNames,
                            triggeredPlatforms,
                            uploadStatusWaitMinutes
                        );
                    } catch (err) {
                        entry.audienceUploadCheckError = err.message;
                        console.error(`❌ Failed to check audience upload status for '${entry.reportName}': ${err.message}`);
                        logSession(`❌ Failed to check audience upload status for '${entry.reportName}': ${err.message}`);
                    }
                }
            }

        } else if (result.status === 'not_found') {
            entry.reason = 'Report not found in Explore';

        } else if (result.status.toLowerCase() === 'incomplete') {
            entry.reason = "Report marked 'Incomplete' by app — will not complete";

        } else {
            console.log(`⏳ Persona report '${entry.reportName}' is still '${entry.status}' — will check again next run.`);
            logSession(`⏳ Persona report '${entry.reportName}' is still '${entry.status}' — will check again next run.`);
        }
    }

    return result;
}

// Flow: for every tracked Persona report, check its status once - if Complete, run validation;
// if Incomplete/not found, record it as done (won't complete); if still Queued/In Progress, log and leave it for the next run.
async function runPersonaStatusCheckFlow(page, env) {
    const trackedReports = loadTracking(env);
    const pending = trackedReports.filter(r => !isTerminalStatus(r.status));

    if (pending.length === 0) {
        console.log(`ℹ️ No pending Persona reports tracked for env '${env}'.`);
        logSession(`ℹ️ No pending Persona reports tracked for env '${env}'.`);
        return [];
    }

    console.log(`🚀 Checking ${pending.length} pending Persona report(s) for env '${env}'...`);
    logSession(`🚀 Checking ${pending.length} pending Persona report(s) for env '${env}'...`);

    const results = [];

    for (const entry of pending) {
        await processTrackedEntry(page, entry);
        results.push({ reportName: entry.reportName, status: entry.status, reason: entry.reason || null });

        await safeWait(page, 2000);
    }

    saveTracking(env, trackedReports);

    console.log(`📊 Persona status check completed for env '${env}':`, results);
    logSession(`📊 Persona status check completed for env '${env}': ${JSON.stringify(results)}`);

    return results;
}

// One outcome per checked report for the run summary / Slack. The inner steps log their own
// outcomes per step (and the last one logged would win), so this records the overall verdict last.
// A report that loaded and passed validation is a success; audience rows still Pending (or an
// upload-status check that couldn't run) only add a warning.
function summarizeDailyOutcome(entry, checkResult) {
    const status = String(entry.status).toLowerCase();

    if (checkResult.status === 'error') return { outcome: 'failure', reason: `status_check_error: ${checkResult.error}` };
    if (status === 'not_found') return { outcome: 'failure', reason: 'not_found_in_explore' };
    if (status === 'incomplete') return { outcome: 'failure', reason: 'persona_incomplete' };
    if (status !== 'complete') return { outcome: 'failure', reason: `still_${status.replace(/\s+/g, '_')}_from_previous_run` };
    if (entry.validation !== 'passed') return { outcome: 'failure', reason: `validation_${entry.validation}` };
    if (entry.audienceExport === 'failed') return { outcome: 'failure', reason: 'audience_export_failed' };

    const uploads = (entry.audienceUploadStatus || []).filter(Boolean);
    const describe = list => list.map(u => `${u.platform}/${u.category}`).join(', ');

    const failed = uploads.filter(u => ['unsuccessful', 'error'].includes(String(u.status).toLowerCase()));
    if (failed.length > 0) return { outcome: 'failure', reason: `audience_upload_failed: ${describe(failed)}` };

    const stillPending = uploads.filter(u => u.status === 'timeout');
    if (stillPending.length > 0) {
        return { outcome: 'warning', reason: `audience_upload_still_pending after ${DAILY_UPLOAD_STATUS_WAIT_MINUTES} min: ${describe(stillPending)}` };
    }
    if (entry.audienceUploadCheckError) {
        return { outcome: 'warning', reason: `audience_upload_status_check_error: ${entry.audienceUploadCheckError}` };
    }

    return { outcome: 'success' };
}

// Daily flow: checks every tracked Persona report, then removes each one from tracking whatever
// the result - daily runs create fresh reports every day, so each is checked exactly once.
// Must run before this run's report flows add their entries, so everything in the file here
// is from a previous daily run.
async function runDailyPersonaStatusCheck(page, env) {
    const entries = loadTracking(env);
    const due = [...entries];

    if (due.length === 0) {
        console.log(`ℹ️ No Persona reports from previous daily runs to check for env '${env}'.`);
        logSession(`ℹ️ No Persona reports from previous daily runs to check for env '${env}'.`);
        return [];
    }

    console.log(`🚀 Checking ${due.length} Persona report(s) from previous daily runs for env '${env}'...`);
    logSession(`🚀 Checking ${due.length} Persona report(s) from previous daily runs for env '${env}'...`);

    const results = [];

    for (const entry of due) {
        let checkResult;
        try {
            checkResult = await processTrackedEntry(page, entry, { uploadStatusWaitMinutes: DAILY_UPLOAD_STATUS_WAIT_MINUTES });
        } catch (err) {
            checkResult = { reportName: entry.reportName, status: 'error', error: err.message };
        }

        const { outcome, reason } = summarizeDailyOutcome(entry, checkResult);
        const icon = outcome === 'success' ? '✅' : outcome === 'warning' ? '⚠️' : '❌';
        const msg = `${icon} Daily Persona status check for '${entry.reportName}': ${outcome}${reason ? ` (${reason})` : ''}`;
        console.log(msg);
        logSession(msg, false, { flow: 'persona_status_check', report: entry.reportName, status: entry.status, outcome, reason });

        results.push({
            reportName: entry.reportName,
            status: entry.status,
            outcome,
            reason: reason || null,
            validation: entry.validation || null,
            audienceExport: entry.audienceExport || null,
            audienceUploadStatus: (entry.audienceUploadStatus || []).filter(Boolean),
        });

        // Save after each report rather than once at the end, so a crash mid-run doesn't
        // re-check (and re-export audiences for) the reports already done.
        entries.splice(entries.indexOf(entry), 1);
        saveTracking(env, entries);
        console.log(`🗑️ Removed '${entry.reportName}' from Persona tracking.`);
        logSession(`🗑️ Removed '${entry.reportName}' from Persona tracking.`);

        await safeWait(page, 2000);
    }

    console.log(`📊 Daily Persona status check completed for env '${env}':`, results);
    logSession(`📊 Daily Persona status check completed for env '${env}': ${JSON.stringify(results)}`);

    return results;
}

module.exports = {
    runPersonaStatusCheckFlow,
    runDailyPersonaStatusCheck
};
