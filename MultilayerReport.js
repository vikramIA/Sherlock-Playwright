const { performance } = require('perf_hooks');
const {
    keplerDatasetsFetch, safeWait, monitorMultilayerReport,
    searchAndClickReport, uploadAudiences, verifyAudienceUploadStatus,
    clearSearchBar, Report_To_Persona_Flow
} = require('./functions');
const { addPersonaReportToTracking } = require('./PersonaStatusFunctions.js');
const { logSession } = require('./Logger');

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
            logSession(`❌ Upload process failed for platform ${platform}: ${err.message}`);
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
    logSession(`⏱️ Layered Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`);
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
    logSession(`⏱️ Unified Merge completed for: ${reportName} | Reports: ${Report_TO_Merge} | Time: ${timeTakenMinutes.toFixed(2)} min (${timeTakenSeconds.toFixed(2)} sec)`);
}

// =============== Main Flow ===============
async function MultilayerFlow(page, reportName, Report_TO_Merge, MergeType, multilayerReportsMap, UploadAudience, Persona, env) {
    const MAX_GLOBAL_RETRIES = 5;

    for (let globalAttempt = 0; globalAttempt < MAX_GLOBAL_RETRIES; globalAttempt++) {
        console.log(`🌍 Starting Multilayer flow - Attempt ${globalAttempt + 1}/${MAX_GLOBAL_RETRIES}`);
        logSession(`🌍 Starting Multilayer flow - Attempt ${globalAttempt + 1}/${MAX_GLOBAL_RETRIES}`);

        try {
            // ===== Validate input reports =====
            for (const num of Report_TO_Merge) {
                if (!multilayerReportsMap.has(Number(num))) {
                    console.warn(`⚠️ Report number ${num} not found. Skipping [${Report_TO_Merge.join(', ')}]`);
                    logSession(`⚠️ Report number ${num} not found. Skipping [${Report_TO_Merge.join(', ')}]`);
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
                logSession(`❌ Invalid MergeType: ${MergeType}`);
                return;
            }

            // ===== Upload Audience (optional) =====
            await uploadAudienceFlow(page, reportName, UploadAudience);

            console.log(`✅ Completed Multilayer flow successfully on attempt ${globalAttempt + 1}`);
            logSession(`✅ Completed Multilayer flow successfully on attempt ${globalAttempt + 1}`);
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
                logSession(`❌ All ${MAX_GLOBAL_RETRIES} attempts failed. Continuing script without abort.`);
                return; // never throw — continue rest of script
            }
        }
    }
}

module.exports = MultilayerFlow;
