const { logSession } = require("./Logger");
const { expect } = require("@playwright/test");


// =========================================================
// Resolves to the key of whichever locator becomes visible first, racing
// them concurrently instead of checking one at a time — so the common
// case (the first one in the list) resolves exactly as fast as before,
// while still detecting whichever other state actually happened. Resolves
// to null only if NONE of them ever become visible within timeout.
// =========================================================

function waitForFirstVisible(locators, timeout) {
    return new Promise((resolve) => {
        let settledCount = 0;
        let resolved = false;

        for (const { key, locator } of locators) {
            locator.waitFor({ state: "visible", timeout })
                .then(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(key);
                    }
                })
                .catch(() => {
                    settledCount++;
                    if (!resolved && settledCount === locators.length) {
                        resolve(null);
                    }
                });
        }
    });
}


// =========================================================
// SHARED WATSONAI CHAT LOCATORS / HELPERS
// =========================================================

const WATSONAI_PROMPT_PLACEHOLDER = "Ask a question or make a command";

// Query-level failures WatsonAI answers with instead of a report form.
// Like the old "Failed to fetch..." block, these stay in the chat DOM, so
// they're only treated as failures when their count grows past a baseline
// taken before the query was sent.
const WATSONAI_QUERY_ERROR_PATTERN =
    /Failed to fetch Sherlock search results|I hit a connection problem/;

// Every WatsonAI reply (text-only answer, form prompt, "report is ready",
// post-report summary) ends with its own "Copy response" button, so this
// count going up is the signal that a NEW reply has landed.
function watsonAICopyResponseButtons(page) {
    return page.getByRole("button", { name: "Copy response", exact: true });
}

function watsonAIReportNameFields(page) {
    return page.getByRole("textbox", { name: "Report Name *" });
}

function watsonAIQueryErrors(page) {
    return page.getByText(WATSONAI_QUERY_ERROR_PATTERN);
}

// Text of the most recent WatsonAI reply (the message block that owns the
// last "Copy response" button), trimmed for logging.
async function getLatestWatsonAIReplyText(page, maxLength = 300) {
    try {
        const text = await watsonAICopyResponseButtons(page)
            .last()
            .locator("xpath=ancestor::div[.//p][1]")
            .innerText({ timeout: 5000 });

        return text.replace(/\s+/g, " ").trim().slice(0, maxLength);
    } catch {
        return "(reply text unavailable)";
    }
}

// Snapshot of the chat state taken right BEFORE a query is sent, so the
// waits below can tell this query's output apart from earlier messages
// that are still sitting in the chat.
async function getWatsonAIChatBaseline(page) {
    return {
        copyCount: await watsonAICopyResponseButtons(page).count(),
        formCount: await watsonAIReportNameFields(page).count(),
        errorCount: await watsonAIQueryErrors(page).count()
    };
}

// The prompt can be visible while still not accepting input (e.g. a report
// left open in Focus Mode sits on top of it), which is what broke the next
// query in earlier runs — so check editable, not just visible.
async function waitForWatsonAIChatReady(page, timeout = 30000) {
    const promptField = page.getByPlaceholder(WATSONAI_PROMPT_PLACEHOLDER, { exact: true });

    await expect(promptField).toBeEditable({ timeout });
}

// Close icon of a report opened in Focus Mode.
const WATSONAI_REPORT_CLOSE_ICON = "svg.cursor-pointer.fill-button-destructive-base";

// Every WatsonAI-generated report is expected to get a summary. DLV/PLV
// summaries land ~3-60s after the report finishes loading; QLI currently
// gets none (no summary request is made — confirmed in the dev network log),
// which is an app bug. A missing summary makes the report outcome=warning
// in WatsonAIFlow rather than hiding it inside success.
const WATSONAI_SUMMARY_TIMEOUT_MS = 60 * 1000;

async function waitForWatsonAIReportSummary(page, copyCountBeforeOpen, timeout = WATSONAI_SUMMARY_TIMEOUT_MS) {

    console.log("⏳ Waiting for WatsonAI report summary...");
    logSession("⏳ Waiting for WatsonAI report summary...");

    try {
        await expect(watsonAICopyResponseButtons(page)).toHaveCount(
            copyCountBeforeOpen + 1,
            { timeout }
        );

        // The Copy button renders with the first chunk of the summary;
        // give the rest of the stream a moment to finish scrolling the chat.
        await page.waitForTimeout(3000);

        const summaryText = await getLatestWatsonAIReplyText(page, 200);

        console.log(`✅ WatsonAI report summary received: '${summaryText}'`);
        logSession(`✅ WatsonAI report summary received: '${summaryText}'`);

        return true;

    } catch {

        console.log(`⚠️ WatsonAI report summary did not appear within ${Math.round(timeout / 1000)}s. Continuing — report will be marked as a warning.`);
        logSession(`⚠️ WatsonAI report summary did not appear within ${Math.round(timeout / 1000)}s. Continuing — report will be marked as a warning.`);

        return false;
    }
}

// Closes a report left open in Focus Mode and confirms the chat prompt is
// usable again. Returns true when the chat is ready for the next query.
// Never throws — callers are mid-cleanup and must move on to the next report.
async function closeWatsonAIReport(page, reportName, { onlyIfOpen = false } = {}) {

    const closeIcon = page.locator(WATSONAI_REPORT_CLOSE_ICON).last();

    try {

        const isOpen = await closeIcon
            .waitFor({ state: "visible", timeout: onlyIfOpen ? 5000 : 30000 })
            .then(() => true)
            .catch(() => false);

        if (isOpen) {

            console.log(`❌ Closing WatsonAI report: '${reportName}'`);
            logSession(`❌ Closing WatsonAI report: '${reportName}'`);

            await closeIcon.click({ timeout: 15000 })
                .catch(() => closeIcon.click({ force: true, timeout: 15000 }));

            await closeIcon.waitFor({ state: "hidden", timeout: 15000 });

        } else if (!onlyIfOpen) {

            console.log(`⚠️ Close icon for '${reportName}' not found — report may not be in Focus Mode.`);
            logSession(`⚠️ Close icon for '${reportName}' not found — report may not be in Focus Mode.`);
        }

    } catch (error) {

        console.error(`⚠️ Failed to close WatsonAI report: ${error.message}`);
        logSession(`⚠️ Failed to close WatsonAI report: ${error.message}`);

        await page.keyboard.press("Escape").catch(() => { });
    }

    try {

        await waitForWatsonAIChatReady(page);

        console.log(`✅ Returned to WatsonAI chat.`);
        logSession(`✅ Returned to WatsonAI chat.`);

        return true;

    } catch (error) {

        console.error(`⚠️ Could not confirm WatsonAI chat: ${error.message}`);
        logSession(`⚠️ Could not confirm WatsonAI chat: ${error.message}`);

        return false;
    }
}


