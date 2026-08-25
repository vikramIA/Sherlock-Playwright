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

const { openWatsonAI } = require("./WatsonAIFunctions.js");
const { logSession, beginFlow } = require("./Logger");


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
    await selectCSAgentPhase(page, "Phase1", { optional: true });

    await sendCSAgentChatAnswer(page, testCase.companyName);
    await sendCSAgentChatAnswer(page, testCase.problemStatement);

    await waitForCSAgentOnboarding(page, testCase.companyName);
    await runCSAgentQuestionnaire(page, testCase.questionnaire || []);
    await handleCSAgentReviewCheckpoints(page);

    await waitForCSAgentPhaseComplete(page, 1, "docx");
    await validateCSAgentDocxOutput(page);
    await answerCSAgentContinuePrompt(page, 2, !!testCase.continueToPhase2);

    if (!testCase.continueToPhase2) return;

    await waitForCSAgentPhase2Pipeline(page);
    await waitForCSAgentPhaseComplete(page, 2, "xlsx");
    await validateCSAgentXlsxOutput(page);
    await answerCSAgentContinuePrompt(page, 3, !!testCase.continueToPhase3);

    if (!testCase.continueToPhase3) return;

    await waitForCSAgentPhase3Pipeline(page);
}


// =========================================================
// MODE "resume": start directly at Phase 2 or Phase 3 for a
// company that already has a saved run, and verify it picks
// up that run's stored data instead of re-asking onboarding.
// =========================================================

async function runResumeCSAgentCase(page, testCase) {

    await selectCSAgentPhase(page, testCase.phase);
    await selectCSAgentSavedRun(page, testCase.savedRun);

    if (testCase.phase === "Phase2") {

        await waitForCSAgentPhase2Pipeline(page);
        await waitForCSAgentPhaseComplete(page, 2, "xlsx");
        await validateCSAgentXlsxOutput(page);
        await answerCSAgentContinuePrompt(page, 3, !!testCase.continueToNextPhase);

        if (!testCase.continueToNextPhase) return;

        await waitForCSAgentPhase3Pipeline(page);

    } else if (testCase.phase === "Phase3") {

        await waitForCSAgentPhase3Pipeline(page);

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
            // NOT bounce back to the SherlockAI home page. The profile
            // menu's toggle button flips between "Switch to WatsonAI"
            // and "Switch to SherlockAI" depending on which mode is
            // currently active, and openWatsonAI() only ever looks for
            // the former — so calling it unconditionally after a reload
            // that keeps us in WatsonAI mode fails deterministically.
            // Check for the chat interface itself (ground truth) instead
            // of assuming which button label will be showing.
            // =================================================

            await page.reload({ waitUntil: "networkidle", timeout: 60000 });

            const alreadyInWatsonAI = await page
                .getByPlaceholder("Ask a question or make a command", { exact: true })
                .isVisible({ timeout: 5000 })
                .catch(() => false);

            if (!alreadyInWatsonAI) {
                await openWatsonAI(page);
            }

            await activateCSAgent(page);

            if (testCase.mode === "fresh") {
                await runFreshCSAgentCase(page, testCase);
            } else if (testCase.mode === "resume") {
                await runResumeCSAgentCase(page, testCase);
            } else {
                throw new Error(`Unknown CS Agent test case mode: '${testCase.mode}'`);
            }

            await waitForCSAgentDeactivated(page);

            console.log(`🎉 CS Agent test case '${testCase.mode}' completed successfully.`);
            logSession(`🎉 CS Agent test case '${testCase.mode}' completed successfully.`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode, outcome: "success" });

        } catch (error) {

            // =================================================
            // IMPORTANT: DO NOT STOP THE LOOP
            // =================================================

            console.error(`❌ CS Agent test case '${testCase.mode}' failed.`);
            console.error(`❌ Error: ${error.message}`);

            logSession(`❌ CS Agent test case '${testCase.mode}' failed.`, false, { flow: "cs_agent", report: caseId, mode: testCase.mode, outcome: "failure", reason: error.message });
            logSession(`❌ Error: ${error.message}`);

            console.log(`➡️ Continuing with next CS Agent test case...`);
            logSession(`➡️ Continuing with next CS Agent test case...`);
        }
    }

    console.log(`\n🏁 CS Agent flow completed. All test cases were processed.`);
    logSession(`\n🏁 CS Agent flow completed. All test cases were processed.`);
}


module.exports = csAgentFlow;
