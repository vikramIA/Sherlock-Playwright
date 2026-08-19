const { logSession } = require('./Logger');
const {
    MatchRateFetch, VerifyItemExist, PersonaReportName, navigateAndCreatePersonaFlow,
    selectPersonaReportType, selectReportInPersona, selectLocations,
    selectOccasion, selectPlaces, selectAvailableAttributes, selectBehaviors,
    selectAgeRanges, selectSubCategory, selectBrands, SelectRating,
    SelectReviewCount, SelectVisitDuration, SelectAverageDailyVisits,
    SelectAverageMonthlyVisits, SelectAverageDailyDevices,
    SelectAverageMonthlyDevices, SelectQualityLifeScore,
    selectCountry, uploadCSVFile, safeWait, searchAndClickInRepository
} = require('./functions'); // Assumes functions.js is converted
const postUploadExploreReportFlow = require("./PostUploadExploreReport.js");
const { addPersonaReportToTracking } = require("./PersonaStatusFunctions.js");

async function PersonaFlow(page, inputData, env) {

    console.log("✅ Persona Flow started");
    logSession("✅ Persona Flow started");
    await safeWait(page, 10000); // Wait for 10 seconds to ensure the page is loaded

    const randomSuffix = () => Math.random().toString(36).substring(2, 7);
    inputData.reportName = `${inputData.reportName} - ${randomSuffix()}`;

    // Step 1: Navigate to Explore and Click on Persona
    await navigateAndCreatePersonaFlow(page, inputData);

    try {
        // Step 2: Select Persona Report Type
        await selectPersonaReportType(page, inputData.reportType);
        const type = inputData.reportType.trim().toLowerCase();

        // === Occasion and Behavior Based Audiences ===
        if (type === 'occasion and behavior based audiences') {

            try {
                console.log('✅ Selected Occasion and Behavior Based Audiences report type');
                logSession('✅ Selected Occasion and Behavior Based Audiences report type');

                await PersonaReportName(page, inputData.reportName);

                // Step 2: Select Existing Report (YES/NO)
                const skipDetailedFilters = await selectReportInPersona(page, inputData.SelectReport, inputData.reportName);


                if (!skipDetailedFilters) {
                    await selectLocations(page, inputData.location, inputData.reportName);
                    await selectOccasion(page, inputData.occasion, inputData.reportName);

                    if (!inputData.occasion?.trim()) {
                        await selectPlaces(page, inputData.place, inputData.reportName);
                        console.log("✅ POIs selected because 'occasion' input was not provided.");
                        logSession("✅ POIs selected because 'occasion' input was not provided.");
                    } else {
                        console.log("ℹ️ Skipping POIs selection — 'occasion' input is present.");
                        logSession("ℹ️ Skipping POIs selection — 'occasion' input is present.");
                    }

                    await selectAvailableAttributes(page, inputData.attributes, inputData.reportName);
                } else {
                    console.log(`[${inputData.reportName}] Skipping detailed selections — Report was selected. Skipped: Location, Occasion, POIs, Available Attributes.`);
                    logSession(`[${inputData.reportName}] Skipping detailed selections — Report was selected. Skipped: Location, Occasion, POIs, Available Attributes.`);
                }

                await selectBehaviors(page, inputData.behaviors, inputData.reportName);
                await selectAgeRanges(page, inputData.age, inputData.reportName);

                // Step 9: Click 'Next Step'
                const nextStepBtn = page.locator("//button[.//div[normalize-space()='Next Step']]");
                await nextStepBtn.waitFor({ state: 'visible', timeout: 10000 });
                await nextStepBtn.click();
                console.log("Clicked 'Next Step'");
                logSession("Clicked 'Next Step'");

                await safeWait(page, 3000);

                if (!skipDetailedFilters) {
                    await selectBrands(page, inputData.Brands, inputData.reportName);
                    await selectSubCategory(page, inputData.SubCategory, inputData.reportName);

                    if (!inputData.attributes?.trim()) {
                        await SelectVisitDuration(page, inputData.VisitDuration, inputData.reportName);
                    } else {
                        console.log(`[${inputData.reportName}] Skipping Visit Duration filter — attributes input is present.`);
                        logSession(`[${inputData.reportName}] Skipping Visit Duration filter — attributes input is present.`);
                    }

                    await SelectReviewCount(page, inputData.ReviewCount, inputData.reportName);
                    await SelectRating(page, inputData.Rating, inputData.reportName);
                    await SelectAverageDailyVisits(page, inputData.AverageDailyVisits, inputData.reportName);
                    await SelectAverageMonthlyVisits(page, inputData.AverageMonthlyVisits, inputData.reportName);
                    await SelectAverageDailyDevices(page, inputData.AverageDailyDevices, inputData.reportName);
                    await SelectAverageMonthlyDevices(page, inputData.AverageMonthlyDevices, inputData.reportName);

                    if (!inputData.attributes?.trim()) {
                        await SelectQualityLifeScore(page, inputData.QualityLifeScore, inputData.reportName);
                    } else {
                        console.log(`[${inputData.reportName}] Skipping Quality of Life Score filter — attributes input is present.`);
                        logSession(`[${inputData.reportName}] Skipping Quality of Life Score filter — attributes input is present.`);
                    }
                } else {
                    console.log(`[${inputData.reportName}] Skipping all detailed filters — Report was selected.`);
                    logSession(`[${inputData.reportName}] Skipping all detailed filters — Report was selected.`);
                }

                // Step 20: Click 'Initiate Workflow'
                const initiateBtn = page.locator("//button[contains(., 'Initiate Workflow')]");
                await initiateBtn.waitFor({ state: 'visible', timeout: 20000 });
                await initiateBtn.click();
                console.log("Clicked 'Initiate Workflow'");
                logSession("Clicked 'Initiate Workflow'");

                await page.waitForURL('**/explore', { timeout: 10 * 60 * 1000 });
                console.log("✅ Redirected to Explore section after initiating workflow.");
                logSession("✅ Redirected to Explore section after initiating workflow.");

                // Verify Workflow success
                const workflowSuccessMessage = page.locator("//div[text()='Workflow created successfully!']");
                try {
                    await workflowSuccessMessage.waitFor({ state: 'visible', timeout: 10000 });
                    console.log("✅ 'Workflow created successfully!' message verified.");
                    logSession("✅ 'Workflow created successfully!' message verified.");
                } catch (error) {
                    console.error(`❌ Could not verify 'Workflow created successfully!' message: ${error.message}`);
                    logSession(`❌ Could not verify 'Workflow created successfully!' message: ${error.message}`);
                }

                // Verify Report exists in Explore
                const reportExists = await VerifyItemExist(page, 'persona', inputData.reportName);
                if (reportExists) {
                    console.log(`✅ Report found in Explore for ${inputData.reportName}`);
                    logSession(`✅ Report found in Explore for ${inputData.reportName}`);
                    console.log(`✅ Occasion and Behavior Based Audiences flow completed successfully! Report: ${inputData.reportName}`);
                    logSession(`✅ Occasion and Behavior Based Audiences flow completed successfully! Report: ${inputData.reportName}`);

                    addPersonaReportToTracking(env, inputData.reportName, {
                        uploadAudience: inputData.UploadAudience
                    });
                } else {
                    console.log(`❌ Report not found in Explore for ${inputData.reportName}`);
                    logSession(`❌ Report not found in Explore for ${inputData.reportName}`);
                    console.log(`❌ Occasion and Behavior Based Audiences flow failed! Report: ${inputData.reportName}`);
                    logSession(`❌ Occasion and Behavior Based Audiences flow failed! Report: ${inputData.reportName}`);
                }
            } catch (error) {
                console.error(`❌ Error in Occasion and Behavior Based Audiences flow: ${error.message}`);
                logSession(`❌ Error in Occasion and Behavior Based Audiences flow: ${error.message}`);
                return;
            }
        }

        // === Custom Audience to IFAs or Custom Places or Custom Place Codes ===
        else if (inputData.reportType.toLowerCase() === 'custom audience to ifas' || inputData.reportType.toLowerCase() === 'custom places' || inputData.reportType.toLowerCase() === 'custom place codes') {

            const type = inputData.reportType;

            let matchRateValue = null;
            let skipCurrentReport = false;

            try {
                console.log(`✅ Selected ${type} report type`);
                logSession(`✅ Selected ${type} report type`);

                // STEP 1: Fill form + upload file
                await setupAndInitiateReport(page, inputData);

                // STEP 2: Verify success upload message
                try {
                    await page.locator("//div[text()='Data uploaded successfully!']")
                        .waitFor({ state: 'visible', timeout: 12000 });

                    console.log("✅ Data uploaded successfully verified.");
                    logSession("✅ Data uploaded successfully verified.");
                } catch (err) {
                    console.error(`❌ Upload success message NOT found: ${err.message}`);
                    logSession(`❌ Upload success message NOT found: ${err.message}`);
                }

                // STEP 3: Redirect to repository
                try {
                    await page.waitForURL('**/repository', { timeout: 60000 });
                    console.log(`✅ Redirected to repository: ${page.url()}`);
                    logSession(`✅ Redirected to repository: ${page.url()}`);
                } catch (err) {
                    console.error(`❌ Failed redirect to repository: ${err.message}`);
                    logSession(`❌ Failed redirect to repository: ${err.message}`);
                }

                // STEP 4: Check if report exists
                try {
                    const exists = await VerifyItemExist(page, 'repository', inputData.reportName);

                    if (exists) {
                        console.log(`✅ Report found in repository: ${inputData.reportName}`);
                        logSession(`✅ Report found in repository: ${inputData.reportName}`);

                        // STEP 5: Extract Match Rate (only if DirectIFAS is NOT YES)
                        try {
                            if (inputData.DirectIFAS?.toUpperCase() === "YES") {
                                console.log("⏭️ Skipping Match Rate — DirectIFAS = YES");
                                logSession("⏭️ Skipping Match Rate — DirectIFAS = YES");
                                // FIX #2 — DO NOT RETURN HERE
                            } else {
                                // Search & click report
                                const repoClicked = await searchAndClickInRepository(page, inputData.reportName);
                                if (!repoClicked) {
                                    const msg = `❌ Skipping report "${inputData.reportName}" because searchAndClickInRepository returned false.`;
                                    console.error(msg);
                                    logSession(msg);
                                    skipCurrentReport = true;
                                }

                                // Extract Match Rate
                                matchRateValue = await MatchRateFetch(page, inputData.reportName);

                                if (matchRateValue === null) {
                                    const msg = `⛔ Match Rate fetch failed for "${inputData.reportName}". Skipping this report.`;
                                    console.error(msg);
                                    logSession(msg);
                                    skipCurrentReport = true;
                                }

                                if (matchRateValue === 0) {
                                    const msg = `⛔ Match Rate is 0 for "${inputData.reportName}". Skipping further actions.`;
                                    console.log(msg);
                                    logSession(msg);
                                    skipCurrentReport = true;
                                }


                            }

                        } catch (err) {
                            console.error(`❌ Match Rate extraction failed: ${err.message}`);
                            logSession(`❌ Match Rate extraction failed: ${err.message}`);
                            skipCurrentReport = true;
                        }

                    } else {
                        console.log(`❌ Report NOT found in repository: ${inputData.reportName}`);
                        logSession(`❌ Report NOT found in repository: ${inputData.reportName}`);
                        skipCurrentReport = true;
                    }

                } catch (err) {
                    console.error(`❌ Repository check failed: ${err.message}`);
                    logSession(`❌ Repository check failed: ${err.message}`);
                    skipCurrentReport = true;
                }

                // ==== STEP 6: Trigger CDP (ONLY for Custom Audience to IFAs) ====
                if (!skipCurrentReport && inputData.reportType.toLowerCase() === "custom audience to ifas") {

                    const directIFAS = inputData.DirectIFAS?.toUpperCase() === "YES";

                    // Direct IFAS → Always trigger CDP
                    if (directIFAS) {
                        console.log("🚀 Triggering CDP — DirectIFAS = YES (Match Rate ignored)");
                        logSession("🚀 Triggering CDP — DirectIFAS = YES (Match Rate ignored)");

                        const repoClicked = await searchAndClickInRepository(page, inputData.reportName);
                        if (!repoClicked) {
                            const msg = `❌ Skipping report "${inputData.reportName}" because searchAndClickInRepository returned false.`;
                            console.error(msg);
                            logSession(msg);
                            return;
                        }

                        await CDPTriggerAfterUpload(page, inputData);
                        return;
                    }

                    // Non-direct → Match Rate required
                    else if (matchRateValue > 0) {
                        console.log(`🚀 Triggering CDP — Match Rate = ${matchRateValue}% (> 0)`);
                        logSession(`🚀 Triggering CDP — Match Rate = ${matchRateValue}% (> 0)`);

                        const repoClicked = await searchAndClickInRepository(page, inputData.reportName);
                        if (!repoClicked) {
                            const msg = `❌ Skipping report "${inputData.reportName}" because searchAndClickInRepository returned false.`;
                            console.error(msg);
                            logSession(msg);
                            skipCurrentReport = true;
                        }
                        if (!skipCurrentReport) {
                            await CDPTriggerAfterUpload(page, inputData);
                        }

                    } else {
                        console.log(`⛔ CDP NOT triggered — Match Rate = ${matchRateValue} (must be > 0)`);
                        logSession(`⛔ CDP NOT triggered — Match Rate = ${matchRateValue} (must be > 0)`);
                    }
                }

                // ==== STEP 7: Trigger Places, Devices level visit and Places Level Visit Reports ====
                if (!skipCurrentReport && (inputData.reportType.toLowerCase() === 'custom places' || inputData.reportType.toLowerCase() === 'custom place codes')) {
                    try {
                        // Validate list exists
                        if (!Array.isArray(inputData.postUploadReports) || inputData.postUploadReports.length === 0) {
                            console.log("⏭️ No post-upload Explore reports to create.");
                            logSession("⏭️ No post-upload Explore reports to create.");
                            skipCurrentReport = true;
                        }

                        // Post Upload Explore Report Flow
                        for (const report of inputData.postUploadReports) {

                            try {
                                console.log(`📌 Starting Explore Report: ${report.reportType} - ${report.reportName}`);
                                logSession(`📌 Starting Explore Report: ${report.reportType} - ${report.reportName}`);

                                const repoClicked = await searchAndClickInRepository(page, inputData.reportName);

                                if (!repoClicked) {
                                    const msg = `❌ Cannot open main report in repository for "${inputData.reportName}". Skipping this Explore report.`;
                                    console.error(msg);
                                    logSession(msg);
                                    skipCurrentReport = true;
                                }

                                await postUploadExploreReportFlow(page, report);

                                console.log(`✅ Completed Explore Report: ${report.reportType} - ${report.reportName}`);
                                logSession(`✅ Completed Explore Report: ${report.reportType} - ${report.reportName}`);

                            } catch (err) {

                                console.error(`❌ Failed Explore Report: ${report.reportName} → ${err.message}`);
                                logSession(`❌ Failed Explore Report: ${report.reportName} → ${err.message}`);
                                skipCurrentReport = true;
                            }
                        }
                    } catch (error) {
                        console.error(`❌ Unexpected error in ${type} flow: ${error.message}`);
                        logSession(`❌ Unexpected error in ${type} flow: ${error.message}`);
                    }
                }

            } catch (err) {
                console.error(`❌ Error in PostUploadExploreReport Creation flow: ${err.message}`);
                logSession(`❌ Error in PostUploadExploreReport Creation flow: ${err.message}`);
                return;
            }
        }

        // === Unknown Report Type ===
        else {
            console.error(`❌ Unknown report type: ${inputData.reportType}`);
            logSession(`❌ Unknown report type: ${inputData.reportType}`);
        }

    } catch (error) {
        console.error(`❌ Error in PersonaFlow: ${error.message}`);
        logSession(`❌ Error in PersonaFlow: ${error.message}`);
        return;
    }

    // === Setup and Initiate Report ===
    async function setupAndInitiateReport(page, inputData) {
        await PersonaReportName(page, inputData.reportName);
        await selectCountry(page, inputData.country, inputData.reportName);
        await uploadCSVFile(page, inputData.UploadFilePath, inputData.reportName);

        const initiateBtn = page.locator("//button[contains(., 'Initiate Workflow')]");
        await initiateBtn.waitFor({ state: 'visible', timeout: 20000 });
        await initiateBtn.click();
        console.log("Clicked 'Initiate Workflow'");
        logSession("Clicked 'Initiate Workflow'");
    }

    // === CDP Trigger After Upload ===
    async function CDPTriggerAfterUpload(page, inputData) {
        try {
            const postReports = inputData.postUploadReports;

            if (!Array.isArray(postReports) || postReports.length === 0) {
                const msg = "❌ No postUploadReports found. Skipping CDP trigger.";
                console.error(msg);
                logSession(msg);
                return;   // STOP only this report flow
            }

            const report = postReports[0];

            if (!report.reportName) {
                const msg = "❌ postUploadReports[0].reportName missing. Skipping CDP.";
                console.error(msg);
                logSession(msg);
                return;
            }

            // === Generate Random Suffix for Persona Report ===
            const randomSuffix = () => Math.random().toString(36).substring(2, 7);
            const newReportName = `${report.reportName} - ${randomSuffix()}`;
            report.reportName = newReportName;

            console.log(`🆕 Persona Report Name Updated: ${newReportName}`);
            logSession(`🆕 Persona Report Name Updated: ${newReportName}`);

            // ✅ Click the first visible "Create Persona Workflow" button
            const personaButton = page.getByRole('button', { name: 'Create Persona Workflow' }).first();
            await personaButton.click();

            console.log(`✅ Clicked 'Create Persona Workflow' for ${newReportName}`);
            logSession(`✅ Clicked 'Create Persona Workflow' for ${newReportName}`);


            // 1️⃣ Persona Report Name
            try {
                await PersonaReportName(page, newReportName);
            } catch (err) {
                console.error(`❌ PersonaReportName failed: ${err.message}`);
                logSession(`❌ PersonaReportName failed: ${err.message}`);
                return; // Stop this persona creation only
            }

            // 2️⃣ Behaviors
            try {
                if (report.behaviors) {
                    await selectBehaviors(page, report.behaviors, newReportName);
                }
            } catch (err) {
                console.error(`❌ selectBehaviors failed: ${err.message}`);
                logSession(`❌ selectBehaviors failed: ${err.message}`);
                return;
            }

            // 3️⃣ Age Ranges
            try {
                if (report.age) {
                    await selectAgeRanges(page, report.age, newReportName);
                }
            } catch (err) {
                console.error(`❌ selectAgeRanges failed: ${err.message}`);
                logSession(`❌ selectAgeRanges failed: ${err.message}`);
                return;
            }

            const initiateBtn = page.locator("//button[contains(., 'Initiate Workflow')]");
            await initiateBtn.waitFor({ state: 'visible', timeout: 20000 });
            await initiateBtn.click();
            console.log("Clicked 'Initiate Workflow'");
            logSession("Clicked 'Initiate Workflow'");

            await page.waitForURL('**/explore', { timeout: 10 * 60 * 1000 });
            console.log("✅ Redirected to Explore section after initiating workflow.");
            logSession("✅ Redirected to Explore section after initiating workflow.");

            // Verify Workflow success
            const workflowSuccessMessage = page.locator("//div[text()='Workflow created successfully!']");
            try {
                await workflowSuccessMessage.waitFor({ state: 'visible', timeout: 10000 });
                console.log("✅ 'Workflow created successfully!' message verified.");
                logSession("✅ 'Workflow created successfully!' message verified.");
            } catch (error) {
                console.error(`❌ Could not verify 'Workflow created successfully!' message: ${error.message}`);
                logSession(`❌ Could not verify 'Workflow created successfully!' message: ${error.message}`);
            }

            // Verify Report exists in Explore
            const reportExists = await VerifyItemExist(page, 'persona', newReportName);
            if (reportExists) {
                console.log(`✅ Report found in Explore for ${newReportName}`);
                logSession(`✅ Report found in Explore for ${newReportName}`);
                console.log(`✅ CDP TRIGGER AFTER UPLOAD flow completed successfully! Report: ${newReportName}`);
                logSession(`✅ CDP TRIGGER AFTER UPLOAD flow completed successfully! Report: ${newReportName}`);

                addPersonaReportToTracking(env, newReportName, {
                    uploadAudience: report.UploadAudience
                });
            } else {
                console.log(`❌ Report not found in Explore for ${newReportName}`);
                logSession(`❌ Report not found in Explore for ${newReportName}`);
                console.log(`❌ CDP TRIGGER AFTER UPLOAD flow failed! Report: ${newReportName}`);
                logSession(`❌ CDP TRIGGER AFTER UPLOAD flow failed! Report: ${newReportName}`);
            }



        } catch (error) {
            console.error(`❌ Unexpected failure inside CDPTriggerAfterUpload: ${error.message}`);
            logSession(`❌ Unexpected failure inside CDPTriggerAfterUpload: ${error.message}`);
        }
    }
}


module.exports = PersonaFlow;