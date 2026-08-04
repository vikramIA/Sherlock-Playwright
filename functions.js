const fs = require('fs');
const path = require("path");
const { logSession } = require('./Logger');
const { authenticator } = require('otplib');

// Function to perform login and navigate to the home page
async function loginAndNavigate(page, baseUrl, email, password, secret) {
    const maxRetries = 3;

    for (let retry = 1; retry <= maxRetries; retry++) {
        try {
            console.log(`\n🔄 Login Attempt ${retry}/${maxRetries}`);
            logSession(`🔄 Login Attempt ${retry}/${maxRetries}`);

            await page.goto(baseUrl, {
                waitUntil: "networkidle",
                timeout: 60000
            });

            // ==========================
            // STEP 1 : Click Login (if on Home page)
            // ==========================
            const loginButton = page.locator("//button[normalize-space()='Login']");

            if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
                console.log("➡ Login button found.");
                logSession("➡ Login button found.");

                await loginButton.click();
                await page.waitForTimeout(1500);
            }

            // ==========================
            // STEP 2 : Email Screen (if shown)
            // ==========================
            const emailInput = page.locator("#username");

            if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log("➡ Email screen detected.");
                logSession("➡ Email screen detected.");

                await emailInput.fill(email);

                await page.locator(
                    "//button[contains(@class,'_button-login-id') and normalize-space()='Continue']"
                ).click();

                await page.waitForTimeout(1500);
            }

            // ==========================
            // STEP 3 : Password Screen (if shown)
            // ==========================
            const passwordInput = page.locator("#password");

            if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log("➡ Password screen detected.");
                logSession("➡ Password screen detected.");

                await passwordInput.fill(password);

                await page.locator(
                    "//button[contains(@class,'_button-login-password') and normalize-space()='Continue']"
                ).click();

                await page.waitForTimeout(2000);
            }

            // ==========================
            // STEP 4 : Optional "Not on this device"
            // ==========================
            try {
                const notOnDevice = page.locator("//button[normalize-space()='Not on this device']");

                if (await notOnDevice.isVisible({ timeout: 3000 })) {
                    await notOnDevice.click();

                    console.log("➡ Clicked 'Not on this device'.");
                    logSession("➡ Clicked 'Not on this device'.");
                }
            } catch { }

            // ==========================
            // STEP 5 : Wait for MFA Screen
            // ==========================
            const otpInput = page.locator("//input[@autocomplete='one-time-code']");

            await otpInput.waitFor({
                state: "visible",
                timeout: 20000
            });

            console.log("➡ MFA screen detected.");
            logSession("➡ MFA screen detected.");

            // ==========================
            // STEP 6 : OTP Retry
            // ==========================
            let otpSuccess = false;
            let currentOtp = authenticator.generate(secret);
            let otpTime = Date.now();

            for (let otpRetry = 1; otpRetry <= 5; otpRetry++) {

                if (Date.now() - otpTime > 25000) {
                    currentOtp = authenticator.generate(secret);
                    otpTime = Date.now();

                    console.log("🔄 Generated new OTP.");
                    logSession("🔄 Generated new OTP.");
                }

                try {
                    await otpInput.fill("");

                    await otpInput.fill(currentOtp);

                    await otpInput.press("Enter");

                    await page.waitForURL("**/home", {
                        timeout: 10000
                    });

                    otpSuccess = true;
                    break;

                } catch (err) {

                    console.log(`⏳ OTP attempt ${otpRetry}/5 failed.`);
                    logSession(`⏳ OTP attempt ${otpRetry}/5 failed.`);

                    await page.waitForTimeout(3000);
                }
            }

            if (!otpSuccess) {
                throw new Error("OTP verification failed.");
            }

            // ==========================
            // STEP 7 : Verify Dashboard
            // ==========================
            await page.locator("//div[normalize-space()='Articles']")
                .waitFor({
                    state: "visible",
                    timeout: 15000
                });

            console.log("✅ Login Successful.");
            logSession("✅ Login Successful.");

            return;

        } catch (err) {

            console.log(`❌ Login attempt ${retry} failed.`);
            console.log(err.message);

            logSession(`❌ Login attempt ${retry} failed.`);
            logSession(err.message);

            if (retry === maxRetries) {
                throw new Error(
                    `Login failed after ${maxRetries} attempts.\n${err.message}`
                );
            }

            console.log("🔄 Restarting login flow...");
            logSession("🔄 Restarting login flow...");

            await page.waitForTimeout(5000);
        }
    }
}

// Function: Manual Login (with OTP)
// async function performManualLogin(page, baseUrl, email, password, secret) {
//     console.log("🔹 Performing full login...");
//     logSession(`🔹 Performing full login...`);
//     await page.goto(baseUrl);
//     await page.waitForTimeout(2000);

//     // Step 1: Email
//     await page.locator("//button[normalize-space()='Login']").click();
//     await page.waitForTimeout(2000);

//     await page.locator("//input[@id='username']").fill(email);
//     await page.locator("//button[contains(@class, '_button-login-id') and normalize-space()='Continue']").click();
//     await page.waitForTimeout(1500);

//     // Step 2: Password
//     await page.locator("//input[@id='password']").fill(password);
//     await page.locator("//button[contains(@class, '_button-login-password') and normalize-space()='Continue']").click();
//     await page.waitForTimeout(2000);

//     // Optional "Not on this device" step
//     try {
//         await page.locator("//button[normalize-space()='Not on this device']").click({ timeout: 5000 });
//         console.log("ℹ️ Clicked 'Not on this device'.");
//     } catch {
//         console.log("ℹ️ 'Not on this device' prompt not shown.");
//     }

//     // Step 3: OTP verification
//     let otpSuccess = false;
//     let currentOtp = authenticator.generate(secret);
//     let otpGeneratedTime = Date.now();

//     for (let i = 0; i < 5; i++) {
//         try {
//             if ((Date.now() - otpGeneratedTime) > 25000) {
//                 currentOtp = authenticator.generate(secret);
//                 otpGeneratedTime = Date.now();
//                 console.log("🔄 OTP refreshed due to expiration.");
//                 logSession(`🔄 OTP refreshed due to expiration.`);
//             }

//             const otpInput = page.locator("//input[@autocomplete='one-time-code']");
//             await otpInput.fill(currentOtp);
//             await otpInput.press('Enter');

//             await page.waitForURL('**/home', { timeout: 10000 });
//             otpSuccess = true;
//             break;
//         } catch (otpErr) {
//             console.log(`⏳ OTP attempt ${i + 1} failed: ${otpErr.message}`);
//             logSession(`⏳ OTP attempt ${i + 1} failed: ${otpErr.message}`);
//             await page.waitForTimeout(2000);
//         }
//     }

//     if (!otpSuccess) {
//         throw new Error("❌ OTP verification failed after multiple attempts.");
//     }

//     // Step 4: Verify home page
//     const finalUrl = page.url();
//     if (finalUrl.includes('/home')) {
//         try {
//             await page.waitForTimeout(5000);
//             await page.locator("//div[normalize-space()='Articles']").waitFor({ state: 'visible', timeout: 10000 });
//             console.log("✅ Manual login successful. Home page fully loaded (Articles visible).");
//             logSession(`✅ Manual login successful. Home page fully loaded (Articles visible).`);
//         } catch {
//             throw new Error("⚠️ Home page loaded but 'Articles' element not found.");
//         }
//     } else {
//         throw new Error(`❌ Redirect failed. Final URL: ${finalUrl}`);
//     }

//     // Step 5: Return updated LocalStorage
//     const newLocalStorage = await getLocalStorageData(page);
//     console.log("💾 Updated LocalStorage fetched.");
//     logSession(`💾 Updated LocalStorage fetched.`);
//     return newLocalStorage;
// }

// Function to navigate to Explore and click 'Create Report'
async function navigateAndCreateExploreReport(page, inputData, maxRetries = 5) {
    let attempt = 0;

    while (attempt < maxRetries) {
        attempt++;
        console.log(`🔁 Attempt ${attempt} to navigate to Explore and click 'Create Report' for ${inputData.reportName}`);
        logSession(`🔁 Attempt ${attempt} to navigate to Explore and click 'Create Report' for ${inputData.reportName}`);

        try {
            // Step 1: Click on Explore
            const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
            await page.locator(exploreXPath).click();
            console.log(`✅ Navigated to Explore for report: ${inputData.reportName}`);
            logSession(`✅ Navigated to Explore for report: ${inputData.reportName}`);

            // Step 2: Verify URL
            await page.waitForURL('**/explore', { timeout: 10000 });
            console.log(`✅ Explore URL verified for ${inputData.reportName}`);
            logSession(`✅ Explore URL verified for ${inputData.reportName}`);

            // Step 3: Click Create Report
            const createBtnXPath = "//button[@data-sidebar='menu-button' and .//span[text()='Create Report']]";
            await page.locator(createBtnXPath).click();
            console.log(`✅ Clicked 'Create Report' for ${inputData.reportName}`);
            logSession(`✅ Clicked 'Create Report' for ${inputData.reportName}`);

            // 🎯 Success - exit retry loop
            return;

        } catch (err) {
            console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
            logSession(`❌ Attempt ${attempt} failed: ${err.message}`);
            if (attempt >= maxRetries) {
                console.error(`❌ All ${maxRetries} attempts failed for report: ${inputData.reportName}`);
                logSession(`❌ All ${maxRetries} attempts failed for report: ${inputData.reportName}`);
                return;
            } else {
                console.log(`🔄 Retrying...`);
                logSession(`🔄 Retrying...`);
                await page.reload();
                await page.waitForTimeout(2000); // Give the page time to reload
            }
        }
    }
}

// Adds multiple locations
async function selectLocations(page, locationString, reportName) {
    try {
        // Step 1: Validate input (mandatory field)
        if (!locationString || locationString.trim() === "") {
            const msg = `❌ [${reportName}] Location(s) is a mandatory field but no value was provided.`;
            console.error(msg);
            logSession(msg);
            throw new Error(msg); // stop test or flow
        }

        // Step 2: Scroll to Location(s) label
        const locationLabel = page.locator("//label[contains(text(), 'Location')]");
        await locationLabel.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Step 3: Locate input
        const locationInput = page.locator("//input[@name='locations']");
        await locationInput.waitFor({ state: 'visible', timeout: 10000 });

        // Step 4: Enter each location
        const locations = locationString.split(';').map(loc => loc.trim());
        for (const loc of locations) {
            await locationInput.fill(loc);
            await page.waitForTimeout(5000); // wait for the dropdown to appear and select the location
            await locationInput.press('ArrowDown');
            await page.waitForTimeout(2000);
            await locationInput.press('Enter');

            console.log(`✅ Location '${loc}' selected successfully for report '${reportName}'.`);
            logSession(`✅ Location '${loc}' selected successfully for report '${reportName}'.`);
            await page.waitForTimeout(500);
        }

        // Step 5: Dismiss focus
        await locationLabel.click();
        await page.waitForTimeout(500);

    } catch (err) {
        const errMsg = `❌ Failed to add locations for report '${reportName}': ${err.message}`;
        console.error(errMsg);
        logSession(errMsg);
        throw err; // propagate error for upstream handling
    }
}

