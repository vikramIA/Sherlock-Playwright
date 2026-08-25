const { performance } = require('perf_hooks');
const {
    keplerDatasetsFetch, safeWait, monitorMultilayerReport,
    checkMultilayerReportStatusOnce, finalizeCompletedMultilayerReport,
    searchAndClickReport, uploadAudiences, verifyAudienceUploadStatus,
    clearSearchBar, Report_To_Persona_Flow
} = require('./functions');
const { addPersonaReportToTracking } = require('./PersonaStatusFunctions.js');
const { logSession, beginFlow } = require('./Logger');

// =============== Upload Audience Flow ===============
// Note: Append Audience is not supported for Multilayer reports — merged
// reports have no "Edit" option in their menu (only Rename/Upload Audience/
// Share/Delete/etc.), so there is no way to re-open and re-trigger an upload.
async function uploadAudienceFlow(page, reportName, UploadAudience) {
    if (!Array.isArray(UploadAudience) || UploadAudience.length === 0) return;

    for (const platform of UploadAudience) {
        try {
            console.log(`--- Starting upload process for platform: ${platform} ---`);
            logSession(`--- Starting upload process for platform: ${platform} ---`);

            // ==========================================
            // 1. Select the merged multilayer report
            // ==========================================
            await searchAndClickReport(page, reportName);
            await safeWait(page, 2000);

            // ==========================================
            // 2. Upload Audience
            // ==========================================
            await uploadAudiences(page, [platform]);
            await safeWait(page, 2000);

            // ==========================================
            // 3. Verify upload
            // ==========================================
            const uploadResult = await verifyAudienceUploadStatus(page, reportName, platform);

            console.log(`✅ Upload completed for '${reportName}'`);
            console.log(`📊 Audience Count: ${uploadResult.audienceCount}`);
            logSession(`✅ Upload completed for '${reportName}'`);
            logSession(`📊 Audience Count: ${uploadResult.audienceCount}`);

            // ==========================================
            // 4. Clear search
            // ==========================================
            await clearSearchBar(page);
            await safeWait(page, 2000);

        } catch (err) {
            console.error(`❌ Upload process failed for platform ${platform}: ${err.message}`);
            logSession(`❌ Upload process failed for platform ${platform}: ${err.message}`, false, { flow: "multilayer_audience_upload", report: reportName, platform, outcome: "failure", reason: err.message });
        }
    }
}