// =========================================================
// 1. OPEN WATSON AI
// =========================================================

async function openWatsonAI(page) {
    try {
        console.log("🤖 Opening WatsonAI...");
        logSession("🤖 Opening WatsonAI...");

        // Profile icon — the button-type div also wraps chevron-down utility
        // icons (lucide svgs) elsewhere on the page, so the xpath must
        // exclude those to stay a single match instead of strict-mode
        // violating on whichever chevron happens to render.
        const profileIcon = page.locator(
            "//div[@type='button']//*[name()='svg' and not(contains(@class,'lucide'))]"
        ).first();

        await expect(profileIcon).toBeVisible({
            timeout: 30000
        });

        await profileIcon.click();

        console.log("✅ Profile icon clicked.");
        logSession("✅ Profile icon clicked.");


        // Switch to WatsonAI — unless we're already there. The same
        // profile menu shows "Switch to SherlockAI" instead whenever
        // WatsonAI mode is already active (e.g. right after a prior
        // WatsonAI-flow run in the same session), so don't assume which
        // label will be showing — race both and react to whichever
        // actually renders.
        const switchWatsonAI = page.getByRole("button", {
            name: "Switch to WatsonAI",
            exact: true
        });

        const switchBackToSherlockAI = page.getByRole("button", {
            name: "Switch to SherlockAI",
            exact: true
        });

        const menuState = await waitForFirstVisible([
            { key: "needsSwitch", locator: switchWatsonAI },
            { key: "alreadyInWatsonAI", locator: switchBackToSherlockAI }
        ], 15000);

        if (menuState === "alreadyInWatsonAI") {

            await page.keyboard.press("Escape");

            console.log("ℹ️ Already in WatsonAI mode — closed the profile menu without switching.");
            logSession("ℹ️ Already in WatsonAI mode — closed the profile menu without switching.");

        } else if (menuState === "needsSwitch") {

            await switchWatsonAI.click();

            console.log("✅ Switched to WatsonAI.");
            logSession("✅ Switched to WatsonAI.");

        } else {

            throw new Error(
                "Neither 'Switch to WatsonAI' nor 'Switch to SherlockAI' appeared after clicking the profile icon."
            );
        }

    } catch (error) {

        console.error(
            `❌ Failed to open WatsonAI: ${error.message}`
        );

        logSession(
            `❌ Failed to open WatsonAI: ${error.message}`
        );

        throw error;
    }
}


// =========================================================
// 2. ENTER WATSON AI QUERY
// =========================================================

async function enterWatsonAIQuery(page, query) {
    try {
        if (!query?.trim()) {
            throw new Error(
                "WatsonAI query is missing or empty."
            );
        }

        const promptField = page.getByPlaceholder(
            "Ask a question or make a command",
            {
                exact: true
            }
        );

        await promptField.waitFor({
            state: "visible",
            timeout: 30000
        });

        await promptField.fill(query);

        console.log(
            `✅ WatsonAI query entered: ${query}`
        );

        logSession(
            `✅ WatsonAI query entered: ${query}`
        );

        // The send arrow is the fieldset right after the prompt. A page-wide
        // "last fieldset with an svg" matched some other element after a
        // QLI report had been opened, so anchor on the prompt instead, and
        // fall back to Enter (which also submits) if it still isn't there.
        const sendButton = promptField.locator(
            "xpath=following::fieldset[.//*[name()='svg']][1]"
        );

        const hasSendButton = await sendButton
            .waitFor({ state: "visible", timeout: 5000 })
            .then(() => true)
            .catch(() => false);

        if (hasSendButton) {
            await sendButton.click();
        } else {
            console.log("ℹ️ Send button not found next to the prompt — submitting with Enter.");
            logSession("ℹ️ Send button not found next to the prompt — submitting with Enter.");
            await promptField.press("Enter");
        }

        console.log("✅ WatsonAI query submitted.");

        logSession(
            "✅ WatsonAI query submitted."
        );

    } catch (error) {

        console.error(
            `❌ Failed to enter WatsonAI query: ${error.message}`
        );

        logSession(
            `❌ Failed to enter WatsonAI query: ${error.message}`
        );

        throw error;
    }
}

// =========================================================
// 3. WAIT FOR WATSON AI RESPONSE
// =========================================================

// Must be called BEFORE the query is submitted, so the response can't be
// missed. Never rejects — resolves to the Response, or to the Error if none
// arrived in time — so it can't become an unhandled rejection when the
// query entry itself fails and nobody awaits it.
function watchWatsonAISearchRequest(page, timeout = 4 * 60 * 1000) {
    return page.waitForResponse(
        response =>
            response.url().includes("/api/services/search/search") &&
            response.request().method() === "POST",
        { timeout }
    ).catch(error => error);
}

