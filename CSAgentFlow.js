const {
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
} = require("./CSAgentFunctions.js");

const { openWatsonAI, getLatestWatsonAIReplyText } = require("./WatsonAIFunctions.js");
const { logSession, beginFlow } = require("./Logger");
const { captureFailureScreenshot, explainError } = require("./FailureDiagnostics.js");


// The step the current test case is on. A bare Playwright error ("locator.
// waitFor: Timeout 480000ms exceeded", "expect(locator).toBeEnabled()
// failed") said nothing about WHERE the CS Agent run stopped, so every
// failure had to be checked in the video. The failure reason now names it.
let currentStep = "starting";

async function step(name, action) {
    currentStep = name;
    return action();
}

// Failure reason for Slack: the step, a readable cause, and what the chat
// showed last (tells "agent errored/stalled" apart from "script missed it").
function describeCSAgentFailure(stepName, error, lastReply) {

    // Playwright colours its messages with ANSI codes.
    const stripAnsi = text => String(text).replace(/\x1b\[[0-9;]*m/g, "");
    const message = stripAnsi(error?.message || error);
    let cause = stripAnsi(explainError(error));

    // Our own errors are already readable — keep those as they are.
    if (/^(locator\.|expect\(|page\.|frame\.|TimeoutError)/.test(cause)) {
        const timeoutMs = Number((message.match(/Timeout:? (\d+)ms/) || [])[1]);
        const waitedFor = timeoutMs
            ? (timeoutMs >= 60000 ? `${Math.round(timeoutMs / 60000)} min` : `${Math.round(timeoutMs / 1000)}s`)
            : null;

        if (/toBeGreaterThanOrEqual/.test(message)) {
            const expected = (message.match(/Expected:\s*>=\s*(\d+)/) || [])[1];
            const received = (message.match(/Received:\s*(\d+)/) || [])[1];
            cause = `only ${received ?? "?"} of ${expected ?? "?"} expected items appeared${waitedFor ? ` within ${waitedFor}` : ""}`;
        } else if (/element\(s\) not found/.test(message)) {
            cause = `expected element never appeared${waitedFor ? ` within ${waitedFor}` : ""}`;
        } else if (/toBeEnabled/.test(message)) {
            cause = `button stayed disabled${waitedFor ? ` for ${waitedFor}` : ""}`;
        } else if (waitedFor) {
            cause = `timed out after ${waitedFor}`;
        }
    }

    const chat = lastReply ? ` | last chat reply: '${lastReply.slice(0, 120)}'` : "";

    return `${stepName}: ${cause}${chat}`;
}


// =========================================================
// MODE "fresh": start a brand-new company at Phase 1 and
// (optionally) chain straight through Phase 2 -> Phase 3
// via the "continue to next phase?" prompts.
// =========================================================

async function runFreshCSAgentCase(page, testCase) {

    // Only a user's very first-ever CS Agent run skips the phase choice
    // entirely and goes straight to asking for the company name (Phase 1
    // being the implicit default there). Every run after that shows the
    // phase selector, even when starting a brand-new company via "fresh".
    // `optional: true` skips the selection step instead of failing on that
    // first-run case, and still selects Phase1 normally whenever the
    // selector does appear.
    await step("Phase 1: phase selection", () => selectCSAgentPhase(page, "Phase1", { optional: true }));

    await step("Phase 1: company name", () => sendCSAgentChatAnswer(page, testCase.companyName));
    await step("Phase 1: problem statement", () => sendCSAgentChatAnswer(page, testCase.problemStatement));

    await step("Phase 1: onboarding data generation", () => waitForCSAgentOnboarding(page, testCase.companyName));
    await step("Phase 1: questionnaire", () => runCSAgentQuestionnaire(page, testCase.questionnaire || []));
    await step("Phase 1: review checkpoints", () => handleCSAgentReviewCheckpoints(page));

    await step("Phase 1: 'Phase 1 complete!' + docx", () => waitForCSAgentPhaseComplete(page, 1, "docx"));
    await step("Phase 1: docx viewer", () => validateCSAgentDocxOutput(page));
    await step("Phase 1: continue-to-phase-2 prompt", () => answerCSAgentContinuePrompt(page, 2, !!testCase.continueToPhase2));

    if (!testCase.continueToPhase2) return [];

    await step("Phase 2: cohort pipeline", () => waitForCSAgentPhase2Pipeline(page));
    await step("Phase 2: 'Phase 2 complete!' + xlsx", () => waitForCSAgentPhaseComplete(page, 2, "xlsx"));
    await step("Phase 2: xlsx viewer", () => validateCSAgentXlsxOutput(page));
    await step("Phase 2: continue-to-phase-3 prompt", () => answerCSAgentContinuePrompt(page, 3, !!testCase.continueToPhase3));

    if (!testCase.continueToPhase3) return [];

    return step("Phase 3: report creation", () => waitForCSAgentPhase3Pipeline(page));
}


// =========================================================
// MODE "resume": start directly at Phase 2 or Phase 3 for a
// company that already has a saved run, and verify it picks
// up that run's stored data instead of re-asking onboarding.
// =========================================================

async function runResumeCSAgentCase(page, testCase) {

    await step(`${testCase.phase}: phase selection`, () => selectCSAgentPhase(page, testCase.phase));
    await step(`${testCase.phase}: saved run selection`, () => selectCSAgentSavedRun(page, testCase.savedRun));

    if (testCase.phase === "Phase2") {

        await step("Phase 2: cohort pipeline", () => waitForCSAgentPhase2Pipeline(page));
        await step("Phase 2: 'Phase 2 complete!' + xlsx", () => waitForCSAgentPhaseComplete(page, 2, "xlsx"));
        await step("Phase 2: xlsx viewer", () => validateCSAgentXlsxOutput(page));
        await step("Phase 2: continue-to-phase-3 prompt", () => answerCSAgentContinuePrompt(page, 3, !!testCase.continueToNextPhase));

        if (!testCase.continueToNextPhase) return [];

        return step("Phase 3: report creation", () => waitForCSAgentPhase3Pipeline(page));

    } else if (testCase.phase === "Phase3") {

        return step("Phase 3: report creation", () => waitForCSAgentPhase3Pipeline(page));

    } else {

        throw new Error(
            `Resume mode only supports starting from 'Phase2' or 'Phase3', got '${testCase.phase}'.`
        );
    }
}


// =========================================================
// CS AGENT FLOW ENTRY POINT
// =========================================================

async function csAgentFlow(page, testCases = []) {

    for (const testCase of testCases) {

        const caseId = testCase.companyName || testCase.savedRun || testCase.mode;
        beginFlow("cs_agent");
        currentStep = "reset + activation";

        try {

            console.log(`\n🤖 Starting CS Agent test case: '${testCase.mode}'`);
            logSession(`\n🤖 Starting CS Agent test case: '${testCase.mode}'`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode });

            // =================================================
            // RESET BEFORE EACH TEST CASE
            // A previous test case can leave the CS Agent chat
            // mid-flow (input disabled) or with stale "Generated
            // strategy" / "Phase N complete!" text still in the
            // DOM that a later .last() lookup could wrongly match
            // as belonging to THIS test case. Reloading gives every
            // test case a genuinely clean WatsonAI chat.
            //
            // Verified live: reloading while already on /watsonai
            // stays on /watsonai with a fresh, empty chat — it does
            // NOT bounce back to the SherlockAI home page. openWatsonAI()
            // now handles the already-there case itself (the profile
            // menu shows "Switch to SherlockAI" instead of "Switch to
            // WatsonAI" when that's true), but it's still worth skipping
            // the extra profile-icon click entirely when we can already
            // see the chat interface — ground truth for "are we in
            // WatsonAI" — right after the reload.
            //
            // NOTE: use waitFor(), not isVisible({ timeout }) — isVisible()
            // is a one-shot check that doesn't actually poll despite taking
            // a timeout option, so right after a reload it can catch the
            // chat UI mid-render and wrongly report "not visible" before
            // it's had a chance to paint.
            // =================================================

            await page.reload({ waitUntil: "networkidle", timeout: 60000 });

            const alreadyInWatsonAI = await page
                .getByPlaceholder("Ask a question or make a command", { exact: true })
                .waitFor({ state: "visible", timeout: 5000 })
                .then(() => true)
                .catch(() => false);

            if (!alreadyInWatsonAI) {
                await openWatsonAI(page);
            }

            await step("activation ('start cs agent')", () => activateCSAgent(page));

            // Problems that didn't stop the run (e.g. fewer Phase 3 reports
            // than cohorts) — they make the outcome "warning", not success.
            let warnings = [];

            if (testCase.mode === "fresh") {
                warnings = (await runFreshCSAgentCase(page, testCase)) || [];
            } else if (testCase.mode === "resume") {
                warnings = (await runResumeCSAgentCase(page, testCase)) || [];
            } else {
                throw new Error(`Unknown CS Agent test case mode: '${testCase.mode}'`);
            }

            await waitForCSAgentDeactivated(page);

            if (warnings.length > 0) {
                const warningReason = warnings.join("; ");
                console.log(`⚠️ CS Agent test case '${testCase.mode}' completed with warnings: ${warningReason}`);
                logSession(`⚠️ CS Agent test case '${testCase.mode}' completed with warnings.`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode, outcome: "warning", reason: warningReason });
            } else {
                console.log(`🎉 CS Agent test case '${testCase.mode}' completed successfully.`);
                logSession(`🎉 CS Agent test case '${testCase.mode}' completed successfully.`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode, outcome: "success" });
            }

        } catch (error) {

            // =================================================
            // IMPORTANT: DO NOT STOP THE LOOP
            // =================================================

            console.error(`❌ CS Agent test case '${testCase.mode}' failed.`);
            console.error(`❌ Error: ${error.message}`);

            const screenshot = await captureFailureScreenshot(page, `cs_agent_${caseId}`);

            const lastReply = page.isClosed()
                ? ""
                : await getLatestWatsonAIReplyText(page, 200).catch(() => "");

            const reason = describeCSAgentFailure(currentStep, error, lastReply);

            logSession(`❌ CS Agent test case '${testCase.mode}' failed.`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode, outcome: "failure", reason, screenshot });
            logSession(`❌ Error: ${error.message}`);

            console.log(`➡️ Continuing with next CS Agent test case...`);
            logSession(`➡️ Continuing with next CS Agent test case...`);
        }
    }

    console.log(`\n🏁 CS Agent flow completed. All test cases were processed.`);
    logSession(`\n🏁 CS Agent flow completed. All test cases were processed.`);
}


module.exports = csAgentFlow;