// =============== Layered Merge Flow ===============
async function layeredMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime, options = {}) {
    const { Persona, env, UploadAudience } = options;
    const reportNameXPath = "//input[contains(@placeholder, 'report a memorable name')]";
    const reportSelectXPath = "//input[@name='multiselect-input']";

    const nameField = page.locator(`xpath=${reportNameXPath}`);
    await nameField.fill(reportName, { timeout: 10000 });

    let isFirstSelection = true;

    for (const reportNum of Report_TO_Merge) {
        const reportNameToSelect = multilayerReportsMap.get(Number(reportNum));

        if (!reportNameToSelect) {
            console.log(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            logSession(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            return; // stop process
        }

        const reportSelectField = page.locator(`xpath=${reportSelectXPath}`);

        // 🔥 Clear only for first selection
        if (isFirstSelection) {
            await reportSelectField.fill("");
            isFirstSelection = false;
        }

        // Type the report name
        await reportSelectField.fill(reportNameToSelect);

        // Wait for dropdown options to load
        await safeWait(page, 1000);

        // XPath to first recommended item
        const firstItemXPath = "//div[@cmdk-item][1]";
        const firstItem = page.locator(`xpath=${firstItemXPath}`);

        // CHECK if the first recommended option exists
        const count = await firstItem.count();
        if (count === 0) {
            console.log(`❌ No recommended options found for: ${reportNameToSelect}`);
            logSession(`❌ No recommended options found for: ${reportNameToSelect}`);
            return; // stop without error
        }

        // Get the text inside first item
        const firstItemText = (await firstItem.textContent())?.trim() || "";

        console.log(`🔍 First recommended: ${firstItemText}`);
        console.log(`🔍 Expected: ${reportNameToSelect}`);

        // Compare EXACT match
        if (firstItemText.toLowerCase() !== reportNameToSelect.toLowerCase()) {
            console.log(`❌ Mismatch! Expected "${reportNameToSelect}" but found "${firstItemText}". Stopping process.`);
            logSession(`❌ Mismatch! Expected "${reportNameToSelect}" but found "${firstItemText}". Stopping process.`);
            return; // stop quietly
        }

        // Select first item
        await firstItem.click();

        console.log(`✅ Successfully selected: ${reportNameToSelect}`);
        logSession(`✅ Successfully selected: ${reportNameToSelect}`);

        await safeWait(page, 800);
    }


    const createButtonXPath = "//div[normalize-space()='Create Multilayer']";
    const createBtn = page.locator(`xpath=${createButtonXPath}`);
    await createBtn.click({ timeout: 10000 }).catch(() => logSession("⚠️ Create Multilayer button not clickable"));
    console.log("✅ Clicked 'Create Multilayer' button");
    logSession("✅ Clicked 'Create Multilayer' button");

    await safeWait(page, 60000);
    await keplerDatasetsFetch(page, reportName);
    await safeWait(page, 2000);

    // ===== Persona (optional) — reuses the same flow as a plain Explore report =====
    if (Persona?.toUpperCase() === "YES") {
        const personaCreated = await Report_To_Persona_Flow(page, reportName);
        if (personaCreated) addPersonaReportToTracking(env, reportName, {
            uploadAudience: UploadAudience
        });
    }

    const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
    const exploreBtn = page.locator(`xpath=${exploreXPath}`);
    await exploreBtn.click({ timeout: 10000 });
    await page.waitForURL('**/explore', { timeout: 10000 });
    await safeWait(page, 2000);

    const endTime = performance.now();
    const timeTakenSeconds = (endTime - startTime) / 1000;
    const timeTakenMinutes = timeTakenSeconds / 60;
    console.log(`⏱️ Layered Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`);
    logSession(`⏱️ Layered Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`, false, { flow: "multilayer", report: reportName, merge_type: "layered", duration_sec: timeTakenSeconds });
}

// =============== Unified Merge Flow ===============
async function unifiedMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime, options = {}) {
    const { Persona, env, UploadAudience } = options;
    const reportNameXPath = "//input[contains(@placeholder, 'report a memorable name')]";
    const reportSelectXPath = "//input[@name='multiselect-input']";

    const nameField = page.locator(`xpath=${reportNameXPath}`);
    await nameField.fill(reportName, { timeout: 10000 });

    let isFirstSelection = true;

    for (const reportNum of Report_TO_Merge) {
        const reportNameToSelect = multilayerReportsMap.get(Number(reportNum));

        if (!reportNameToSelect) {
            console.log(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            logSession(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            return; // stop process
        }

        const reportSelectField = page.locator(`xpath=${reportSelectXPath}`);

        // 🔥 Clear only for first selection
        if (isFirstSelection) {
            await reportSelectField.fill("");
            isFirstSelection = false;
        }

        // Type the report name
        await reportSelectField.fill(reportNameToSelect);

        // Wait for dropdown options to load
        await safeWait(page, 1000);

        // XPath to first recommended item
        const firstItemXPath = "//div[@cmdk-item][1]";
        const firstItem = page.locator(`xpath=${firstItemXPath}`);

        // CHECK if the first recommended option exists
        const count = await firstItem.count();
        if (count === 0) {
            console.log(`❌ No recommended options found for: ${reportNameToSelect}`);
            logSession(`❌ No recommended options found for: ${reportNameToSelect}`);
            return; // stop without error
        }

        // Get the text inside first item
        const firstItemText = (await firstItem.textContent())?.trim() || "";

        console.log(`🔍 First recommended: ${firstItemText}`);
        console.log(`🔍 Expected: ${reportNameToSelect}`);

        // Compare EXACT match
        if (firstItemText.toLowerCase() !== reportNameToSelect.toLowerCase()) {
            console.log(`❌ Mismatch! Expected "${reportNameToSelect}" but found "${firstItemText}". Stopping process.`);
            logSession(`❌ Mismatch! Expected "${reportNameToSelect}" but found "${firstItemText}". Stopping process.`);
            return; // stop quietly
        }

        // Select first item
        await firstItem.click();

        console.log(`✅ Successfully selected: ${reportNameToSelect}`);
        logSession(`✅ Successfully selected: ${reportNameToSelect}`);

        await safeWait(page, 800);
    }


    // ✅ Click "Next Step" to load metadata
    const nextStepButtonXPath = "//*[normalize-space(text())='Next Step']";
    const nextStepBtn1 = page.locator(`xpath=${nextStepButtonXPath}`);
    await nextStepBtn1.click({ timeout: 10000 });
    console.log("✅ Clicked 'Next Step' (first time)");
    logSession("✅ Clicked 'Next Step' (first time)");
    await safeWait(page, 5000);

    // ✅ Wait for Multilayer section to load
    const multilayerHeaderXPath = "//div[normalize-space(text())='Multilayer']";
    await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });
    console.log("✅ Multilayer section loaded");
    logSession("✅ Multilayer section loaded");

    // ✅ Wait for "Join Group(s)" section
    const joinGroupsXPath = "//div[normalize-space(text())='Join Group(s)']";
    await page.locator(`xpath=${joinGroupsXPath}`).waitFor({ state: 'visible', timeout: 10000 });
    console.log("✅ Join Group(s) section loaded");
    logSession("✅ Join Group(s) section loaded");

    // ✅ Click "Next Step" again after metadata is loaded
    const nextStepBtn2 = page.locator(`xpath=${nextStepButtonXPath}`);
    await nextStepBtn2.click({ timeout: 10000 });
    console.log("✅ Clicked 'Next Step' (second time)");
    logSession("✅ Clicked 'Next Step' (second time)");
    await safeWait(page, 3000);

    // ✅ Wait for Multilayer section to load
    await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });
    console.log("✅ Multilayer section loaded");
    logSession("✅ Multilayer section loaded");

    // ---- Click Create Multilayer ----
    const createButtonXPath = "//div[normalize-space()='Create Multilayer']";
    const createBtn = page.locator(`xpath=${createButtonXPath}`);
    await createBtn.click({ timeout: 10000 }).catch(() => logSession("⚠️ Create Multilayer button not clickable"));
    console.log("✅ Clicked 'Create Multilayer' button");
    logSession("✅ Clicked 'Create Multilayer' button");

    // 🔥 Monitor Multilayer (THIS IS THE MAIN PART)
    const multilayerResult = await monitorMultilayerReport(page, reportName);

    console.log("📊 Multilayer Result:");
    console.log(multilayerResult);
    logSession(JSON.stringify(multilayerResult, null, 2));

    // ===== Persona (optional) — reuses the same flow as a plain Explore report =====
    if (Persona?.toUpperCase() === "YES") {
        const personaCreated = await Report_To_Persona_Flow(page, reportName);
        if (personaCreated) addPersonaReportToTracking(env, reportName, {
            uploadAudience: UploadAudience
        });
    }

    const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
    const exploreBtn = page.locator(`xpath=${exploreXPath}`);
    await exploreBtn.click({ timeout: 10000 });
    await page.waitForURL('**/explore', { timeout: 10000 });
    await safeWait(page, 2000);

    const endTime = performance.now();
    const timeTakenSeconds = (endTime - startTime) / 1000;
    const timeTakenMinutes = timeTakenSeconds / 60;
    console.log(`⏱️ Unified Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`);
    logSession(`⏱️ Unified Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`, false, { flow: "multilayer", report: reportName, merge_type: "unified", duration_sec: timeTakenSeconds });
}

