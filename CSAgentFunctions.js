const { logSession } = require("./Logger");
const { expect } = require("@playwright/test");


// =========================================================
// KNOWN CS AGENT DISCONNECT / CONNECTION-ERROR MESSAGES
// These can appear at ANY point mid-flow (backend hiccup,
// inactivity timeout, etc.) instead of the next expected step.
// Confirmed real occurrences (manual QA testing + live
// exploration):
//   "CS agent is having trouble connecting. Please try again
//    after some time."
//   "CS agent disconnected unexpectedly. Starting things over."
//   "CS agent disconnected due to inactivity (30 minutes of
//    idle time)."
// Without an explicit check, waiting for the next expected
// element just times out with a generic error while the real,
// already-visible-on-screen cause goes unreported.
// =========================================================

const CS_AGENT_DISCONNECT_PATTERN =
    /CS agent is having trouble connecting|CS agent disconnected/;

// Races a target check against a disconnect-banner check over the same
// window, WITHOUT waiting for both to fully settle (Promise.allSettled
// would block for the full timeout on whichever one loses, even if the
// other already succeeded in a second — that was a real bug: onboarding
// success rendered almost immediately, but the wait still blocked for the
// full 15 minutes because the unrelated disconnect check hadn't timed
// out yet). Both checks are wrapped to never reject, so Promise.race
// resolves as soon as EITHER produces a real answer (target found, or
// disconnect found) — only in the genuinely-inconclusive case (neither
// found anything) do we need the other's result too, and by then it is
// already settled or a moment away, since both share the same timeout.
async function raceCSAgentSignal(runTargetCheck, disconnectLocator, timeout) {

    const targetOutcome = runTargetCheck()
        .then(() => ({ type: "target" }))
        .catch(error => ({ type: "neither", error }));

    const disconnectOutcome = disconnectLocator.waitFor({ state: "visible", timeout })
        .then(() => ({ type: "disconnect" }))
        .catch(() => ({ type: "neither" }));

    const first = await Promise.race([targetOutcome, disconnectOutcome]);

    if (first.type !== "neither") {
        return first;
    }

    const [targetResult, disconnectResult] = await Promise.all([targetOutcome, disconnectOutcome]);

    return disconnectResult.type === "disconnect" ? disconnectResult : targetResult;
}

// Drop-in replacement for `locator.waitFor({ state: "visible", timeout })`
// that also watches for a disconnect banner over the same window, without
// slowing down the common case where the target simply appears quickly.
async function waitForCSAgentElementOrDisconnect(page, targetLocator, timeout) {

    const disconnectLocator = page.getByText(CS_AGENT_DISCONNECT_PATTERN).last();

    const result = await raceCSAgentSignal(
        () => targetLocator.waitFor({ state: "visible", timeout }),
        disconnectLocator,
        timeout
    );

    if (result.type === "disconnect") {

        const message = (await disconnectLocator.innerText()).trim();

        throw new Error(`CS Agent disconnected: '${message}'`);
    }

    if (result.type === "neither") {

        throw result.error;
    }
}

// Same idea, for the count-based waits used by the Phase 3 pipeline
// (`expect(locator).toHaveCount(...)`), which don't fit the plain
// waitFor() shape above.
async function expectCSAgentCountOrDisconnect(page, targetLocator, count, timeout) {

    const disconnectLocator = page.getByText(CS_AGENT_DISCONNECT_PATTERN).last();

    const result = await raceCSAgentSignal(
        () => expect(targetLocator).toHaveCount(count, { timeout }),
        disconnectLocator,
        timeout
    );

    if (result.type === "disconnect") {

        const message = (await disconnectLocator.innerText()).trim();

        throw new Error(`CS Agent disconnected: '${message}'`);
    }

    if (result.type === "neither") {

        throw result.error;
    }
}


// =========================================================
// 1. ACTIVATE CS AGENT ("start cs agent")
// =========================================================