// Add multiple Places
async function selectPlaces(page, placeString, reportName) {
    try {
        // Scroll to the "Places" label
        const placesLabel = page.locator("//label[contains(text(), 'Places')]");
        await placesLabel.scrollIntoViewIfNeeded();
        await placesLabel.click(); // Playwright auto-waits for clickability

        // Locate the input under “Places”
        const searchInput = placesLabel
            .locator("xpath=following-sibling::div//input[@type='search' and not(@readonly)]")
            .first();

        const places = placeString.split(';').map(p => p.trim()).filter(Boolean);

        for (const place of places) {
            await searchInput.fill(place);   // Playwright auto-waits
            await searchInput.press('Enter'); // Hit Enter to select
            console.log(`✅ Place '${place}' selected for report '${reportName}'.`);
            logSession(`✅ Place '${place}' selected for report '${reportName}'.`);
        }

        // Close the dropdown
        await searchInput.press('Escape');

    } catch (err) {
        console.error(`❌ Error selecting Places for report '${reportName}': ${err.message}`);
        logSession(`❌ Error selecting Places for report '${reportName}': ${err.message}`);
    }
}

// Function to select a date range in the calendar
async function selectDateRange(page, startDate, endDate) {

    if (!startDate || !endDate) return;

    const dateRangePickerButton = page.getByRole('button', { name: 'Pick a date' });
    const prevBtn = page.locator('button[name="previous-month"]');
    const nextBtn = page.locator('button[name="next-month"]');

    await dateRangePickerButton.click();

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    // Convert month name to number
    const monthToNumber = (monthName) => {
        return new Date(`${monthName} 1, 2000`).getMonth() + 1;
    };

    const navigateToMonth = async (targetYear, targetMonth) => {

        while (true) {

            const visibleMonthName = await page.locator('.rdp-caption_start span').first().textContent();
            const visibleYearText = await page.locator('.rdp-caption_start span').nth(1).textContent();

            const visibleMonth = monthToNumber(visibleMonthName.trim());
            const visibleYear = parseInt(visibleYearText.trim());

            if (visibleMonth === targetMonth && visibleYear === targetYear) {
                break;
            }

            const visibleDate = new Date(visibleYear, visibleMonth - 1);
            const targetDate = new Date(targetYear, targetMonth - 1);

            if (visibleDate < targetDate) {
                await nextBtn.click();
            } else {
                await prevBtn.click();
            }

            await page.waitForTimeout(150);
        }
    };

    try {

        // Navigate to start month
        await navigateToMonth(startYear, startMonth);

        // Click start date (XPath unchanged)
        await page.locator(`//button[normalize-space()='${startDay}' and not(@disabled)]`).first().click();

        // Navigate to end month
        await navigateToMonth(endYear, endMonth);

        // Click end date (XPath unchanged)
        await page.locator(`//button[normalize-space()='${endDay}' and not(@disabled)]`).first().click();

        await page.keyboard.press('Escape');

        console.log(`✅ Date range ${startDate} → ${endDate} selected successfully`);

    } catch (error) {

        console.error("❌ Error selecting the date range:", error);

    }
}

// Function to select Available Attributes
async function selectAvailableAttributes(page, attributeString, reportName) {
    try {
        if (!attributeString?.trim()) {
            console.log(`[${reportName}] No Available Attributes provided. Skipping filter.`);
            logSession(`[${reportName}] No Available Attributes provided. Skipping filter.`);
            return;
        }

        // Scroll to label
        const label = page.locator("//label[normalize-space(text())='Available Attributes']");
        await label.scrollIntoViewIfNeeded();

        // Open the dropdown
        const dropdown = page.locator(
            "//label[normalize-space(text())='Available Attributes']/following-sibling::div//div[contains(@class,'ant-select-selector')]"
        );
        await dropdown.click();

        // Input inside dropdown
        const searchInput = dropdown.locator("input[role='combobox']");

        // Type each attribute and hit Enter
        const attributes = attributeString.split(';').map(a => a.trim()).filter(Boolean);
        for (const attr of attributes) {
            await searchInput.fill(attr);       // type the attribute
            await searchInput.press('Enter');   // hit Enter to select
            console.log(`✅ Attribute '${attr}' selected for report '${reportName}'.`);
            logSession(`✅ Attribute '${attr}' selected for report '${reportName}'.`);
        }

    } catch (err) {
        console.error(`❌ Error selecting Available Attributes for '${reportName}': ${err.message}`);
        logSession(`❌ Error selecting Available Attributes for '${reportName}': ${err.message}`);
    }
}

// Adds multiple subcategories
async function selectSubCategory(page, SubcategoryString, reportName) {
    try {
        if (!SubcategoryString?.trim()) {
            console.log(`[${reportName}] No Sub Category input provided. Skipping selection.`);
            logSession(`[${reportName}] No Sub Category input provided. Skipping selection.`);
            return;
        }

        // Scroll to label
        const label = page.locator("//label[contains(text(), 'Sub Category')]");
        await label.scrollIntoViewIfNeeded();

        // Click the container specific to this label
        const container = page.locator(
            "//label[contains(normalize-space(.),'Sub Category')]/following::div[@id='multiselect-input-container'][1]"
        );
        await container.first().click({ force: true });

        // Input inside container
        const inputField = container.first().locator("input[name='sub_category']");

        const subcategories = SubcategoryString.split(';').map(s => s.trim()).filter(Boolean);
        for (const subcat of subcategories) {
            await inputField.fill(subcat);
            await page.waitForTimeout(200);      // wait for dropdown suggestions
            await inputField.press('Enter');     // select
            console.log(`[${reportName}] Sub Category '${subcat}' selected.`);
            logSession(`[${reportName}] Sub Category '${subcat}' selected.`);
        }

    } catch (err) {
        const errMsg = `❌ Error selecting Sub Category for report '${reportName}': ${err.message}`;
        console.error(errMsg);
        logSession(errMsg);
    }
}

// Adds multiple brands
async function selectBrands(page, BrandsString, reportName) {
    try {
        // Skip if no brands provided
        if (!BrandsString?.trim()) {
            console.log(`[${reportName}] No Brands input provided. Skipping selection.`);
            logSession(`[${reportName}] No Brands input provided. Skipping selection.`);
            return;
        }

        // Scroll to the "Brands" label
        const brandsLabel = page.locator("//label[contains(text(), 'Brands')]");
        await brandsLabel.scrollIntoViewIfNeeded();

        // Locate input field
        const inputField = page.locator("//input[@name='brands']");
        await inputField.click(); // Playwright auto-waits for visibility

        // Split brands and select each
        const brands = BrandsString.split(';').map(b => b.trim()).filter(Boolean);
        for (const brand of brands) {
            await inputField.fill(brand);          // type brand
            await inputField.press('ArrowDown');   // select dropdown suggestion
            await inputField.press('Enter');       // confirm selection
            console.log(`[${reportName}] Brand '${brand}' selected via dropdown.`);
            logSession(`[${reportName}] Brand '${brand}' selected via dropdown.`);
        }

        // Exit the dropdown gracefully
        await inputField.press('Tab');

    } catch (err) {
        const errMsg = `❌ Error selecting Brands for report '${reportName}': ${err.message}`;
        console.error(errMsg);
        logSession(errMsg);
    }
}

// Function to Apply Rating Filter
async function SelectRating(page, Ratings, reportName) {
    if (!Ratings || Ratings.trim() === "" || Ratings.trim() === "-") {
        console.log(`[${reportName}] No rating range provided. Skipping rating filter.`);
        logSession(`[${reportName}] No rating range provided. Skipping rating filter.`);
        return;
    }

    const [startRaw, endRaw] = Ratings.split('-').map(v => v.trim());
    const start = parseFloat(startRaw);
    const end = parseFloat(endRaw);

    if (isNaN(start) || isNaN(end)) {
        console.log(`[${reportName}] Invalid rating values. Skipping rating filter.`);
        logSession(`[${reportName}] Invalid rating values. Skipping rating filter.`);
        return;
    }

    const min = Math.min(start, end);
    const max = Math.max(start, end);

    if (min < 0 || max > 5) {
        console.log(`[${reportName}] Rating range out of bounds (must be 0–5). Skipping rating filter.`);
        logSession(`[${reportName}] Rating range out of bounds (must be 0–5). Skipping rating filter.`);
        return;
    }

    try {
        const startInput = page.locator("//label[contains(text(), 'Ratings')]/following::input[1]");
        await startInput.fill(String(min));
        console.log(`[${reportName}] Applied Rating Start: ${min}`);
        logSession(`[${reportName}] Applied Rating Start: ${min}`);
    } catch (e) {
        console.error(`[${reportName}] Failed to apply start rating:`, e.message);
        logSession(`[${reportName}] Failed to apply start rating: ${e.message}`);
    }

    try {
        const endInput = page.locator("//label[contains(text(), 'Ratings')]/following::input[2]");
        await endInput.fill(String(max));
        console.log(`[${reportName}] Applied Rating End: ${max}`);
        logSession(`[${reportName}] Applied Rating End: ${max}`);
        await endInput.press('Tab');
    } catch (e) {
        console.error(`[${reportName}] Failed to apply end rating:`, e.message);
        logSession(`[${reportName}] Failed to apply end rating: ${e.message}`);
    }
}

