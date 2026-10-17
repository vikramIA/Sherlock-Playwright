const { logSession } = require("./Logger");
const { expect } = require("@playwright/test");
const { getLatestWatsonAIReplyText } = require("./WatsonAIFunctions.js");


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

// Also the generic chat error seen on prod (Oct 2026) ~6 min into
// onboarding generation: "Error occurred while processing your request.
// Please try again." — the run then sat out the rest of the 15-min wait
// and only ever logged "browser has been closed".
const CS_AGENT_DISCONNECT_PATTERN =
    /CS agent is having trouble connecting|CS agent disconnected|Error occurred while processing your request/;

// Errors thrown by csAgentStoppedError — callers that treat a timeout as a
// normal outcome must still rethrow these.
const CS_AGENT_STOPPED_ERROR = /^CS Agent (disconnected|showed an error):/;

function csAgentStoppedError(message) {
    return new Error(
        /disconnected|trouble connecting/i.test(message)
            ? `CS Agent disconnected: '${message}'`
            : `CS Agent showed an error: '${message}'`
    );
}

// Old and current (Oct 2026 dev) wording of the "start cs agent" reply.
const CS_AGENT_ACTIVATED_PATTERN =
    /Agent mode activated\.|customer-success agent is on/i;

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

        throw csAgentStoppedError(message);
    }

    if (result.type === "neither") {

        throw result.error;
    }
}