// =============== Trigger-only Unified Merge (for batched flow) ===============
// Navigates to Explore and creates the merged report up through clicking
// "Create Multilayer", but does NOT wait for it to finish processing — that
// happens later, once, for the whole batch. Throws on any failure so the
// caller can log it and exclude this report from the batch's status check.
async function triggerUnifiedMultilayerReport(page, reportName, Report_TO_Merge, multilayerReportsMap) {
    const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
    await page.locator(`xpath=${exploreXPath}`).click({ timeout: 10000 });
    await page.waitForURL('**/explore', { timeout: 10000 });
    await safeWait(page, 3000);

    const multilayerBtn = page
        .locator("//button//span[normalize-space()='Add Multiple Layers']")
        .locator('xpath=ancestor::button')
        .filter({ hasNot: page.locator("[data-sidebar]") })
        .first();
    await multilayerBtn.waitFor({ state: 'visible', timeout: 10000 });
    await multilayerBtn.click();

    const multilayerHeaderXPath = "//div[normalize-space(text())='Multilayer']";
    await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });

    const reportNameXPath = "//input[contains(@placeholder, 'report a memorable name')]";
    const reportSelectXPath = "//input[@name='multiselect-input']";
    await page.locator(`xpath=${reportNameXPath}`).fill(reportName, { timeout: 10000 });

    let isFirstSelection = true;
    for (const reportNum of Report_TO_Merge) {
        const reportNameToSelect = multilayerReportsMap.get(Number(reportNum));
        if (!reportNameToSelect) {
            throw new Error(`Report number ${reportNum} not found in multilayerReportsMap`);
        }

        const reportSelectField = page.locator(`xpath=${reportSelectXPath}`);
        if (isFirstSelection) {
            await reportSelectField.fill("");
            isFirstSelection = false;
        }
        await reportSelectField.fill(reportNameToSelect);
        await safeWait(page, 1000);

        const firstItem = page.locator("xpath=//div[@cmdk-item][1]");
        if (await firstItem.count() === 0) {
            throw new Error(`No recommended options found for: ${reportNameToSelect}`);
        }

        const firstItemText = (await firstItem.textContent())?.trim() || "";
        if (firstItemText.toLowerCase() !== reportNameToSelect.toLowerCase()) {
            throw new Error(`Mismatch! Expected "${reportNameToSelect}" but found "${firstItemText}"`);
        }

        await firstItem.click();
        await safeWait(page, 800);
    }

    const nextStepButtonXPath = "//*[normalize-space(text())='Next Step']";
    await page.locator(`xpath=${nextStepButtonXPath}`).click({ timeout: 10000 });
    await safeWait(page, 5000);

    await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });

    const joinGroupsXPath = "//div[normalize-space(text())='Join Group(s)']";
    await page.locator(`xpath=${joinGroupsXPath}`).waitFor({ state: 'visible', timeout: 10000 });

    await page.locator(`xpath=${nextStepButtonXPath}`).click({ timeout: 10000 });
    await safeWait(page, 3000);

    await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });

    const createButtonXPath = "//div[normalize-space()='Create Multilayer']";
    await page.locator(`xpath=${createButtonXPath}`).click({ timeout: 10000 });

    // Let the creation submission settle before navigating off to trigger the
    // next report in the batch — without this, immediately clicking back to
    // Explore for the next item can interrupt this report's creation before
    // it registers, leaving it permanently "not found" later (seen in QA
    // session 4: two back-to-back triggered reports never showed up at all).
    await safeWait(page, 15000);

    console.log(`🚀 Triggered unified multilayer report: ${reportName}`);
    logSession(`🚀 Triggered unified multilayer report: ${reportName}`, false, { flow: "multilayer_batch", report: reportName });
}