// Function to select Review Count
async function SelectReviewCount(page, ReviewCount, reportName) {
    try {
        if (!ReviewCount || ReviewCount.trim() === "" || ReviewCount.trim() === "-") {
            console.log(`[${reportName}] No Review Count provided. Skipping filter.`);
            logSession(`[${reportName}] No Review Count provided. Skipping filter.`);
            return;
        }

        const [startRaw, endRaw] = ReviewCount.split('-').map(v => v.trim());
        const start = parseInt(startRaw);
        const end = parseInt(endRaw);

        if (isNaN(start) || isNaN(end)) {
            console.log(`[${reportName}] Invalid review count values. Skipping filter.`);
            logSession(`[${reportName}] Invalid review count values. Skipping filter.`);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        try {
            const startInput = page.locator("//label[contains(text(), 'Review Count')]/following::input[1]");
            await startInput.fill(String(min));
            console.log(`[${reportName}] Applied Review Count Start: ${min}`);
            logSession(`[${reportName}] Applied Review Count Start: ${min}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start review count:`, e.message);
            logSession(`[${reportName}] Failed to apply start review count: ${e.message}`);
        }

        try {
            const endInput = page.locator("//label[contains(text(), 'Review Count')]/following::input[2]");
            await endInput.fill(String(max));
            console.log(`[${reportName}] Applied Review Count End: ${max}`);
            logSession(`[${reportName}] Applied Review Count End: ${max}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply end review count:`, e.message);
            logSession(`[${reportName}] Failed to apply end review count: ${e.message}`);
        }

    } catch (error) {
        console.error(`[${reportName}] Error in SelectReviewCount:`, error.message);
        logSession(`[${reportName}] Error in SelectReviewCount: ${error.message}`);
    }
}

// Function to select Visit Duration(min)
async function SelectVisitDuration(page, VisitDuration, reportName) {
    if (!VisitDuration || VisitDuration.trim() === "" || VisitDuration.trim() === "-") {
        console.log(`[${reportName}] No Visit Duration provided. Skipping filter.`);
        logSession(`[${reportName}] No Visit Duration provided. Skipping filter.`);
        return;
    }

    const [startRaw, endRaw] = VisitDuration.split('-').map(v => v.trim());
    const start = parseInt(startRaw, 10);
    const end = parseInt(endRaw, 10);

    if (isNaN(start) || isNaN(end)) {
        console.log(`[${reportName}] Invalid visit duration values. Skipping filter.`);
        logSession(`[${reportName}] Invalid visit duration values. Skipping filter.`);
        return;
    }

    const min = Math.min(start, end);
    const max = Math.max(start, end);

    try {
        const startInput = page.locator("//label[contains(text(), 'Visit Duration(min)')]/following::input[1]");
        await startInput.fill(String(min));
        console.log(`[${reportName}] Applied Visit Duration Start: ${min}`);
        logSession(`[${reportName}] Applied Visit Duration Start: ${min}`);

        const endInput = page.locator("//label[contains(text(), 'Visit Duration(min)')]/following::input[2]");
        await endInput.fill(String(max));
        console.log(`[${reportName}] Applied Visit Duration End: ${max}`);
        logSession(`[${reportName}] Applied Visit Duration End: ${max}`);
    } catch (error) {
        console.error(`[${reportName}] Failed to apply Visit Duration: ${error.message}`);
        logSession(`[${reportName}] Failed to apply Visit Duration: ${error.message}`);
    }
}

// Function to select Average Daily Visits
async function SelectAverageDailyVisits(page, valueRange, reportName) {
    try {
        if (!valueRange || valueRange.trim() === "" || valueRange.trim() === "-") {
            console.log(`[${reportName}] No Average Daily Visits provided. Skipping filter.`);
            logSession(`[${reportName}] No Average Daily Visits provided. Skipping filter.`);
            return;
        }

        const [startRaw, endRaw] = valueRange.split('-').map(v => v.trim());
        const start = parseInt(startRaw);
        const end = parseInt(endRaw);

        if (isNaN(start) || isNaN(end)) {
            console.log(`[${reportName}] Invalid Average Daily Visits range. Skipping filter.`);
            logSession(`[${reportName}] Invalid Average Daily Visits range. Skipping filter.`);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        try {
            const minInput = page.locator("//label[contains(text(), 'Average Daily Visits')]/following::input[1]");
            await minInput.fill(String(min));
            console.log(`[${reportName}] Applied Average Daily Visits Start: ${min}`);
            logSession(`[${reportName}] Applied Average Daily Visits Start: ${min}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Daily Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Daily Visits: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Daily Visits')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Daily Visits End: ${max}`);
            logSession(`[${reportName}] Applied Average Daily Visits End: ${max}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply end Average Daily Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply end Average Daily Visits: ${e.message}`);
        }

    } catch (error) {
        console.error(`[${reportName}] Error in SelectAverageDailyVisits:`, error.message);
        logSession(`[${reportName}] Error in SelectAverageDailyVisits: ${error.message}`);
    }
}

// Function to select Average Monthly Visits
async function SelectAverageMonthlyVisits(page, valueRange, reportName) {
    try {
        if (!valueRange || valueRange.trim() === "" || valueRange.trim() === "-") {
            console.log(`[${reportName}] No Average Monthly Visits provided. Skipping filter.`);
            logSession(`[${reportName}] No Average Monthly Visits provided. Skipping filter.`);
            return;
        }

        const [startRaw, endRaw] = valueRange.split('-').map(v => v.trim());
        const start = parseInt(startRaw);
        const end = parseInt(endRaw);

        if (isNaN(start) || isNaN(end)) {
            console.log(`[${reportName}] Invalid Average Monthly Visits range. Skipping filter.`);
            logSession(`[${reportName}] Invalid Average Monthly Visits range. Skipping filter.`);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        try {
            const minInput = page.locator("//label[contains(text(), 'Average Monthly Visits')]/following::input[1]");
            await minInput.fill(String(min));
            console.log(`[${reportName}] Applied Average Monthly Visits Start: ${min}`);
            logSession(`[${reportName}] Applied Average Monthly Visits Start: ${min}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Monthly Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Monthly Visits: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Monthly Visits')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Monthly Visits End: ${max}`);
            logSession(`[${reportName}] Applied Average Monthly Visits End: ${max}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply end Average Monthly Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply end Average Monthly Visits: ${e.message}`);
        }

    } catch (error) {
        console.error(`[${reportName}] Error in SelectAverageMonthlyVisits:`, error.message);
        logSession(`[${reportName}] Error in SelectAverageMonthlyVisits: ${error.message}`);
    }
}

// Function to select Average Daily Devices
async function SelectAverageDailyDevices(page, valueRange, reportName) {
    try {
        if (!valueRange || valueRange.trim() === "" || valueRange.trim() === "-") {
            console.log(`[${reportName}] No Average Daily Devices provided. Skipping filter.`);
            logSession(`[${reportName}] No Average Daily Devices provided. Skipping filter.`);
            return;
        }

        const [startRaw, endRaw] = valueRange.split('-').map(v => v.trim());
        const start = parseInt(startRaw);
        const end = parseInt(endRaw);

        if (isNaN(start) || isNaN(end)) {
            console.log(`[${reportName}] Invalid Average Daily Devices range. Skipping filter.`);
            logSession(`[${reportName}] Invalid Average Daily Devices range. Skipping filter.`);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        try {
            const minInput = page.locator("//label[contains(text(), 'Average Daily Devices')]/following::input[1]");
            await minInput.fill(String(min));
            console.log(`[${reportName}] Applied Average Daily Devices Start: ${min}`);
            logSession(`[${reportName}] Applied Average Daily Devices Start: ${min}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Daily Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Daily Devices: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Daily Devices')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Daily Devices End: ${max}`);
            logSession(`[${reportName}] Applied Average Daily Devices End: ${max}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply end Average Daily Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply end Average Daily Devices: ${e.message}`);
        }

    } catch (error) {
        console.error(`[${reportName}] Error in SelectAverageDailyDevices:`, error.message);
        logSession(`[${reportName}] Error in SelectAverageDailyDevices: ${error.message}`);
    }
}

// Function to select Average Monthly Devices
async function SelectAverageMonthlyDevices(page, valueRange, reportName) {
    try {
        if (!valueRange || valueRange.trim() === "" || valueRange.trim() === "-") {
            console.log(`[${reportName}] No Average Monthly Devices provided. Skipping filter.`);
            logSession(`[${reportName}] No Average Monthly Devices provided. Skipping filter.`);
            return;
        }

        const [startRaw, endRaw] = valueRange.split('-').map(v => v.trim());
        const start = parseInt(startRaw);
        const end = parseInt(endRaw);

        if (isNaN(start) || isNaN(end)) {
            console.log(`[${reportName}] Invalid Average Monthly Devices range. Skipping filter.`);
            logSession(`[${reportName}] Invalid Average Monthly Devices range. Skipping filter.`);
            return;
        }

        const min = Math.min(start, end);
        const max = Math.max(start, end);

        try {
            const minInput = page.locator("//label[contains(text(), 'Average Monthly Devices')]/following::input[1]");
            await minInput.fill(String(min));
            console.log(`[${reportName}] Applied Average Monthly Devices Start: ${min}`);
            logSession(`[${reportName}] Applied Average Monthly Devices Start: ${min}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Monthly Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Monthly Devices: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Monthly Devices')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Monthly Devices End: ${max}`);
            logSession(`[${reportName}] Applied Average Monthly Devices End: ${max}`);
        } catch (e) {
            console.error(`[${reportName}] Failed to apply end Average Monthly Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply end Average Monthly Devices: ${e.message}`);
        }

    } catch (error) {
        console.error(`[${reportName}] Error in SelectAverageMonthlyDevices:`, error.message);
        logSession(`[${reportName}] Error in SelectAverageMonthlyDevices: ${error.message}`);
    }
}

// Function to select Quality of Life Score With Toggle Button
async function SelectQualityLifeScore(page, range, reportName) {
    if (!range || range.trim() === "" || range.trim() === "-") {
        return logSession(`[${reportName}] No Quality of Life Score provided. Skipping filter.`);
    }

    const toggle = page.locator("//button[@role='switch']").first();
    const inputs = page.locator("//label[contains(text(), 'Quality of Life Score')]/following::input[not(@type='hidden') and not(@aria-hidden='true')]");

    async function waitForInputsEnabled(timeout = 10000) {
        try {
            await page.waitForFunction(() => {
                const inputs = document.querySelectorAll("label:has-text('Quality of Life Score') ~ input:not([type='hidden'])");
                return Array.from(inputs).every(inp => !inp.disabled);
            }, { timeout });
            return true;
        } catch {
            return false;
        }
    }

    // Toggle ON if needed
    if ((await toggle.count()) > 0) {
        const currentState = await toggle.getAttribute("aria-checked");

        if (currentState === "false") {
            await toggle.click();
            console.log(`[${reportName}] Quality of Life Score toggle switched ON.`);
            logSession(`[${reportName}] Quality of Life Score toggle switched ON.`);

            // Wait for overlay/spinner to disappear
            await page.waitForSelector("div[class*='overlay'], div[class*='loader']", { state: "detached", timeout: 10000 }).catch(() => { });

            // Wait for inputs to become enabled
            const enabled = await waitForInputsEnabled();

            // Retry once if still disabled
            if (!enabled) {
                console.log(`[${reportName}] Inputs still disabled — checking toggle state before retry.`);
                logSession(`[${reportName}] Inputs still disabled — checking toggle state before retry.`);

                const retryState = await toggle.getAttribute("aria-checked");
                if (retryState === "false") {
                    await toggle.click();
                    console.log(`[${reportName}] Retried toggle ON.`);
                    logSession(`[${reportName}] Retried toggle ON.`);
                } else {
                    console.log(`[${reportName}] Toggle already ON, waiting again for inputs to enable.`);
                    logSession(`[${reportName}] Toggle already ON, waiting again for inputs to enable.`);
                }

                await page.waitForSelector("div[class*='overlay'], div[class*='loader']", { state: "detached", timeout: 10000 }).catch(() => { });
                await waitForInputsEnabled(8000);
            }
        }
    }

    // Parse and validate range
    const [startRaw, endRaw] = range.split('-').map(v => v.trim());
    const start = parseFloat(startRaw);
    const end = parseFloat(endRaw);
    if (isNaN(start) || isNaN(end) || start < 0 || end > 100) {
        return logSession(`[${reportName}] Invalid Quality of Life Score values (0–100). Skipping filter.`);
    }

    const [min, max] = [Math.min(start, end), Math.max(start, end)];

    async function clearAndType(locator, value) {
        await locator.waitFor({ state: 'visible' });
        await locator.click({ clickCount: 3 });
        await locator.fill('');
        await locator.type(value.toString());
    }

    try {
        if ((await inputs.count()) < 2) throw new Error("Min/Max inputs not found");

        const startInput = inputs.nth(0);
        const endInput = inputs.nth(1);

        await clearAndType(startInput, min);
        await clearAndType(endInput, max);

        console.log(`[${reportName}] Applied Quality of Life Score: ${min}–${max}`);
        logSession(`[${reportName}] Applied Quality of Life Score: ${min}–${max}`);
    } catch (e) {
        console.error(`[${reportName}] Failed to apply Quality of Life Score: ${e.message}`);
        logSession(`[${reportName}] Failed to apply Quality of Life Score: ${e.message}`);
    }
}

// Function to click the "Create Report" button
async function clickCreateReportButton(page, reportName) {
    try {
        const createReportButton = page.locator("//button[normalize-space()='Create Report']").first();
        await createReportButton.waitFor({ state: 'visible', timeout: 10000 });
        await createReportButton.click();
        const successMsg = `✅ 'Create Report' button clicked successfully for report '${reportName}'.`;
        console.log(successMsg);
        logSession(successMsg);
    } catch (error) {
        const errorMsg = `❌ Failed to click 'Create Report' button for report '${reportName}': ${error.message}`;
        console.error(errorMsg);
        logSession(errorMsg);
    }
}

// Function to enter the report name
async function enterReportName(page, reportName, reportNumber = false, multilayerReportsMap = false) {
    try {
        const reportNameInput = page.locator("//input[@placeholder='Report Name']");

        // Playwright auto-waits for element to be ready before fill
        await reportNameInput.fill(reportName); // clears existing value and types new one

        // Save only if reportNumber is provided AND map exists
        if (reportNumber !== false && multilayerReportsMap) {
            multilayerReportsMap.set(reportNumber, reportName);
            console.log(`📌 Saved for multilayer -> ReportNumber: ${reportNumber}, ReportName: '${reportName}'`);
            logSession(`📌 Saved for multilayer -> ReportNumber: ${reportNumber}, ReportName: '${reportName}'`);
        }

        console.log(`✅ Report name '${reportName}' entered successfully.`);
        logSession(`✅ Report name '${reportName}' entered successfully.`);
        return reportName;   // ✅ Return the report name
    } catch (err) {
        console.error(`❌ Failed to enter report name '${reportName}': ${err.message}`);
        logSession(`❌ Failed to enter report name '${reportName}': ${err.message}`);
        return null; // return null if failed
    }
}

// Function to select a  Explore report type
async function selectExploreReportType(page, reportTypeRaw) {
    const reportType = reportTypeRaw.trim().toLowerCase();
    let reportXPath;

    switch (reportType) {
        case 'place level visits':
            reportXPath = "//p[text()='Place Level Visits']";
            break;
        case 'device level visits':
            reportXPath = "//p[text()='Device Level Visits']";
            break;
        case 'places':
            reportXPath = "//p[text()='Places']";
            break;
        case 'quality of life index':
            reportXPath = "//p[text()='Quality of Life Index']";
            break;
        case 'population':
            reportXPath = "//p[text()='Population']";
            break;
        case 'h9 master':
            reportXPath = "//p[text()='H9 Master']";
            break;
        case 'home locations':
            reportXPath = "//p[text()='Home Locations']";
            break;
        case 'quality of life index raw':
            reportXPath = "//p[text()='Quality of Life Index Raw']";
            break;
        case 'places internal':
            reportXPath = "//p[text()='Places Internal']";
            break;
        default:
            const errMsg = `❌ Unsupported Report Type: '${reportTypeRaw}'`;
            console.log(errMsg);
            logSession(errMsg);
            throw new Error(errMsg);
    }

    try {
        const reportBtn = page.locator(reportXPath);
        await reportBtn.click();
        console.log(`✅ Selected Report Type: ${reportTypeRaw}`);
        logSession(`✅ Selected Report Type: ${reportTypeRaw}`);

        const nextBtn = page.locator("//button[normalize-space()='Next Step']");
        await nextBtn.click();
        console.log(`✅ Clicked 'Next Step' for: ${reportTypeRaw}`);
        logSession(`✅ Clicked 'Next Step' for: ${reportTypeRaw}`);
    } catch (error) {
        const errMsg = `❌ Error while selecting report type '${reportTypeRaw}': ${error.message}`;
        console.error(errMsg);
        logSession(errMsg);
        throw error;
    }
}

// Function to fetch Kepler rows and handle data extraction
async function keplerDatasetsFetch(page, reportName) {
    const log = (result) => {
        console.log("\n🧾 Kepler Report Result");
        console.log(`📘 Report Name : ${result.reportName}`);
        console.log(`🔗 URL : ${result.url}`);
        console.log(`📌 status : ${result.status}`);
        console.log(`📝 Datasets Present : ${result.text}`);
        console.log(`⏱️ Time Taken : ${result.timeMinutes} minutes (${result.timeSeconds} seconds)`);

        logSession("\n🧾 Kepler Report Result");
        logSession(`📘 Report Name : ${result.reportName}`);
        logSession(`🔗 URL : ${result.url}`);
        logSession(`📌 status : ${result.status}`);
        logSession(`📝 Datasets Present : ${result.text}`);
        logSession(`⏱️ Time Taken : ${result.timeMinutes} minutes (${result.timeSeconds} seconds)`);

        return result.status; // ✅ Enhancement 1 — return status
    };

    const startTime = Date.now();

    try {
        const overlay = page.locator("div.bg-surface-container-backdrop");
        const keplerArrow = page.locator("button.side-bar__close");
        const datasetsSpan = page.locator("//button[.//text()[normalize-space()='Add Data']]/preceding-sibling::span");
        const toastDivs = page.locator("div:has-text('No Data'), div:has-text('Failed')");
        const summaryMsg = page.locator("div:has-text('Large dataset detected')");


        if (await overlay.count() > 0) {
            console.log("⏳ Waiting for loader overlay to disappear...");
            await overlay.first().waitFor({
                state: "hidden",
                timeout: 30 * 60 * 1000
            });
        }


        // Begin continuous monitoring
        const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
        const POLL_INTERVAL = 1000; // 1 second
        const startPoll = Date.now();

        while (true) {
            const currentURL = page.url();
            const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(2);
            const elapsedSec = Math.floor((Date.now() - startTime) / 1000);

            // 1️⃣ Always check for toast first
            if (await toastDivs.count() > 0) {
                const rawText = await toastDivs.first().innerText();
                const toastText = rawText.split("\n")[0].trim();  // only first line
                const status = toastText.toLowerCase().includes("no data") ? "no_data" : "error";
                return log({
                    reportName,
                    url: currentURL,
                    text: `Toast detected: ${toastText}`,
                    status,
                    timeMinutes: elapsedMin,
                    timeSeconds: elapsedSec
                });
            }

            // 2️⃣ Summary Page (Large dataset detected)
            if (currentURL.includes("/explore/summary?id=") || (await summaryMsg.isVisible())) {
                return log({
                    reportName,
                    url: currentURL,
                    text: "Summary Page detected (likely large dataset). Please verify manually.",
                    status: "summary",
                    timeMinutes: elapsedMin,
                    timeSeconds: elapsedSec
                });
            }

            // 3️⃣ Data Page Handling (this is where your URL sanity check happens)
            if (currentURL.includes("/explore")) {
                // Check if URL is stuck at /explore instead of /explore/{id}
                const exploreIdMatch = currentURL.match(/\/explore\/\d+/);
                if (!exploreIdMatch) {
                    return log({
                        reportName,
                        url: currentURL,
                        text: "Kepler failed to load full report — URL stuck at /explore (no report ID found).",
                        status: "no_data",
                        timeMinutes: elapsedMin,
                        timeSeconds: elapsedSec
                    });
                }

                // Proceed if we have a proper /explore/{id} report page
                let clicked = false;
                for (let i = 0; i < 3 && !clicked; i++) {
                    try {
                        await keplerArrow.click();
                        clicked = true;
                    } catch {
                        await page.waitForTimeout(500);
                    }
                }

                if (await datasetsSpan.isVisible()) {
                    const datasetsText = await datasetsSpan.innerText();
                    const datasetsCount = (datasetsText.match(/\((\d+)\)/) || [])[1] ?? 0;
                    return log({
                        reportName,
                        url: currentURL,
                        text: datasetsText,
                        status: datasetsCount > 0 ? "success" : "no_data",
                        timeMinutes: elapsedMin,
                        timeSeconds: elapsedSec
                    });
                }
            }

            // 4️⃣ Timeout fallback
            if (Date.now() - startPoll > MAX_WAIT_MS) {
                return log({
                    reportName,
                    url: page.url(),
                    text: "Timeout or unknown state: No summary, dataset, or toast detected",
                    status: "timeout",
                    timeMinutes: elapsedMin,
                    timeSeconds: elapsedSec
                });
            }

            await page.waitForTimeout(POLL_INTERVAL);
        }

    } catch (err) {
        const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(2);
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const errorMsg = err.message.split('\n').slice(0, 5).join('\n');
        return log({
            reportName,
            url: page.url(),
            text: `Unexpected error:\n${errorMsg}`,
            status: "error",
            timeMinutes: elapsedMin,
            timeSeconds: elapsedSec
        });
    }
}

//Report to Persona Workflow
async function Report_To_Persona_Flow(page, reportName) {
    try {
        console.log(`🔄 Starting Report_To_Persona_Flow for report: ${reportName}`);
        logSession(`🔄 Starting Report_To_Persona_Flow for report: ${reportName}`);

        // Step 1: Click "Create Persona Workflow"
        const createPersonaButton = page.getByRole('button', { name: 'Create Persona Workflow' }).first();
        await createPersonaButton.click(); // Smart wait built-in
        console.log("✅ Clicked on 'Create Persona Workflow' button.");
        logSession("✅ Clicked on 'Create Persona Workflow' button.");

        // Step 2: Click 'Next Step'
        const nextStepBtn = page.getByRole('button', { name: 'Next Step' });
        await nextStepBtn.click(); // Smart wait
        console.log("✅ Clicked 'Next Step'");
        logSession("✅ Clicked 'Next Step'");

        await safeWait(page, 3000);

        // Step 3: Click 'Initiate Workflow'
        const initiateBtn = page.getByRole('button', { name: 'Initiate Workflow' });
        await initiateBtn.click(); // Smart wait
        console.log("✅ Clicked 'Initiate Workflow'");
        logSession("✅ Clicked 'Initiate Workflow'");

        // Step 4: Wait for Explore page redirect
        await page.waitForURL('**/explore'); // Smart wait
        console.log("✅ Redirected to Explore page after initiating workflow.");
        logSession("✅ Redirected to Explore page after initiating workflow.");

        // Step 5: Verify workflow success message (if visible)
        const workflowSuccessMessage = page.locator("div:text('Workflow created successfully!')");
        if (await workflowSuccessMessage.isVisible()) {
            console.log("✅ 'Workflow created successfully!' message verified.");
            logSession("✅ 'Workflow created successfully!' message verified.");
        } else {
            console.log("⚠️ Success message not visible immediately. Check workflow status manually.");
            logSession("⚠️ Success message not visible immediately. Check workflow status manually.");
        }

        // Step 6: Wait for Explore page redirect
        await page.waitForURL('**/explore'); // Smart wait
        console.log("✅ Currently ON Explore page after initiating workflow.");
        logSession("✅ Currently ON Explore page after initiating workflow.");

        // Step 7: Verify the Persona report exists using improved VerifyItemExist
        const reportExists = await VerifyItemExist(page, 'persona', reportName);
        if (reportExists) {
            console.log(`✅ Report_To_Persona_Flow completed successfully for ${reportName}`);
            logSession(`✅ Report_To_Persona_Flow completed successfully for ${reportName}`);
        } else {
            console.log(`❌ Report_To_Persona_Flow failed — report "${reportName}" not found in Explore.`);
            logSession(`❌ Report_To_Persona_Flow failed — report "${reportName}" not found in Explore.`);
        }

    } catch (error) {
        console.error(`❌ Error in Report_To_Persona_Flow: ${error.message}`);
        logSession(`❌ Error in Report_To_Persona_Flow: ${error.message}`);
    }
}

// Function to navigate to Explore and click 'Create Persona Workflow'
async function navigateAndCreatePersonaFlow(page, inputData, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔁 Attempt ${attempt} to navigate to Explore and click 'Create Persona Workflow' for ${inputData.reportName}`);
        logSession(`🔁 Attempt ${attempt} to navigate to Explore and click 'Create Persona Workflow' for ${inputData.reportName}`);

        try {
            // ✅ Click the sidebar Explore button only
            const exploreButton = page.locator("//a[@href='/explore' and @data-sidebar='menu-button']");
            await exploreButton.first().click();
            await page.waitForURL('**/explore');

            console.log(`✅ Navigated to Explore for report: ${inputData.reportName}`);
            logSession(`✅ Navigated to Explore for report: ${inputData.reportName}`);

            // ✅ Click the first visible "Create Persona Workflow" button
            const personaButton = page.getByRole('button', { name: 'Create Persona Workflow' }).first();
            await personaButton.click();

            console.log(`✅ Clicked 'Create Persona Workflow' for ${inputData.reportName}`);
            logSession(`✅ Clicked 'Create Persona Workflow' for ${inputData.reportName}`);
            return; // Exit after success

        } catch (err) {
            console.error(`❌ Attempt ${attempt} failed for ${inputData.reportName}:`, err.message);
            logSession(`❌ Attempt ${attempt} failed for ${inputData.reportName}: ${err.message}`);

            if (attempt === maxRetries) {
                console.error(`❌ Max retries reached. Could not complete Persona Flow for ${inputData.reportName}`);
                logSession(`❌ Max retries reached. Could not complete Persona Flow for ${inputData.reportName}`);
                throw err;
            }
        }
    }
}

// Function to select a Persona report type and click 'Next Step'
async function selectPersonaReportType(page, reportTypeRaw) {
    const reportType = reportTypeRaw.trim().toLowerCase();
    let reportXPath;

    switch (reportType) {
        case 'occasion and behavior based audiences':
            reportXPath = "//div[div[text()='Occasion and Behavior Based Audiences']]//div[@role='button' and text()='Select']";
            break;
        case 'custom audience to ifas':
            reportXPath = "//div[div[text()='Custom Audience to IFAs']]//div[@role='button' and text()='Select']";
            break;
        case 'custom places':
            reportXPath = "//div[div[text()='Custom Places']]//div[@role='button' and text()='Select']";
            break;
        case 'custom place codes':
            reportXPath = "//div[div[text()='Custom Place Codes']]//div[@role='button' and text()='Select']";
            break;
        default:
            const errMsg = `❌ Unsupported Report Type: '${reportTypeRaw}'`;
            console.log(errMsg);
            logSession(errMsg);
            throw new Error(errMsg);
    }

    try {
        const selectButton = page.locator(reportXPath);
        await selectButton.click(); // Playwright waits for it to be visible & enabled
        console.log(`✅ Selected Persona report type: '${reportTypeRaw}'`);
        logSession(`✅ Selected Persona report type: '${reportTypeRaw}'`);

        // Click "Next Step"
        await page.locator("//button[.//div[text()='Next Step']]").click();
        console.log("✅ Clicked on 'Next Step' button");
        logSession("✅ Clicked on 'Next Step' button");

    } catch (err) {
        const msg = `❌ Failed during report type selection or next step: '${reportTypeRaw}' -> ${err.message}`;
        console.error(msg);
        logSession(msg);
        throw err;
    }
}

// Function to select Behaviors
async function selectBehaviors(page, behaviorsString, reportName) {
    if (!behaviorsString || behaviorsString.trim() === "") {
        console.log(`[${reportName}] No Behaviors input provided. Skipping selection.`);
        logSession(`[${reportName}] No Behaviors input provided. Skipping selection.`);
        return;
    }

    // Scroll to the Behavior label if exists
    const behaviorLabel = page.locator("//label[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'behavior')]");
    if (await behaviorLabel.count() > 0) {
        await behaviorLabel.scrollIntoViewIfNeeded();
    }

    // Try locating Behavior(s) input field
    let inputField = page.locator("//label[normalize-space(text())='Behavior(s)']//following::input[1]");

    await inputField.waitFor({ state: 'visible' });
    await inputField.click();

    const behaviors = behaviorsString.split(';').map(b => b.trim()).filter(Boolean);

    for (const behavior of behaviors) {
        try {
            await inputField.type(behavior);
            await page.waitForTimeout(500); // Optional
            await inputField.press('ArrowDown');
            await page.waitForTimeout(500); // Optional
            await inputField.press('Enter');

            console.log(`[${reportName}] Behavior '${behavior}' selected via dropdown.`);
            logSession(`[${reportName}] Behavior '${behavior}' selected via dropdown.`);
        } catch (err) {
            console.log(`[${reportName}] Error selecting behavior '${behavior}': ${err.message}`);
            logSession(`[${reportName}] Error selecting behavior '${behavior}': ${err.message}`);
        }
    }

    await inputField.blur(); // close dropdown
}

// Function to select Age Ranges
async function selectAgeRanges(page, ageRangeString, reportName) {
    if (!ageRangeString || ageRangeString.trim() === "") {
        console.log(`[${reportName}] No Age Range input provided. Skipping selection.`);
        logSession(`[${reportName}] No Age Range input provided. Skipping selection.`);
        return;
    }

    // Scroll to the Age Range label if exists
    const ageLabel = page.locator("//label[contains(text(), 'Age Range')]");
    if (await ageLabel.count() > 0) {
        await ageLabel.scrollIntoViewIfNeeded();
    }

    // Try locating 'age_filters' first, then fallback to 'age'
    let inputField = page.locator("//input[@name='age_filters']");
    if ((await inputField.count()) === 0) {
        inputField = page.locator("//input[@name='age']");
    }

    await inputField.waitFor({ state: 'visible' });
    await inputField.click();

    // Split age ranges
    const ageRanges = ageRangeString.split(';').map(a => a.trim()).filter(Boolean);

    for (const age of ageRanges) {
        try {
            await inputField.type(age);   // type directly
            // Select first dropdown item with ArrowDown + Enter
            await inputField.press('ArrowDown');
            await inputField.press('Enter');

            console.log(`[${reportName}] Age Range '${age}' selected via dropdown.`);
            logSession(`[${reportName}] Age Range '${age}' selected via dropdown.`);
        } catch (err) {
            console.log(`[${reportName}] Error selecting Age Range '${age}': ${err.message}`);
            logSession(`[${reportName}] Error selecting Age Range '${age}': ${err.message}`);
        }
    }

    await inputField.press('Tab'); // close dropdown and move focus
}

// Function to select the first available report in Persona if SelectReport = YES
async function selectReportInPersona(page, SelectReport, reportName) {
    // If NO, continue with normal filters
    if (!SelectReport || SelectReport.trim().toUpperCase() !== "YES") {
        console.log(`[${reportName}] ℹ️ SelectReport = NO. Continuing with normal filters.`);
        logSession(`[${reportName}] ℹ️ SelectReport = NO. Continuing with normal filters.`);
        return false;
    }
    try {
        const reportInput = page.locator("//input[@name='reportid']");

        await reportInput.waitFor({ state: "visible", timeout: 5000 });

        await reportInput.click();
        await page.waitForTimeout(500);

        await reportInput.press("ArrowDown");
        await page.waitForTimeout(300);
        await reportInput.press("Enter");

        console.log(`[${reportName}] ✅ First available report selected.`);
        logSession(`[${reportName}] ✅ First available report selected.`);

        return true;
    } catch (err) {
        const errorMsg = `[${reportName}] ❌ SelectReport = YES, but Report selection field was not found or could not be selected.`;
        console.error(errorMsg);
        logSession(errorMsg);
        throw new Error(errorMsg);
    }
}

// Function to enter persona report name
async function PersonaReportName(page, reportName) {
    try {
        await safeWait(page, 5000);
        const reportNameInput = page.locator("//input[@name='name']");
        await reportNameInput.waitFor({ state: 'visible', timeout: 10000 });

        await reportNameInput.clear();
        await page.waitForTimeout(300);

        await safeWait(page, 5000);
        await reportNameInput.fill(reportName);
        console.log(`✅ Report name entered: '${reportName}'`);
        logSession(`✅ Report name entered: '${reportName}'`);
    } catch (err) {
        console.error(`❌ Failed to enter report name: ${err.message}`);
        logSession(`❌ Failed to enter report name: ${err.message}`);
        throw err;
    }
}

// Function to select Occasion
async function selectOccasion(page, occasionText, reportName) {
    if (!occasionText?.trim()) {
        console.log(`[${reportName}] ℹ️ Skipping occasion input — no value provided in inputData.`);
        logSession(`[${reportName}] ℹ️ Skipping occasion input — no value provided in inputData.`);
        return;
    }

    try {
        const label = page.locator("//label[contains(text(), 'Occasion')]");
        await label.scrollIntoViewIfNeeded();

        const occasionInput = page.locator("//input[@name='occasion']");
        await occasionInput.waitFor({ state: 'visible', timeout: 10000 });

        await occasionInput.fill(occasionText);
        console.log(`[${reportName}] ✅ Occasion input filled: '${occasionText}'`);
        logSession(`[${reportName}] ✅ Occasion input filled: '${occasionText}'`);

        // Use Playwright-native select from autocomplete if dropdown appears
        const dropdownOption = page.locator(`//div[contains(@class,'autocomplete')]//div[text()='${occasionText}']`);
        if (await dropdownOption.isVisible()) {
            await dropdownOption.click();
        } else {
            // fallback: press ArrowDown + Enter if no exact match locator
            await occasionInput.press('ArrowDown');
            await occasionInput.press('Enter');
        }

        console.log(`[${reportName}] ✅ Occasion confirmed: '${occasionText}'`);
        logSession(`[${reportName}] ✅ Occasion confirmed: '${occasionText}'`);
    } catch (err) {
        console.error(`[${reportName}] ❌ Failed to enter occasion: ${err.message}`);
        logSession(`[${reportName}] ❌ Failed to enter occasion: ${err.message}`);
        throw err;
    }
}

// Function to select a country in  Custom Audience to IFAs report type
async function selectCountry(page, countryInput, reportName) {
    if (!countryInput?.trim()) {
        const msg = `[${reportName}] ❌ Country is a mandatory field but was not provided in inputData.`;
        console.error(msg);
        logSession(msg);
        throw new Error(msg);
    }

    try {
        const countryLabel = page.locator("//label[contains(text(), 'Select Country')]");
        await countryLabel.scrollIntoViewIfNeeded();

        const input = page.locator("//input[@name='country']");
        await input.waitFor({ state: 'visible', timeout: 10000 });
        await input.fill(countryInput);

        // Attempt to click exact match in autocomplete dropdown
        const dropdownOption = page.locator(`//div[contains(@class,'autocomplete')]//div[text()='${countryInput}']`);
        if (await dropdownOption.isVisible()) {
            await dropdownOption.click();
        } else {
            // fallback: ArrowDown + Enter
            await input.press('ArrowDown');
            await input.press('Enter');
        }

        console.log(`[${reportName}] ✅ Country selected: '${countryInput}'`);
        logSession(`[${reportName}] ✅ Country selected: '${countryInput}'`);
    } catch (err) {
        console.error(`[${reportName}] ❌ Failed to select Country: ${err.message}`);
        logSession(`[${reportName}] ❌ Failed to select Country: ${err.message}`);
        throw err;
    }
}

//Verify if an item exists in Explore/Persona reports or Repository files
async function VerifyItemExist(page, section, itemName) {
    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds between retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let searchInput = null;

        try {
            let sectionXPath, itemXPath, urlPart;

            switch (section.toLowerCase()) {
                case "explore":
                    sectionXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
                    itemXPath = "//a[contains(@href, '/explore/')]";
                    urlPart = "explore";
                    break;
                case "persona":
                    sectionXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
                    itemXPath = `//a[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${itemName.toLowerCase()}')]`;
                    urlPart = "explore";
                    break;
                case "repository":
                    sectionXPath = "//a[@href='/repository' and @data-sidebar='menu-button']";
                    itemXPath = "//a[contains(@href, '/repository/') or contains(@href, '/repository/matchRate?id') or @href='#']";
                    urlPart = "repository";
                    break;
                default:
                    throw new Error("Invalid section. Use 'explore', 'persona', or 'repository'.");
            }

            // Navigate to the correct section
            const sectionBtn = page.locator(sectionXPath).first();


            await sectionBtn.click();
            await page.waitForURL(`**/${urlPart}`);

            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000);

            // Optional: Search the item if search bar exists
            searchInput = page.locator("//input[@placeholder='Search for a file']");

            await searchInput.waitFor({
                state: "visible",
                timeout: 30000
            });
            if (await searchInput.isVisible()) {
                await searchInput.clear();
                await searchInput.fill(itemName);

                await page.waitForTimeout(500);

                await searchInput.press("Enter");

                await page.waitForTimeout(2000);
            }

            // Locate items matching itemXPath
            const items = page.locator(itemXPath);
            const count = await items.count();

            for (let i = 0; i < count; i++) {
                const el = items.nth(i);
                let text = await el.textContent() || '';
                text = text.trim() || (await el.locator(".//*").textContent() || '').trim();
                if (text.toLowerCase().includes(itemName.toLowerCase())) {
                    console.log(`✅ [${section.toUpperCase()}] Item exists: ${text}`);
                    logSession(`✅ [${section.toUpperCase()}] Item exists: ${text}`);
                    return true;
                }
            }

            console.log(`❌ [${section.toUpperCase()}] Item not found: ${itemName}`);
            logSession(`❌ [${section.toUpperCase()}] Item not found: ${itemName}`);

            if (attempt < maxRetries) {
                console.log(`🔁 Retry ${attempt} for ${section} -> ${itemName} after ${retryDelay / 1000}s`);
                logSession(`🔁 Retry ${attempt} for ${section} -> ${itemName} after ${retryDelay / 1000}s`);
                await new Promise(resolve => setTimeout(resolve, retryDelay)); // non-blocking wait
                continue; // retry
            }

            return false;

        } catch (error) {
            console.log(`❌ Error verifying ${section} item: ${error.message}`);
            logSession(`❌ Error verifying ${section} item: ${error.message}`);

            if (attempt < maxRetries) {

                console.log(`🔄 Refreshing Repository...`);
                logSession(`🔄 Refreshing Repository...`);

                await page.reload({
                    waitUntil: "networkidle"
                });

                await page.waitForTimeout(3000);

                console.log(`🔁 Retry ${attempt} for ${section} -> ${itemName}`);
                logSession(`🔁 Retry ${attempt} for ${section} -> ${itemName}`);

                continue;
            }

            return false;
        } finally {
            if (searchInput && await searchInput.isVisible()) {
                try {
                    await searchInput.fill(''); // clear search input
                    console.log("🧹 Search bar cleared.");
                    logSession("🧹 Search bar cleared.");
                } catch (_) {
                    console.log("⚠️ Failed to clear search bar.");
                }
            }
        }
    }
}

// Function to upload a CSV file
async function uploadCSVFile(page, filePathFromInputData, reportName) {
    try {
        if (!filePathFromInputData || filePathFromInputData.trim() === "") {
            console.log(`[${reportName}] ⚠️ Upload File is a mandatory field but was not provided in inputData. .`);
            logSession(`[${reportName}] ⚠️ Upload File is a mandatory field but was not provided in inputData. .`);
            return;
        }

        const fullPath = path.resolve(__dirname, filePathFromInputData);

        // Locate the hidden file input
        const fileInput = page.locator('input#file-input[type="file"]');
        await fileInput.waitFor({ state: 'attached', timeout: 10000 });

        // Set the file
        await fileInput.setInputFiles(fullPath);

        console.log(`[${reportName}] ✅ CSV file uploaded successfully: ${filePathFromInputData}`);
        logSession(`[${reportName}] ✅ CSV file uploaded successfully: ${filePathFromInputData}`);
    } catch (err) {
        console.error(`[${reportName}] ❌ File upload failed: ${err.message}`);
        logSession(`[${reportName}] ❌ File upload failed: ${err.message}`);
        throw err;
    }
}

// Function to search and click on a report by name on 3 dots menu
async function searchAndClickReport(page, reportName) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // ms delay between retries

    if (!reportName || reportName.trim() === "") {
        const msg = "⚠️ Report name is required for search.";
        console.log(msg);
        logSession(msg);
        return false; // ❌ invalid input
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1️⃣ Go to Explore
            const exploreBtn = page.locator("//a[@href='/explore' and @data-sidebar='menu-button']");
            await exploreBtn.waitFor({ state: 'visible', timeout: 10000 });
            await exploreBtn.click();
            await page.waitForURL('**/explore', { waitUntil: 'networkidle', timeout: 15000 });

            // 2️⃣ Search for the report
            const searchInput = page.locator("//input[@placeholder='Search for a file']");
            await searchInput.waitFor({ state: 'visible', timeout: 10000 });
            await searchInput.fill(reportName);
            await searchInput.press('Enter');

            // Wait for report result
            const reportLink = page.locator(`//a[normalize-space(text())='${reportName}']`);
            await reportLink.waitFor({ state: 'visible', timeout: 10000 });

            // 3️⃣ Click the 3-dot menu for the report
            const threeDotButton = page.locator(`//a[normalize-space(text())='${reportName}']
                /ancestor::div[contains(@class,'mt-2 w-full')]
                //button[@aria-haspopup='menu']`);
            await threeDotButton.waitFor({ state: 'visible', timeout: 10000 });
            await threeDotButton.click();

            const msg = `✅ Report "${reportName}" found and 3-dot menu clicked (Attempt ${attempt}/${MAX_RETRIES}).`;
            console.log(msg);
            logSession(msg);

            return true; // ✅ FOUND
        } catch (err) {
            const msg = `⚠️ Attempt ${attempt}/${MAX_RETRIES} failed for report "${reportName}": ${err.message}`;
            console.log(msg);
            logSession(msg);

            if (attempt < MAX_RETRIES) {
                const waitMsg = `🔁 Retrying in ${RETRY_DELAY / 1000}s...`;
                console.log(waitMsg);
                logSession(waitMsg);
                await page.waitForTimeout(RETRY_DELAY);
            }
        }
    }

    const errMsg = `❌ Report "${reportName}" not found after ${MAX_RETRIES} attempts — continuing script.`;
    console.log(errMsg);
    logSession(errMsg);

    return false; // ❌ NOT FOUND after all retries
}

