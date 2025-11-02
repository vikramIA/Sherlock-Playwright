const { performance } = require('perf_hooks');
const { keplerDatasetsFetch , safeWait } = require('./functions');
const { logSession, logReport } = require('./Logger');

// =============== Layered Merge Flow ===============
async function layeredMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime) {
    const reportNameXPath = "//input[contains(@placeholder, 'report a memorable name')]";
    const reportSelectXPath = "//input[@name='multiselect-input']";

    const nameField = page.locator(`xpath=${reportNameXPath}`);
    await nameField.fill(reportName, { timeout: 10000 });

    for (const reportNum of Report_TO_Merge) {
        const reportNameToSelect = multilayerReportsMap.get(Number(reportNum));
        if (reportNameToSelect) {
            const reportSelectField = page.locator(`xpath=${reportSelectXPath}`);
            await reportSelectField.fill(reportNameToSelect);
            await safeWait(page, 500);
            await reportSelectField.press('ArrowDown');
            await reportSelectField.press('Enter');
            console.log(`✅ Selected report: ${reportNameToSelect}`);
            logSession(`✅ Selected report: ${reportNameToSelect}`);
            await safeWait(page, 1000);
        } else {
            console.log(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            logSession(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
        }
    }

    const createButtonXPath = "//div[normalize-space()='Create Multilayer']";
    const createBtn = page.locator(`xpath=${createButtonXPath}`);
    await createBtn.click({ timeout: 10000 }).catch(() => logSession("⚠️ Create Multilayer button not clickable"));
    console.log("✅ Clicked 'Create Multilayer' button");
    logSession("✅ Clicked 'Create Multilayer' button");

    await safeWait(page, 60000);
    await keplerDatasetsFetch(page, reportName);
    await safeWait(page, 2000);

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
async function unifiedMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime) {
    const reportNameXPath = "//input[contains(@placeholder, 'report a memorable name')]";
    const reportSelectXPath = "//input[@name='multiselect-input']";

    const nameField = page.locator(`xpath=${reportNameXPath}`);
    await nameField.fill(reportName, { timeout: 10000 });

    for (const reportNum of Report_TO_Merge) {
        const reportNameToSelect = multilayerReportsMap.get(Number(reportNum));
        if (reportNameToSelect) {
            const reportSelectField = page.locator(`xpath=${reportSelectXPath}`);
            await reportSelectField.fill(reportNameToSelect);
            await safeWait(page, 500);
            await reportSelectField.press('ArrowDown');
            await reportSelectField.press('Enter');
            console.log(`✅ Selected report: ${reportNameToSelect}`);
            logSession(`✅ Selected report: ${reportNameToSelect}`);
            await safeWait(page, 1000);
        } else {
            console.log(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
            logSession(`⚠️ Report number ${reportNum} not found in multilayerReportsMap`);
        }
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

    await safeWait(page, 60000);
    await keplerDatasetsFetch(page, reportName);
    await safeWait(page, 2000);

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
async function MultilayerFlow(page, reportName, Report_TO_Merge, MergeType, multilayerReportsMap) {

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

    console.log("🔄 Starting Multilayer Flow | MergeType:", MergeType);
    logSession(`🔄 Starting Multilayer Flow | MergeType: ${MergeType}`);

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            console.log(`Attempt ${attempt + 1} of ${MAX_RETRIES}...`);
            logSession(`Attempt ${attempt + 1} of ${MAX_RETRIES}...`);

            const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
            const exploreBtn = page.locator(`xpath=${exploreXPath}`);
            await exploreBtn.click({ timeout: 10000 });
            await page.waitForURL('**/explore', { timeout: 10000 });
            await safeWait(page, 3000);
            console.log(`✅ Navigated to Explore for report: ${reportName}`);
            logSession(`✅ Navigated to Explore for report: ${reportName}`);

            // ✅ FIXED STRICT MODE VIOLATION HERE
            const multilayerBtn = page
                .locator("//button//span[normalize-space()='Add Multiple Layers']")
                .locator('xpath=ancestor::button')
                .filter({ hasNot: page.locator("[data-sidebar]") })
                .first();

            await multilayerBtn.waitFor({ state: 'visible', timeout: 10000 });
            await multilayerBtn.click();
            console.log("✅ Clicked 'Add Multiple Layers' button (filtered, visible only)");
            logSession("✅ Clicked 'Add Multiple Layers' button (filtered, visible only)");

            const multilayerHeaderXPath = "//div[normalize-space(text())='Multilayer']";
            await page.locator(`xpath=${multilayerHeaderXPath}`).waitFor({ state: 'visible', timeout: 120000 });
            console.log("✅ Multilayer section loaded");
            logSession("✅ Multilayer section loaded");

            const type = MergeType.toLowerCase();
            if (type === "layered") {
                console.log("📌 Executing Layered Datasets Merge");
                logSession("📌 Executing Layered Datasets Merge");
                const layeredBtnXPath = "//button[normalize-space(text())='Layered Datasets']";
                await page.locator(`xpath=${layeredBtnXPath}`).click({ timeout: 15000 });
                await safeWait(page, 2000);
                await layeredMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime);
            } else if (type === "unified") {
                console.log("📌 Executing Unified Dataset Merge");
                logSession("📌 Executing Unified Dataset Merge");
                await safeWait(page, 2000);
                await unifiedMerge(page, reportName, Report_TO_Merge, multilayerReportsMap, startTime);
            } else {
                throw new Error(`❌ Invalid MergeType: ${MergeType}`);
            }

            console.log(`✅ Completed Multilayer flow successfully on attempt ${attempt + 1}`);
            logSession(`✅ Completed Multilayer flow successfully on attempt ${attempt + 1}`);
            break;

        } catch (err) {
            console.warn(`⚠️ Attempt ${attempt + 1} failed: ${err.message}`);
            logSession(`⚠️ Attempt ${attempt + 1} failed: ${err.message}`);
            if (attempt === MAX_RETRIES - 1) {
                console.error(`❌ All ${MAX_RETRIES} attempts failed. Aborting multilayer flow.`);
                logSession(`❌ All ${MAX_RETRIES} attempts failed. Aborting multilayer flow.`);
                throw err;
            }
            await safeWait(page, 2000);
        }
    }
}

module.exports = MultilayerFlow;