// searchResponsePromise: from watchWatsonAISearchRequest(). The chat prompt
// stays disabled until this backend call settles — seen on dev: it hung for
// ~180s and then returned 502, while the old 120s loader-only wait gave up
// first and left the next query unable to type into the disabled prompt.
async function waitForWatsonAIResponse(page, searchResponsePromise = null) {
    try {
        if (searchResponsePromise) {

            const startedAt = Date.now();

            console.log("⏳ Waiting for WatsonAI search API response...");

            const searchResponse = await searchResponsePromise;

            const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

            if (searchResponse instanceof Error) {

                throw new Error(
                    `WatsonAI search API did not respond: ${searchResponse.message.split("\n")[0]}`
                );
            }

            if (searchResponse.status() >= 400) {

                throw new Error(
                    `WatsonAI search API failed: HTTP ${searchResponse.status()} after ${seconds}s ` +
                    `(${searchResponse.url()}).`
                );
            }

            console.log(`✅ WatsonAI search API responded: HTTP ${searchResponse.status()} after ${seconds}s.`);
            logSession(`✅ WatsonAI search API responded: HTTP ${searchResponse.status()} after ${seconds}s.`);
        }

        const watsonAILoader = page.locator(
            'div.flex.h-8.min-w-\\[40px\\].items-center.justify-center.rounded-lg.bg-surface-container-overlay-level-2.px-3.py-2'
        ).last();

        console.log("⏳ Waiting for WatsonAI processing...");

        await watsonAILoader.waitFor({
            state: "hidden",
            timeout: 120000
        });

        console.log("✅ WatsonAI processing completed.");
        logSession("✅ WatsonAI processing completed.");

    } catch (error) {
        console.error(`❌ WatsonAI processing failed: ${error.message}`);
        logSession(`❌ WatsonAI processing failed: ${error.message}`);
        throw error;
    }
}

// =========================================================
// 3B. CHECK FOR A WATSONAI QUERY-LEVEL ERROR
// (e.g. "Error: Failed to fetch Sherlock search results" —
// WatsonAI sometimes fails to process the query itself and
// never generates a report form at all. Must be checked BEFORE
// looking for the Report Name field, otherwise the code just
// waits/times out searching for a field that will never appear.)
// =========================================================

// previousErrorCount: how many of these error blocks already existed in
// the chat BEFORE this query was submitted. The error block never gets
// removed from the DOM once it appears (unlike the "No Data"/"Failed"
// toasts elsewhere in this file, which auto-dismiss), so a plain
// .last().isVisible() check keeps re-matching that same leftover element
// on every later query too — confirmed live in the qa logs: one real
// error on the first query in a session caused every subsequent query
// (10+ in a row, several of which had genuinely succeeded) to get
// wrongly flagged with the same stale error. Only a genuinely NEW error
// block (count grew past the pre-query baseline) counts as a failure.
async function checkWatsonAIQueryError(page, previousErrorCount = 0) {
    const errorLocator = page.getByText("Failed to fetch Sherlock search results");

    const currentCount = await errorLocator.count();

    if (currentCount <= previousErrorCount) {
        return;
    }

    const hasError = await errorLocator
        .last()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

    if (hasError) {
        const message = "WatsonAI failed to process the query: Failed to fetch Sherlock search results.";
        console.error(`❌ ${message}`);
        logSession(`❌ ${message}`);
        throw new Error(message);
    }
}

// =========================================================
// 3C. WAIT FOR THE REPORT FORM (OR FAIL WITH WATSONAI'S REPLY)
// WatsonAI can answer a query in three ways:
//   - a prefilled report form (expected)
//   - a known query error ("I hit a connection problem — try that again.")
//   - a plain text reply with no form at all — e.g. the QLI query currently
//     gets "I can only help with Sherlock's location data..." back.
// Without this, the last two cases just sit out the 30s Report Name wait
// and get logged as a locator timeout instead of what WatsonAI said.
// =========================================================

async function waitForWatsonAIReportForm(page, baseline, timeout = 180000) {

    // A text reply and the form can land a moment apart, so a new reply
    // without a form only counts as "no form" once it has had this long.
    const FORM_GRACE_MS = 5000;
    const deadline = Date.now() + timeout;
    let replyWithoutFormSince = null;

    while (Date.now() < deadline) {

        if (await watsonAIReportNameFields(page).count() > baseline.formCount) {
            return;
        }

        if (await watsonAIQueryErrors(page).count() > baseline.errorCount) {

            const errorText = (
                await watsonAIQueryErrors(page).last().innerText().catch(() => "")
            ).trim();

            throw new Error(`WatsonAI failed to process the query: '${errorText}'`);
        }

        if (await watsonAICopyResponseButtons(page).count() > baseline.copyCount) {

            replyWithoutFormSince ??= Date.now();

            if (Date.now() - replyWithoutFormSince > FORM_GRACE_MS) {

                const replyText = await getLatestWatsonAIReplyText(page);

                throw new Error(
                    `WatsonAI did not generate a report form. WatsonAI replied: '${replyText}'`
                );
            }
        }

        await page.waitForTimeout(1000);
    }

    throw new Error(
        `WatsonAI did not respond with a report form within ${Math.round(timeout / 1000)}s.`
    );
}

// =========================================================
// 4. VERIFY GENERATED REPORT FIELDS
// =========================================================

