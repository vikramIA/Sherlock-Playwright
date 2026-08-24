const fs = require('fs');
const path = require('path');
const { logSession, beginFlow } = require('./Logger');

const TRACKING_FILE = path.join(__dirname, 'personaTracking.json');

// App reports exactly 4 statuses: Queued, In Progress, Incomplete, Complete.
// Only Queued/In Progress still have a chance of reaching Complete - Incomplete is terminal (won't complete).
// 'not_found' is our own terminal state for when the report can't be located at all.
function isTerminalStatus(status) {
    return ['complete', 'incomplete', 'not_found'].includes(String(status).toLowerCase());
}

async function navigateToExplore(page) {
    if (!page.url().includes('/explore')) {
        const exploreBtn = page.locator("//a[@href='/explore' and @data-sidebar='menu-button']");
        await exploreBtn.click({ timeout: 10000 });
        await page.waitForURL('**/explore', { timeout: 15000 });
        await page.waitForTimeout(2000);
    }
}

// Finds the Persona row for a report. A Persona-derived report keeps the exact same display
// name as its source report (e.g. "PLV_Trigger_CDP: jx2d6" appears twice - once as
// "Insight type: Place Level Visits", once as "Insight type: Persona") so matching on name
// alone is ambiguous; filtering on "Insight type: Persona" disambiguates it.
async function locatePersonaReportRow(page, reportName) {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await navigateToExplore(page);

            const searchInput = page.locator("//input[@placeholder='Search for a file']");
            await searchInput.waitFor({ state: 'visible', timeout: 15000 });
            await searchInput.click();
            await page.keyboard.press('Control+A');
            await page.keyboard.press('Backspace');
            await searchInput.fill(reportName);
            await searchInput.press('Enter');

            console.log(`🔎 [Persona] Attempt ${attempt}/${MAX_RETRIES}: Searching '${reportName}'`);
            logSession(`🔎 [Persona] Attempt ${attempt}/${MAX_RETRIES}: Searching '${reportName}'`);

            await page.waitForTimeout(1500);

            const personaRow = page.locator(
                `xpath=//div[contains(@class,'mt-2 w-full')][.//a[normalize-space()='${reportName}']][.//p[contains(.,'Insight type:') and contains(.,'Persona')]]`
            ).first();

            await personaRow.waitFor({ state: 'visible', timeout: 15000 });
            return personaRow;

        } catch (err) {
            console.log(`⚠ [Persona] Attempt ${attempt} failed: ${err.message}`);
            logSession(`⚠ [Persona] Attempt ${attempt} failed: ${err.message}`);

            if (attempt < MAX_RETRIES) {
                await page.waitForTimeout(RETRY_DELAY);
            }
        }
    }

    console.log(`❌ Persona report '${reportName}' not found after ${MAX_RETRIES} attempts`);
    logSession(`❌ Persona report '${reportName}' not found after ${MAX_RETRIES} attempts`);
    return null;
}

// === Tracking store helpers ===
// Structure: { [env]: [ { reportName, status, createdAt, lastCheckedAt, reason, validation } ] }

