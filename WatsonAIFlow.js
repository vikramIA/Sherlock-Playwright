const {
    openWatsonAI,
    enterWatsonAIQuery,
    waitForWatsonAIResponse,
    checkWatsonAIQueryError,
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

        let actualReportName = "Unknown";
        let reportOpened = false;
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

            await enterWatsonAIQuery(
                page,
                inputData.query
            );


            // =================================================
            // WAIT FOR WATSONAI RESPONSE
            // =================================================

            await waitForWatsonAIResponse(page);


            // =================================================
            // CHECK FOR A WATSONAI QUERY-LEVEL ERROR
            // (e.g. "Failed to fetch Sherlock search results")
            // Must run BEFORE looking for report fields, otherwise
            // we just wait/time out searching for a field that
            // will never appear.
            // =================================================

            await checkWatsonAIQueryError(page);


            // =================================================
            // VERIFY GENERATED REPORT FIELDS
            // =================================================

            actualReportName =
                await verifyWatsonAIReportFields(
                    page,
                    inputData.verification
                );


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
                // CLOSE INCORRECT REPORT
                // =============================================

                try {

                    const crossIcon = page.locator(
                        "svg.cursor-pointer.fill-button-destructive-base"
                    );

                    await crossIcon.waitFor({
                        state: "visible",
                        timeout: 30000
                    });

                    console.log(
                        `❌ Closing incorrectly generated WatsonAI report: '${actualReportName}'`
                    );

                    logSession(
                        `❌ Closing incorrectly generated WatsonAI report: '${actualReportName}'`
                    );

                    await crossIcon.click();

                } catch (closeError) {

                    console.error(
                        `⚠️ Could not close incorrect report: ${closeError.message}`
                    );

                    logSession(
                        `⚠️ Could not close incorrect report: ${closeError.message}`
                    );
                }


                // =============================================
                // RETURN TO WATSONAI CHAT
                // =============================================

                try {

                    const queryInput = page.getByPlaceholder(
                        "Ask a question or make a command"
                    );

                    await queryInput.waitFor({
                        state: "visible",
                        timeout: 30000
                    });

                    console.log(
                        `✅ Returned to WatsonAI chat.`
                    );

                    logSession(
                        `✅ Returned to WatsonAI chat.`
                    );

                } catch (chatError) {

                    console.error(
                        `⚠️ Could not confirm WatsonAI chat: ${chatError.message}`
                    );

                    logSession(
                        `⚠️ Could not confirm WatsonAI chat: ${chatError.message}`
                    );
                }


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
            // CLOSE REPORT AFTER SUCCESS
            // =================================================

            try {

                const crossIcon = page.locator(
                    "svg.cursor-pointer.fill-button-destructive-base"
                );

                await crossIcon.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                console.log(
                    `❌ Closing WatsonAI report: '${actualReportName}'`
                );

                logSession(
                    `❌ Closing WatsonAI report: '${actualReportName}'`
                );

                await crossIcon.click();

            } catch (closeError) {

                console.error(
                    `⚠️ Failed to close WatsonAI report: ${closeError.message}`
                );

                logSession(
                    `⚠️ Failed to close WatsonAI report: ${closeError.message}`
                );
            }


            // =================================================
            // WAIT FOR WATSONAI CHAT
            // =================================================

            try {

                const queryInput = page.getByPlaceholder(
                    "Ask a question or make a command"
                );

                await queryInput.waitFor({
                    state: "visible",
                    timeout: 30000
                });

                console.log(
                    `✅ Returned to WatsonAI chat.`
                );

                logSession(
                    `✅ Returned to WatsonAI chat.`
                );

            } catch (chatError) {

                console.error(
                    `⚠️ Could not confirm WatsonAI chat: ${chatError.message}`
                );

                logSession(
                    `⚠️ Could not confirm WatsonAI chat: ${chatError.message}`
                );
            }


            // =================================================
            // REPORT COMPLETED
            // =================================================

            console.log(
                `🎉 WatsonAI ${inputData.reportType} completed successfully.`
            );

            logSession(
                `🎉 WatsonAI ${inputData.reportType} completed successfully.`,
                false,
                { flow: "watson_ai", report: actualReportName, report_type: inputData.reportType, outcome: "success" }
            );


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
            // TRY TO CLOSE REPORT IF IT IS OPEN
            // =================================================

            if (reportOpened) {

                try {

                    const crossIcon = page.locator(
                        "svg.cursor-pointer.fill-button-destructive-base"
                    );

                    if (
                        await crossIcon.isVisible({
                            timeout: 5000
                        }).catch(() => false)
                    ) {

                        console.log(
                            `🔄 Attempting to close failed WatsonAI report...`
                        );

                        logSession(
                            `🔄 Attempting to close failed WatsonAI report...`
                        );

                        await crossIcon.click();

                    }

                } catch (closeError) {

                    console.error(
                        `⚠️ Failed to close report after error: ${closeError.message}`
                    );

                    logSession(
                        `⚠️ Failed to close report after error: ${closeError.message}`
                    );
                }
            }


            // =================================================
            // WAIT FOR WATSONAI CHAT
            // =================================================

            try {

                const queryInput = page.getByPlaceholder(
                    "Ask a question or make a command"
                );

                await queryInput.waitFor({
                    state: "visible",
                    timeout: 15000
                });

                console.log(
                    `✅ WatsonAI chat ready for next report.`
                );

                logSession(
                    `✅ WatsonAI chat ready for next report.`
                );

            } catch (chatError) {

                console.error(
                    `⚠️ WatsonAI chat was not confirmed after failure: ${chatError.message}`
                );

                logSession(
                    `⚠️ WatsonAI chat was not confirmed after failure: ${chatError.message}`
                );
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