async function verifyWatsonAIReportFields(page, expectedData) {

    try {

        console.log(
            "🔍 Starting WatsonAI report field validation..."
        );

        logSession(
            "🔍 Starting WatsonAI report field validation..."
        );


        // =====================================================
        // REPORT NAME
        // =====================================================

        const reportNameField = watsonAIReportNameFields(page).last();

        await reportNameField.waitFor({
            state: "visible",
            timeout: 30000
        });

        const actualReportName = (
            await reportNameField.inputValue()
        ).trim();

        if (!actualReportName) {

            throw new Error(
                "WatsonAI report generation failed: Report Name field is empty."
            );
        }

        console.log(
            `✅ WatsonAI generated Report Name: '${actualReportName}'`
        );

        logSession(
            `✅ WatsonAI generated Report Name: '${actualReportName}'`
        );


        // Soft checks below that failed (logged, not thrown).
        const fieldWarnings = [];


        // =====================================================
        // LOCATION — READ & LOG ONLY
        // =====================================================

        try {
            if (expectedData.location) {

                const locationField = page.locator(
                    "xpath=//label[contains(text(),'Location')]/following::div[@id='multiselect-input-container'][1]"
                );

                await locationField.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                // The container can render before its text is actually
                // filled in (location is resolved asynchronously), so
                // waiting for "visible" alone can still read it empty.
                // Wait for non-empty text too before reading it.
                await expect(locationField).not.toHaveText("", {
                    timeout: 15000
                });

                const actualLocation = (
                    await locationField.innerText()
                ).trim();

                console.log(`📍 Location read from UI: '${actualLocation}'`);
                logSession(`📍 Location read from UI: '${actualLocation}'`);
            }

        } catch (error) {

            const message =
                `❌ Failed to read location from the UI: ${error.message}`;

            console.log(message);
            logSession(message);
            fieldWarnings.push("Location");
        }

        // Code after this will continue executing


        // =====================================================
        // DATE RANGE
        // =====================================================

        try {
            if (expectedData.dateRange) {

                const expectedDateRange =
                    expectedData.dateRange.trim();

                // NOTE: getByRole('button', {name: ...}) does not work here —
                // this button contains a nested "Clear date range" button,
                // which breaks the outer button's computed accessible name
                // (it ends up unnamed) even though its visible text is
                // correct. Anchor off the "Date Range *" label instead,
                // same approach already used for the Location field above.
                const dateRangeButton = page.locator(
                    "xpath=//label[contains(text(),'Date Range')]/following::button[1]"
                );

                await dateRangeButton.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                const actualDateRange = (
                    await dateRangeButton.innerText()
                ).trim();

                if (actualDateRange !== expectedDateRange) {

                    throw new Error(
                        `Date Range mismatch.\n` +
                        `Expected: '${expectedDateRange}'\n` +
                        `Actual: '${actualDateRange}'`
                    );
                }

                console.log(
                    `✅ Date Range matched: '${actualDateRange}'`
                );

                logSession(
                    `✅ Date Range matched: '${actualDateRange}'`
                );
            }
        }
        catch (error) {
            const message =
                `❌ Failed to validate Date Range: ${error.message}`;
            console.log(message);
            logSession(message);
            fieldWarnings.push("Date Range");
        }


        // =====================================================
        // PLACES
        // =====================================================

        try {
            const placesField = page
                .locator(".ant-select-selector:visible")
                .first();

            if (
                await placesField.count() > 0 &&
                await placesField.isVisible().catch(() => false)
            ) {

                const actualPlaces = (
                    await placesField.innerText()
                )
                    .split("\n")
                    .map(place => place.trim())
                    .filter(Boolean);

                if (actualPlaces.length === 0) {

                    throw new Error(
                        "WatsonAI Places field is empty."
                    );
                }

                console.log(
                    `📍 WatsonAI generated Places: ${actualPlaces.join(", ")}`
                );

                logSession(
                    `📍 WatsonAI generated Places: ${actualPlaces.join(", ")}`
                );

                const missingPlaces = (expectedData.places || []).filter(
                    expectedPlace => !actualPlaces.includes(expectedPlace)
                );

                if (missingPlaces.length > 0) {

                    throw new Error(
                        `Places mismatch. Missing expected: '${missingPlaces.join(", ")}', ` +
                        `Actual Places: '${actualPlaces.join(", ")}'.`
                    );
                }
            }
        } catch (error) {
            const message =
                `❌ Failed to validate Places: ${error.message}`;
            console.log(message);
            logSession(message);
            fieldWarnings.push("Places");
        }


        // =====================================================
        // BRANDS
        // =====================================================

        try {
            const expectedBrands =
                expectedData.brands || [];

            if (expectedBrands.length > 0) {

                // Anchored on the "Brands" label rather than filtering the
                // selected-value box by the expected brand's text: when
                // WatsonAI leaves Brands empty (seen on dev + qa for the
                // Starbucks PLV query) the old text filter could only wait
                // 30s and log a bare locator timeout. Reading the field
                // directly reports what was actually prefilled.
                const brandsField = page
                    .locator("xpath=//label[normalize-space()='Brands']/..")
                    .last();

                await brandsField.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                const actualBrands = (
                    await brandsField.innerText()
                )
                    .split("\n")
                    .map(brand => brand.trim())
                    .filter(brand => brand && brand !== "Brands");

                const missingBrands = expectedBrands.filter(
                    expectedBrand => !actualBrands.some(
                        actualBrand => actualBrand.includes(expectedBrand)
                    )
                );

                if (missingBrands.length > 0) {

                    throw new Error(
                        actualBrands.length === 0
                            ? `Brands field is empty — WatsonAI did not prefill expected brand(s): '${missingBrands.join(", ")}'.`
                            : `Brand mismatch. Expected: '${missingBrands.join(", ")}', ` +
                            `Actual Brands: '${actualBrands.join(", ")}'.`
                    );
                }

                console.log(
                    `✅ Brands matched: '${expectedBrands.join(", ")}'`
                );

                logSession(
                    `✅ Brands matched: '${expectedBrands.join(", ")}'`
                );
            }
        } catch (error) {
            const message =
                `❌ Failed to validate Brands: ${error.message}`;
            console.log(message);
            logSession(message);
            fieldWarnings.push("Brands");
        }


        // =====================================================
        // RESULT
        // These checks are soft — a mismatch is logged but does not
        // stop the report — so only claim full success when none of
        // them actually failed.
        // =====================================================

        const resultMessage = fieldWarnings.length === 0
            ? "✅ All applicable WatsonAI report fields validated successfully."
            : `⚠️ WatsonAI report fields validated with warnings in: ${fieldWarnings.join(", ")}. Continuing with report creation.`;

        console.log(resultMessage);
        logSession(resultMessage);

        return { reportName: actualReportName, fieldWarnings };


    } catch (error) {

        console.error(
            `❌ WatsonAI report validation failed: ${error.message}`
        );

        logSession(
            `❌ WatsonAI report validation failed: ${error.message}`
        );

        throw error;
    }
}


