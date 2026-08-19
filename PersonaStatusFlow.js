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

// Flow: for every tracked Persona report, check its status once - if Complete, run validation;
// if Incomplete/not found, record it as done (won't complete); if still Queued/In Progress, log and leave it for the next run.
async function runPersonaStatusCheckFlow(page, env) {
    const data = loadTracking();
    const trackedReports = data[env] || [];
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
                    // it here would just poll for 15 minutes waiting for a status that never comes.
                    const triggeredPlatforms = Object.keys(exportResult.platforms)
                        .filter(platform => exportResult.platforms[platform].passed);

                    if (exportResult.categoryNames?.length > 0 && triggeredPlatforms.length > 0) {
                        try {
                            entry.audienceUploadStatus = await checkPersonaAudienceUploadStatus(
                                page,
                                entry.reportName,
                                exportResult.categoryNames,
                                triggeredPlatforms
                            );
                        } catch (err) {
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

        results.push({ reportName: entry.reportName, status: entry.status, reason: entry.reason || null });

        await safeWait(page, 2000);
    }

    saveTracking(data);

    console.log(`📊 Persona status check completed for env '${env}':`, results);
    logSession(`📊 Persona status check completed for env '${env}': ${JSON.stringify(results)}`);

    return results;
}

module.exports = {
    runPersonaStatusCheckFlow
};
