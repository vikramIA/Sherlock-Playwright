const {
    openWatsonAI,
    enterWatsonAIQuery,
    watchWatsonAISearchRequest,
    waitForWatsonAIResponse,
    WATSONAI_REPORT_DATA_WAIT_MS,
    getWatsonAIChatBaseline,
    waitForWatsonAIReportForm,
    waitForWatsonAIChatReady,
    recoverWatsonAIChat,
    isWatsonAINoResponseError,
    closeWatsonAIReport,
    verifyWatsonAIReportFields,
    clickWatsonAISubmit,
    verifyWatsonAISuccess,
    checkWatsonAIReportSummaryLate,
    watsonAIKeplerValidation
} = require("./WatsonAIFunctions.js");

const { verifyDefaultBentoCharts, SummaryPageReportError } = require("./functions.js");
const { logSession, beginFlow } = require("./Logger");
const { captureFailureScreenshot, explainError } = require("./FailureDiagnostics.js");


async function watsonAIFlow(page, reports) {

    // =====================================================
    // OPEN WATSONAI ONCE
    // If it can't be opened (e.g. the previous flow left the tab frozen on
    // a heavy report), retry once from the home page; if it still fails,
    // mark each WatsonAI report failed and return — throwing here used to
    // abort the whole run and skip CS Agent.
    // =====================================================

    try {
        await openWatsonAI(page);
    } catch (firstError) {
        console.error(`⚠️ Opening WatsonAI failed, retrying from home page: ${firstError.message}`);
        logSession(`⚠️ Opening WatsonAI failed, retrying from home page: ${firstError.message.split("\n")[0]}`);

        try {
            await page.goto(new URL("/", page.url()).href, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(5000);
            await openWatsonAI(page);
        } catch (retryError) {
            const reason = `watsonai_not_opened: ${retryError.message.split("\n")[0]}`;

            for (const inputData of reports) {
                beginFlow("watson_ai");
                logSession(
                    `❌ WatsonAI ${inputData.reportType} failed — WatsonAI could not be opened.`,
                    false,
                    { flow: "watson_ai", report: `WatsonAI ${inputData.reportType} (name not generated)`, report_type: inputData.reportType, outcome: "failure", reason }
                );
            }

            console.error(`❌ WatsonAI could not be opened. Skipping WatsonAI reports and continuing the run.`);
            logSession(`❌ WatsonAI could not be opened. Skipping WatsonAI reports and continuing the run.`);
            return;
        }
    }


    // =====================================================
    // PROCESS EACH WATSONAI REPORT INDEPENDENTLY
    // =====================================================

    for (const inputData of reports) {

        // A report gets a second attempt only when WatsonAI never answered
        // (see isWatsonAINoResponseError) — everything else ends after one.
        for (let attempt = 1; attempt <= 2; attempt++) {

            // Placeholder until WatsonAI generates the real name. Must be unique
            // per input — the run summary counts reports by this name, so a
            // shared "Unknown" merged every early failure into one.
            let actualReportName = `WatsonAI ${inputData.reportType} (name not generated)`;
            let reportOpened = false;
            // Set once Submit is clicked — from then on a report may be open.
            let submitClicked = false;
            // Problems that don't fail the report (it was still created and
            // verified) but must not be reported as a clean success either —
            // they turn the final outcome into "warning".
            const reportWarnings = [];
            beginFlow("watson_ai");

            try {

                const type = inputData.reportType
                    .trim()
                    .toLowerCase();


                console.log(
                    `\n🤖 Starting WatsonAI report: ${inputData.reportType}`
                );

                logSession(
                    `\n🤖 Starting WatsonAI report: ${inputData.reportType}`
                );


                // A previous report (or a dropped connection) can leave the prompt
                // disabled — recover it here instead of failing at typing the query.
                const chatUsable = await waitForWatsonAIChatReady(page, 30000).then(() => true, () => false);

                if (!chatUsable) {
                    await recoverWatsonAIChat(page);
                }


                // =================================================
                // ENTER QUERY
                // =================================================

                // Baseline taken BEFORE this query is submitted — replies,
                // forms and error blocks from earlier queries in this session
                // stay in the chat DOM forever, so the wait below needs this
                // to tell "THIS query got a reply/error" apart from "an old
                // one is still sitting there".
                const chatBaseline = await getWatsonAIChatBaseline(page, inputData.query);

                const searchResponse = watchWatsonAISearchRequest(page);

                await enterWatsonAIQuery(
                    page,
                    inputData.query
                );


                // =================================================
                // WAIT FOR WATSONAI RESPONSE
                // Fails fast with WatsonAI's own reply when it answers
                // with an error or a text-only reply instead of a report
                // form (e.g. the QLI query currently gets no form),
                // instead of timing out on the Report Name field.
                // =================================================

                await waitForWatsonAIResponse(page, searchResponse);

                await waitForWatsonAIReportForm(page, chatBaseline);


                // =================================================
                // VERIFY GENERATED REPORT FIELDS
                // =================================================

                const fieldCheck =
                    await verifyWatsonAIReportFields(
                        page,
                        inputData.verification
                    );

                actualReportName = fieldCheck.reportName;

                if (fieldCheck.fieldWarnings.length > 0) {
                    reportWarnings.push(
                        `field_mismatch: ${fieldCheck.fieldWarnings.join(", ")}`
                    );
                }


                // =================================================
                // SUBMIT REPORT
                // =================================================

                const submitBaseline =
                    await clickWatsonAISubmit(page);

                submitClicked = true;


                // =================================================
                // VERIFY REPORT CREATION + OPEN REPORT
                // =================================================

                const reportValidation =
                    await verifyWatsonAISuccess(
                        page,
                        inputData.expectedMessage,
                        inputData.reportType,
                        { ...submitBaseline, query: inputData.query }
                    );

                // At this point Open Report was clicked
                reportOpened = true;

                // Every WatsonAI-generated report should get a summary. If it
                // hasn't come yet, it is checked once more before the report is
                // closed (a slow one often lands while Kepler/Bento are checked).
                let summaryReceived = reportValidation.summaryReceived;


                // =================================================
                // REPORT TYPE VALIDATION
                // =================================================

                if (!reportValidation.matched) {

                    console.error(
                        `❌ ${inputData.reportType} report type validation failed.`
                    );

                    logSession(
                        `❌ ${inputData.reportType} report type validation failed.`,
                        false,
                        { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "failure", reason: "report_type_mismatch" }
                    );

                    console.error(
                        `Expected reportType: ${reportValidation.expectedType}`
                    );

                    logSession(
                        `Expected reportType: ${reportValidation.expectedType}`
                    );

                    console.error(
                        `Actual reportType: ${reportValidation.actualType}`
                    );

                    logSession(
                        `Actual reportType: ${reportValidation.actualType}`
                    );


                    // =============================================
                    // CLOSE INCORRECT REPORT + RETURN TO CHAT
                    // =============================================

                    await closeWatsonAIReport(page, actualReportName);


                    console.log(
                        `⚠️ Skipping Kepler/Bento validation because report type is incorrect.`
                    );

                    logSession(
                        `⚠️ Skipping Kepler/Bento validation because report type is incorrect.`
                    );

                    console.log(
                        `➡️ Continuing with next WatsonAI report...`
                    );

                    logSession(
                        `➡️ Continuing with next WatsonAI report...`
                    );

                    break;
                }


                // =================================================
                // KEPLER VALIDATION
                // =================================================

                const keplerResult =
                    await watsonAIKeplerValidation(
                        page,
                        actualReportName,
                        reportValidation.reportOpenSeconds
                    );


                console.log(
                    `📊 WatsonAI Kepler validation result: ${keplerResult.status}`
                );

                logSession(
                    `📊 WatsonAI Kepler validation result: ${keplerResult.status}`
                );


                if (keplerResult.status !== "success") {

                    throw new Error(
                        `Kepler validation failed (${keplerResult.status}): ${keplerResult.text}`
                    );
                }


                console.log(
                    `✅ WatsonAI Kepler validation passed for '${actualReportName}'.`
                );

                logSession(
                    `✅ WatsonAI Kepler validation passed for '${actualReportName}'.`
                );


                // =================================================
                // BENTO VALIDATION
                // =================================================

                try {
                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        actualReportName,
                        { maxWaitMs: WATSONAI_REPORT_DATA_WAIT_MS }
                    );
                } catch (bentoError) {
                    // Large report on the summary page with data: loaded, just no Bento.
                    if (!(bentoError instanceof SummaryPageReportError)) throw bentoError;
                    reportWarnings.push(`summary_page_with_data: Total ${bentoError.totalRaw}`);
                }


                if (!summaryReceived) {
                    summaryReceived = await checkWatsonAIReportSummaryLate(page, { ...submitBaseline, query: inputData.query });
                }

                if (!summaryReceived) {
                    reportWarnings.push(
                        "summary_missing: no WatsonAI summary in the chat by the end of validation"
                    );
                }


                // =================================================
                // CLOSE REPORT AFTER SUCCESS + RETURN TO CHAT
                // =================================================

                await closeWatsonAIReport(page, actualReportName);


                // =================================================
                // REPORT COMPLETED
                // =================================================

                if (reportWarnings.length > 0) {

                    const warningReason = reportWarnings.join("; ");

                    console.log(
                        `⚠️ WatsonAI ${inputData.reportType} completed with warnings: ${warningReason}`
                    );

                    logSession(
                        `⚠️ WatsonAI ${inputData.reportType} completed with warnings.`,
                        false,
                        { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "warning", reason: warningReason }
                    );

                } else {

                    console.log(
                        `🎉 WatsonAI ${inputData.reportType} completed successfully.`
                    );

                    logSession(
                        `🎉 WatsonAI ${inputData.reportType} completed successfully.`,
                        false,
                        { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "success" }
                    );
                }

                break;


            } catch (error) {

                // WatsonAI never answered (no reply / no report / chat stuck):
                // get a fresh chat and give the report one more try instead of
                // failing it — and every report after it — on a dropped connection.
                if (attempt === 1 && isWatsonAINoResponseError(error)) {

                    console.log(`⚠️ WatsonAI did not respond for ${inputData.reportType} (${explainError(error)}). Recovering the chat and retrying once...`);
                    logSession(`⚠️ WatsonAI did not respond for ${inputData.reportType} (${explainError(error)}). Recovering the chat and retrying once...`);

                    if (reportOpened || submitClicked) {
                        await closeWatsonAIReport(page, actualReportName, { onlyIfOpen: true });
                    }

                    const recovered = await recoverWatsonAIChat(page).then(() => true, recoverError => {
                        console.error(`❌ ${recoverError.message}`);
                        logSession(`❌ ${recoverError.message}`);
                        return false;
                    });

                    if (recovered) continue;
                }

                // =================================================
                // REPORT FAILED
                // IMPORTANT: DO NOT STOP THE LOOP
                // =================================================

                console.error(
                    `❌ WatsonAI ${inputData.reportType} failed.`
                );

                console.error(
                    `❌ Error: ${error.message}`
                );

                // Prefilled-field problems found before the failure are often
                // its cause (e.g. empty Location -> Submit creates nothing).
                const retried = attempt > 1 ? " (after recovering the chat and retrying once)" : "";
                const reason = reportWarnings.length > 0
                    ? `${explainError(error)}${retried} [earlier: ${reportWarnings.join("; ")}]`
                    : `${explainError(error)}${retried}`;

                const screenshot = await captureFailureScreenshot(page, `watson_${inputData.reportType}`);

                logSession(
                    `❌ WatsonAI ${inputData.reportType} failed.`,
                    false,
                    { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "failure", reason, screenshot }
                );

                logSession(
                    `❌ Error: ${error.message}`
                );


                // =================================================
                // TRY TO CLOSE REPORT IF IT IS OPEN + RETURN TO CHAT
                // =================================================

                // Not only when reportOpened: a failure inside
                // verifyWatsonAISuccess (e.g. at Focus Mode) happens after
                // Open Report was clicked but before reportOpened is set. The
                // prompt stays editable under a Focus Mode report, so the
                // chat-ready check alone missed it — on QA the QLI report was
                // left open and every click of the next two reports timed out.
                if (reportOpened || submitClicked) {

                    await closeWatsonAIReport(page, actualReportName, { onlyIfOpen: true });

                } else {

                    // The prompt stays disabled while a failed query's search
                    // request is still settling, so allow more than a moment.
                    await waitForWatsonAIChatReady(page, 60000)
                        .then(() => {
                            console.log(`✅ WatsonAI chat ready for next report.`);
                            logSession(`✅ WatsonAI chat ready for next report.`);
                        })
                        .catch(chatError => {
                            console.error(`⚠️ WatsonAI chat was not confirmed after failure: ${chatError.message}`);
                            logSession(`⚠️ WatsonAI chat was not confirmed after failure: ${chatError.message}`);
                        });
                }

                // Never hand the next report a stuck chat.
                if (!(await waitForWatsonAIChatReady(page, 5000).then(() => true, () => false))) {
                    await recoverWatsonAIChat(page).catch(recoverError => {
                        console.error(`❌ ${recoverError.message}`);
                        logSession(`❌ ${recoverError.message}`);
                    });
                }


                // =================================================
                // VERY IMPORTANT
                // MOVE TO NEXT REPORT
                // =================================================

                console.log(
                    `➡️ Continuing with next WatsonAI report...`
                );

                logSession(
                    `➡️ Continuing with next WatsonAI report...`
                );

                break;
            }
        }
    }


    // =====================================================
    // ALL REPORTS PROCESSED
    // =====================================================

    console.log(
        `\n🏁 WatsonAI flow completed. All reports were processed.`
    );

    logSession(
        `\n🏁 WatsonAI flow completed. All reports were processed.`
    );
}


module.exports = watsonAIFlow;