// Function to clear the search bar after using it
async function clearSearchBar(page) {
    try {
        // 1️⃣ Ensure navigation to Explore
        const exploreBtn = page.locator("//a[@href='/explore' and @data-sidebar='menu-button']");
        await exploreBtn.waitFor({ state: 'visible', timeout: 10000 });
        await exploreBtn.click();
        await page.waitForURL('**/explore', { waitUntil: 'networkidle', timeout: 15000 });

        // 2️⃣ Locate and clear the search bar
        const searchInput = page.locator("//input[@placeholder='Search for a file']");
        await searchInput.waitFor({ state: 'visible', timeout: 10000 });
        await searchInput.clear(); // simpler than fill('') for emptying input
        await searchInput.press('Enter');

        const msg = "✅ Search bar cleared successfully.";
        console.log(msg);
        logSession(msg);
    } catch (err) {
        const msg = `❌ Could not clear search bar: ${err.message}`;
        console.error(msg);
        logSession(msg);
        throw err;
    }
}

// Function to upload audiences to selected platforms (Meta, Google)
async function uploadAudiences(page, platforms) {
    const results = [];
    const cdpSession = await page.context().newCDPSession(page);
    const platformLabelMap = { google: 'Google', meta: 'Meta' };

    try {
        // Enable network capture once before looping
        await cdpSession.send("Network.enable");

        for (const platform of platforms) {
            const lowerPlatform = platform.toLowerCase();
            const label = platformLabelMap[lowerPlatform];
            if (!label) {
                console.log(`⚠️ Unknown platform "${platform}" skipped.`);
                logSession(`⚠️ Unknown platform "${platform}" skipped.`);
                continue;
            }

            try {
                // 1️⃣ Click Upload Audience button
                const uploadBtn = page.locator("//div[normalize-space()='Upload Audience']");
                await uploadBtn.waitFor({ state: 'visible', timeout: 10000 });
                await uploadBtn.scrollIntoViewIfNeeded();
                await uploadBtn.click();

                // 2️⃣ Prepare listener for platform API response
                const apiCallPromise = new Promise((resolve) => {
                    const listener = async (event) => {
                        if (event.type !== 'XHR' || !event.response) return;

                        const url = event.response.url;
                        const apiPlatform =
                            lowerPlatform === "meta" ? "facebook" :
                                lowerPlatform === "google" ? "google" : null;

                        if (url.includes("/audiences/uploadCustomAudience") && url.includes(`platform=${apiPlatform}`)) {
                            cdpSession.off("Network.responseReceived", listener);

                            try {
                                const body = await cdpSession.send("Network.getResponseBody", {
                                    requestId: event.requestId
                                });
                                resolve({
                                    platform,
                                    api: {
                                        url,
                                        status: event.response.status,
                                        response: JSON.parse(body.body || "{}")
                                    }
                                });
                            } catch (e) {
                                resolve({
                                    platform,
                                    api: {
                                        url,
                                        status: event.response.status,
                                        response: { error: "Response body unavailable", message: e.message }
                                    }
                                });
                            }
                        }
                    };
                    cdpSession.on("Network.responseReceived", listener);
                });

                // 3️⃣ Click target platform (Meta/Google)
                const platformBtn = page.locator(`//div[normalize-space()='${label}']`);
                await platformBtn.waitFor({ state: 'visible', timeout: 10000 });
                await platformBtn.scrollIntoViewIfNeeded();
                await platformBtn.click();

                // 4️⃣ Optional toast check (no failure if missing)
                const toastText = `uploading audience to ${lowerPlatform}`;
                const toastXPath = `//div[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${toastText}')]`;
                const toast = page.locator(toastXPath);
                const toastVisible = await toast.isVisible({ timeout: 5000 }).catch(() => false);
                if (toastVisible) {
                    console.log(`⏳ Toast detected for ${platform}`);
                    logSession(`⏳ Toast detected for ${platform}`);
                } else {
                    console.log(`ℹ️ No toast shown for ${platform}, continuing...`);
                    logSession(`ℹ️ No toast shown for ${platform}, continuing...`);
                }

                // 5️⃣ Await API response
                const apiResult = await apiCallPromise;
                results.push(apiResult);

                console.log(`✅ Upload result for ${platform}:`, JSON.stringify(apiResult, null, 2));
                logSession(`✅ Upload result for ${platform}: ${JSON.stringify(apiResult, null, 2)}`);

            } catch (err) {
                const msg = `❌ Upload failed for ${platform}: ${err.message}`;
                console.error(msg);
                logSession(msg);
                results.push({ platform, error: err.message });
            }
        }
    } catch (outerErr) {
        console.error("❌ Unexpected error during upload:", outerErr.message);
        logSession(`❌ Unexpected error during upload: ${outerErr.message}`);
    } finally {
        await cdpSession.send("Network.disable");
        await cdpSession.detach();
        console.log("🔌 CDP session closed.");
        logSession("🔌 CDP session closed.");
    }

    return results;
}