// How many chat items match `pattern` — the smallest elements whose text
// matches, never counting text inside the toast area. With `distinct`, the
// same text counts once.
//
// Verified live on QA (Oct 17 2026): a plain getByText(/^Multilayer /).count()
// also counted the "Multilayer Report Saved Successfully!" toast and each
// report name more than once, so the count went 4 -> 3 -> 4 and "report N
// generated" passed before report N existed.
async function countCSAgentChatItems(page, pattern, { distinct = false } = {}) {
    return page.evaluate(({ source, flags, distinct }) => {
        const regex = new RegExp(source, flags);
        const matches = element => regex.test((element.textContent || "").trim());

        const texts = [...document.querySelectorAll("body *")]
            .filter(element => !["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName))
            .filter(element => !element.closest("[role='region'][aria-label^='Notifications']"))
            .filter(matches)
            .filter(element => ![...element.children].some(matches))
            .map(element => element.textContent.trim());

        return distinct ? new Set(texts).size : texts.length;
    }, { source: pattern.source, flags: pattern.flags, distinct });
}

// Waits until at least `expected` chat items match. Unlike a plain count
// poll it also notices when the agent has MOVED ON (`movedOn()` true) with
// fewer items — e.g. one cohort's report skipped — and returns then instead
// of waiting out the full timeout and failing a run that otherwise finished.
// Returns { count, complete }. Throws on a disconnect/error banner, or when
// nothing moves on within `timeout`.
async function waitForCSAgentChatItems(page, { pattern, expected, timeout, label, distinct = false, movedOn = async () => false }) {

    const disconnectLocator = page.getByText(CS_AGENT_DISCONNECT_PATTERN).last();
    const deadline = Date.now() + timeout;
    let count = 0;

    while (true) {

        count = await countCSAgentChatItems(page, pattern, { distinct });

        if (count >= expected) return { count, complete: true };

        if (await disconnectLocator.isVisible().catch(() => false)) {
            throw csAgentStoppedError((await disconnectLocator.innerText()).trim());
        }

        if (await movedOn()) {
            // Let a late item finish rendering before concluding it's missing.
            await page.waitForTimeout(5000);
            count = await countCSAgentChatItems(page, pattern, { distinct });
            return { count, complete: count >= expected };
        }

        if (Date.now() > deadline) {
            throw new Error(
                `${label}: only ${count} of ${expected} appeared within ${Math.round(timeout / 60000)} min, and the agent did not move on`
            );
        }

        await page.waitForTimeout(2000);
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

        // The activation reply was reworded on dev (Oct 2026) from "Agent
        // mode activated." to "The customer-success agent is on. I'll take
        // you through onboarding — ...". Accept either wording, or the phase
        // selector itself, so a further rewording doesn't break activation.
        const activatedText = page.getByText(CS_AGENT_ACTIVATED_PATTERN)
            .or(page.getByPlaceholder("Select one phase selection"))
            .last();

        try {
            await waitForCSAgentElementOrDisconnect(page, activatedText, 30000);
        } catch (error) {

            if (CS_AGENT_STOPPED_ERROR.test(error.message)) throw error;

            // Currently seen on qa: WatsonAI answers the command like a
            // normal question ("Tell me a little more — which brand or
            // area...") instead of entering agent mode. Surface that reply
            // rather than a bare locator timeout.
            const replyText = await getLatestWatsonAIReplyText(page);

            throw new Error(
                `CS Agent did not activate (no activation message or phase selector within 30s). WatsonAI replied: '${replyText}'`
            );
        }

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

        if (optional && !CS_AGENT_STOPPED_ERROR.test(error.message)) {

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

        // Case-insensitive: the session is created as e.g.
        // "old_world_hospitality_2026-10-06" but listed here as
        // "Old_world_hospitality_2026-10-06".
        const escapedRunName = savedRunName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const runOption = page.getByRole("option", {
            name: new RegExp(`^${escapedRunName}$`, "i")
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

                throw new Error(`CS Agent stopped during questionnaire: '${message}'`);
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
// 8A. ONLYOFFICE VIEWER HELPERS (shared by docx + xlsx)
// Verified live on QA after the OnlyOffice 9.2.1 upgrade (Oct 2026):
//   - The status bar already reads "Page 1 of 1" while "Loading
//     document" is still on screen over a grey placeholder page, so the
//     page count alone passed a document that had not loaded.
//   - The header Close button only exists once the file has loaded
//     (count 0 while loading), which makes it the "loaded" signal.
//   - Closing the spreadsheet now asks "All unsaved changes in this
//     spreadsheet will be lost" (OK / Cancel) — nothing answered it, so
//     the editor iframe never detached (dev Phase 2 failure).
// =========================================================

const ONLYOFFICE_FRAME_SELECTOR = 'iframe[name="frameEditor"]';

// The viewer loads much slower on the VM (software rendering) than locally;
// prod Phase 1 (Oct 12 2026) failed after 60s with the Close button "not
// found" — the viewer was still loading.
const ONLYOFFICE_LOAD_TIMEOUT_MS = 3 * 60 * 1000;

async function waitForOnlyOfficeLoaded(page, timeout) {

    const editorFrame = page.frameLocator(ONLYOFFICE_FRAME_SELECTOR);

    try {

        await expect(
            editorFrame.getByRole("button", { name: "Close", exact: true })
        ).toBeEnabled({ timeout });

        await expect(
            editorFrame.getByText(/^Loading (document|spreadsheet)/i).filter({ visible: true })
        ).toHaveCount(0, { timeout });

    } catch {
        throw new Error(
            `OnlyOffice viewer did not finish loading within ${Math.round(timeout / 1000)}s — ${await describeOnlyOfficeState(page)}`
        );
    }

    return editorFrame;
}

// What the viewer showed when it failed to load, for the failure reason.
async function describeOnlyOfficeState(page) {

    if (await page.locator(ONLYOFFICE_FRAME_SELECTOR).count() === 0) {
        return "the editor iframe never opened";
    }

    const frameText = await page.frameLocator(ONLYOFFICE_FRAME_SELECTOR)
        .locator("body")
        .innerText({ timeout: 5000 })
        .then(text => text.replace(/\s+/g, " ").trim().slice(0, 150))
        .catch(() => "");

    return frameText
        ? `editor showed: '${frameText}'`
        : "editor iframe opened but stayed blank";
}

// Closes the viewer and confirms the iframe is gone. The file was only
// viewed, so the "unsaved changes will be lost" warning is answered with
// OK (discard) — never Save, which would modify the generated output.
async function closeOnlyOfficeViewer(page, label) {

    const editorFrame = page.frameLocator(ONLYOFFICE_FRAME_SELECTOR);
    const iframe = page.locator(ONLYOFFICE_FRAME_SELECTOR);
    const closeButton = editorFrame.getByRole("button", { name: "Close", exact: true });
    const unsavedWarning = editorFrame
        .getByText(/unsaved changes in this \w+ will be lost/i)
        .filter({ visible: true });
    const discardButton = editorFrame
        .getByRole("button", { name: "OK", exact: true })
        .filter({ visible: true })
        .last();

    for (let attempt = 1; attempt <= 2; attempt++) {

        // A busy renderer can stall click() even on a visible, enabled
        // button (QA Phase 1, Oct 2026) — a DOM click doesn't wait on it.
        await closeButton.click({ timeout: 15000 })
            .catch(() => closeButton.evaluate(button => button.click(), null, { timeout: 5000 }))
            .catch(() => { });

        const outcome = await Promise.race([
            iframe.waitFor({ state: "detached", timeout: 15000 }).then(() => "closed"),
            unsavedWarning.first().waitFor({ state: "visible", timeout: 15000 }).then(() => "warning")
        ]).catch(() => "still_open");

        if (outcome === "warning") {

            console.log(`ℹ️ ${label}: OnlyOffice asked about unsaved changes — discarding (the file was only viewed).`);
            logSession(`ℹ️ ${label}: OnlyOffice asked about unsaved changes — discarding (the file was only viewed).`);

            await discardButton.click({ timeout: 10000 });
        }

        if (outcome === "closed" ||
            await iframe.waitFor({ state: "detached", timeout: 15000 }).then(() => true, () => false)) {
            return;
        }

        console.log(`⚠️ ${label} viewer still open after Close (attempt ${attempt}).`);
        logSession(`⚠️ ${label} viewer still open after Close (attempt ${attempt}).`);
    }

    throw new Error(`${label} viewer did not close: the OnlyOffice editor was still open after clicking Close twice.`);
}


// =========================================================
// 8B. OPEN + VALIDATE THE PHASE 1 DOCX OUTPUT
// (Verified live: clicking "Open ....docx" does NOT trigger a
// browser download — it opens a real embedded OnlyOffice editor
// in an iframe named "frameEditor". A genuine, non-empty document
// reports a page count like "Page 1 of 13"; that is the signal
// used here to confirm the file is real and not blank/corrupt.)
// =========================================================

async function validateCSAgentDocxOutput(page, timeout = ONLYOFFICE_LOAD_TIMEOUT_MS) {
    try {

        const openFileButton = page.getByRole("button", {
            name: /^Open .*\.docx$/
        }).last();

        await openFileButton.waitFor({ state: "visible", timeout: 30000 });
        await openFileButton.click();

        console.log(`📄 Opened Phase 1 document for validation.`);
        logSession(`📄 Opened Phase 1 document for validation.`);

        // Page count is only meaningful once the document has loaded (see 8A).
        const editorFrame = await waitForOnlyOfficeLoaded(page, timeout);

        const pageCountText = editorFrame.getByText(/^Page \d+ of \d+$/).first();

        await pageCountText.waitFor({ state: "visible", timeout: 15000 });

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

        // Confirms the viewer actually closed before returning, so the
        // caller isn't left racing a chat prompt still hidden behind
        // a not-yet-dismissed editor overlay.
        await closeOnlyOfficeViewer(page, "Phase 1 document");

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

async function validateCSAgentXlsxOutput(page, timeout = ONLYOFFICE_LOAD_TIMEOUT_MS) {
    try {

        const openFileButton = page.getByRole("button", {
            name: /^Open .*\.xlsx$/
        }).last();

        await openFileButton.waitFor({ state: "visible", timeout: 30000 });
        await openFileButton.click();

        console.log(`📊 Opened Phase 2 spreadsheet for validation.`);
        logSession(`📊 Opened Phase 2 spreadsheet for validation.`);

        const editorFrame = await waitForOnlyOfficeLoaded(page, timeout);

        const sheetTabs = editorFrame.locator("#statusbar_bottom li.list-item");

        await sheetTabs.first().waitFor({ state: "visible", timeout: 15000 });

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

        await closeOnlyOfficeViewer(page, "Phase 2 spreadsheet");

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

        // ~1.5 min on QA/prod runs (Oct 2026), but slower days hit the old
        // 8 min limit ("locator.waitFor: Timeout 480000ms exceeded").
        // The strategy-changes prompt that follows also proves this step
        // finished, so either one ends the wait. A disconnect/error banner
        // still fails it right away.
        const strategyText = page.getByText("Generated strategy")
            .or(page.getByText("Would you like to make changes to the strategy above?"))
            .last();

        await waitForCSAgentElementOrDisconnect(page, strategyText, 15 * 60 * 1000);

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


        // Problems that didn't stop the agent (it moved on and finished)
        // but must not pass as a clean success either.
        const warnings = [];

        const reviewPromptPattern = /^Please review and modify the following query parameters\.?$/;
        const deactivated = () => page.getByText("CS agent deactivated").last().isVisible().catch(() => false);
        const reviewFormCount = () => countCSAgentChatItems(page, reviewPromptPattern);

        const recordShortfall = (what, result) => {
            if (result.complete) return;
            const warning = `phase3_${what}_short: ${result.count}/${cohortCount}`;
            warnings.push(warning);
            console.log(`⚠️ Phase 3: the agent moved on with only ${result.count} of ${cohortCount} ${what} report(s).`);
            logSession(`⚠️ Phase 3: the agent moved on with only ${result.count} of ${cohortCount} ${what} report(s).`);
        };


        // =====================================================
        // VISITATION REPORTS
        // =====================================================

        currentStep = `${cohortCount} visitation report(s)`;
        console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

        const visitation = await waitForCSAgentChatItems(page, {
            pattern: /^Visitation report for /,
            expected: cohortCount,
            distinct: true,
            timeout: 10 * 60 * 1000,
            label: "Visitation reports",
            movedOn: async () =>
                (await countCSAgentChatItems(page, /^Places report for /)) > 0 ||
                (await reviewFormCount()) > 0 ||
                (await deactivated())
        });

        recordShortfall("visitation", visitation);

        console.log(`✅ ${visitation.count} of ${cohortCount} visitation report(s) generated.`);
        logSession(`✅ ${visitation.count} of ${cohortCount} visitation report(s) generated.`);


        // =====================================================
        // POI (PLACES) REPORTS
        // =====================================================

        currentStep = `${cohortCount} POI report(s)`;
        console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
        logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

        const places = await waitForCSAgentChatItems(page, {
            pattern: /^Places report for /,
            expected: cohortCount,
            distinct: true,
            timeout: 10 * 60 * 1000,
            label: "POI reports",
            movedOn: async () => (await reviewFormCount()) > 0 || (await deactivated())
        });

        recordShortfall("poi", places);

        console.log(`✅ ${places.count} of ${cohortCount} POI report(s) generated.`);
        logSession(`✅ ${places.count} of ${cohortCount} POI report(s) generated.`);


        // =====================================================
        // MULTILAYER REPORTS
        // (one "review query parameters" form per cohort)
        //
        // Verified live: every submitted form stays in the chat with its
        // Submit button disabled. So the form for cohort i is "the
        // (i+1)-th review prompt" — the old .last() matched the previous,
        // already-submitted form at once and then waited only 3 min for
        // the next form's Submit to turn enabled, failing as
        // "toBeEnabled() failed" whenever the next form was slow.
        // =====================================================

        // Report names ("Multilayer <cohort>"), not the "Multilayer Report
        // Saved Successfully!" toast.
        const multilayerNamePattern = /^Multilayer (?!Report Saved)/;
        let formsShown = 0;
        let multilayerCount = 0;

        for (let i = 0; i < cohortCount; i++) {

            currentStep = `multilayer query-parameter review for cohort ${i + 1}/${cohortCount}`;
            console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
            logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

            const form = await waitForCSAgentChatItems(page, {
                pattern: reviewPromptPattern,
                expected: i + 1,
                timeout: 10 * 60 * 1000,
                label: `Multilayer review form for cohort ${i + 1}`,
                movedOn: deactivated
            });

            if (!form.complete) break;

            formsShown = i + 1;

            const submitButton = page.getByRole("button", {
                name: "Submit",
                exact: true
            }).last();

            // Submit renders disabled until the form finishes populating
            // (observed live to take well past 60s for some cohorts).
            try {
                await expect(submitButton).toBeEnabled({ timeout: 3 * 60 * 1000 });
            } catch {
                throw new Error(
                    `Multilayer review form for cohort ${i + 1} appeared, but its Submit button stayed disabled for 3 min`
                );
            }

            await submitButton.click();

            console.log(`✅ Submitted multilayer report parameters for cohort ${i + 1}/${cohortCount}.`);
            logSession(`✅ Submitted multilayer report parameters for cohort ${i + 1}/${cohortCount}.`);

            currentStep = `multilayer report generation for cohort ${i + 1}/${cohortCount}`;
            console.log(`⏳ Phase 3: waiting for ${currentStep}...`);
            logSession(`⏳ Phase 3: waiting for ${currentStep}...`);

            const multilayer = await waitForCSAgentChatItems(page, {
                pattern: multilayerNamePattern,
                expected: i + 1,
                distinct: true,
                timeout: 10 * 60 * 1000,
                label: `Multilayer report for cohort ${i + 1}`,
                movedOn: async () => (await reviewFormCount()) > i + 1 || (await deactivated())
            });

            multilayerCount = multilayer.count;
        }

        if (formsShown < cohortCount) {
            warnings.push(`phase3_multilayer_forms_short: ${formsShown}/${cohortCount}`);
            console.log(`⚠️ Phase 3: the agent finished after only ${formsShown} of ${cohortCount} multilayer review form(s).`);
            logSession(`⚠️ Phase 3: the agent finished after only ${formsShown} of ${cohortCount} multilayer review form(s).`);
        }

        recordShortfall("multilayer", { count: multilayerCount, complete: multilayerCount >= cohortCount });

        console.log(`✅ ${multilayerCount} of ${cohortCount} multilayer report(s) generated.`);
        logSession(`✅ ${multilayerCount} of ${cohortCount} multilayer report(s) generated.`);

        return warnings;

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