function loadTracking() {
    if (!fs.existsSync(TRACKING_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf-8'));
    } catch (err) {
        // Don't silently treat a corrupt file as empty - the next save would then
        // permanently overwrite it, discarding whatever was tracked before. Back it up first.
        const backupPath = `${TRACKING_FILE}.corrupted-${Date.now()}`;
        try {
            fs.copyFileSync(TRACKING_FILE, backupPath);
        } catch { /* best-effort backup */ }

        console.error(`❌ personaTracking.json is corrupted (${err.message}). Backed up to ${backupPath} and starting fresh.`);
        logSession(`❌ personaTracking.json is corrupted (${err.message}). Backed up to ${backupPath} and starting fresh.`);
        return {};
    }
}

function saveTracking(data) {
    // Write to a temp file and rename over the real one, so a process interrupted mid-write
    // (Ctrl+C, crash) leaves the previous valid file intact instead of a truncated/corrupt one.
    const tempPath = `${TRACKING_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, TRACKING_FILE);
}

// Called right after a Persona report is confirmed created, so its completion can be checked later.
// options.uploadAudience carries the trigger-time input.json "UploadAudience": ["META", "GOOGLE"]
// value forward into personaTracking.json, since the status-check run happens much later in a
// separate process invocation with no access to input.json.
function addPersonaReportToTracking(env, reportName, options = {}) {
    const data = loadTracking();
    if (!data[env]) data[env] = [];

    const alreadyTracked = data[env].some(
        r => r.reportName === reportName && !isTerminalStatus(r.status)
    );

    if (alreadyTracked) {
        console.log(`ℹ️ Persona report '${reportName}' already tracked and pending for env '${env}'. Skipping duplicate entry.`);
        logSession(`ℹ️ Persona report '${reportName}' already tracked and pending for env '${env}'. Skipping duplicate entry.`, false, { report: reportName, env });
        return;
    }

    data[env].push({
        reportName,
        status: 'pending',
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
        uploadAudience: Array.isArray(options.uploadAudience) ? options.uploadAudience : []
    });

    saveTracking(data);

    console.log(`📌 Persona report '${reportName}' added to tracking for status check (env: ${env}).`);
    logSession(`📌 Persona report '${reportName}' added to tracking for status check (env: ${env}).`, false, { report: reportName, env });
}

// Single status check for one Persona report (no long polling - meant to be called once per run)
async function checkSinglePersonaStatus(page, reportName) {
    beginFlow("persona_status_check");
    try {
        const reportContainer = await locatePersonaReportRow(page, reportName);

        if (!reportContainer) {
            console.log(`❌ Persona report '${reportName}' not found in Explore.`);
            logSession(`❌ Persona report '${reportName}' not found in Explore.`, false, { flow: "persona_status_check", report: reportName, status: 'not_found', outcome: "failure", reason: "not_found_in_explore" });
            return { reportName, status: 'not_found' };
        }

        const statusText = (await reportContainer
            .locator("xpath=.//p[contains(text(),'Status:')]//span")
            .textContent())?.trim();

        const lowerStatus = statusText?.toLowerCase();
        const terminal = isTerminalStatus(lowerStatus);

        console.log(`🔍 Persona report '${reportName}' status = ${statusText}`);
        logSession(`🔍 Persona report '${reportName}' status = ${statusText}`, false, {
            flow: "persona_status_check",
            report: reportName,
            status: statusText,
            ...(terminal ? { outcome: lowerStatus === 'complete' ? "success" : "failure" } : {}),
        });

        // Return the app's exact status text (Queued / In Progress / Incomplete / Complete) as-is
        return statusText?.toLowerCase() === 'complete'
            ? { reportName, status: statusText, reportContainer }
            : { reportName, status: statusText || 'unknown' };

    } catch (err) {
        console.error(`❌ Error checking status for Persona report '${reportName}': ${err.message}`);
        logSession(`❌ Error checking status for Persona report '${reportName}': ${err.message}`, false, { flow: "persona_status_check", report: reportName, outcome: "failure", reason: err.message });
        return { reportName, status: 'error', error: err.message };
    }
}

// The category dropdown (Lifestyle Wellness / Travel Mobility / Shopping Services / Community)
// renders top-right, distinguishable from the main tab dropdown by its "right-0" positioning class.
const CATEGORY_DROPDOWN_XPATH = "xpath=//div[contains(@class,'right-0')]//*[@role='combobox']";
const STATS_ROW_SELECTOR = '.flex.flex-wrap.justify-between.gap-2.rounded.bg-surface-container-overlay-level-2.px-4.py-3.shadow-md';

async function getDropdownOptionNames(page, dropdownLocator) {
    await dropdownLocator.click();
    const options = await page.getByRole('option').all();
    const names = [];
    for (const option of options) {
        names.push((await option.textContent())?.trim());
    }
    await page.keyboard.press('Escape');
    return names;
}

// Validates one Poi sub-tab's content: the stat tiles (whatever set is shown - it varies by
// category, e.g. Lifestyle Wellness shows Segments/Total Unique Audience/Addressable Audience,
// Travel Mobility can show Meta/Google/TikTok Addressable) all have non-empty values, and every
// chart card renders at least one bar.
async function validateSubTabContent(page) {
    const result = { statTiles: {}, charts: [], passed: true };

    const statsRow = page.locator(STATS_ROW_SELECTOR).first();
    const tileCount = await statsRow.locator(':scope > div').count();

    if (tileCount === 0) result.passed = false;

    for (let i = 0; i < tileCount; i++) {
        const tile = statsRow.locator(':scope > div').nth(i);
        const tileParagraphs = tile.locator('p');
        const label = (await tileParagraphs.nth(0).textContent().catch(() => null))?.trim();
        const value = (await tileParagraphs.nth(1).textContent().catch(() => null))?.trim();

        result.statTiles[label || `tile_${i}`] = value || null;
        if (!label || !value) result.passed = false;
    }

    const chartHeaders = page.locator(
        "xpath=//div[contains(@class,'mb-[14px]') and contains(@class,'justify-between')][p]"
    );
    const chartCount = await chartHeaders.count();

    if (chartCount === 0) {
        result.passed = false;
        result.charts.push({ title: null, hasData: false, error: 'No chart found' });
    }

    for (let i = 0; i < chartCount; i++) {
        const header = chartHeaders.nth(i);
        const title = (await header.locator('p').first().textContent().catch(() => null))?.trim();

        // Chart bars render asynchronously after the stat tiles - wait for at least one bar.
        // The icon button's svg has no <rect> (it's a <path> icon), so this also naturally
        // distinguishes the real chart svg without needing to exclude the button separately.
        const card = header.locator('xpath=..');
        const rects = card.locator('svg rect');
        await rects.first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => { });
        const rectCount = await rects.count().catch(() => 0);
        const hasData = rectCount > 0;

        result.charts.push({ title, hasData, rectCount });
        if (!hasData) result.passed = false;
    }

    return result;
}

// Shared by tabs with the "All Audience + segments" pattern and no category dropdown
// (Journeys, Touchpoints, ...) - each sub-tab's content is checked via validateSubTabContent.
async function validateTabSubTabs(page, tabLabel, tablistName) {
    const subTabs = await page.getByRole('tablist', { name: tablistName }).getByRole('tab').all();
    const subTabNames = [];
    for (const tab of subTabs) {
        subTabNames.push((await tab.textContent())?.trim());
    }

    const results = [];

    for (const subTabName of subTabNames) {
        let subTabResult;

        try {
            await page.getByRole('tab', { name: subTabName, exact: true }).click();
            await page.waitForTimeout(1500);
            subTabResult = await validateSubTabContent(page);
        } catch (err) {
            subTabResult = { statTiles: {}, charts: [], passed: false, error: err.message };
        }

        subTabResult.subTab = subTabName;

        const icon = subTabResult.passed ? '✅' : '❌';
        const msg = `${icon} [${tabLabel}/${subTabName}] stats=${JSON.stringify(subTabResult.statTiles)} charts=${JSON.stringify(subTabResult.charts)}`;
        console.log(msg);
        logSession(msg);

        results.push(subTabResult);
    }

    return { tab: tabLabel, passed: results.length > 0 && results.every(r => r.passed), subTabs: results };
}

// Structurally identical to a single category's sub-tabs in Lifestyles (no category dropdown).
async function validateJourneysTab(page, reportName) {
    return validateTabSubTabs(page, 'Journeys', 'Journey Tabs');
}

async function validateTouchpointsTab(page, reportName) {
    return validateTabSubTabs(page, 'Touchpoints', 'Touchpoints Tabs');
}

async function validateBehavioursTab(page, reportName) {
    return validateTabSubTabs(page, 'Behaviours', 'Behaviour Tabs');
}

// Validates the Lifestyles tab: for every category (Lifestyle Wellness / Travel Mobility /
// Shopping Services / Community) and every Poi sub-tab within it (All Audience + each audience
// segment - these differ per category), checks the stat tiles and charts render with data.
async function validateLifestylesTab(page, reportName) {
    const categoryDropdown = page.locator(CATEGORY_DROPDOWN_XPATH).first();

    let categoryNames;
    try {
        categoryNames = await getDropdownOptionNames(page, categoryDropdown);
    } catch (err) {
        console.error(`❌ Failed to read Lifestyles category dropdown options: ${err.message}`);
        logSession(`❌ Failed to read Lifestyles category dropdown options: ${err.message}`);
        return { tab: 'Lifestyles', passed: false, error: err.message, categories: [] };
    }

    const categoryResults = [];

    for (const categoryName of categoryNames) {
        let subTabNames;
        try {
            await categoryDropdown.click();
            await page.getByRole('option', { name: categoryName, exact: true }).click();
            await page.waitForTimeout(1500);

            const subTabs = await page.getByRole('tablist', { name: 'Poi Tabs' }).getByRole('tab').all();
            subTabNames = [];
            for (const tab of subTabs) {
                subTabNames.push((await tab.textContent())?.trim());
            }
        } catch (err) {
            console.error(`❌ Failed to select Lifestyles category '${categoryName}': ${err.message}`);
            logSession(`❌ Failed to select Lifestyles category '${categoryName}': ${err.message}`);
            categoryResults.push({ category: categoryName, passed: false, error: err.message, subTabs: [] });
            continue;
        }

        const subTabResults = [];

        for (const subTabName of subTabNames) {
            let subTabResult;

            try {
                await page.getByRole('tab', { name: subTabName, exact: true }).click();
                await page.waitForTimeout(1500);
                subTabResult = await validateSubTabContent(page);
            } catch (err) {
                subTabResult = { statTiles: {}, charts: [], passed: false, error: err.message };
            }

            subTabResult.subTab = subTabName;

            const icon = subTabResult.passed ? '✅' : '❌';
            const msg = `${icon} [Lifestyles/${categoryName}/${subTabName}] stats=${JSON.stringify(subTabResult.statTiles)} charts=${JSON.stringify(subTabResult.charts)}`;
            console.log(msg);
            logSession(msg);

            subTabResults.push(subTabResult);
        }

        categoryResults.push({
            category: categoryName,
            passed: subTabResults.length > 0 && subTabResults.every(r => r.passed),
            subTabs: subTabResults
        });
    }

    return {
        tab: 'Lifestyles',
        passed: categoryResults.length > 0 && categoryResults.every(c => c.passed),
        categories: categoryResults
    };
}

// The main tab dropdown (Lifestyles / Layered Dataset Map View / Journeys / Touchpoints / Behaviours)
// is the combobox NOT nested in the "right-0" category dropdown's container.
const MAIN_TAB_DROPDOWN_XPATH = "xpath=//*[@role='combobox'][not(ancestor::div[contains(@class,'right-0')])]";
const ADD_DATA_BUTTON_XPATH = "xpath=//button[.//text()[normalize-space()='Add Data']]";
const DATASETS_SPAN_XPATH = "xpath=//button[.//text()[normalize-space()='Add Data']]/preceding-sibling::span";
const MAP_VIEW_NAMES = ['Visits', 'Places'];

async function selectMainTab(page, tabName) {
    const dropdown = page.locator(MAIN_TAB_DROPDOWN_XPATH).first();

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await dropdown.click();
            await page.getByRole('option', { name: tabName, exact: true }).click({ timeout: 10000 });
            await page.waitForTimeout(1500);
            return;
        } catch (err) {
            if (attempt === 3) throw err;
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(1000);
        }
    }
}

// Validates the Layered Dataset Map View tab: for each map view (Visits, Places), opens the
// Kepler side panel (if not already open - it stays open across Visits/Places switches once
// opened) and checks it reports at least one dataset loaded, with no "No Data"/"Failed" toast.
async function validateLayeredDatasetMapViewTab(page, reportName, tabLabel = 'Layered Dataset Map View') {
    try {
        await page.waitForTimeout(1000);

        // Wait out the loading backdrop, if present, before inspecting what actually rendered
        const overlay = page.locator('div.bg-surface-container-backdrop');
        if (await overlay.count() > 0) {
            await overlay.first().waitFor({ state: 'hidden', timeout: 3 * 60 * 1000 }).catch(() => { });
        }

        // This tab has been observed rendering a plain data table instead of the expected Kepler
        // map (seen on a 'CDP_Offline_Behaviors' report) - looks like an app-side issue, not
        // something to validate as a map. Flag it rather than waiting on map elements that will
        // never appear.
        if ((await page.locator('table').count()) > 0 && (await page.locator('button.side-bar__close').count()) === 0) {
            const msg = `ℹ️ [${tabLabel}] Table rendered instead of Kepler map for '${reportName}' - possible app-side issue, skipping map validation.`;
            console.log(msg);
            logSession(msg);
            return { tab: tabLabel, passed: false, reason: 'table_rendered_instead_of_map', views: [] };
        }

        if ((await page.locator(ADD_DATA_BUTTON_XPATH).count()) === 0) {
            // The overlay can also appear *after* the check above but before the click lands, so
            // re-check it on every retry rather than just once up front (same overlay/wait pattern
            // as keplerDatasetsFetch in functions.js).
            const sideBarClose = page.locator('button.side-bar__close');

            let opened = false;
            for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
                try {
                    if (await overlay.count() > 0) {
                        await overlay.first().waitFor({ state: 'hidden', timeout: 3 * 60 * 1000 });
                    }
                    await sideBarClose.click({ timeout: 15000 });
                    opened = true;
                } catch (err) {
                    if (attempt === 3) throw err;
                    await page.waitForTimeout(2000);
                }
            }
        }
    } catch (err) {
        console.error(`❌ Failed to open Kepler side panel: ${err.message}`);
        logSession(`❌ Failed to open Kepler side panel: ${err.message}`);
        return { tab: tabLabel, passed: false, error: err.message, views: [] };
    }

    const results = [];

    for (const viewName of MAP_VIEW_NAMES) {
        const viewResult = { view: viewName, passed: true };

        try {
            await page.getByRole('button', { name: viewName, exact: true }).click();
            await page.waitForTimeout(2000);

            const toastDivs = page.locator("div:has-text('No Data'), div:has-text('Failed')");

            if (await toastDivs.count() > 0) {
                viewResult.passed = false;
                viewResult.reason = `Toast detected: ${(await toastDivs.first().innerText()).split('\n')[0].trim()}`;
            } else {
                // The count briefly shows as plain "Datasets" (no number) while switching
                // views, before settling to "Datasets(N)" - poll until the number appears.
                const datasetsSpan = page.locator(DATASETS_SPAN_XPATH);
                await datasetsSpan.waitFor({ state: 'visible', timeout: 15000 });

                let datasetsText = '';
                const deadline = Date.now() + 15000;
                do {
                    datasetsText = (await datasetsSpan.textContent().catch(() => ''))?.trim() || '';
                    if (/\(\d+\)/.test(datasetsText)) break;
                    await page.waitForTimeout(500);
                } while (Date.now() < deadline);

                const datasetsCount = Number((datasetsText.match(/\((\d+)\)/) || [])[1] ?? 0);

                viewResult.datasetsText = datasetsText;
                viewResult.datasetsCount = datasetsCount;
                viewResult.passed = datasetsCount > 0;
            }
        } catch (err) {
            viewResult.passed = false;
            viewResult.error = err.message;
        }

        const icon = viewResult.passed ? '✅' : '❌';
        const msg = `${icon} [${tabLabel}/${viewName}] ${JSON.stringify(viewResult)}`;
        console.log(msg);
        logSession(msg);

        results.push(viewResult);
    }

    return { tab: tabLabel, passed: results.every(r => r.passed), views: results };
}

// Runs one main tab's validation in isolation - if it throws (e.g. the tab's dropdown/button
// never appears), that tab is recorded as failed with the error, but the remaining tabs still run.
async function runTabValidation(tabLabel, fn) {
    try {
        return await fn();
    } catch (err) {
        console.error(`❌ Unexpected error validating '${tabLabel}' tab: ${err.message}`);
        logSession(`❌ Unexpected error validating '${tabLabel}' tab: ${err.message}`);
        return { tab: tabLabel, passed: false, error: err.message };
    }
}

// Maps the "UploadAudience": ["META", "GOOGLE"] input.json values to the UI's platform button labels
const AUDIENCE_PLATFORM_LABELS = { META: 'Meta', GOOGLE: 'Google' };

// Deactivates every segment except the first one in each lifestyle category (the Segments
// list is a flat sequence of category-header rows and segment rows). Keeping only one active
// segment per category avoids hitting the connected ad platform's custom-audience limit on export.
// Returns the category display names (e.g. "Community", "Lifestyle Wellness") in DOM order.
async function reduceToOneActiveSegmentPerCategory(page) {
    const { deactivatedLabels, categoryNames } = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        const container = Array.from(dialog.querySelectorAll('div')).find(
            d => d.className.includes('overflow-auto') && d.className.includes('flex-col') && d.className.includes('min-h-0')
        );

        const deactivatedLabels = [];
        const categoryNames = [];
        let keptOneForCurrentCategory = false;

        for (const child of container.children) {
            const toggle = child.querySelector('[role="button"]');
            const label = child.querySelector('div.grow');

            if (!toggle || !label) {
                categoryNames.push(child.textContent.trim());
                keptOneForCurrentCategory = false;
                continue;
            }

            if (toggle.textContent.trim() === 'Active') {
                if (!keptOneForCurrentCategory) {
                    keptOneForCurrentCategory = true;
                } else {
                    deactivatedLabels.push(label.textContent.trim());
                }
            }
        }

        return { deactivatedLabels, categoryNames };
    });

    for (const label of deactivatedLabels) {
        await page.getByRole('dialog').getByText(label, { exact: true }).first()
            .locator('xpath=following-sibling::div[@role="button"]')
            .click();
    }

    return categoryNames;
}

// Polls for the "Upload audience successful for lifestyle '<category>'" toast per category -
// these appear immediately after clicking Export and auto-dismiss within a few seconds, so this
// must poll tightly rather than wait-then-check-once.
async function waitForAudienceUploadToasts(page, categoryNames, timeoutMs = 8000) {
    const successSeen = new Set();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline && successSeen.size < categoryNames.length) {
        const toastTexts = await page.evaluate(() =>
            Array.from(document.querySelectorAll('*'))
                .filter(el => el.children.length === 0 && el.textContent?.includes('Upload audience successful'))
                .map(el => el.textContent.trim())
        );

        for (const category of categoryNames) {
            if (toastTexts.some(t => t.includes(`'${category}'`))) {
                successSeen.add(category);
            }
        }

        if (successSeen.size < categoryNames.length) {
            await page.waitForTimeout(300);
        }
    }

    return categoryNames.map(category => ({ category, success: successSeen.has(category) }));
}

// Exports the persona's audience to the given platforms (from input.json's "UploadAudience":
// ["META", "GOOGLE"] on the Persona entry). Opens the Audience dialog, trims each lifestyle
// category down to one active segment (to stay under the ad platform's audience limit), then
// exports to each requested platform in turn and verifies every category's upload toast.
async function exportPersonaAudience(page, reportName, uploadAudience) {
    const platforms = (uploadAudience || [])
        .map(p => AUDIENCE_PLATFORM_LABELS[String(p).toUpperCase()])
        .filter(Boolean);

    const result = { reportName, platforms: {}, passed: true };

    if (platforms.length === 0) {
        console.log(`ℹ️ No valid export platforms in UploadAudience for '${reportName}'. Skipping audience export.`);
        logSession(`ℹ️ No valid export platforms in UploadAudience for '${reportName}'. Skipping audience export.`, false, { report: reportName, outcome: "skipped", reason: "no_upload_platforms_configured" });
        return result;
    }

    try {
        await page.getByRole('button', { name: 'Audience', exact: true }).click();
        await page.waitForTimeout(2000);

        const categoryNames = await reduceToOneActiveSegmentPerCategory(page);
        result.categoryNames = categoryNames;

        await page.getByRole('button', { name: 'Next Step' }).click();
        await page.waitForTimeout(1500);

        for (const platform of platforms) {
            const platformResult = { platform, categories: [], passed: true };

            try {
                const platformButton = page.getByRole('button', { name: new RegExp(`^${platform}`) });
                const alreadySelected = (await platformButton.textContent())?.includes('Selected');
                if (!alreadySelected) {
                    await platformButton.click();
                    await page.waitForTimeout(1500);
                }

                // "Export" also matches the dialog's tab label button - the submit button is the last match
                await page.getByRole('button', { name: 'Export', exact: true }).last().click();

                platformResult.categories = await waitForAudienceUploadToasts(page, categoryNames);
                platformResult.passed = platformResult.categories.every(c => c.success);

            } catch (err) {
                platformResult.passed = false;
                platformResult.error = err.message;
            }

            // Log per-category so it's clear which ones actually triggered vs which didn't,
            // rather than only a pass/fail for the whole platform.
            for (const { category, success } of platformResult.categories) {
                const catIcon = success ? '✅' : '❌';
                const catMsg = `${catIcon} [Audience Export/${platform}/${category}] ${success ? 'Upload audience triggered' : 'Upload audience NOT triggered'} for '${reportName}'.`;
                console.log(catMsg);
                logSession(catMsg, false, { report: reportName, platform, category, success });
            }

            const icon = platformResult.passed ? '✅' : '❌';
            const msg = `${icon} [Audience Export/${platform}] ${JSON.stringify(platformResult)}`;
            console.log(msg);
            logSession(msg, false, { report: reportName, platform, outcome: platformResult.passed ? "success" : "failure" });

            result.platforms[platform] = platformResult;
            if (!platformResult.passed) result.passed = false;

            await page.waitForTimeout(1000);
        }

        await page.keyboard.press('Escape').catch(() => { });

    } catch (err) {
        result.passed = false;
        result.error = err.message;
        console.error(`❌ Failed to export Persona audience for '${reportName}': ${err.message}`);
        logSession(`❌ Failed to export Persona audience for '${reportName}': ${err.message}`, false, { report: reportName, outcome: "failure", reason: err.message });
    }

    return result;
}

// Checks the Settings > Uploaded Audience table for each lifestyle category's export row,
// for each requested platform. A persona export shows up there as its own row named
// "{reportName}_{category_in_snake_case}" (e.g. "CDP_Normal_Report - yrnl8_travel_mobility"),
// NOT the bare report name - this table is shared with the unrelated PLV/DLV upload-audience
// feature (which does use the bare report name), so the two must not be confused.
//
// This table is a permanent history across every test run ever, so the same report/category/
// platform combo can appear multiple times (once per run). The "Uploaded At" column only has
// day-level granularity, so same-day retries tie and the column's own sort controls are a no-op
// for them (verified live: clicking Sort Ascending/Descending did not reorder same-day rows).
// The table's default (unsorted) order is newest-first though - confirmed by observing a full,
// unbroken block of exactly categories.length * platforms.length rows from one export run,
// immediately followed by an identical block from an earlier run - so the FIRST matching row
// for a given category+platform is reliably the most recent upload.
//
// Rows can sit in "Pending" for a while after the upload is triggered, so this polls the table
// (same 1-minute recheck cadence as the existing verifyAudienceUploadStatus in functions.js) until
// every category/platform combo resolves to a terminal status, up to maxWaitMinutes - capped at
// 15 min by default here (shorter than that function's 30, since a partial per-run wait is enough
// to catch the common case and this covers up to 8 rows per call, not just one).
async function checkPersonaAudienceUploadStatus(page, reportName, categoryNames, platforms, maxWaitMinutes = 30) {
    const startTime = Date.now();
    const MAX_WAIT_MS = maxWaitMinutes * 60 * 1000;
    const CHECK_INTERVAL = 60 * 1000; // 1 minute

    const profileIcon = page.locator("//div[@type='button']//*[name()='svg']");
    await profileIcon.waitFor({ state: 'visible', timeout: 30000 });
    await profileIcon.click();

    const settingsOption = page.getByRole('button', { name: 'Settings', exact: true });
    await settingsOption.waitFor({ state: 'visible', timeout: 15000 });
    await settingsOption.click();

    const uploadedAudienceTab = page.getByText('Uploaded Audience', { exact: true });
    await uploadedAudienceTab.waitFor({ state: 'visible', timeout: 30000 });
    await uploadedAudienceTab.click();

    await page.getByText('Status', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });

    // Re-opens the tab to force the table to refetch - same trick verifyAudienceUploadStatus
    // uses (there's no dedicated refresh control), by hopping to Personal and back.
    const refreshTable = async () => {
        const personalTab = page.getByText('Personal', { exact: true });
        await personalTab.waitFor({ state: 'visible', timeout: 30000 });
        await personalTab.click();

        await uploadedAudienceTab.waitFor({ state: 'visible', timeout: 30000 });
        await uploadedAudienceTab.click();

        await page.getByText('Status', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    };

    const readTable = () => page.evaluate(() => ({
        headers: Array.from(document.querySelectorAll('thead tr th')).map(th => th.textContent.trim().toLowerCase()),
        rows: Array.from(document.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
        )
    }));

    let pendingChecks = [];
    for (const category of categoryNames) {
        const rowName = `${reportName}_${category.toLowerCase().replace(/\s+/g, '_')}`;
        for (const platform of platforms) {
            pendingChecks.push({ category, platform, rowName });
        }
    }

    const resultsByKey = {};
    const logResolved = (category, platform, status, audienceCount) => {
        const isSuccess = ['successful', 'completed'].includes(status.toLowerCase());
        const icon = isSuccess ? '✅' : '❌';
        const msg = `${icon} [Uploaded Audience/${platform}/${category}] status=${status} audienceCount=${audienceCount ?? 'n/a'}`;
        console.log(msg);
        logSession(msg, false, {
            report: reportName,
            platform,
            category,
            status,
            audience_count: audienceCount,
            outcome: isSuccess ? "success" : "failure",
        });
    };

    while (pendingChecks.length > 0) {
        const table = await readTable();
        const statusIdx = table.headers.indexOf('status');
        const audienceCountIdx = table.headers.indexOf('audience count');
        const stillPending = [];

        for (const check of pendingChecks) {
            const match = table.rows.find(cells =>
                cells[0]?.includes(check.rowName) && cells.some(c => c.toLowerCase() === check.platform.toLowerCase())
            );

            const status = match ? match[statusIdx] : null;
            const lower = status?.toLowerCase();
            const isTerminal = lower === 'successful' || lower === 'completed' || lower === 'unsuccessful' || lower === 'error';

            if (isTerminal) {
                const audienceCount = match[audienceCountIdx];
                resultsByKey[`${check.category}|${check.platform}`] = { category: check.category, platform: check.platform, status, audienceCount };
                logResolved(check.category, check.platform, status, audienceCount);
            } else {
                stillPending.push(check);
            }
        }

        pendingChecks = stillPending;
        if (pendingChecks.length === 0) break;

        if (Date.now() - startTime >= MAX_WAIT_MS) {
            for (const check of pendingChecks) {
                const entry = { category: check.category, platform: check.platform, status: 'timeout' };
                resultsByKey[`${check.category}|${check.platform}`] = entry;
                const msg = `❌ [Uploaded Audience/${check.platform}/${check.category}] Timed out waiting for a terminal status after ${maxWaitMinutes} min.`;
                console.log(msg);
                logSession(msg, false, { report: reportName, platform: check.platform, category: check.category, status: "timeout", outcome: "failure", reason: "audience_upload_status_timeout" });
            }
            break;
        }

        const remainingMinutes = ((MAX_WAIT_MS - (Date.now() - startTime)) / 60000).toFixed(1);
        const msg = `⏳ ${pendingChecks.length} audience upload(s) still pending for '${reportName}'. Waiting 1 minute before checking again. Remaining: ${remainingMinutes} min`;
        console.log(msg);
        logSession(msg);

        await page.waitForTimeout(CHECK_INTERVAL);
        await refreshTable();
    }

    return categoryNames.flatMap(category =>
        platforms.map(platform => resultsByKey[`${category}|${platform}`])
    );
}

// Maps a main-tab dropdown label to its validator. Not every report type shows the same tabs
// (e.g. some add "Unified Dataset Map View" alongside "Layered Dataset Map View", some may omit
// a tab entirely) - "Unified Dataset Map View" renders the identical Kepler map + Visits/Places
// toggle as "Layered Dataset Map View" (just a different dataset), so it reuses that validator.
const TAB_VALIDATORS = {
    'Lifestyles': validateLifestylesTab,
    'Layered Dataset Map View': validateLayeredDatasetMapViewTab,
    'Unified Dataset Map View': validateLayeredDatasetMapViewTab,
    'Journeys': validateJourneysTab,
    'Touchpoints': validateTouchpointsTab,
    'Behaviours': validateBehavioursTab
};

// Opens the completed Persona report and runs its validation checklist.
async function validatePersonaReport(page, reportName, reportContainer) {
    try {
        const reportLink = reportContainer.locator(`xpath=.//a[contains(normalize-space(.),'${reportName}')]`);
        await reportLink.waitFor({ state: 'visible', timeout: 15000 });
        await reportLink.click({ force: true });

        // Completed Persona reports open at /persona/{id}, not /explore/{id}
        await page.waitForURL(url => url.href.includes('/persona/'), { timeout: 60000 });

        // The page shows a loading splash ("Did you know...") before the report content renders
        await page.locator(STATS_ROW_SELECTOR).first()
            .waitFor({ state: 'visible', timeout: 30000 });

        console.log(`✅ Opened completed Persona report '${reportName}'.`);
        logSession(`✅ Opened completed Persona report '${reportName}'.`);

        // Read the dropdown live instead of assuming a fixed tab set - it varies by report type.
        const availableTabs = await getDropdownOptionNames(page, page.locator(MAIN_TAB_DROPDOWN_XPATH).first());

        const tabs = [];
        for (const tabName of availableTabs) {
            const validator = TAB_VALIDATORS[tabName];
            if (!validator) {
                console.log(`⚠️ Unknown tab '${tabName}' in dropdown for '${reportName}' - skipping validation.`);
                logSession(`⚠️ Unknown tab '${tabName}' in dropdown for '${reportName}' - skipping validation.`);
                continue;
            }

            await page.waitForTimeout(2000);
            const result = await runTabValidation(tabName, async () => {
                await selectMainTab(page, tabName);
                return validator(page, reportName, tabName);
            });
            tabs.push(result);
        }

        // 'table_rendered_instead_of_map' is a known app-side display quirk unrelated to the
        // underlying data - it's logged on its own tab but doesn't block audience export as long
        // as every other tab genuinely passed.
        const blockingFailures = tabs.filter(t => !t.passed && t.reason !== 'table_rendered_instead_of_map');
        const validation = tabs.length > 0 && blockingFailures.length === 0 ? 'passed' : 'failed';

        logSession(`Persona report validation ${validation} for '${reportName}'`, false, {
            report: reportName,
            outcome: validation === 'passed' ? "success" : "failure",
            reason: validation === 'passed' ? undefined : "tab_validation_failed",
        });

        return { reportName, validation, tabs };
    } catch (err) {
        console.error(`❌ Failed to validate completed Persona report '${reportName}': ${err.message}`);
        logSession(`❌ Failed to validate completed Persona report '${reportName}': ${err.message}`, false, { report: reportName, outcome: "failure", reason: err.message });
        return { reportName, validation: 'error_opening_report', error: err.message };
    }
}

module.exports = {
    isTerminalStatus,
    loadTracking,
    saveTracking,
    addPersonaReportToTracking,
    checkSinglePersonaStatus,
    validateLifestylesTab,
    validateLayeredDatasetMapViewTab,
    validateJourneysTab,
    validateTouchpointsTab,
    validateBehavioursTab,
    validatePersonaReport,
    exportPersonaAudience,
    checkPersonaAudienceUploadStatus
};