// Function to fetch Match Rate for a report
async function MatchRateFetch(page, reportName, maxRetries = 3, retryDelayMs = 2000) {
    let attempt = 0;

    while (attempt < maxRetries) {
        attempt++;

        try {
            console.log(`⏳ Attempt ${attempt}: Opening Details panel`);
            logSession(`⏳ Attempt ${attempt}: Opening Details panel`);

            // Click Details button
            const detailsBtn = page.getByRole("button", { name: "Details" });

            await detailsBtn.waitFor({
                state: "visible",
                timeout: 180000
            });

            await detailsBtn.click();

            console.log("✅ Clicked Details button");
            logSession("✅ Clicked Details button");

            // Wait for Match Rate section
            const matchRateElement = page.locator(
                "//div[normalize-space()='Match Rate']/parent::div//div[contains(text(),'%')]"
            );

            await matchRateElement.waitFor({
                state: "visible",
                timeout: 60000
            });

            const rawText = (await matchRateElement.textContent())?.trim();

            if (!rawText) {
                throw new Error("Match Rate text is empty");
            }

            const numericValue = parseFloat(rawText.replace("%", "").trim());

            if (Number.isNaN(numericValue)) {
                throw new Error(`Invalid Match Rate value: ${rawText}`);
            }

            console.log(`✅ Match Rate for ${reportName}: ${numericValue}%`);
            logSession(`✅ Match Rate for ${reportName}: ${numericValue}%`);

            // Close Details panel
            try {
                const closeBtn = page.locator(
                    "svg.lucide.lucide-x.absolute.right-6"
                );

                await closeBtn.waitFor({
                    state: "visible",
                    timeout: 10000
                });

                await closeBtn.click();

                console.log("✅ Closed Details panel");
                logSession("✅ Closed Details panel");

            } catch (closeError) {
                console.log(`⚠️ Could not close Details panel: ${closeError.message}`);
                logSession(`⚠️ Could not close Details panel: ${closeError.message}`);
            }

            return numericValue;

        } catch (error) {
            const msg = `⚠️ Attempt ${attempt} failed: ${error.message}`;
            console.log(msg);
            logSession(msg);

            if (attempt < maxRetries) {
                console.log(`🔄 Retrying in ${retryDelayMs / 1000}s...`);
                await page.waitForTimeout(retryDelayMs);
            } else {
                console.error(`❌ All ${maxRetries} attempts failed. Could not fetch Match Rate.`);
                logSession(`❌ All ${maxRetries} attempts failed. Could not fetch Match Rate.`);
                return null;
            }
        }
    }
}