// =============== Batched Unified Merge Flow ===============
// Instead of triggering one unified report and blocking until it completes,
// triggers up to UNIFIED_BATCH_SIZE reports back-to-back, waits once, then
// checks each one's status — completed reports get their normal post-steps
// (map load, persona, audience upload). Anything still processing at that
// point gets polled every UNIFIED_BATCH_POLL_INTERVAL_MS (real runs showed
// unified merges routinely taking longer than 5 min, so a single check was
// skipping post-steps for almost everything) until UNIFIED_BATCH_TOTAL_WAIT_MS
// total has elapsed; anything still not done by then is logged and skipped
// rather than blocking further.
const UNIFIED_BATCH_SIZE = 3;
const UNIFIED_BATCH_WAIT_MS = 5 * 60 * 1000; // initial wait before the first status check
const UNIFIED_BATCH_TOTAL_WAIT_MS = 20 * 60 * 1000; // give up on stragglers after this much total time
const UNIFIED_BATCH_POLL_INTERVAL_MS = 30 * 1000; // poll cadence for stragglers still processing

async function finalizeUnifiedBatchItem(page, item, env) {
    const { finalReportName } = item;

    const keplerResult = await finalizeCompletedMultilayerReport(page, finalReportName);
    console.log(`✅ Map load status for '${finalReportName}':`, keplerResult);
    logSession(`✅ Map load status for '${finalReportName}': ${JSON.stringify(keplerResult)}`);

    if (item.Persona?.toUpperCase() === "YES") {
        const personaCreated = await Report_To_Persona_Flow(page, finalReportName);
        if (personaCreated) addPersonaReportToTracking(env, finalReportName, { uploadAudience: item.UploadAudience });
    }

    await uploadAudienceFlow(page, finalReportName, item.UploadAudience);

    const timeTakenSeconds = (performance.now() - item.startTime) / 1000;
    console.log(`⏱️ Batched unified merge completed for: ${finalReportName} | Time: ${(timeTakenSeconds / 60).toFixed(2)} min`);
    logSession(`⏱️ Batched unified merge completed for: ${finalReportName} | Time: ${(timeTakenSeconds / 60).toFixed(2)} min`, false, { flow: "multilayer", report: finalReportName, merge_type: "unified", outcome: "success", duration_sec: timeTakenSeconds });
}

