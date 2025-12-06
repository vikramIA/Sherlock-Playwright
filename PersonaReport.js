const { logSession, logReport } = require('./Logger');
const {
    MatchRateFetch, VerifyItemExist, PersonaReportName, navigateAndCreatePersonaFlow,
    selectPersonaReportType, selectExploreReportInPersona, selectLocations,
    selectOccasion, selectPlaces, selectAvailableAttributes, selectBehaviors,
    selectAgeRanges, selectSubCategory, selectBrands, SelectRating,
    SelectReviewCount, SelectVisitDuration, SelectAverageDailyVisits,
    SelectAverageMonthlyVisits, SelectAverageDailyDevices,
    SelectAverageMonthlyDevices, SelectQualityLifeScore,
    selectCountry, uploadCSVFile, safeWait, searchAndClickInRepository
} = require('./functions'); // Assumes functions.js is converted

async function PersonaFlow(page, inputData) {
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

                // Step 2: Select Explore Report in Persona
                const skipDetailedFilters = await selectExploreReportInPersona(page, inputData.ExploreReportName, inputData.reportName);

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
                    // Continue script
                }

                // STEP 3: Redirect to repository
                try {
                    await page.waitForURL('**/repository', { timeout: 60000 });
                    console.log(`✅ Redirected to repository: ${page.url()}`);
                    logSession(`✅ Redirected to repository: ${page.url()}`);
                } catch (err) {
                    console.error(`❌ Failed redirect to repository: ${err.message}`);
                    logSession(`❌ Failed redirect to repository: ${err.message}`);
                    // Continue execution
                }

                // STEP 4: Check if report exists in repository
                try {
                    const exists = await VerifyItemExist(page, 'repository', inputData.reportName);

                    if (exists) {
                        console.log(`✅ Report found in repository: ${inputData.reportName}`);
                        logSession(`✅ Report found in repository: ${inputData.reportName}`);

                        // STEP 5: Extract Match Rate 
                        try {
                            // If DirectIFAS is YES, skip Match Rate
                            if (inputData.DirectIFAS?.toUpperCase() === "YES") {
                                console.log("⏭️ Skipping Match Rate — DirectIFAS = YES");
                                logSession("⏭️ Skipping Match Rate — DirectIFAS = YES");
                                return;
                            }
            
                            // Search and click on the report in repository
                            const repoClicked = await searchAndClickInRepository(page, inputData.reportName);
                            if (!repoClicked) {
                                const msg = `❌ Skipping report "${inputData.reportName}" because searchAndClickInRepository returned false.`;
                                console.error(msg);
                                logSession(msg);
                                return;  
                            }

                            // Extract Match Rate
                            const matchSuccess = await MatchRateFetch(page, inputData.reportName);
                            if (!matchSuccess) {
                                const msg = `❌ Skipping report "${inputData.reportName}" because MatchRateFetch failed.`;
                                console.error(msg);
                                logSession(msg);
                                return;  
                            }

                        } catch (err) {
                            console.error(`❌ Match Rate extraction failed: ${err.message}`);
                            logSession(`❌ Match Rate extraction failed: ${err.message}`);
                            return;  
                        }


                    } else {
                        console.log(`❌ Report NOT found in repository: ${inputData.reportName}`);
                        logSession(`❌ Report NOT found in repository: ${inputData.reportName}`);
                    }
                } catch (err) {
                    console.error(`❌ Repository check failed: ${err.message}`);
                    logSession(`❌ Repository check failed: ${err.message}`);
                }

            } catch (error) {
                console.error(`❌ Unexpected error in ${type} flow: ${error.message}`);
                logSession(`❌ Unexpected error in ${type} flow: ${error.message}`);
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
}

module.exports = PersonaFlow;