// =========================================================
// 5. CLICK SUBMIT
// =========================================================

async function clickWatsonAISubmit(page) {

    try {

        const submitButton = page.getByRole("button", {
            name: "Submit",
            exact: true
        });

        await submitButton.waitFor({
            state: "visible",
            timeout: 30000
        });

        // Capture how many "Open Report" buttons already exist BEFORE
        // submitting, so we can later confirm a NEW one actually appears
        // instead of mistaking an old leftover button for this report.
        const previousOpenReportCount = await page.getByRole("button", {
            name: "Open Report",
            exact: true
        }).count();

        await submitButton.click();

        console.log(
            "✅ WatsonAI Submit button clicked."
        );

        logSession(
            "✅ WatsonAI Submit button clicked."
        );

        return previousOpenReportCount;

    } catch (error) {

        console.error(
            `❌ Failed to click WatsonAI Submit: ${error.message}`
        );

        logSession(
            `❌ Failed to click WatsonAI Submit: ${error.message}`
        );

        throw error;
    }
}


// =========================================================
// 6. VERIFY REPORT CREATION SUCCESS
// =========================================================

async function verifyWatsonAISuccess(page, expectedMessage, expectedReportType, previousOpenReportCount = 0) {

    const reportTypeMap = {
        "place level visits": 9,
        "quality of life index": 10,
        "device level visits": 6
    };

    const normalizedReportType =
        expectedReportType?.trim().toLowerCase();

    const expectedType =
        reportTypeMap[normalizedReportType];

    try {

        const watsonAILoader = page.locator(
            "div.flex.h-8.min-w-\\[40px\\].items-center.justify-center.rounded-lg.bg-surface-container-overlay-level-2.px-3.py-2"
        ).last();


        // =========================================================
        // 1. WAIT FOR FINAL REPORT CREATION
        // =========================================================

        let reportCreationConfirmed = false;

        try {

            await watsonAILoader.waitFor({
                state: "visible",
                timeout: 10000
            });

            console.log(
                "⏳ Final report creation started..."
            );

            logSession(
                "⏳ Final report creation started..."
            );

            await watsonAILoader.waitFor({
                state: "hidden",
                timeout: 120000
            });

            console.log(
                "✅ Final report creation completed."
            );

            logSession(
                "✅ Final report creation completed."
            );

            reportCreationConfirmed = true;

        } catch {

            console.log(
                "ℹ️ Final loader not detected. Checking for a report name validation error..."
            );

            logSession(
                "ℹ️ Final loader not detected. Checking for a report name validation error..."
            );
        }


        // =========================================================
        // 1B. IF THE LOADER NEVER APPEARED, CHECK FOR THE KNOWN
        //     "INVALID REPORT NAME" VALIDATION ERROR SO WE CAN FAIL
        //     FAST WITH A CLEAR REASON INSTEAD OF OPENING A STALE
        //     REPORT FROM AN EARLIER, SUCCESSFUL QUERY.
        // =========================================================

        if (!reportCreationConfirmed) {

            const invalidNameError = page.getByText(
                "Please enter report name (A-Z, a-z, 0-9, _ - , : and spaces only)"
            );

            const hasInvalidNameError = await invalidNameError
                .isVisible({ timeout: 3000 })
                .catch(() => false);

            if (hasInvalidNameError) {

                throw new Error(
                    "WatsonAI report creation did not start: Report Name contains " +
                    "characters not accepted by the platform (only A-Z, a-z, 0-9, _ - , : and spaces are allowed)."
                );
            }

            console.log(
                "ℹ️ No validation error detected. Waiting to confirm a new report was created..."
            );

            logSession(
                "ℹ️ No validation error detected. Waiting to confirm a new report was created..."
            );
        }


        // =========================================================
        // 2. WAIT FOR A NEW OPEN REPORT BUTTON
        // =========================================================

        // IMPORTANT:
        // Previous WatsonAI reports remain in the DOM, so simply
        // checking "count > 0" is not enough — that would match a
        // leftover button from an earlier, successful report even
        // when THIS submission failed. We require the count to
        // actually increase past what it was before Submit was clicked.

        const openReportButtons = page.getByRole(
            "button",
            {
                name: "Open Report",
                exact: true
            }
        );

        try {

            await expect(openReportButtons).toHaveCount(
                previousOpenReportCount + 1,
                { timeout: 60000 }
            );

        } catch {

            throw new Error(
                "WatsonAI report creation failed: no new report was generated " +
                "after clicking Submit (Open Report button count did not increase)."
            );
        }

        const openReportCount = await openReportButtons.count();

        console.log(
            `🔎 Open Report buttons found: ${openReportCount}`
        );

        logSession(
            `🔎 Open Report buttons found: ${openReportCount}`
        );

        const openReportButton =
            openReportButtons.last();

        await openReportButton.waitFor({
            state: "visible",
            timeout: 120000
        });

        console.log(
            "✅ Latest 'Open Report' button is visible."
        );

        logSession(
            "✅ Latest 'Open Report' button is visible."
        );


        // =========================================================
        // WAIT FOR REPORT TYPE API
        // =========================================================

        const reportTypeResponsePromise = page.waitForResponse(
            async response => {

                const url = response.url();

                if (
                    !url.includes("/api/services/sherlock/sparkJobs/")
                ) {
                    return false;
                }

                if (response.status() !== 200) {
                    return false;
                }

                try {

                    const data = await response.json();

                    const reportData =
                        Array.isArray(data)
                            ? data[0]
                            : data;

                    return (
                        reportData &&
                        reportData.reportType !== undefined
                    );

                } catch {

                    return false;
                }
            },
            {
                timeout: 120000
            }
        );


        // =========================================================
        // CLICK OPEN REPORT
        // =========================================================

        // Baseline for the post-open summary reply (see below).
        const copyCountBeforeOpen =
            await watsonAICopyResponseButtons(page).count();

        await openReportButton.click();

        console.log(
            "✅ 'Open Report' button clicked."
        );

        logSession(
            "✅ 'Open Report' button clicked."
        );

        // Marks the start of the "report open" timing window —
        // ends once the loading overlay clears below (report visible).
        const openReportClickTime = Date.now();


        // =========================================================
        // VALIDATE REPORT TYPE FROM API
        // =========================================================

        let reportTypeValidation = {
            matched: true,
            expectedType,
            actualType: null
        };

        try {

            const reportTypeResponse =
                await reportTypeResponsePromise;

            const responseData =
                await reportTypeResponse.json();

            const reportData =
                Array.isArray(responseData)
                    ? responseData[0]
                    : responseData;

            const actualReportType =
                Number(reportData.reportType);

            reportTypeValidation.actualType =
                actualReportType;


            console.log(
                `📡 WatsonAI API reportType received: ${actualReportType}`
            );

            logSession(
                `📡 WatsonAI API reportType received: ${actualReportType}`
            );


            // =====================================================
            // REPORT TYPE MATCH
            // =====================================================

            if (
                expectedType !== undefined &&
                actualReportType === expectedType
            ) {

                console.log(
                    `✅ WatsonAI report type matched: ` +
                    `${expectedReportType} (${actualReportType})`
                );

                logSession(
                    `✅ WatsonAI report type matched: ` +
                    `${expectedReportType} (${actualReportType})`
                );

            }

            // =====================================================
            // REPORT TYPE MISMATCH
            // =====================================================

            else {

                reportTypeValidation.matched = false;

                console.error(
                    `❌ WatsonAI report type mismatch.\n` +
                    `Expected: ${expectedReportType} (${expectedType})\n` +
                    `Actual API reportType: ${actualReportType}`
                );

                logSession(
                    `❌ WatsonAI report type mismatch.\n` +
                    `Expected: ${expectedReportType} (${expectedType})\n` +
                    `Actual API reportType: ${actualReportType}`
                );

            }

        } catch (error) {

            reportTypeValidation.matched = false;

            console.error(
                `❌ Unable to validate WatsonAI report type from API: ${error.message}`
            );

            logSession(
                `❌ Unable to validate WatsonAI report type from API: ${error.message}`
            );
        }

        // =========================================================
        // 4. WAIT FOR REPORT TO OPEN
        // =========================================================

        await page.waitForLoadState("domcontentloaded", {
            timeout: 60000
        }).catch(() => {
            console.log(
                "ℹ️ DOMContentLoaded wait completed/timed out. Checking report UI..."
            );

            logSession(
                "ℹ️ DOMContentLoaded wait completed/timed out. Checking report UI..."
            );
        });

        console.log(
            "⏳ Waiting for report view to open..."
        );

        logSession(
            "⏳ Waiting for report view to open..."
        );


        // =========================================================
        // WAIT FOR FOCUS MODE BUTTON
        // =========================================================

        // Every opened report leaves its inline map card (with its own
        // Focus Mode "expand" button) in the chat, so .last() is the one
        // for THIS report — .first() would re-open an earlier report's
        // card on the 2nd+ query of a session.
        const focusModeButton = page.locator(
            "button:has(svg.lucide-expand)"
        ).last();

        await focusModeButton.waitFor({
            state: "visible",
            timeout: 120000
        });

        console.log(`✅ Focus Mode button is visible.`);
        logSession(`✅ Focus Mode button is visible.`);


        // =========================================================
        // WAIT FOR ALL REPORT OVERLAYS TO DISAPPEAR
        // =========================================================

        const reportOverlays = page.locator(
            "div.fixed.inset-0.z-\\[99999999\\], " +
            "div.absolute.left-0.right-0.z-\\[9999999\\]"
        );

        console.log(
            "⏳ Waiting for report overlays to disappear..."
        );

        logSession(
            "⏳ Waiting for report overlays to disappear..."
        );

        await expect(reportOverlays).toHaveCount(0, {
            timeout: 120000
        });

        console.log(
            "✅ All report overlays disappeared."
        );

        logSession(
            "✅ All report overlays disappeared."
        );

        // Report-open timing window ends here — no loading overlay is
        // left covering the screen, meaning the report is actually visible.
        const reportOpenSeconds = Number(
            ((Date.now() - openReportClickTime) / 1000).toFixed(2)
        );

        reportTypeValidation.reportOpenSeconds = reportOpenSeconds;

        console.log(
            `⏱️ Report Open Time (Open Report click → report visible): ${reportOpenSeconds} seconds`
        );

        logSession(
            `⏱️ Report Open Time (Open Report click → report visible): ${reportOpenSeconds} seconds`
        );


        // =========================================================
        // WAIT FOR THE POST-OPEN WATSONAI SUMMARY
        // =========================================================

        // After Open Report, WatsonAI now streams a data summary (tables +
        // "You could ask: ...") into the chat below the report card. While
        // it streams, the chat keeps auto-scrolling, so the Focus Mode
        // button never holds still long enough to be clicked — that is
        // what left Focus Mode half-open, the close icon unclickable and
        // the prompt unusable for the next query. Wait for the summary
        // reply first. A missing summary doesn't stop the Kepler/Bento
        // checks — WatsonAIFlow turns it into outcome=warning.
        reportTypeValidation.summaryReceived =
            await waitForWatsonAIReportSummary(page, copyCountBeforeOpen);


        // =========================================================
        // CLICK FOCUS MODE
        // =========================================================

        await focusModeButton.scrollIntoViewIfNeeded().catch(() => { });

        // The report-title label above this button can overlap it at narrower
        // window widths and intercept the click for the full default timeout
        // (seen under Xvfb's smaller default screen). Fall back to a force
        // click rather than depending on window size to keep them apart.
        try {
            await focusModeButton.click({ timeout: 15000 });
        } catch (err) {
            console.log(
                "⚠️ Focus Mode click was intercepted (likely by the report title label) — retrying with a force click."
            );
            logSession(
                "⚠️ Focus Mode click was intercepted (likely by the report title label) — retrying with a force click."
            );
            await focusModeButton.click({ force: true });
        }

        // Focus Mode is confirmed by its close icon — without this, a click
        // that didn't take effect only surfaces much later as a failed close.
        await page.locator(WATSONAI_REPORT_CLOSE_ICON).last().waitFor({
            state: "visible",
            timeout: 30000
        });

        console.log(
            "✅ Focus Mode button clicked."
        );

        logSession(
            "✅ Focus Mode button clicked."
        );

        // =========================================================
        // FLOW ENDS HERE FOR NOW
        // =========================================================

        console.log(
            "🎉 WatsonAI report opened and Focus Mode activated."
        );

        logSession(
            "🎉 WatsonAI report opened and Focus Mode activated."
        );

        return reportTypeValidation;


    } catch (error) {

        console.error(
            `❌ WatsonAI report opening failed: ${error.message}`
        );

        logSession(
            `❌ WatsonAI report opening failed: ${error.message}`
        );

        throw error;
    }
}

