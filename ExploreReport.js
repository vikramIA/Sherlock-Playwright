const { logSession, beginFlow } = require('./Logger');
const {
    navigateAndCreateExploreReport, selectBehaviors, selectAgeRanges,
    clearSearchBar, uploadAudiences, searchAndClickReport, selectLocations,
    selectPlaces, selectDateRange, clickCreateReportButton, enterReportName,
    selectExploreReportType, keplerDatasetsFetch, Report_To_Persona_Flow,
    selectSubCategory, selectBrands, SelectRating, SelectReviewCount,
    SelectVisitDuration, SelectAverageDailyVisits, SelectAverageMonthlyVisits,
    SelectAverageDailyDevices, SelectAverageMonthlyDevices,
    selectAvailableAttributes, SelectQualityLifeScore, safeWait, verifyDefaultBentoCharts, verifyAggregatedCount, verifyAudienceUploadStatus, verifyAppendAudience
} = require('./functions');


async function exploreFlow(page, inputData, isForMultilayer = false, multilayerReportsMap = false) {
    const randomSuffix = () => Math.random().toString(36).substring(2, 7);
    inputData.reportName = `${inputData.reportName}: ${randomSuffix()}`;
    beginFlow("explore");

    try {
        // Step 1: Navigate to Explore and create a new report
        try {
            await navigateAndCreateExploreReport(page, inputData);
        } catch (err) {
            console.error(`❌ Failed during navigation: ${err.message}`);
            logSession(`❌ Failed during navigation: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
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

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await selectDateRange(page, inputData.StartDateRange, inputData.EndDateRange);
                    await safeWait(page, 1000);

                    await selectPlaces(page, inputData.place, inputData.reportName);
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
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );

                    const total = await verifyAggregatedCount(
                        page,
                        inputData.reportName,
                    );

                    console.log(total);

                    if (inputData.Persona?.toUpperCase() === "YES") {
                        await Report_To_Persona_Flow(page, inputData.reportName);
                    }

                    if (
                        Array.isArray(inputData.UploadAudience) &&
                        inputData.UploadAudience.length > 0
                    ) {
                        for (const platform of inputData.UploadAudience) {
                            try {
                                console.log(
                                    `--- Starting upload process for platform: ${platform} ---`
                                );

                                logSession(
                                    `--- Starting upload process for platform: ${platform} ---`
                                );

                                // ==========================================
                                // 1. Select original report
                                // ==========================================

                                await searchAndClickReport(
                                    page,
                                    reportName
                                );

                                await safeWait(page, 2000);

                                // ==========================================
                                // 2. Upload Audience - FIRST UPLOAD
                                // ==========================================

                                await uploadAudiences(
                                    page,
                                    [platform]
                                );

                                await safeWait(page, 2000);

                                // ==========================================
                                // 3. Verify FIRST upload
                                // ==========================================

                                const firstUploadResult =
                                    await verifyAudienceUploadStatus(
                                        page,
                                        inputData.reportName,
                                        platform
                                    );

                                console.log(
                                    `✅ First upload completed for '${inputData.reportName}'`
                                );

                                console.log(
                                    `📊 Previous Audience Count: ${firstUploadResult.audienceCount}`
                                );

                                logSession(
                                    `✅ First upload completed for '${inputData.reportName}'`
                                );

                                logSession(
                                    `📊 Previous Audience Count: ${firstUploadResult.audienceCount}`
                                );

                                // ==========================================
                                // 4. APPEND AUDIENCE - ONLY IF REQUESTED
                                // ==========================================

                                if (
                                    inputData.AppendAudience &&
                                    inputData.AppendAudience.toLowerCase() === "yes"
                                ) {
                                    console.log(
                                        `🔄 AppendAudience = Yes. Starting Append Audience flow for '${inputData.reportName}'`
                                    );

                                    logSession(
                                        `🔄 AppendAudience = Yes. Starting Append Audience flow for '${inputData.reportName}'`
                                    );

                                    const previousAudienceCount =
                                        firstUploadResult.audienceCount;

                                    const appendResult =
                                        await verifyAppendAudience(
                                            page,
                                            inputData.reportName,
                                            platform,
                                            previousAudienceCount
                                        );

                                    // ==========================================
                                    // 5. LOG APPEND RESULT
                                    // ==========================================

                                    console.log(
                                        `📈 Append Audience Count: ${appendResult.previousAudienceCount} → ${appendResult.newAudienceCount}`
                                    );

                                    logSession(
                                        `📈 Append Audience Count: ${appendResult.previousAudienceCount} → ${appendResult.newAudienceCount}`
                                    );

                                    if (appendResult.isGreater) {
                                        console.log(
                                            `✅ APPEND AUDIENCE PASSED: ${appendResult.newAudienceCount} > ${appendResult.previousAudienceCount}`
                                        );

                                        logSession(
                                            `✅ APPEND AUDIENCE PASSED: ${appendResult.newAudienceCount} > ${appendResult.previousAudienceCount}`
                                        );
                                    } else {
                                        throw new Error(
                                            `APPEND AUDIENCE FAILED: ${appendResult.newAudienceCount} is not greater than ${appendResult.previousAudienceCount}`
                                        );
                                    }

                                } else {

                                    console.log(
                                        `ℹ️ AppendAudience is not enabled for '${inputData.reportName}'. Skipping Append Audience flow.`
                                    );

                                    logSession(
                                        `ℹ️ AppendAudience is not enabled for '${inputData.reportName}'. Skipping Append Audience flow.`
                                    );
                                }

                                // ==========================================
                                // 5. Clear search
                                // ==========================================

                                await clearSearchBar(page);

                                await safeWait(page, 2000);

                            } catch (err) {

                                console.error(
                                    `❌ Upload/Append process failed for platform ${platform}: ${err.message}`
                                );

                                logSession(
                                    `❌ Upload/Append process failed for platform ${platform}: ${err.message}`,
                                    false,
                                    { flow: "explore_audience_upload", report: inputData.reportName, platform, outcome: "failure", reason: err.message }
                                );
                            }
                        }
                    }

                    logSession(`✅ 'place level visits' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'place level visits' flow: ${err.message}`);
                    logSession(`❌ Error in 'place level visits' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- DEVICE LEVEL VISITS ---------
            else if (type === 'device level visits') {
                try {
                    const DeviceReportName = await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await selectDateRange(page, inputData.StartDateRange, inputData.EndDateRange);
                    await safeWait(page, 1000);

                    await selectPlaces(page, inputData.place, inputData.reportName);
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
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );

                    const total = await verifyAggregatedCount(
                        page,
                        inputData.reportName,
                    );

                    console.log(total);


                    if (inputData.Persona?.toUpperCase() === "YES") {
                        await Report_To_Persona_Flow(page, inputData.reportName);
                    }

                    if (
                        Array.isArray(inputData.UploadAudience) &&
                        inputData.UploadAudience.length > 0
                    ) {
                        for (const platform of inputData.UploadAudience) {
                            try {
                                console.log(
                                    `--- Starting upload process for platform: ${platform} ---`
                                );

                                logSession(
                                    `--- Starting upload process for platform: ${platform} ---`
                                );

                                // ==========================================
                                // 1. Select Device Level Visit report
                                // ==========================================
                                try {
                                    await searchAndClickReport(
                                        page,
                                        DeviceReportName,
                                        1
                                    );

                                    await safeWait(page, 2000);

                                } catch (err) {
                                    console.warn(
                                        `⚠️ Could not select report "${DeviceReportName}" for upload: ${err.message}`
                                    );

                                    logSession(
                                        `⚠️ Could not select report "${DeviceReportName}" for upload: ${err.message}`,
                                        false,
                                        { flow: "explore_audience_upload", report: DeviceReportName, outcome: "skipped", reason: err.message }
                                    );

                                    continue;
                                }

                                // ==========================================
                                // 2. FIRST AUDIENCE UPLOAD
                                // ==========================================
                                await uploadAudiences(
                                    page,
                                    [platform]
                                );

                                await safeWait(page, 2000);

                                // ==========================================
                                // 3. VERIFY FIRST UPLOAD
                                //    Get the FIRST Audience Count
                                // ==========================================
                                const firstUploadResult =
                                    await verifyAudienceUploadStatus(
                                        page,
                                        inputData.reportName,
                                        platform
                                    );

                                const previousAudienceCount =
                                    firstUploadResult.audienceCount;

                                console.log(
                                    `📊 Previous Audience Count for '${inputData.reportName}' [${platform}]: ${previousAudienceCount}`
                                );

                                logSession(
                                    `📊 Previous Audience Count for '${inputData.reportName}' [${platform}]: ${previousAudienceCount}`
                                );

                                // ==========================================
                                // 4. APPEND AUDIENCE - ONLY IF REQUESTED
                                // ==========================================

                                if (
                                    inputData.AppendAudience &&
                                    inputData.AppendAudience.toLowerCase() === "yes"
                                ) {

                                    console.log(
                                        `🔄 AppendAudience = Yes. Starting Append Audience flow for '${inputData.reportName}'`
                                    );

                                    logSession(
                                        `🔄 AppendAudience = Yes. Starting Append Audience flow for '${inputData.reportName}'`
                                    );

                                    const appendResult =
                                        await verifyAppendAudience(
                                            page,
                                            inputData.reportName,
                                            platform,
                                            previousAudienceCount
                                        );

                                    // ==========================================
                                    // 5. LOG APPEND RESULT
                                    // ==========================================

                                    console.log(
                                        `📈 Append Audience Count: ${appendResult.previousAudienceCount} → ${appendResult.newAudienceCount}`
                                    );

                                    logSession(
                                        `📈 Append Audience Count: ${appendResult.previousAudienceCount} → ${appendResult.newAudienceCount}`
                                    );

                                    if (appendResult.isGreater) {

                                        console.log(
                                            `✅ APPEND AUDIENCE PASSED: ${appendResult.newAudienceCount} > ${appendResult.previousAudienceCount}`
                                        );

                                        logSession(
                                            `✅ APPEND AUDIENCE PASSED: ${appendResult.newAudienceCount} > ${appendResult.previousAudienceCount}`
                                        );

                                    } else {

                                        throw new Error(
                                            `APPEND AUDIENCE FAILED: ${appendResult.newAudienceCount} is NOT greater than ${appendResult.previousAudienceCount}`
                                        );
                                    }

                                } else {

                                    console.log(
                                        `ℹ️ AppendAudience is not enabled for '${inputData.reportName}'. Skipping Append Audience flow.`
                                    );

                                    logSession(
                                        `ℹ️ AppendAudience is not enabled for '${inputData.reportName}'. Skipping Append Audience flow.`
                                    );
                                }

                                // ==========================================
                                // 6. Clear search bar
                                // ==========================================
                                await clearSearchBar(page);
                                await safeWait(page, 2000);

                            } catch (err) {

                                console.error(
                                    `❌ Upload/Append process failed for platform ${platform}: ${err.message}`
                                );

                                logSession(
                                    `❌ Upload/Append process failed for platform ${platform}: ${err.message}`,
                                    false,
                                    { flow: "explore_audience_upload", report: inputData.reportName, platform, outcome: "failure", reason: err.message }
                                );
                            }
                        }
                    }
                    logSession(`✅ 'device level visits' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'device level visits' flow: ${err.message}`);
                    logSession(`❌ Error in 'device level visits' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- PLACES ---------
            else if (type === 'places') {
                try {
                    const PlaceReportName = await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await selectPlaces(page, inputData.place, inputData.reportName);
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

                    if (result.status === 'no_data' || result.status === 'error' || result.status === 'timeout' || result.status === 'summary') {
                        console.log(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`);
                        logSession(`[${inputData.reportName}] ⛔ Skipping further flows due to Kepler status: ${result.status}`, false, { flow: "explore", report: inputData.reportName, outcome: "skipped", reason: `kepler_status_${result.status}` });
                        return; // 🚨 THIS is what stops execution
                    }

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );

                    const total = await verifyAggregatedCount(
                        page,
                        inputData.reportName
                    );

                    console.log(total);

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
                                logSession(msg, false, { flow: "explore", report: PlaceReportName, outcome: "skipped", reason: "linked_report_not_found" });
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
                                logSession(`[${PLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`, false, { flow: "explore", report: PLVReportInputs.reportName, outcome: "skipped", reason: `kepler_status_${visitResult.status}` });
                            }
                            else {
                                if (PLVReportInputs.Persona?.toUpperCase() === "YES") {
                                    await Report_To_Persona_Flow(page, PLVReportInputs.reportName);
                                }
                            }

                        } catch (err) {
                            console.error(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`);
                            logSession(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`, false, { flow: "explore", report: PLVReportInputs.reportName, linked_report: PlaceReportName, outcome: "failure", reason: err.message });
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
                                logSession(msg, false, { flow: "explore", report: PlaceReportName, outcome: "skipped", reason: "linked_report_not_found" });
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
                                logSession(`[${DLVReportInputs.reportName}] ⛔ Skipping further flows due to Kepler status: ${visitResult.status}`, false, { flow: "explore", report: DLVReportInputs.reportName, outcome: "skipped", reason: `kepler_status_${visitResult.status}` });
                            }
                            else {
                                if (DLVReportInputs.Persona?.toUpperCase() === "YES") {
                                    await Report_To_Persona_Flow(page, DLVReportInputs.reportName);
                                }
                            }

                        } catch (err) {
                            console.error(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`);
                            logSession(`❌ Error in 'places' flow for ${PlaceReportName}: ${err.message}`, false, { flow: "explore", report: DLVReportInputs.reportName, linked_report: PlaceReportName, outcome: "failure", reason: err.message });
                        } finally {
                            // Always clear search bar and continue safely
                            await safeWait(page, 2000);
                            await clearSearchBar(page);
                            await safeWait(page, 2000);
                        }
                    }


                    logSession(`✅ 'places' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'places' flow: ${err.message}`);
                    logSession(`❌ Error in 'places' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- QUALITY OF LIFE INDEX ---------
            else if (type === 'quality of life index') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await SelectQualityLifeScore(page, inputData.QualityLifeScore, inputData.reportName);
                    await safeWait(page, 1000);

                    await clickCreateReportButton(page, inputData.reportName);
                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );


                    logSession(`✅ 'quality of life index' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'quality of life index' flow: ${err.message}`);
                    logSession(`❌ Error in 'quality of life index' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- POPULATION ---------
            else if (type === 'population') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await clickCreateReportButton(page, inputData.reportName);

                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );
                    logSession(`✅ 'population' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'population' flow: ${err.message}`);
                    logSession(`❌ Error in 'population' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- HOME LOCATIONS ---------
            else if (type === 'home locations') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await clickCreateReportButton(page, inputData.reportName);

                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );

                    logSession(`✅ 'home locations' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'home locations' flow: ${err.message}`);
                    logSession(`❌ Error in 'home locations' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- H9 MASTER ---------
            else if (type === 'h9 master') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await clickCreateReportButton(page, inputData.reportName);

                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    logSession(`✅ 'h9 master' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'h9 master' flow: ${err.message}`);
                    logSession(`❌ Error in 'h9 master' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- QUALITY OF LIFE INDEX RAW ---------
            else if (type === 'quality of life index raw') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    clickCreateReportButton(page, inputData.reportName);

                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    logSession(`✅ 'quality of life index raw' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'quality of life index raw' flow: ${err.message}`);
                    logSession(`❌ Error in 'quality of life index raw' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- PLACES INTERNAL ---------
            else if (type === 'places internal') {
                try {
                    await enterReportName(page, inputData.reportName, isForMultilayer ? inputData.ReportNumber : false, multilayerReportsMap);
                    await safeWait(page, 1000);

                    await selectLocations(page, inputData.location, inputData.reportName);
                    await safeWait(page, 1000);

                    await selectPlaces(page, inputData.place, inputData.reportName);
                    await safeWait(page, 1000);

                    await clickCreateReportButton(page, inputData.reportName);

                    await keplerDatasetsFetch(page, inputData.reportName);
                    await safeWait(page, 2000);

                    await verifyDefaultBentoCharts(
                        page,
                        inputData.reportType,
                        inputData.reportName,
                    );

                    const total = await verifyAggregatedCount(
                        page,
                        inputData.reportName,
                    );

                    console.log(total);

                    logSession(`✅ 'places internal' flow completed successfully: ${inputData.reportName}`, false, { flow: "explore", report: inputData.reportName, report_type: inputData.reportType, outcome: "success" });
                } catch (err) {
                    console.error(`❌ Error in 'places internal' flow: ${err.message}`);
                    logSession(`❌ Error in 'places internal' flow: ${err.message}`, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
                }
            }

            // --------- UNKNOWN TYPE ---------
            else {
                const errMsg = `❌ Report Type '${inputData.reportType}' not recognized.`;
                console.error(errMsg);
                logSession(errMsg, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: "unrecognized_report_type" });
                return;
            }

        } catch (err) {
            const errMsg = `❌ Error while selecting report type '${inputData.reportType}': ${err.message}`;
            console.error(errMsg);
            logSession(errMsg, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
            return;
        }

    } catch (err) {
        const finalError = `❌ General Error in Explore flow for ${inputData.reportName}: ${err.message}`;
        console.error(finalError);
        logSession(finalError, false, { flow: "explore", report: inputData.reportName, outcome: "failure", reason: err.message });
    }
}

module.exports = exploreFlow;
