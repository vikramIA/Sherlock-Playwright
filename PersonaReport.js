const { logSession, logReport } = require('./Logger');
const { 
    MatchRateFetch, VerifyItemExist, PersonaReportName, navigateAndCreatePersonaFlow, 
    selectPersonaReportType, selectExploreReportInPersona, selectLocations, 
    selectOccasion, selectPlaces, selectAvailableAttributes, selectBehaviors, 
    selectAgeRanges, selectSubCategory, selectBrands, SelectRating, 
    SelectReviewCount, SelectVisitDuration, SelectAverageDailyVisits, 
    SelectAverageMonthlyVisits, SelectAverageDailyDevices, 
    SelectAverageMonthlyDevices, SelectQualityLifeScore, 
    selectCountry, uploadCSVFile, CHECKDataUploadedSuccessfully, safeWait
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
        
       // === Custom Audience to IFAs ===
        else if (type === 'custom audience to ifas') {
            try {
            console.log('✅ Selected Custom Audience to IFAs report type');
            logSession('✅ Selected Custom Audience to IFAs report type');

            await setupAndInitiateReport(page, inputData);

            await page.waitForURL('**/explore', { timeout: 10 * 60 * 1000 }); 
            console.log("✅ Redirected to Explore section after initiating workflow.");
            logSession("✅ Redirected to Explore section after initiating workflow.");

            try {
                await page.locator("//div[text()='Workflow created successfully!']")
                    .waitFor({ state: 'visible', timeout: 10000 });
                console.log("✅ 'Workflow created successfully!' message verified.");
                logSession("✅ 'Workflow created successfully!' message verified.");
            } catch (error) {
                console.error(`❌ Could not verify workflow success: ${error.message}`);
                logSession(`❌ Could not verify workflow success: ${error.message}`);
            }

            const reportExists = await VerifyItemExist(page, 'persona', inputData.reportName);
            if (!reportExists) return console.log(`❌ Report not found in Explore — Aborting repository check.`);

            const repositoryExists = await VerifyItemExist(page, 'repository', inputData.reportName);
            if (repositoryExists) {
                console.log(`✅ File Uploaded successfully for Report: ${inputData.reportName}`);
                logSession(`✅ File Uploaded successfully for Report: ${inputData.reportName}`);
            } else {
                console.log(`❌ File not found in Repository for ${inputData.reportName}`);
                logSession(`❌ File not found in Repository for ${inputData.reportName}`);
            }
            } catch (error) {
                console.error(`❌ Error in Custom Audience to IFAs flow: ${error.message}`);
                logSession(`❌ Error in Custom Audience to IFAs flow: ${error.message}`);
                  return;
            }
        }

        // === Custom Places ===
        else if (type === 'custom places') {
            try {
            console.log('✅ Selected Custom Places report type');
            logSession('✅ Selected Custom Places report type');

            await setupAndInitiateReport(page, inputData);

            await CHECKDataUploadedSuccessfully(page, inputData.reportName);

            await page.waitForURL('**/repository/**', { timeout: 60000 });
            console.log(`✅ Redirected to repository page: ${page.url()}`);
            logSession(`✅ Redirected to repository page: ${page.url()}`);

            await MatchRateFetch(page, inputData.reportName);

            const repositoryExists = await VerifyItemExist(page, 'repository', inputData.reportName);
            repositoryExists? console.log(`✅ File Uploaded successfully for ${inputData.reportName}`): console.log(`❌ File not found for ${inputData.reportName}`);
            repositoryExists? logSession(`✅ File Uploaded successfully for ${inputData.reportName}`): console.log(`❌ File not found for ${inputData.reportName}`);
            } catch (error) {
                console.error(`❌ Error in Custom Places flow: ${error.message}`);
                logSession(`❌ Error in Custom Places flow: ${error.message}`);
                  return;
            }
        }

        // === Custom POI Codes ===
        else if (type === 'custom poi codes') {
            try {
            console.log('✅ Selected Custom POI Codes report type');
            logSession('✅ Selected Custom POI Codes report type');

            await setupAndInitiateReport(page, inputData);

            await CHECKDataUploadedSuccessfully(page, inputData.reportName);

            await page.waitForURL('**/repository/**', { timeout: 60000 });
            console.log(`✅ Redirected to repository page: ${page.url()}`);
            logSession(`✅ Redirected to repository page: ${page.url()}`);

            await MatchRateFetch(page, inputData.reportName);

            const repositoryExists = await VerifyItemExist(page, 'repository', inputData.reportName);
            repositoryExists? console.log(`✅ File Uploaded successfully for ${inputData.reportName}`): console.log(`❌ File not found for ${inputData.reportName}`);
            repositoryExists? logSession(`✅ File Uploaded successfully for ${inputData.reportName}`): console.log(`❌ File not found for ${inputData.reportName}`);
            } catch (error) {
                console.error(`❌ Error in Custom POI Codes flow: ${error.message}`);
                logSession(`❌ Error in Custom POI Codes flow: ${error.message}`);
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
}

module.exports = PersonaFlow;