async function activateCSAgent(page) {
    try {
        const queryInput = page.getByPlaceholder(
            "Ask a question or make a command",
            { exact: true }
        );

        await queryInput.waitFor({ state: "visible", timeout: 30000 });
        await queryInput.fill("start cs agent");
        await queryInput.press("Enter");

        console.log(`✅ Sent 'start cs agent' command.`);
        logSession(`✅ Sent 'start cs agent' command.`);

        const activatedText = page.getByText("Agent mode activated.").last();

        await waitForCSAgentElementOrDisconnect(page, activatedText, 30000);

        console.log(`✅ CS Agent mode activated.`);
        logSession(`✅ CS Agent mode activated.`);

    } catch (error) {

        console.error(`❌ Failed to activate CS Agent: ${error.message}`);
        logSession(`❌ Failed to activate CS Agent: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 2. SELECT A PHASE (Phase1 / Phase2 / Phase3)
// =========================================================

// `optional: true` (used by the "fresh" flow) treats a phase selector that
// never appears as expected rather than a failure. Confirmed app behavior:
// the FIRST time a user ever opens CS Agent (no prior run on any company),
// no phase selector is shown at all — it goes straight to asking for the
// company name, with Phase 1 as the implicit default. Every time after
// that, for that user, the selector always appears (even when starting a
// brand-new company via "fresh"), and Phase 1 must be picked explicitly.
// This function doesn't need to know which case it's in — it just reacts
// to whichever actually renders. A genuine disconnect still throws either
// way. "resume" mode never passes this — there, a missing selector means
// there is no saved run to resume, which is a real failure.
async function selectCSAgentPhase(page, phaseKey, { optional = false } = {}) {
    const phaseCombobox = page.getByPlaceholder("Select one phase selection").last();

    try {
        await waitForCSAgentElementOrDisconnect(page, phaseCombobox, 30000);
    } catch (error) {

        if (optional && !error.message.startsWith("CS Agent disconnected:")) {

            console.log(`ℹ️ No phase selector shown — treating as a new user with no prior CS Agent run, skipping straight to company name.`);
            logSession(`ℹ️ No phase selector shown — treating as a new user with no prior CS Agent run, skipping straight to company name.`);

            return false;
        }

        console.error(`❌ Failed to select CS Agent phase '${phaseKey}': ${error.message}`);
        logSession(`❌ Failed to select CS Agent phase '${phaseKey}': ${error.message}`);

        throw error;
    }

    try {
        await phaseCombobox.click();

        const phaseOption = page.getByRole("option", {
            name: new RegExp(`^${phaseKey}:`)
        }).last();

        await phaseOption.waitFor({ state: "visible", timeout: 15000 });
        await phaseOption.click();

        const submitButton = page.getByRole("button", {
            name: "Submit",
            exact: true
        }).last();

        await submitButton.waitFor({ state: "visible", timeout: 15000 });
        await submitButton.click();

        console.log(`✅ Selected CS Agent phase: '${phaseKey}'.`);
        logSession(`✅ Selected CS Agent phase: '${phaseKey}'.`);

        return true;

    } catch (error) {

        console.error(`❌ Failed to select CS Agent phase '${phaseKey}': ${error.message}`);
        logSession(`❌ Failed to select CS Agent phase '${phaseKey}': ${error.message}`);

        throw error;
    }
}


// =========================================================
// 3. SELECT A SAVED RUN
// (Only shown when Phase2/Phase3 is started directly, i.e.
// not chained from a completed earlier phase in the same
// session. Resumes using that run's stored earlier-phase data.)
// =========================================================

async function selectCSAgentSavedRun(page, savedRunName) {
    try {
        const runCombobox = page.getByPlaceholder("Select one folder selection").last();

        await waitForCSAgentElementOrDisconnect(page, runCombobox, 30000);
        await runCombobox.click();

        const runOption = page.getByRole("option", {
            name: savedRunName,
            exact: true
        }).last();

        await runOption.waitFor({ state: "visible", timeout: 15000 });
        await runOption.click();

        const submitButton = page.getByRole("button", {
            name: "Submit",
            exact: true
        }).last();

        await submitButton.waitFor({ state: "visible", timeout: 15000 });
        await submitButton.click();

        console.log(`✅ Selected CS Agent saved run: '${savedRunName}'.`);
        logSession(`✅ Selected CS Agent saved run: '${savedRunName}'.`);

    } catch (error) {

        console.error(`❌ Failed to select CS Agent saved run '${savedRunName}': ${error.message}`);
        logSession(`❌ Failed to select CS Agent saved run '${savedRunName}': ${error.message}`);

        throw error;
    }
}


// =========================================================
// 4. SEND A CHAT ANSWER
// (Company name, problem statement and every questionnaire
// answer are all typed into the same shared chat textbox.)
// =========================================================

async function sendCSAgentChatAnswer(page, answerText) {
    try {
        const queryInput = page.getByPlaceholder(
            "Ask a question or make a command",
            { exact: true }
        );

        await queryInput.waitFor({ state: "visible", timeout: 30000 });
        await queryInput.fill(answerText);
        await queryInput.press("Enter");

        console.log(`✅ Answered CS Agent prompt: '${answerText}'`);
        logSession(`✅ Answered CS Agent prompt: '${answerText}'`);


        // =================================================
        // KNOWN FAILURE MODE (confirmed in manual QA testing):
        // overly long messages are silently rejected with this
        // text instead of being accepted, and the flow then
        // stalls waiting for a prompt that never arrives. Fail
        // fast with a clear reason instead of timing out later.
        // =================================================

        const tooLengthyText = page.getByText(
            "It seems like your message got a bit lengthy!"
        ).last();

        // NOTE: isVisible() does not poll/retry, it is a one-shot
        // check — use waitFor() so this actually gives the error
        // banner a chance to render before concluding it's absent.
        const isTooLengthy = await tooLengthyText
            .waitFor({ state: "visible", timeout: 3000 })
            .then(() => true)
            .catch(() => false);

        if (isTooLengthy) {

            throw new Error(
                `CS Agent rejected the message as too long: '${answerText}'`
            );
        }

    } catch (error) {

        console.error(`❌ Failed to send CS Agent answer '${answerText}': ${error.message}`);
        logSession(`❌ Failed to send CS Agent answer '${answerText}': ${error.message}`);

        throw error;
    }
}


// =========================================================
// 5. WAIT FOR ONBOARDING DATA GENERATION (Phase 1)
// (App-stated estimate is 7-8 minutes.)
// =========================================================

async function waitForCSAgentOnboarding(page, companyName, timeout = 15 * 60 * 1000) {
    try {
        const generatingText = page.getByText(
            `Generating onboarding data for ${companyName}`
        ).last();

        await waitForCSAgentElementOrDisconnect(page, generatingText, 30000);

        console.log(`⏳ Generating onboarding data for '${companyName}' (up to ${Math.round(timeout / 60000)} min)...`);
        logSession(`⏳ Generating onboarding data for '${companyName}' (up to ${Math.round(timeout / 60000)} min)...`);

        const successText = page.getByText(
            `Onboarding data for ${companyName} generated successfully.`
        ).last();

        await waitForCSAgentElementOrDisconnect(page, successText, timeout);

        console.log(`✅ Onboarding data generated successfully for '${companyName}'.`);
        logSession(`✅ Onboarding data generated successfully for '${companyName}'.`);

    } catch (error) {

        console.error(`❌ Onboarding data generation failed for '${companyName}': ${error.message}`);
        logSession(`❌ Onboarding data generation failed for '${companyName}': ${error.message}`);

        throw error;
    }
}


// =========================================================
// 6. RUN THE QUESTIONNAIRE (Phase 1)
// Each question renders with a "Skip" button. answers[i] is
// either the text to send, or a falsy value (null/undefined)
// to click Skip instead. Once a question is answered/skipped
// its "Skip" button is removed from the DOM (replaced by the
// echoed question + answer), so .last() always targets the
// current, still-unanswered question.
// =========================================================

async function runCSAgentQuestionnaire(page, answers = []) {
    const MAX_QUESTIONS = 15;
    let index = 0;

    try {
        while (index < MAX_QUESTIONS) {

            const skipButton = page.getByRole("button", {
                name: "Skip",
                exact: true
            }).last();

            // NOTE: isVisible() does not poll/retry — it is a one-shot
            // check of the current DOM state. The next question can take
            // a moment to render after the previous one is answered, so
            // waitFor() (which actually retries up to the timeout) must
            // be used here, or the loop stops one question early.
            //
            // The skip button genuinely NOT appearing is a normal, expected
            // outcome (it means the questionnaire is done) — so unlike other
            // waits in this file, this can't just throw whenever the target
            // fails. Only a disconnect banner should cause a hard failure
            // here; a plain "no more questions" timeout must stay silent.
            const disconnectLocator = page.getByText(CS_AGENT_DISCONNECT_PATTERN).last();

            const questionCheck = await raceCSAgentSignal(
                () => skipButton.waitFor({ state: "visible", timeout: 45000 }),
                disconnectLocator,
                45000
            );

            if (questionCheck.type === "disconnect") {

                const message = (await disconnectLocator.innerText()).trim();

                throw new Error(`CS Agent disconnected during questionnaire: '${message}'`);
            }

            const hasQuestion = questionCheck.type === "target";

            if (!hasQuestion) {

                console.log(`✅ Questionnaire finished after ${index} question(s).`);
                logSession(`✅ Questionnaire finished after ${index} question(s).`);

                break;
            }

            let questionText = "(question text unavailable)";

            try {
                // Verified against the live DOM: the button's immediate
                // parent is just its own padding wrapper (text: "Skip"
                // only) — the question text lives in the GRANDPARENT
                // (button's parent's parent), concatenated with "Skip".
                const containerText = await skipButton.locator("xpath=../..").innerText();

                questionText = containerText.replace(/\s*Skip\s*$/, "").trim();
            } catch { }

            const answer = answers[index];

            if (answer) {

                await sendCSAgentChatAnswer(page, answer);

                console.log(`✅ Q${index + 1}: '${questionText}' -> answered.`);
                logSession(`✅ Q${index + 1}: '${questionText}' -> answered.`);

            } else {

                await skipButton.click();

                console.log(`⏭️ Q${index + 1}: '${questionText}' -> skipped.`);
                logSession(`⏭️ Q${index + 1}: '${questionText}' -> skipped.`);
            }

            index++;
        }

    } catch (error) {

        console.error(`❌ CS Agent questionnaire failed at question ${index + 1}: ${error.message}`);
        logSession(`❌ CS Agent questionnaire failed at question ${index + 1}: ${error.message}`);

        throw error;
    }

    return index;
}


// =========================================================
// 7. HANDLE THE 3 REVIEW CHECKPOINTS (Phase 1)
// (Company Snapshot / Initiative Context / Audience Landscape.
// Only the "No changes needed" path is exercised here — the
// "Yes" path opens an unexplored follow-up flow.)
// =========================================================

async function handleCSAgentReviewCheckpoints(
    page,
    sections = ["Company Snapshot", "Initiative Context", "Audience Landscape"]
) {
    for (const section of sections) {

        try {

            const heading = page.getByRole("heading", {
                name: section,
                level: 2
            }).last();

            await waitForCSAgentElementOrDisconnect(page, heading, 60000);

            const noButton = page.getByRole("button", {
                name: "No",
                exact: true
            }).last();

            await waitForCSAgentElementOrDisconnect(page, noButton, 30000);
            await noButton.click();

            console.log(`✅ Reviewed '${section}' section — no changes requested.`);
            logSession(`✅ Reviewed '${section}' section — no changes requested.`);

        } catch (error) {

            console.error(`❌ Failed to review '${section}' section: ${error.message}`);
            logSession(`❌ Failed to review '${section}' section: ${error.message}`);

            throw error;
        }
    }
}


// =========================================================
// 8. WAIT FOR "PHASE N COMPLETE!" + GENERATED FILE BUTTON
// =========================================================

async function waitForCSAgentPhaseComplete(page, phaseNumber, fileExtension) {
    try {

        const completeText = page.getByText(`Phase ${phaseNumber} complete!`).last();

        await waitForCSAgentElementOrDisconnect(page, completeText, 60000);

        const openFileButton = page.getByRole("button", {
            name: new RegExp(`^Open .*\\.${fileExtension}$`)
        }).last();

        await waitForCSAgentElementOrDisconnect(page, openFileButton, 30000);

        const fileName = (await openFileButton.innerText()).trim();

        console.log(`✅ Phase ${phaseNumber} complete. Generated file: '${fileName}'`);
        logSession(`✅ Phase ${phaseNumber} complete. Generated file: '${fileName}'`);

        return fileName;

    } catch (error) {

        console.error(`❌ Phase ${phaseNumber} did not complete as expected: ${error.message}`);
        logSession(`❌ Phase ${phaseNumber} did not complete as expected: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 8B. OPEN + VALIDATE THE PHASE 1 DOCX OUTPUT
// (Verified live: clicking "Open ....docx" does NOT trigger a
// browser download — it opens a real embedded OnlyOffice editor
// in an iframe named "frameEditor". A genuine, non-empty document
// reports a page count like "Page 1 of 13"; that is the signal
// used here to confirm the file is real and not blank/corrupt.)
// =========================================================

async function validateCSAgentDocxOutput(page, timeout = 60000) {
    try {

        const openFileButton = page.getByRole("button", {
            name: /^Open .*\.docx$/
        }).last();

        await openFileButton.waitFor({ state: "visible", timeout: 30000 });
        await openFileButton.click();

        console.log(`📄 Opened Phase 1 document for validation.`);
        logSession(`📄 Opened Phase 1 document for validation.`);

        const editorFrame = page.frameLocator('iframe[name="frameEditor"]');

        const pageCountText = editorFrame.getByText(/^Page \d+ of \d+$/).first();

        await pageCountText.waitFor({ state: "visible", timeout });

        const pageCountLabel = (await pageCountText.innerText()).trim();

        const pageCountMatch = pageCountLabel.match(/^Page (\d+) of (\d+)$/);
        const totalPages = pageCountMatch ? parseInt(pageCountMatch[2], 10) : 0;

        if (totalPages === 0) {

            throw new Error(
                `Document editor did not report a valid page count (saw: '${pageCountLabel}').`
            );
        }

        console.log(`✅ Phase 1 document validated: ${pageCountLabel}.`);
        logSession(`✅ Phase 1 document validated: ${pageCountLabel}.`);

        const closeButton = editorFrame.getByRole("button", {
            name: "Close",
            exact: true
        });

        await closeButton.click();

        // Confirm the viewer actually closed before returning, so the
        // caller isn't left racing a chat prompt still hidden behind
        // a not-yet-dismissed editor overlay.
        await page.locator('iframe[name="frameEditor"]').waitFor({
            state: "detached",
            timeout: 15000
        });

        console.log(`✅ Closed Phase 1 document viewer.`);
        logSession(`✅ Closed Phase 1 document viewer.`);

        return totalPages;

    } catch (error) {

        console.error(`❌ Failed to validate Phase 1 document: ${error.message}`);
        logSession(`❌ Failed to validate Phase 1 document: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 8C. OPEN + VALIDATE A PHASE 2 XLSX OUTPUT
// (Same embedded OnlyOffice mechanism as the Phase 1 docx, but
// this time the spreadsheeteditor app. Verified live: the sheet
// tabs live in a stable-id list, #statusbar_bottom, with each
// <li> carrying a data-label attribute holding the real sheet
// name — e.g. "Audience Cohort" / "POI Categorization". A
// spreadsheet with zero sheet tabs would mean it failed to
// generate; the exact sheet names/count are expected to legitimately
// differ between the STEP 4 strategy file and the final Phase 2
// complete file (POI Categorization is only added by STEP 6), so
// this only checks for at least one real sheet, not an exact count.
// Called from two places: right after "Generated strategy" (STEP 4)
// and again after "Phase 2 complete!", each time picking up the
// CURRENT/last "Open ....xlsx" button in the transcript via .last().
// =========================================================

async function validateCSAgentXlsxOutput(page, timeout = 60000) {
    try {

        const openFileButton = page.getByRole("button", {
            name: /^Open .*\.xlsx$/
        }).last();

        await openFileButton.waitFor({ state: "visible", timeout: 30000 });
        await openFileButton.click();

        console.log(`📊 Opened Phase 2 spreadsheet for validation.`);
        logSession(`📊 Opened Phase 2 spreadsheet for validation.`);

        const editorFrame = page.frameLocator('iframe[name="frameEditor"]');

        const sheetTabs = editorFrame.locator("#statusbar_bottom li.list-item");

        await sheetTabs.first().waitFor({ state: "visible", timeout });

        const sheetNames = await sheetTabs.evaluateAll(
            elements => elements
                .map(el => el.getAttribute("data-label"))
                .filter(Boolean)
        );

        if (sheetNames.length === 0) {

            throw new Error(
                "Spreadsheet editor reported no sheet tabs — likely empty or failed to generate."
            );
        }

        console.log(`✅ Phase 2 spreadsheet validated: ${sheetNames.length} sheet(s) — ${sheetNames.join(", ")}.`);
        logSession(`✅ Phase 2 spreadsheet validated: ${sheetNames.length} sheet(s) — ${sheetNames.join(", ")}.`);

        const closeButton = editorFrame.getByRole("button", {
            name: "Close",
            exact: true
        });

        await closeButton.click();

        await page.locator('iframe[name="frameEditor"]').waitFor({
            state: "detached",
            timeout: 15000
        });

        console.log(`✅ Closed Phase 2 spreadsheet viewer.`);
        logSession(`✅ Closed Phase 2 spreadsheet viewer.`);

        return sheetNames;

    } catch (error) {

        console.error(`❌ Failed to validate Phase 2 spreadsheet: ${error.message}`);
        logSession(`❌ Failed to validate Phase 2 spreadsheet: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 9. ANSWER THE "CONTINUE TO PHASE N?" PROMPT
// =========================================================

async function answerCSAgentContinuePrompt(page, nextPhaseNumber, shouldContinue) {
    try {

        const prompt = page.getByText(
            new RegExp(`Would you like to continue to phase ${nextPhaseNumber}`)
        ).last();

        await waitForCSAgentElementOrDisconnect(page, prompt, 30000);

        const buttonName = shouldContinue ? "Yes" : "No";

        const button = page.getByRole("button", {
            name: buttonName,
            exact: true
        }).last();

        await waitForCSAgentElementOrDisconnect(page, button, 15000);
        await button.click();

        console.log(`➡️ Answered '${buttonName}' to continue-to-phase-${nextPhaseNumber} prompt.`);
        logSession(`➡️ Answered '${buttonName}' to continue-to-phase-${nextPhaseNumber} prompt.`);

    } catch (error) {

        console.error(`❌ Failed to answer continue-to-phase-${nextPhaseNumber} prompt: ${error.message}`);
        logSession(`❌ Failed to answer continue-to-phase-${nextPhaseNumber} prompt: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 10. WAIT THROUGH THE PHASE 2 PIPELINE (Cohort Generation)
// STEP1-4 -> strategy file -> "make changes?" (No) -> STEP5-6
// =========================================================

async function waitForCSAgentPhase2Pipeline(page) {

    // Logged before each wait (not just after) so that if this
    // pipeline dies partway through a long run, the last log line
    // pinpoints exactly which step it was waiting on.
    let currentStep = "STEP 1-4 (blueprint, POI taxonomy/refinement, cohort strategy)";

    try {

        console.log(`⏳ Phase 2: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 2: waiting for ${currentStep}...`);

        const strategyText = page.getByText("Generated strategy").last();

        await waitForCSAgentElementOrDisconnect(page, strategyText, 8 * 60 * 1000);

        console.log(`✅ Phase 2 cohort strategy generated.`);
        logSession(`✅ Phase 2 cohort strategy generated.`);

        currentStep = "STEP 4 strategy spreadsheet validation";
        await validateCSAgentXlsxOutput(page);

        currentStep = "'make changes to strategy?' prompt";
        console.log(`⏳ Phase 2: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 2: waiting for ${currentStep}...`);

        const changesPrompt = page.getByText(
            "Would you like to make changes to the strategy above?"
        ).last();

        await waitForCSAgentElementOrDisconnect(page, changesPrompt, 30000);

        const noButton = page.getByRole("button", {
            name: "No",
            exact: true
        }).last();

        await waitForCSAgentElementOrDisconnect(page, noButton, 15000);
        await noButton.click();

        console.log(`➡️ Answered 'No' to strategy-changes prompt.`);
        logSession(`➡️ Answered 'No' to strategy-changes prompt.`);

        currentStep = "STEP 5-6 (location verification, POI categorization) + strategy save";
        console.log(`⏳ Phase 2: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 2: waiting for ${currentStep}...`);

        const savingText = page.getByText("Saving Phase 2 strategy...").last();

        await waitForCSAgentElementOrDisconnect(page, savingText, 5 * 60 * 1000);

        console.log(`✅ Phase 2 strategy saved.`);
        logSession(`✅ Phase 2 strategy saved.`);

    } catch (error) {

        console.error(`❌ Phase 2 pipeline failed while waiting for ${currentStep}: ${error.message}`);
        logSession(`❌ Phase 2 pipeline failed while waiting for ${currentStep}: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 11. WAIT THROUGH THE PHASE 3 PIPELINE (Report Creation)
// Visitation reports -> POI reports -> multilayer reports
// (one query-parameter review + Submit per cohort).
// =========================================================

async function waitForCSAgentPhase3Pipeline(page) {

    // Logged before each wait (not just after) so that if this
    // pipeline dies partway through a long run, the last log line
    // pinpoints exactly which step/cohort it was waiting on.
    let currentStep = "report metadata generation";

    try {

        console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

        const metadataText = page.getByText(
            /Generated metadata for \d+ visitation reports/
        ).last();

        await waitForCSAgentElementOrDisconnect(page, metadataText, 3 * 60 * 1000);

        const metadataMessage = (await metadataText.innerText()).trim();

        const cohortCountMatch = metadataMessage.match(
            /Generated metadata for (\d+) visitation reports/
        );

        const cohortCount = cohortCountMatch ? parseInt(cohortCountMatch[1], 10) : 0;

        if (cohortCount === 0) {

            throw new Error(
                `Could not determine cohort count from metadata message: '${metadataMessage}'`
            );
        }

        console.log(`📊 Phase 3 will generate reports for ${cohortCount} cohort(s).`);
        logSession(`📊 Phase 3 will generate reports for ${cohortCount} cohort(s).`);


        // =====================================================
        // VISITATION REPORTS
        // =====================================================

        currentStep = `${cohortCount} visitation report(s)`;
        console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

        const visitationReports = page.getByText(/^Visitation report for /);

        await expectCSAgentCountOrDisconnect(page, visitationReports, cohortCount, 10 * 60 * 1000);

        console.log(`✅ All ${cohortCount} visitation report(s) generated.`);
        logSession(`✅ All ${cohortCount} visitation report(s) generated.`);


        // =====================================================
        // POI (PLACES) REPORTS
        // =====================================================

        currentStep = `${cohortCount} POI report(s)`;
        console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

        const poiReports = page.getByText(/^Places report for /);

        await expectCSAgentCountOrDisconnect(page, poiReports, cohortCount, 10 * 60 * 1000);

        console.log(`✅ All ${cohortCount} POI report(s) generated.`);
        logSession(`✅ All ${cohortCount} POI report(s) generated.`);


        // =====================================================
        // MULTILAYER REPORTS
        // (one "review query parameters" form per cohort)
        // =====================================================

        for (let i = 0; i < cohortCount; i++) {

            currentStep = `multilayer query-parameter review for cohort ${i + 1}/${cohortCount}`;
            console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
            logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

            const reviewPrompt = page.getByText(
                "Please review and modify the following query parameters."
            ).last();

            await waitForCSAgentElementOrDisconnect(page, reviewPrompt, 5 * 60 * 1000);

            const submitButton = page.getByRole("button", {
                name: "Submit",
                exact: true
            }).last();

            await waitForCSAgentElementOrDisconnect(page, submitButton, 15000);

            // Submit renders visible but disabled until the form finishes
            // populating (usually near-instant, but observed live to
            // occasionally stay disabled well past 60s for a specific
            // cohort — confirmed cohort/company-dependent backend
            // slowness, not a fixed position: cohort 5 failed here for
            // one company in the same run cohort 5 succeeded instantly
            // for another) — wait for enabled explicitly instead of
            // relying on click()'s default 30s actionability wait.
            await expect(submitButton).toBeEnabled({ timeout: 3 * 60 * 1000 });
            await submitButton.click();

            console.log(`✅ Submitted multilayer report parameters for cohort ${i + 1}/${cohortCount}.`);
            logSession(`✅ Submitted multilayer report parameters for cohort ${i + 1}/${cohortCount}.`);

            currentStep = `multilayer report generation for cohort ${i + 1}/${cohortCount}`;
            console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
            logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

            const multilayerReports = page.getByText(/^Multilayer /);

            await expectCSAgentCountOrDisconnect(page, multilayerReports, i + 1, 10 * 60 * 1000);
        }

        console.log(`✅ All ${cohortCount} multilayer report(s) generated.`);
        logSession(`✅ All ${cohortCount} multilayer report(s) generated.`);

        return cohortCount;

    } catch (error) {

        console.error(`❌ Phase 3 pipeline failed while waiting for ${currentStep}: ${error.message}`);
        logSession(`❌ Phase 3 pipeline failed while waiting for ${currentStep}: ${error.message}`);

        throw error;
    }
}


// =========================================================
// 12. WAIT FOR CS AGENT DEACTIVATION MESSAGE
// (Best-effort — logged as a warning, not thrown, since it is
// only a final confirmation banner and not itself a test gate.)
// =========================================================

async function waitForCSAgentDeactivated(page, timeout = 30000) {
    const deactivatedText = page.getByText("CS agent deactivated").last();

    // NOTE: isVisible() does not poll/retry — waitFor() is required
    // to actually give the deactivation banner up to `timeout` to render.
    const found = await deactivatedText
        .waitFor({ state: "visible", timeout })
        .then(() => true)
        .catch(() => false);

    if (found) {

        console.log(`✅ CS agent deactivated — process completed successfully.`);
        logSession(`✅ CS agent deactivated — process completed successfully.`);

    } else {

        console.log(`⚠️ CS agent deactivation message not detected within timeout.`);
        logSession(`⚠️ CS agent deactivation message not detected within timeout.`);
    }

    return found;
}


module.exports = {
    activateCSAgent,
    selectCSAgentPhase,
    selectCSAgentSavedRun,
    sendCSAgentChatAnswer,
    waitForCSAgentOnboarding,
    runCSAgentQuestionnaire,
    handleCSAgentReviewCheckpoints,
    waitForCSAgentPhaseComplete,
    validateCSAgentDocxOutput,
    validateCSAgentXlsxOutput,
    answerCSAgentContinuePrompt,
    waitForCSAgentPhase2Pipeline,
    waitForCSAgentPhase3Pipeline,
    waitForCSAgentDeactivated
};