// Function to wait for a specific time
async function safeWait(page, time = 2000) {
    try {
        const waitTime = Number(time) || 2000; // fallback if time is invalid
        await page.waitForTimeout(waitTime);
    } catch (err) {
        console.log(`⚠️ safeWait failed after ${time}ms: ${err.message}`);
    }
}

// Function to search and click on a report by name in Repository if it is completed
async function searchAndClickInRepository(page, reportName) {
    const MAX_RETRIES = 30;
    const REFRESH_DELAY = 60000; // 1 minute

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // 1️⃣ Navigate to Explore
            const repoBtn1 = page.locator("xpath=//a[@href='/explore' and @data-sidebar='menu-button']");
            await repoBtn1.waitFor({ state: 'visible', timeout: 15000 });
            await repoBtn1.click();
            await page.waitForURL('**/explore', { timeout: 15000 });
            console.log("📁 Navigated to Explore");
            logSession("📁 Navigated to Explore");

            // 2️⃣ Navigate to Repository
            const repoBtn2 = page.locator("xpath=//a[@href='/repository' and @data-sidebar='menu-button']");
            await repoBtn2.waitFor({ state: 'visible', timeout: 15000 });
            await repoBtn2.click();
            await page.waitForURL('**/repository', { timeout: 15000 });
            console.log("📁 Navigated to Repository");
            logSession("📁 Navigated to Repository");


            // 2️⃣ Search report
            const searchInput = page.locator("xpath=//input[@placeholder='Search']");
            if (await searchInput.isVisible()) {
                await searchInput.fill(reportName);
                await searchInput.press('Enter');
            }

            // 3️⃣ Get the report row using safe XPath
            const reportRow = page.locator(`xpath=//a[normalize-space(text())='${reportName}']/ancestor::div[contains(@class,'mt-2 w-full')]`);
            await reportRow.waitFor({ state: "visible", timeout: 15000 });

            // 4️⃣ Extract Status (FIXED XPath)
            const statusLocator = reportRow.locator(`xpath=.//p[span[contains(text(),'Status')]]/span[last()]`);
            const statusText = (await statusLocator.textContent())?.trim()?.toLowerCase();

            const msgStatus = `🔍 Attempt ${attempt}/${MAX_RETRIES}: Report "${reportName}" status = ${statusText}`;
            console.log(msgStatus);
            logSession(msgStatus);

            // ✔ COMPLETED → click row and exit
            if (statusText === "completed") {
                const reportLink = page.locator(`xpath=//a[normalize-space(text())='${reportName}']`);

                await reportLink.waitFor({ state: 'visible', timeout: 15000 });
                await reportLink.click();

                const msg = `✅ Report "${reportName}" is completed and clicked successfully.`;
                console.log(msg);
                logSession(msg);

                return true;  // <-- FIXED
            }

            // ❌ FAILED → stop checking, do NOT retry
            if (statusText === "failed") {
                const msg = `❌ Report "${reportName}" has FAILED. Stopping checks and continuing script.`;
                console.log(msg);
                logSession(msg);

                return false; // <-- FIXED
            }

            // ⏳ PENDING → retry (this is the ONLY retried state)
            if (statusText === "pending") {
                const msg = `⏳ Report "${reportName}" is still pending. Refreshing in 1 minutes...`;
                console.log(msg);
                logSession(msg);

                await page.waitForTimeout(REFRESH_DELAY);

                // 👉 Step 1: Navigate to Explore
                const exploreBtn = page.locator("xpath=//a[@href='/explore' and @data-sidebar='menu-button']");
                await exploreBtn.waitFor({ state: "visible", timeout: 15000 });
                await exploreBtn.click();
                await page.waitForURL("**/explore");

                // 👉 Step 2: UI stability wait
                await page.waitForTimeout(2000);

                // 👉 Step 3: Return to Repository
                const repoBtn = page.locator("xpath=//a[@href='/repository' and @data-sidebar='menu-button']");
                await repoBtn.waitFor({ state: "visible", timeout: 15000 });
                await repoBtn.click();
                await page.waitForURL("**/repository");
                continue;
            }

            // ⚠ UNKNOWN → NO RETRY
            const msgUnknown = `⚠️ Unknown status "${statusText}". Not retrying. Continuing script.`;
            console.log(msgUnknown);
            logSession(msgUnknown);

            return false; // <-- FIXED

        } catch (err) {
            const msg = `❌ Error on attempt ${attempt}/${MAX_RETRIES}: ${err.message}`;
            console.log(msg);
            logSession(msg);

            return false; // <-- FIXED
        }
    }

    return false; // <-- Already correct (timeout)
}