async function processUnifiedBatch(page, batch, multilayerReportsMap, env) {
    if (batch.length === 0) return;

    const triggered = [];

    for (const item of batch) {
        const startTime = performance.now();
        const randomSuffix = Math.random().toString(36).substring(2, 7);
        const finalReportName = `${item.reportName}_${randomSuffix}`;

        try {
            for (const num of item.Report_TO_Merge) {
                if (!multilayerReportsMap.has(Number(num))) {
                    throw new Error(`Report number ${num} not found in multilayerReportsMap`);
                }
            }
            await triggerUnifiedMultilayerReport(page, finalReportName, item.Report_TO_Merge, multilayerReportsMap);
            triggered.push({ ...item, finalReportName, startTime });
        } catch (err) {
            console.error(`❌ Failed to trigger '${item.reportName}': ${err.message}`);
            logSession(`❌ Failed to trigger '${item.reportName}': ${err.message}`, false, { flow: "multilayer", report: item.reportName, outcome: "failure", reason: err.message });
        }
    }

    if (triggered.length === 0) return;

    const batchWaitStart = Date.now();

    console.log(`⏳ Triggered ${triggered.length} unified multilayer report(s). Waiting 5 minutes before checking status...`);
    logSession(`⏳ Triggered ${triggered.length} unified multilayer report(s). Waiting 5 minutes before checking status...`, false, { flow: "multilayer_batch", count: triggered.length });
    await safeWait(page, UNIFIED_BATCH_WAIT_MS);

    const stillProcessing = [];

    for (const item of triggered) {
        const { finalReportName } = item;
        try {
            const statusResult = await checkMultilayerReportStatusOnce(page, finalReportName);
            console.log(`📋 Status for '${finalReportName}': ${statusResult.status}${statusResult.reason ? ` (${statusResult.reason})` : ""}`);
            logSession(`📋 Status for '${finalReportName}': ${statusResult.status}`, false, { flow: "multilayer_batch", report: finalReportName, status: statusResult.status, reason: statusResult.reason || "" });

            if (statusResult.status === "processing") {
                stillProcessing.push(item);
                continue;
            }

            if (statusResult.status !== "completed") {
                console.warn(`⚠️ '${finalReportName}' not completed after 5 min (status: ${statusResult.status}) — skipping post-steps.`);
                logSession(`⚠️ '${finalReportName}' not completed after 5 min (status: ${statusResult.status}) — skipping post-steps.`, false, { flow: "multilayer", report: finalReportName, outcome: "skipped", reason: statusResult.status });
                continue;
            }

            await finalizeUnifiedBatchItem(page, item, env);

        } catch (err) {
            console.error(`❌ Post-processing failed for '${finalReportName}': ${err.message}`);
            logSession(`❌ Post-processing failed for '${finalReportName}': ${err.message}`, false, { flow: "multilayer", report: finalReportName, outcome: "failure", reason: err.message });
        }
    }

    if (stillProcessing.length === 0) return;

    const deadline = batchWaitStart + UNIFIED_BATCH_TOTAL_WAIT_MS;
    console.log(`⏳ ${stillProcessing.length} report(s) still processing after 5 min. Polling every 30s until 20 min total have elapsed...`);
    logSession(`⏳ ${stillProcessing.length} report(s) still processing after 5 min. Polling every 30s until 20 min total have elapsed...`, false, { flow: "multilayer_batch", count: stillProcessing.length });

    let remaining = stillProcessing;

    while (remaining.length > 0 && Date.now() < deadline) {
        await safeWait(page, UNIFIED_BATCH_POLL_INTERVAL_MS);

        const nextRemaining = [];

        for (const item of remaining) {
            const { finalReportName } = item;
            try {
                const statusResult = await checkMultilayerReportStatusOnce(page, finalReportName);
                const elapsedMin = ((Date.now() - batchWaitStart) / 60000).toFixed(1);
                console.log(`📋 Poll status for '${finalReportName}' (${elapsedMin} min elapsed): ${statusResult.status}${statusResult.reason ? ` (${statusResult.reason})` : ""}`);
                logSession(`📋 Poll status for '${finalReportName}': ${statusResult.status}`, false, { flow: "multilayer_batch", report: finalReportName, status: statusResult.status, reason: statusResult.reason || "", elapsed_min: elapsedMin });

                if (statusResult.status === "processing") {
                    nextRemaining.push(item);
                    continue;
                }

                if (statusResult.status !== "completed") {
                    console.warn(`⚠️ '${finalReportName}' ended as '${statusResult.status}' during polling — skipping post-steps.`);
                    logSession(`⚠️ '${finalReportName}' ended as '${statusResult.status}' during polling — skipping post-steps.`, false, { flow: "multilayer", report: finalReportName, outcome: "skipped", reason: statusResult.status });
                    continue;
                }

                await finalizeUnifiedBatchItem(page, item, env);

            } catch (err) {
                console.error(`❌ Post-processing failed for '${finalReportName}': ${err.message}`);
                logSession(`❌ Post-processing failed for '${finalReportName}': ${err.message}`, false, { flow: "multilayer", report: finalReportName, outcome: "failure", reason: err.message });
            }
        }

        remaining = nextRemaining;
    }

    for (const item of remaining) {
        console.warn(`⚠️ '${item.finalReportName}' still not completed after 20 min total — giving up on post-steps.`);
        logSession(`⚠️ '${item.finalReportName}' still not completed after 20 min total — giving up on post-steps.`, false, { flow: "multilayer", report: item.finalReportName, outcome: "skipped", reason: "timeout_20min" });
    }
}

