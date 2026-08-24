const { logSession, beginFlow } = require('./Logger');
const {
    selectBehaviors, selectAgeRanges, clearSearchBar, uploadAudiences, searchAndClickReport, selectDateRange, clickCreateReportButton, enterReportName,
    selectExploreReportType, keplerDatasetsFetch, Report_To_Persona_Flow, selectSubCategory, selectBrands, SelectRating, SelectReviewCount,
    SelectVisitDuration, SelectAverageDailyVisits, SelectAverageMonthlyVisits, SelectAverageDailyDevices, SelectAverageMonthlyDevices,
    selectAvailableAttributes, SelectQualityLifeScore, safeWait } = require('./functions');


async function postUploadExploreReportFlow(page, inputData, isForMultilayer = false, multilayerReportsMap = false) {
    const randomSuffix = () => Math.random().toString(36).substring(2, 7);
    inputData.reportName = `${inputData.reportName}: ${randomSuffix()}`;
    beginFlow("post_upload_explore");

    try {
        // Step 1: Navigate to Explore and create a new report
        try {
            const createBtnXPath = "//button[@data-sidebar='menu-button' and .//span[text()='Create Report']]";
            await page.locator(createBtnXPath).click();
            console.log(`✅ Clicked 'Create Report' for ${inputData.reportName}`);
            logSession(`✅ Clicked 'Create Report' for ${inputData.reportName}`, false, { report: inputData.reportName })
        } catch (err) {
            console.error(`❌ Failed during navigation: ${err.message}`);
            logSession(`❌ Failed during navigation: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
            return;
        }

        // Step 2: Wait and select Report Type
        try {
            await safeWait(page, 3000);
            await selectExploreReportType(page, inputData.reportType);
            const type = inputData.reportType.trim().toLowerCase();

            // --------- PLACE LEVEL VISITS ---------
            if (type === 'place level visits') {
                try {
                    const reportName = await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectDateRange(page, inputData.StartDateRange, inputData.EndDateRange);
                    await safeWait(page, 1000);

                    await selectAvailableAttributes(page, inputData.attributes, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectSubCategory(page, inputData.SubCategory, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectBrands(page, inputData.Brands, inputData.reportName);
                    await safeWait(page, 3000);

                    await SelectRating(page, inputData.Rating, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectReviewCount(page, inputData.ReviewCount, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyVisits(page, inputData.AverageDailyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyVisits(page, inputData.AverageMonthlyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyDevices(page, inputData.AverageDailyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyDevices(page, inputData.AverageMonthlyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await clickCreateReportButton(page, inputData.reportName);
                    await safeWait(page, 1000);

                    const result = await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    if (result.status === 'no_data' || result.status === 'error' || result.status === 'timeout' || result.status === 'summary') {
                        console.log(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`);
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    if (inputData.Persona?.toUpperCase() === "YES") {
                        await Report_To_Persona_Flow(page, inputData.reportName);
                    }

                    if (Array.isArray(inputData.UploadAudience) && inputData.UploadAudience.length > 0) {
                        for (const platform of inputData.UploadAudience) {
                            try {
                                console.log(`--- Starting upload process for platform: ${platform} ---`);
                                logSession(`--- Starting upload process for platform: ${platform} ---`);
                                await searchAndClickReport(page, reportName);
                                await safeWait(page, 2000);

                                await uploadAudiences(page, [platform]);
                                await safeWait(page, 2000);

                                await clearSearchBar(page);
                                await safeWait(page, 2000);
                            } catch (err) {
                                console.error(`❌ Upload process failed for platform ${platform}: ${err.message}`);
                                logSession(`❌ Upload process failed for platform ${platform}: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                            }
                        }
                    }

                } catch (err) {
                    console.error(`❌ Error in 'place level visits' flow: ${err.message}`);
                    logSession(`❌ Error in 'place level visits' flow: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- DEVICE LEVEL VISITS ---------
            else if (type === 'device level visits') {
                try {
                    const DeviceReportName = await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectDateRange(page, inputData.StartDateRange, inputData.EndDateRange);
                    await safeWait(page, 1000);

                    await selectSubCategory(page, inputData.SubCategory, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectQualityLifeScore(page, inputData.QualityLifeScore, inputData.reportName);
                    await safeWait(page, 1000);

                    await selectBehaviors(page, inputData.behaviors, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectAgeRanges(page, inputData.age, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectBrands(page, inputData.Brands, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectRating(page, inputData.Rating, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectReviewCount(page, inputData.ReviewCount, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectVisitDuration(page, inputData.VisitDuration, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyVisits(page, inputData.AverageDailyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyVisits(page, inputData.AverageMonthlyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyDevices(page, inputData.AverageDailyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyDevices(page, inputData.AverageMonthlyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await clickCreateReportButton(page, inputData.reportName);

                    const result = await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    if (result.status === 'no_data' || result.status === 'error' || result.status === 'timeout' || result.status === 'summary') {
                        console.log(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`);
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    if (inputData.Persona?.toUpperCase() === "YES") {
                        await Report_To_Persona_Flow(page, inputData.reportName);
                    }

                    if (Array.isArray(inputData.UploadAudience) && inputData.UploadAudience.length > 0) {
                        for (const platform of inputData.UploadAudience) {
                            try {
                                console.log(`--- Starting upload process for platform: ${platform} ---`);
                                logSession(`--- Starting upload process for platform: ${platform} ---`);

                                // SPA-safe, retry-enabled report selection
                                try {
                                    await searchAndClickReport(page, DeviceReportName, 1); // retry once if fails
                                    await safeWait(page, 2000);
                                } catch (err) {
                                    console.warn(`⚠️ Could not select report "${DeviceReportName}" for upload: ${err.message}`);
                                    logSession(`⚠️ Could not select report "${DeviceReportName}" for upload: ${err.message}`, false, { flow: "post_upload_explore", report: DeviceReportName, outcome: "skipped", reason: err.message });
                                    // Skip this platform if report cannot be selected
                                    continue;
                                }

                                await uploadAudiences(page, [platform]);
                                await safeWait(page, 2000);

                                await clearSearchBar(page);
                                await safeWait(page, 2000);
                            } catch (err) {
                                console.error(`❌ Upload process failed for platform ${platform}: ${err.message}`);
                                logSession(`❌ Upload process failed for platform ${platform}: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                            }
                        }
                    }

                } catch (err) {
                    console.error(`❌ Error in 'device level visits' flow: ${err.message}`);
                    logSession(`❌ Error in 'device level visits' flow: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- PLACES ---------
            else if (type === 'places') {
                try {
                    const PlaceReportName = await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectAvailableAttributes(page, inputData.attributes, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectSubCategory(page, inputData.SubCategory, inputData.reportName);
                    await safeWait(page, 2000);

                    await selectBrands(page, inputData.Brands, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectRating(page, inputData.Rating, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectReviewCount(page, inputData.ReviewCount, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyVisits(page, inputData.AverageDailyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyVisits(page, inputData.AverageMonthlyVisits, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageDailyDevices(page, inputData.AverageDailyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await SelectAverageMonthlyDevices(page, inputData.AverageMonthlyDevices, inputData.reportName);
                    await safeWait(page, 2000);

                    await clickCreateReportButton(page, inputData.reportName);

                    const result = await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    if (result.status === 'no_data' || result.status === 'error' || result.status === 'timeout') {
                        console.log(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`);
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    // Handling Places -> Places Level Visit Report
                    if (inputData.PLACES_TO_Place_Level_Visit_Report?.toUpperCase() === "YES") {
                        const PLVReportInputs = inputData.PLVReportDetails;
                        PLVReportInputs.reportName = `${PLVReportInputs.reportName}: ${randomSuffix()}`;

                        console.log(`➡️ Creating Places Level Visit report linked to POI: ${PlaceReportName}`);
                        logSession(`➡️ Creating Places Level Visit report linked to POI: ${PlaceReportName}`);

                        try {
                            // Use retry-enabled searchAndClickReport
                            const isReportFound = await searchAndClickReport(page, PlaceReportName, 1); // retry once if fails
                            await safeWait(page, 2000);

                            if (!isReportFound) {
                                const msg = `⚠️ Skipping visitation creation Using Places — report "${PlaceReportName}" not found.`;
                                console.log(msg);
                                logSession(msg, false, { flow: "post_upload_explore", report: PlaceReportName, outcome: "skipped", reason: "linked_report_not_found" });
                                return;
                            }

                            const createVisitationBtn = page.locator("//button[normalize-space()='Create Place Level Visits']");
                            await createVisitationBtn.waitFor({ state: 'visible', timeout: 10000 });
                            await createVisitationBtn.click();

                            console.log("✅ 'Create Places Level Visits Report' button clicked.");
                            logSession("✅ 'Create Places Level Visits Report' button clicked.");

                            await enterReportName(page, PLVReportInputs.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                            await safeWait(page, 1000);

                            await selectDateRange(page, PLVReportInputs.StartDateRange, PLVReportInputs.EndDateRange);
                            await safeWait(page, 1000);

                            await clickCreateReportButton(page, PLVReportInputs.reportName);
                            const visitResult = await keplerDatasetsFetch(page, PLVReportInputs.reportName);
                            await safeWait(page, 2000);

                            if (visitResult.status === 'no_data' || visitResult.status === 'error' || visitResult.status === 'timeout' || visitResult.status === 'summary') {
                                console.log(`[${PLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`);
                                logSession(`[${PLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`, false, { flow: "post_upload_explore", report: PLVReportInputs.reportName, outcome: "skipped", reason: `kepler_status_${visitResult.status}` });
                            }
                            else {
                                if (PLVReportInputs.Persona?.toUpperCase() === "YES") {
                                    await Report_To_Persona_Flow(page, PLVReportInputs.reportName);
                                }
                            }

                        } catch (err) {
                            console.error(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`);
                            logSession(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`, false, { flow: "post_upload_explore", report: PLVReportInputs.reportName, linked_report: PlaceReportName, outcome: "failure", reason: err.message });
                        } finally {
                            // Always clear search bar and continue safely
                            await safeWait(page, 2000);
                            await clearSearchBar(page);
                            await safeWait(page, 2000);
                        }
                    }

                    // Handling Places -> Device Level Visit Report
                    if (inputData.PLACES_TO_Device_Level_Visit_Report?.toUpperCase() === "YES") {
                        const DLVReportInputs = inputData.DLVReportDetails;
                        DLVReportInputs.reportName = `${DLVReportInputs.reportName}: ${randomSuffix()}`;

                        console.log(`➡️ Creating Device Level Visit report linked to POI: ${PlaceReportName}`);
                        logSession(`➡️ Creating Device Level Visit report linked to POI: ${PlaceReportName}`);

                        try {
                            // Use retry-enabled searchAndClickReport
                            const isReportFound = await searchAndClickReport(page, PlaceReportName, 1); // retry once if fails
                            await safeWait(page, 2000);

                            if (!isReportFound) {
                                const msg = `⚠️ Skipping visitation creation Using Places — report "${PlaceReportName}" not found.`;
                                console.log(msg);
                                logSession(msg, false, { flow: "post_upload_explore", report: PlaceReportName, outcome: "skipped", reason: "linked_report_not_found" });
                                return;
                            }

                            const createVisitationBtn = page.locator("//button[normalize-space()='Create Device Level Visits']");
                            await createVisitationBtn.waitFor({ state: 'visible', timeout: 10000 });
                            await createVisitationBtn.click();

                            console.log("✅ 'Create Device Level Visits Report' button clicked.");
                            logSession("✅ 'Create Device Level Visits Report' button clicked.");

                            await enterReportName(page, DLVReportInputs.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                            await safeWait(page, 1000);

                            await selectDateRange(page, DLVReportInputs.StartDateRange, DLVReportInputs.EndDateRange);
                            await safeWait(page, 1000);

                            await clickCreateReportButton(page, DLVReportInputs.reportName);
                            const visitResult = await keplerDatasetsFetch(page, DLVReportInputs.reportName);
                            await safeWait(page, 2000);

                            if (visitResult.status === 'no_data' || visitResult.status === 'error' || visitResult.status === 'timeout' || visitResult.status === 'summary') {
                                console.log(`[${DLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`);
                                logSession(`[${DLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`, false, { flow: "post_upload_explore", report: DLVReportInputs.reportName, outcome: "skipped", reason: `kepler_status_${visitResult.status}` });
                            }
                            else {
                                if (DLVReportInputs.Persona?.toUpperCase() === "YES") {
                                    await Report_To_Persona_Flow(page, DLVReportInputs.reportName);
                                }
                            }
                        } catch (err) {
                            console.error(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`);
                            logSession(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`, false, { flow: "post_upload_explore", report: DLVReportInputs.reportName, linked_report: PlaceReportName, outcome: "failure", reason: err.message });
                        } finally {
                            // Always clear search bar and continue safely
                            await safeWait(page, 2000);
                            await clearSearchBar(page);
                            await safeWait(page, 2000);
                        }
                    }


                } catch (err) {
                    console.error(`❌ Error in 'places' flow: ${err.message}`);
                    logSession(`❌ Error in 'places' flow: ${err.message}`, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }
        } catch (err) {
            const errMsg = `❌ Error while selecting report type '${inputData.reportType}': ${err.message}`;
            console.error(errMsg);
            logSession(errMsg, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
            return;
        }

    } catch (err) {
        const finalError = `❌ General Error in Explore flow for ${inputData.reportName}: ${err.message}`;
        console.error(finalError);
        logSession(finalError, false, { flow: "post_upload_explore", report: inputData.reportName, outcome: "failure", reason: err.message });
    }
}

module.exports = postUploadExploreReportFlow;