// Function to search and click on a report by name in Explore if it is completed for Multilayer Reports
async function searchReportWithRetry(page, reportName) {

    const MAX_RETRIES = 5;
    const RETRY_DELAY = 5000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

        try {

            // Ensure we are in /explore
            if (!page.url().includes("/explore")) {
                const exploreBtn = page.locator("//a[@href='/explore' and @data-sidebar='menu-button']");
                await exploreBtn.click({ timeout: 10000 });
                await page.waitForURL("**/explore", { timeout: 15000 });
                await page.waitForTimeout(2000);
            }

            const searchInput = page.locator("//input[@placeholder='Search for a file']");
            await searchInput.waitFor({ state: "visible", timeout: 15000 });

            // Ctrl + A + Backspace
            await searchInput.click();
            await page.keyboard.press("Control+A");
            await page.keyboard.press("Backspace");

            await searchInput.fill(reportName);
            await searchInput.press("Enter");

            console.log(`🔎 Attempt ${attempt}: Searching ${reportName}`);
            logSession(`🔎 Attempt ${attempt}: Searching ${reportName}`);

            const reportContainer = page.locator(`//a[normalize-space()='${reportName}']/ancestor::div[@data-state]`);

            await reportContainer.waitFor({ state: "visible", timeout: 15000 });

            return reportContainer;

        } catch (err) {

            console.log(`⚠ Attempt ${attempt} failed`);
            logSession(`⚠ Attempt ${attempt} failed`);

            if (attempt < MAX_RETRIES) {
                await page.waitForTimeout(RETRY_DELAY);
            }
        }
    }

    console.log(`❌ Report ${reportName} not found after 5 attempts`);
    logSession(`❌ Report ${reportName} not found after 5 attempts`);

    return null;
}