async function watsonAIKeplerValidation(page, reportName, reportOpenSeconds) {

    const log = (result) => {

        console.log("\n🧾 WatsonAI Report Result");

        console.log(
            `📘 Report Name : ${result.reportName}`
        );

        console.log(
            `🔗 URL : ${result.url}`
        );

        console.log(
            `📌 status : ${result.status}`
        );

        console.log(
            `📝 Validation : ${result.text}`
        );

        console.log(
            `⏱️ Report Open Time (Open Report click → report visible): ${result.reportOpenSeconds} seconds`
        );


        logSession("\n🧾 WatsonAI Report Result");

        logSession(
            `📘 Report Name : ${result.reportName}`
        );

        logSession(
            `🔗 URL : ${result.url}`
        );

        logSession(
            `📌 status : ${result.status}`
        );

        logSession(
            `📝 Validation : ${result.text}`
        );

        logSession(
            `⏱️ Report Open Time (Open Report click → report visible): ${result.reportOpenSeconds} seconds`
        );


        return result.status;
    };


    try {

        // =====================================================
        // LOCATORS
        // =====================================================

        const keplerArrow =
            page.locator("button.side-bar__close");

        const toastDivs =
            page.locator(
                "div:has-text('No Data'), div:has-text('Failed')"
            );


        // =====================================================
        // CONTINUOUS MONITORING
        // =====================================================

        const MAX_WAIT_MS = 30 * 60 * 1000;

        const POLL_INTERVAL = 1000;

        const startPoll = Date.now();

        const NO_DATA_GRACE_MS = 2 * 60 * 1000;

        let firstEmptyDatasetsAt = null;


        while (true) {

            const currentURL = page.url();


            // =================================================
            // 1️⃣ CHECK FOR ERROR / NO DATA TOAST
            // =================================================

            if (await toastDivs.count() > 0) {

                // NOTE: "No Data"/"Failed" toasts auto-dismiss after a
                // few seconds. Using .innerText() here can time out
                // (30s) if the toast vanishes between this count()
                // check and the read — .allTextContents() reads
                // whatever is currently in the DOM without waiting
                // for the element to stay visible.
                const rawTexts =
                    await toastDivs.allTextContents();

                const rawText = rawTexts[0] || "";

                const toastText =
                    rawText
                        .split("\n")[0]
                        .trim();


                const status =
                    toastText
                        .toLowerCase()
                        .includes("no data")
                        ? "no_data"
                        : "error";


                return log({

                    reportName,

                    url: currentURL,

                    text:
                        `Toast detected: ${toastText}`,

                    status,

                    reportOpenSeconds
                });
            }


            // =================================================
            // 2️⃣ VERIFY WATSONAI REPORT URL
            // =================================================

            /*
             * WatsonAI reports remain on /watsonai.
             *
             * Therefore we DO NOT expect:
             *
             * /explore/{id}
             *
             * or
             *
             * /explore
             */

            if (!currentURL.includes("/watsonai")) {

                return log({

                    reportName,

                    url: currentURL,

                    text:
                        "Unexpected URL while validating WatsonAI generated report.",

                    status: "error",

                    reportOpenSeconds
                });
            }


            // =================================================
            // 3️⃣ CHECK KEPLER SIDEBAR ELEMENT
            // =================================================

            const keplerArrowCount =
                await keplerArrow.count();


            console.log(
                `🔍 Checking WatsonAI report Kepler elements...`
            );

            console.log(
                `Kepler Arrow count: ${keplerArrowCount}`
            );


            logSession(
                `🔍 Checking WatsonAI report Kepler elements...`
            );

            logSession(
                `Kepler Arrow count: ${keplerArrowCount}`
            );


            if (keplerArrowCount > 0) {

                try {

                    await keplerArrow.last().waitFor({
                        state: "visible",
                        timeout: 5000
                    });


                    console.log(
                        "✅ Kepler sidebar element exists in WatsonAI report."
                    );

                    logSession(
                        "✅ Kepler sidebar element exists in WatsonAI report."
                    );


                    // =============================================
                    // VERIFY REAL DATASET ROWS ARE LOADED
                    // (a rendered Kepler sidebar alone does not mean
                    // the report actually has data — confirmed live
                    // that ".source-data-rows" reflects the real
                    // row count, e.g. "51 rows", while a report with
                    // no data leaves the dataset catalog empty)
                    // =============================================

                    // IMPORTANT: this button TOGGLES the panel open/
                    // closed (confirmed live) — it does not just open
                    // it. Only click if the panel isn't already open,
                    // otherwise we'd close a perfectly good report's
                    // panel and wrongly read it as having no data.
                    const isDatasetPanelOpen = async () =>
                        (await page.locator(".source-data-catalog").count()) > 0;

                    // Same interception this file already works around
                    // for the Focus Mode button just above (see "Focus
                    // Mode click was intercepted (likely by the report
                    // title label)") — confirmed live via DOM inspection
                    // that the BentoBox charts tooltip / report-title
                    // label can sit on top of this button's hit area, so
                    // a plain click() (bounded 30s default timeout) can
                    // fail actionability and get silently swallowed by
                    // .catch(() => {}), leaving the panel closed and a
                    // report with real data wrongly flagged no_data.
                    // Retry with a bounded timeout, then fall back to a
                    // force click that bypasses the actionability check
                    // entirely — confirmed live that a plain DOM
                    // .click() (which force: true approximates) opens
                    // the panel correctly even while occluded.
                    for (
                        let attempt = 0;
                        attempt < 3 && !(await isDatasetPanelOpen());
                        attempt++
                    ) {

                        await keplerArrow.last()
                            .click({ timeout: 5000 })
                            .catch(() =>
                                keplerArrow.last()
                                    .click({ timeout: 5000, force: true })
                                    .catch(() => { })
                            );

                        await page.waitForTimeout(500);
                    }

                    // Read the "Datasets(N)" counter next to the "Add
                    // Data" button instead of parsing row-count text.
                    // Confirmed live: this span reads "Datasets(1)" for
                    // a report with a normal tabular dataset, and plain
                    // "Datasets" (no parens at all) when the catalog is
                    // genuinely empty. This also sidesteps the earlier
                    // row-text approach entirely breaking on choropleth
                    // report types (QLI) whose row entry reads "Vector
                    // tile" instead of a number — same selector pattern
                    // already proven for Explore reports in
                    // keplerDatasetsFetch() in functions.js.
                    const datasetsLabel = page.locator(
                        "//button[.//text()[normalize-space()='Add Data']]/preceding-sibling::span"
                    );

                    let datasetsLabelText = "";

                    if (await isDatasetPanelOpen()) {

                        const pollDeadline =
                            Date.now() + 20000;

                        while (Date.now() < pollDeadline) {

                            if (await datasetsLabel.count() > 0) {

                                datasetsLabelText =
                                    (await datasetsLabel.last().innerText())
                                        .trim();

                                if (/\(\d+\)/.test(datasetsLabelText)) {

                                    break;
                                }
                            }

                            await page.waitForTimeout(1000);
                        }
                    }

                    const datasetCountMatch =
                        datasetsLabelText.match(/\((\d+)\)/);

                    const datasetCount =
                        datasetCountMatch
                            ? parseInt(datasetCountMatch[1], 10)
                            : 0;

                    if (datasetCount > 0) {

                        console.log(
                            `✅ Datasets confirmed: '${datasetsLabelText}'.`
                        );

                        logSession(
                            `✅ Datasets confirmed: '${datasetsLabelText}'.`
                        );

                        return log({

                            reportName,

                            url: currentURL,

                            text:
                                `WatsonAI generated report opened successfully with real data (${datasetsLabelText}).`,

                            status: "success",

                            reportOpenSeconds
                        });
                    }

                    // The dataset panel/counter can still be empty right
                    // after Focus Mode opens (seen for QLI on dev: empty
                    // label on one run, 'Datasets(1)' on another), so only
                    // call it no_data once it has stayed empty for a while.
                    firstEmptyDatasetsAt ??= Date.now();

                    if (Date.now() - firstEmptyDatasetsAt < NO_DATA_GRACE_MS) {

                        console.log(
                            `⏳ No datasets detected yet (datasetsLabelText: '${datasetsLabelText}', panel open: ${await isDatasetPanelOpen()}). Retrying...`
                        );

                        logSession(
                            `⏳ No datasets detected yet (datasetsLabelText: '${datasetsLabelText}', panel open: ${await isDatasetPanelOpen()}). Retrying...`
                        );

                        await page.waitForTimeout(5000);

                        continue;
                    }

                    console.log(
                        `⚠️ Kepler sidebar rendered, but no datasets detected (datasetsLabelText: '${datasetsLabelText}').`
                    );

                    logSession(
                        `⚠️ Kepler sidebar rendered, but no datasets detected (datasetsLabelText: '${datasetsLabelText}').`
                    );

                    return log({

                        reportName,

                        url: currentURL,

                        text:
                            `Kepler sidebar rendered, but no datasets were detected — report likely has no data (datasetsLabelText: '${datasetsLabelText}').`,

                        status: "no_data",

                        reportOpenSeconds
                    });


                } catch (err) {

                    console.log(
                        "⏳ Kepler sidebar element exists but is not visible yet. Continuing to wait..."
                    );

                    logSession(
                        "⏳ Kepler sidebar element exists but is not visible yet. Continuing to wait..."
                    );
                }
            }


            // =================================================
            // 4️⃣ TIMEOUT FALLBACK
            // =================================================

            if (
                Date.now() - startPoll >
                MAX_WAIT_MS
            ) {

                return log({

                    reportName,

                    url: page.url(),

                    text:
                        "Timeout: WatsonAI report opened, but Kepler sidebar element was not detected.",

                    status: "timeout",

                    reportOpenSeconds
                });
            }


            // =================================================
            // 5️⃣ POLL AGAIN
            // =================================================

            await page.waitForTimeout(
                POLL_INTERVAL
            );
        }


    } catch (err) {

        const errorMsg =
            err.message
                .split("\n")
                .slice(0, 5)
                .join("\n");


        return log({

            reportName,

            url: page.url(),

            text:
                `Unexpected error:\n${errorMsg}`,

            status: "error",

            reportOpenSeconds
        });
    }
}


module.exports = {
    openWatsonAI,
    enterWatsonAIQuery,
    watchWatsonAISearchRequest,
    waitForWatsonAIResponse,
    WATSONAI_SUMMARY_TIMEOUT_MS,
    checkWatsonAIQueryError,
    getWatsonAIChatBaseline,
    getLatestWatsonAIReplyText,
    waitForWatsonAIReportForm,
    waitForWatsonAIChatReady,
    closeWatsonAIReport,
    verifyWatsonAIReportFields,
    clickWatsonAISubmit,
    verifyWatsonAISuccess,
    watsonAIKeplerValidation
};