// =============== Batched entry point ===============
// Drop-in replacement for looping MultilayerFlow over input.Multilayer: layered
// merges run one at a time as before (unchanged), while unified merges are
// grouped into batches of UNIFIED_BATCH_SIZE and processed via
// processUnifiedBatch above.
async function MultilayerBatchFlow(page, multilayerConfigs, multilayerReportsMap, env) {
    beginFlow("multilayer");
    let pendingUnifiedBatch = [];

    const flushPending = async () => {
        if (pendingUnifiedBatch.length === 0) return;
        await processUnifiedBatch(page, pendingUnifiedBatch, multilayerReportsMap, env);
        pendingUnifiedBatch = [];
    };

    for (const report of multilayerConfigs) {
        const type = (report.MergeType || "").toLowerCase();

        if (type === "unified") {
            pendingUnifiedBatch.push(report);
            if (pendingUnifiedBatch.length >= UNIFIED_BATCH_SIZE) {
                await flushPending();
            }
        } else {
            await flushPending();
            await MultilayerFlow(page, report.reportName, report.Report_TO_Merge, report.MergeType, multilayerReportsMap, report.UploadAudience, report.Persona, env);
        }
    }

    await flushPending();
}

// =============== Main Flow ===============
async function MultilayerFlow(page, reportName, Report_TO_Merge, MergeType, multilayerReportsMap, UploadAudience, Persona, env) {
    const MAX_GLOBAL_RETRIES = 5;
    beginFlow("multilayer");

    for (let globalAttempt = 0; globalAttempt < MAX_GLOBAL_RETRIES; globalAttempt++) {
        console.log(`🌍 Starting Multilayer flow - Attempt ${globalAttempt + 1}/${MAX_GLOBAL_RETRIES}`);
        logSession(`🌍 Starting Multilayer flow - Attempt ${globalAttempt + 1}/${MAX_GLOBAL_RETRIES}`);

        try {
            // ===== Validate input reports =====
            for (const num of Report_TO_Merge) {
                if (!multilayerReportsMap.has(Number(num))) {
                    console.warn(`⚠️ Report number ${num} not found. Skipping [${Report_TO_Merge.join(', ')}]`);
                    logSession(`⚠️ Report number ${num} not found. Skipping [${Report_TO_Merge.join(', ')}]`, false, { flow: "multilayer", report: reportName, outcome: "skipped", reason: `report_number_${num}_not_found` });
                    return;
                }
            }

            const startTime = performance.now();
            const randomSuffix = () => Math.random().toString(36).substring(2, 7);
            reportName = `${reportName}_${randomSuffix()}`;

            for (const num of Report_TO_Merge) {
                console.log(`✅ Found report ${num}: ${multilayerReportsMap.get(Number(num))}`);
                logSession(`✅ Found report ${num}: ${multilayerReportsMap.get(Number(num))}`);
            }

            console.log(`🔄 Starting Multilayer Flow | MergeType: ${MergeType}`);
            logSession(`🔄 Starting Multilayer Flow | MergeType: ${MergeType}`);

            // ===== Navigation to Explore =====
            const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
            const exploreBtn = page.locator(`xpath=${exploreXPath}`);
            await exploreBtn.click({ timeout: 10000 });
            await page.waitForURL('**/explore', { timeout: 10000 });
            await safeWait(page, 3000);
            console.log(`✅ Navigated to Explore for report: ${reportName}`);
            logSession(`✅ Navigated to Explore for report: ${reportName}`);

            // ===== Multilayer button =====
            const multilayerBtn = page
                .locator("//button//span[normalize-space()='Add Multiple Layers']")
                .locator('xpath=ancestor::button')
                .filter({ hasNot: page.locator("[data-sidebar]") })
                .first();

            await multilayerBtn.waitFor({ state: 'visible', timeout: 10000 });
            await multilayerBtn.click();
            console.log("✅ Clicked 'Add Multiple Layers' button");
            logSession("✅ Clicked 'Add Multiple Layers' button");

            // ===== Wait for multilayer section =====
            const multilayerHeaderXPath = "//div[normalize-space(text())='Multilayer']";
            await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });
            console.log("✅ Multilayer section loaded");
            logSession("✅ Multilayer section loaded");

            // ===== Execute Merge Type =====
            const type = MergeType.toLowerCase();
            if (type === "layered") {
                console.log("📌 Executing Layered Datasets Merge");
                logSession("📌 Executing Layered Datasets Merge");
                const layeredBtnXPath = "//button[normalize-space(text())='Layered Datasets']";
                await page.locator(`xpath=${layeredBtnXPath}`).click({ timeout: 15000 });
                await safeWait(page, 2000);
                await layeredMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime, { Persona, env, UploadAudience });
            } else if (type === "unified") {
                console.log("📌 Executing Unified Dataset Merge");
                logSession("📌 Executing Unified Dataset Merge");
                await safeWait(page, 2000);
                await unifiedMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime, { Persona, env, UploadAudience });
            } else {
                console.warn(`❌ Invalid MergeType: ${MergeType}`);
                logSession(`❌ Invalid MergeType: ${MergeType}`, false, { flow: "multilayer", report: reportName, outcome: "failure", reason: "invalid_merge_type" });
                return;
            }

            // ===== Upload Audience (optional) =====
            await uploadAudienceFlow(page, reportName, UploadAudience);

            console.log(`✅ Completed Multilayer flow successfully on attempt ${globalAttempt + 1}`);
            logSession(`✅ Completed Multilayer flow successfully on attempt ${globalAttempt + 1}`, false, { flow: "multilayer", report: reportName, outcome: "success", attempt: globalAttempt + 1 });
            return; // success — exit loop

        } catch (err) {
            console.warn(`⚠️ Flow attempt ${globalAttempt + 1} failed: ${err.message}`);
            logSession(`⚠️ Flow attempt ${globalAttempt + 1} failed: ${err.message}`);

            if (globalAttempt < MAX_GLOBAL_RETRIES - 1) {
                console.log(`🔁 Retrying full flow (Attempt ${globalAttempt + 2}/${MAX_GLOBAL_RETRIES}) after wait...`);
                logSession(`🔁 Retrying full flow (Attempt ${globalAttempt + 2}/${MAX_GLOBAL_RETRIES}) after wait...`);
                await safeWait(page, 5000);
                continue; // retry full flow
            } else {
                console.error(`❌ All ${MAX_GLOBAL_RETRIES} attempts failed. Continuing script without abort.`);
                logSession(`❌ All ${MAX_GLOBAL_RETRIES} attempts failed. Continuing script without abort.`, false, { flow: "multilayer", report: reportName, outcome: "failure", reason: err.message });
                return; // never throw — continue rest of script
            }
        }
    }
}

module.exports = { MultilayerFlow, MultilayerBatchFlow };