// Function to monitor the status of a multilayer report
async function monitorMultilayerReport(page, reportName) {

    const MAX_WAIT_TIME = 60 * 60 * 1000; // 60 minutes
    const CHECK_INTERVAL = 30000; // 30 sec

    const processingStartTime = Date.now();
    let statusChangeTime = null;
    let finalStatus = "";
    let reason = "";

    try {

        // 🔎 Search report safely with retry
        const reportContainer = await searchReportWithRetry(page, reportName);

        if (!reportContainer) {
            return {
                "ReportName": reportName,
                "Final Status of Multilayer": "Not Found",
                "Reason": "Report not found after 5 attempts",
                "Status of Maps Loading": "Not Triggered",
                [`Processing Time for Multilayer ${reportName}`]: "0 minutes",
                [`Loading Time of Map (${reportName})`]: "0 minutes",
                [`Final Time of Multilayer ${reportName}`]: "0 minutes"
            };
        }

        console.log(`🔍 Monitoring Multilayer Report: ${reportName}`);
        logSession(`🔍 Monitoring Multilayer Report: ${reportName}`);

        // 🔁 Monitor Multilayer Status
        let checkCount = 0;

        while (Date.now() - processingStartTime < MAX_WAIT_TIME) {

            checkCount++;

            let statusText = await reportContainer
                .locator("xpath=.//p[contains(text(),'Status:')]//span")
                .textContent();

            statusText = statusText?.trim().toLowerCase();

            const elapsedMinutes = Math.floor(
                (Date.now() - processingStartTime) / 60000
            );

            console.log(
                `⏳ [${elapsedMinutes} min] Check #${checkCount} | Status: ${statusText}`
            );
            logSession(
                `⏳ [${elapsedMinutes} min] Check #${checkCount} | Status: ${statusText}`
            );

            if (statusText === "completed" || statusText === "failed") {

                finalStatus = statusText;
                statusChangeTime = Date.now();

                console.log(`🎯 Status changed to "${statusText}" after ${elapsedMinutes} minutes.`);
                logSession(`🎯 Status changed to "${statusText}" after ${elapsedMinutes} minutes.`);
                break;
            }

            await page.waitForTimeout(CHECK_INTERVAL);
        }


        const processingTimeMinutes =
            (((statusChangeTime || Date.now()) - processingStartTime) / (1000 * 60)).toFixed(2);

        // ===============================
        // 🔴 FAILED CASE
        // ===============================
        if (finalStatus === "failed") {

            reason = "Report generation failed";

            console.log(`❌ FAILED: ${reportName} failed after ${processingTimeMinutes} minutes.`);
            logSession(`❌ FAILED: ${reportName} failed after ${processingTimeMinutes} minutes.`);

            return {
                "ReportName": reportName,
                "Final Status of Multilayer": "Failed",
                "Reason": reason,
                "Status of Maps Loading": "Not Triggered",
                [`Processing Time for Multilayer ${reportName}`]: `${processingTimeMinutes} minutes`,
                [`Loading Time of Map (${reportName})`]: "0 minutes",
                [`Final Time of Multilayer ${reportName}`]: `${processingTimeMinutes} minutes`
            };
        }

        // ===============================
        // ⏰ TIMEOUT CASE
        // ===============================
        if (!statusChangeTime) {

            reason = "Processing exceeded 30 minutes";

            console.log(`⏰ TIMEOUT: ${reportName} exceeded 30 minutes.`);
            logSession(`⏰ TIMEOUT: ${reportName} exceeded 30 minutes.`);

            return {
                "ReportName": reportName,
                "Final Status of Multilayer": "Timeout",
                "Reason": reason,
                "Status of Maps Loading": "Not Triggered",
                [`Processing Time for Multilayer ${reportName}`]: `${processingTimeMinutes} minutes`,
                [`Loading Time of Map (${reportName})`]: "0 minutes",
                [`Final Time of Multilayer ${reportName}`]: `${processingTimeMinutes} minutes`
            };
        }

        // ===============================
        // 🟢 COMPLETE CASE
        // ===============================

        console.log(`✅ COMPLETE: ${reportName} completed in ${processingTimeMinutes} minutes.`);
        logSession(`✅ COMPLETE: ${reportName} completed in ${processingTimeMinutes} minutes.`);

        const reportLink = reportContainer.locator(`xpath=.//a[contains(normalize-space(.),'${reportName}')]`);

        const loadStartTime = Date.now();

        await safeWait(page, 10000); // wait for 10 seconds to  Page to be stable and then click the report link
        // --- NEW RETRY CLICK LOGIC ---
        const MAX_CLICK_RETRIES = 3;
        let clickSuccess = false;

        for (let i = 1; i <= MAX_CLICK_RETRIES; i++) {
            try {
                console.log(`🖱️ Attempting to click report (Attempt ${i}/${MAX_CLICK_RETRIES})...`);

                await safeWait(page, 5000); // Small stability buffer
                await reportLink.click({ force: true });

                // Wait for URL to change to contain "explore/" (timeout after 60s)
                await page.waitForURL(url => url.href.includes('explore/'), { timeout: 60000 });

                console.log(`🔗 URL changed successfully. Navigation confirmed.`);
                clickSuccess = true;
                break;
            } catch (e) {
                console.warn(`⚠️ Click attempt ${i} failed or URL did not change: ${e.message}`);
                if (i === MAX_CLICK_RETRIES) throw new Error("Failed to navigate to report details after multiple click attempts.");
            }
        }
        // -----------------------------

        // 🔥 Get Kepler Result
        const keplerResult = await keplerDatasetsFetch(page, reportName);

        // 🔥 Stop timer when kepler completes
        const loadEndTime = Date.now();

        // Calculate loading time
        let loadingTimeMinutes = (loadEndTime - loadStartTime) / (1000 * 60);

        const finalTime = (parseFloat(processingTimeMinutes) + parseFloat(loadingTimeMinutes)).toFixed(2);

        return {
            "ReportName": reportName,
            "Final Status of Multilayer": "Complete",
            "Status of Maps Loading": keplerResult,
            [`Processing Time for Multilayer ${reportName}`]: `${processingTimeMinutes} minutes`,
            [`Loading Time of Map (${reportName})`]: `${loadingTimeMinutes.toFixed(2)} minutes`,
            [`Final Time of Multilayer ${reportName}`]: `${finalTime} minutes`
        };
    }

    catch (error) {

        console.log(`⚠ ERROR: ${error.message}`);
        logSession(`⚠ ERROR: ${error.message}`);

        return {
            "ReportName": reportName,
            "Final Status of Multilayer": "Error",
            "Reason": error.message,
            "Status of Maps Loading": "Not Triggered",
            [`Processing Time for Multilayer ${reportName}`]: "0 minutes",
            [`Loading Time of Map (${reportName})`]: "0 minutes",
            [`Final Time of Multilayer ${reportName}`]: "0 minutes"
        };
    }
}

module.exports = {
    searchAndClickInRepository,
    safeWait,
    MatchRateFetch,
    VerifyItemExist,
    navigateAndCreateExploreReport,
    navigateAndCreatePersonaFlow,
    selectLocations,
    selectPlaces,
    selectDateRange,
    clickCreateReportButton,
    enterReportName,
    selectExploreReportType,
    selectPersonaReportType,
    keplerDatasetsFetch,
    Report_To_Persona_Flow,
    selectSubCategory,
    selectBrands,
    SelectRating,
    SelectReviewCount,
    SelectVisitDuration,
    SelectAverageDailyVisits,
    SelectAverageMonthlyVisits,
    SelectAverageDailyDevices,
    SelectAverageMonthlyDevices,
    selectAvailableAttributes,
    SelectQualityLifeScore,
    selectBehaviors,
    selectAgeRanges,
    selectOccasion,
    selectReportInPersona,
    PersonaReportName,
    selectCountry,
    uploadCSVFile,
    loginAndNavigate,
    searchAndClickReport,
    clearSearchBar,
    uploadAudiences,
    monitorMultilayerReport
}