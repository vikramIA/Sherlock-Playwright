const {
    openWatsonAI,
    enterWatsonAIQuery,
    watchWatsonAISearchRequest,
    waitForWatsonAIResponse,
    WATSONAI_SUMMARY_TIMEOUT_MS,
    getWatsonAIChatBaseline,
    waitForWatsonAIReportForm,
    waitForWatsonAIChatReady,
    closeWatsonAIReport,
    verifyWatsonAIReportFields,
    clickWatsonAISubmit,
    verifyWatsonAISuccess,
    watsonAIKeplerValidation
} = require("./WatsonAIFunctions.js");

const { verifyDefaultBentoCharts } = require("./functions.js");
const { logSession, beginFlow } = require("./Logger");


async function watsonAIFlow(page, reports) {

    // =====================================================
    // OPEN WATSONAI ONCE
    // =====================================================

    await openWatsonAI(page);


    // =====================================================
    // PROCESS EACH WATSONAI REPORT INDEPENDENTLY
    // =====================================================

    for (const inputData of reports) {

        // Placeholder until WatsonAI generates the real name. Must be unique
        // per input — the run summary counts reports by this name, so a
        // shared "Unknown" merged every early failure into one.
        let actualReportName = `WatsonAI ${inputData.reportType} (name not generated)`;
        let reportOpened = false;
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


            // =================================================
            // ENTER QUERY
            // =================================================

            // Baseline taken BEFORE this query is submitted — replies,
            // forms and error blocks from earlier queries in this session
            // stay in the chat DOM forever, so the wait below needs this
            // to tell "THIS query got a reply/error" apart from "an old
            // one is still sitting there".
            const chatBaseline = await getWatsonAIChatBaseline(page);

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

            const previousOpenReportCount =
                await clickWatsonAISubmit(page);


            // =================================================
            // VERIFY REPORT CREATION + OPEN REPORT
            // =================================================

            const reportValidation =
                await verifyWatsonAISuccess(
                    page,
                    inputData.expectedMessage,
                    inputData.reportType,
                    previousOpenReportCount
                );

            // At this point Open Report was clicked
            reportOpened = true;

            // Every WatsonAI-generated report should get a summary.
            if (!reportValidation.summaryReceived) {
                reportWarnings.push(
                    `summary_missing: no WatsonAI summary within ${Math.round(WATSONAI_SUMMARY_TIMEOUT_MS / 1000)}s`
                );
            }


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

                continue;
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
                `📊 WatsonAI Kepler validation result: ${keplerResult}`
            );

            logSession(
                `📊 WatsonAI Kepler validation result: ${keplerResult}`
            );


            if (keplerResult !== "success") {

                throw new Error(
                    `Kepler validation failed. ` +
                    `Status: ${keplerResult}`
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

            await verifyDefaultBentoCharts(
                page,
                inputData.reportType,
                actualReportName
            );


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


        } catch (error) {

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

            logSession(
                `❌ WatsonAI ${inputData.reportType} failed.`,
                false,
                { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "failure", reason: error.message }
            );

            logSession(
                `❌ Error: ${error.message}`
            );


            // =================================================
            // TRY TO CLOSE REPORT IF IT IS OPEN + RETURN TO CHAT
            // =================================================

            if (reportOpened) {

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

            continue;
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