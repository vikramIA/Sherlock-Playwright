const fs = require('fs');
const path = require("path");
const { logSession } = require('./Logger');
const { authenticator } = require('otplib');
const { expect } = require("@playwright/test");

// Function to perform login and navigate to the home page

async function loginAndNavigate(
    page,
    baseUrl,
    email,
    password,
    secret
) {

    const maxRetries = 3;

    for (let retry = 1; retry <= maxRetries; retry++) {

        try {

            console.log(
                `\n🔄 Login Attempt ${retry}/${maxRetries}`
            );

            logSession(
                `🔄 Login Attempt ${retry}/${maxRetries}`
            );


            await page.goto(baseUrl, {
                waitUntil: "networkidle",
                timeout: 60000
            });


            // =====================================================
            // CHECK IF ALREADY LOGGED IN
            // =====================================================

            if (
                page.url().includes("/home") ||
                await page.locator("//div[normalize-space()='Articles']")
                    .isVisible({ timeout: 3000 })
                    .catch(() => false)
            ) {
                console.log("✅ User is already authenticated.");
                logSession("✅ User is already authenticated.");
                return;
            }


            // ==========================
            // STEP 1 : Click Login
            // ==========================

            const loginButton = page.locator(
                "//button[normalize-space()='Login']"
            );

            if (
                await loginButton.isVisible({
                    timeout: 5000
                }).catch(() => false)
            ) {

                console.log("➡ Login button found.");
                logSession("➡ Login button found.");

                await loginButton.click();

                await page.waitForTimeout(1500);
            }


            // ==========================
            // STEP 2 : Email Screen
            // ==========================

            const emailInput =
                page.locator("#username");

            if (
                await emailInput.isVisible({
                    timeout: 3000
                }).catch(() => false)
            ) {

                console.log(
                    "➡ Email screen detected."
                );

                logSession(
                    "➡ Email screen detected."
                );

                await emailInput.fill(email);

                await page.locator(
                    "//button[contains(@class,'_button-login-id') and normalize-space()='Continue']"
                ).click();

                await page.waitForTimeout(1500);
            }


            // ==========================
            // STEP 3 : Password Screen
            // ==========================

            const passwordInput =
                page.locator("#password");

            if (
                await passwordInput.isVisible({
                    timeout: 3000
                }).catch(() => false)
            ) {

                console.log(
                    "➡ Password screen detected."
                );

                logSession(
                    "➡ Password screen detected."
                );

                await passwordInput.fill(password);

                await page.locator(
                    "//button[contains(@class,'_button-login-password') and normalize-space()='Continue']"
                ).click();

                await page.waitForTimeout(2000);
            }


            // ==========================
            // STEP 4 : Optional Device
            // ==========================

            try {

                const notOnDevice =
                    page.locator(
                        "//button[normalize-space()='Not on this device']"
                    );

                if (
                    await notOnDevice.isVisible({
                        timeout: 3000
                    })
                ) {

                    await notOnDevice.click();

                    console.log(
                        "➡ Clicked 'Not on this device'."
                    );

                    logSession(
                        "➡ Clicked 'Not on this device'."
                    );
                }

            } catch { }


            // ==========================
            // STEP 5 : MFA
            // ==========================

            const otpInput =
                page.locator(
                    "//input[@autocomplete='one-time-code']"
                );

            await otpInput.waitFor({
                state: "visible",
                timeout: 20000
            });

            console.log(
                "➡ MFA screen detected."
            );

            logSession(
                "➡ MFA screen detected."
            );


            // ==========================
            // STEP 6 : OTP Retry
            // ==========================

            let otpSuccess = false;

            let currentOtp =
                authenticator.generate(secret);

            let otpTime = Date.now();


            for (
                let otpRetry = 1;
                otpRetry <= 5;
                otpRetry++
            ) {

                if (
                    Date.now() - otpTime > 25000
                ) {

                    currentOtp =
                        authenticator.generate(secret);

                    otpTime = Date.now();

                    console.log(
                        "🔄 Generated new OTP."
                    );

                    logSession(
                        "🔄 Generated new OTP."
                    );
                }


                try {

                    await otpInput.fill("");

                    await otpInput.fill(
                        currentOtp
                    );

                    await otpInput.press(
                        "Enter"
                    );

                    await page.waitForURL(
                        "**/home",
                        {
                            timeout: 10000
                        }
                    );

                    otpSuccess = true;

                    break;

                } catch (err) {

                    console.log(
                        `⏳ OTP attempt ${otpRetry}/5 failed.`
                    );

                    logSession(
                        `⏳ OTP attempt ${otpRetry}/5 failed.`
                    );

                    await page.waitForTimeout(
                        3000
                    );
                }
            }


            if (!otpSuccess) {

                throw new Error(
                    "OTP verification failed."
                );
            }


            // ==========================
            // STEP 7 : Verify Home
            // ==========================

            if (
                !page.url().includes("/home")
            ) {

                throw new Error(
                    `Login completed but home page was not reached. Current URL: ${page.url()}`
                );
            }


            console.log(
                "✅ Login Successful."
            );

            logSession(
                "✅ Login Successful."
            );

            return;


        } catch (err) {

            console.log(
                `❌ Login attempt ${retry} failed.`
            );

            console.log(
                err.message
            );

            logSession(
                `❌ Login attempt ${retry} failed.`
            );

            logSession(
                err.message
            );


            if (retry === maxRetries) {

                throw new Error(
                    `Login failed after ${maxRetries} attempts.\n${err.message}`
                );
            }


            console.log(
                "🔄 Restarting login flow..."
            );

            logSession(
                "🔄 Restarting login flow..."
            );

            await page.waitForTimeout(
                5000
            );
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
        logSession(`🔁 Attempt ${attempt} to navigate to Explore and click 'Create Report' for ${inputData.reportName}`, false, { report: inputData.reportName, attempt });

        try {
            // Step 1: Click on Explore
            const exploreXPath = "//a[@href='/explore' and @data-sidebar='menu-button']";
            await page.locator(exploreXPath).click();
            console.log(`✅ Navigated to Explore for report: ${inputData.reportName}`);
            logSession(`✅ Navigated to Explore for report: ${inputData.reportName}`, false, { report: inputData.reportName });

            // Step 2: Verify URL
            await page.waitForURL('**/explore', { timeout: 10000 });
            console.log(`✅ Explore URL verified for ${inputData.reportName}`);
            logSession(`✅ Explore URL verified for ${inputData.reportName}`, false, { report: inputData.reportName });

            // Step 3: Click Create Report
            const createBtnXPath = "//button[@data-sidebar='menu-button' and .//span[text()='Create Report']]";
            await page.locator(createBtnXPath).click();
            console.log(`✅ Clicked 'Create Report' for ${inputData.reportName}`);
            logSession(`✅ Clicked 'Create Report' for ${inputData.reportName}`, false, { report: inputData.reportName });

            // 🎯 Success - exit retry loop
            return;

        } catch (err) {
            console.error(`❌ Attempt ${attempt} failed: ${err.message}`);
            logSession(`❌ Attempt ${attempt} failed: ${err.message}`, false, { report: inputData.reportName, attempt });
            if (attempt >= maxRetries) {
                console.error(`❌ All ${maxRetries} attempts failed for report: ${inputData.reportName}`);
                logSession(`❌ All ${maxRetries} attempts failed for report: ${inputData.reportName}`, false, { report: inputData.reportName });
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
            logSession(`✅ Location '${loc}' selected successfully for report '${reportName}'.`, false, { report: reportName, location: loc });
            await page.waitForTimeout(500);
        }

        // Step 5: Dismiss focus
        await locationLabel.click();
        await page.waitForTimeout(500);

    } catch (err) {
        const errMsg = `❌ Failed to add locations for report '${reportName}': ${err.message}`;
        console.error(errMsg);
        logSession(errMsg, false, { report: reportName });
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

    const dateRangePickerButton = page.locator('button[name="dateRange"]');

    const prevBtn = page.getByRole('button', {
        name: 'Go to the Previous Month'
    });

    const nextBtn = page.getByRole('button', {
        name: 'Go to the Next Month'
    });

    await dateRangePickerButton.waitFor({ state: "visible" });
    await dateRangePickerButton.click();

    await page.waitForTimeout(500);

    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

    const monthToNumber = (monthName) =>
        new Date(`${monthName} 1, 2000`).getMonth() + 1;

    async function navigateToMonth(targetYear, targetMonth) {

        let attempts = 0;

        while (attempts < 36) {

            attempts++;

            const monthSpans = page.locator('button[role="combobox"] span');

            const leftMonth = (await monthSpans.nth(0).textContent()).trim();
            const leftYear = parseInt((await monthSpans.nth(1).textContent()).trim());

            const rightMonth = (await monthSpans.nth(2).textContent()).trim();
            const rightYear = parseInt((await monthSpans.nth(3).textContent()).trim());

            // If target month is already visible, stop navigating
            if (
                (monthToNumber(leftMonth) === targetMonth && leftYear === targetYear) ||
                (monthToNumber(rightMonth) === targetMonth && rightYear === targetYear)
            ) {
                return;
            }

            const leftDate = new Date(leftYear, monthToNumber(leftMonth) - 1);
            const targetDate = new Date(targetYear, targetMonth - 1);

            if (leftDate < targetDate) {
                await nextBtn.click();
            } else {
                await prevBtn.click();
            }

            await page.waitForTimeout(250);
        }

        throw new Error(`Unable to navigate to ${targetMonth}/${targetYear}`);
    }

    async function selectDay(year, month, day) {

        const target = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const dayButton = page.locator(
            `td[data-day="${target}"] button:not([disabled])`
        );

        await dayButton.waitFor({ state: "visible", timeout: 5000 });
        await dayButton.click();
    }

    try {

        await navigateToMonth(startYear, startMonth);
        await selectDay(startYear, startMonth, startDay);

        await page.waitForTimeout(300);

        await navigateToMonth(endYear, endMonth);
        await selectDay(endYear, endMonth, endDay);

        await page.waitForTimeout(300);

        // Close picker if still open
        if (await page.locator(".rdp-root").isVisible()) {
            await page.keyboard.press("Escape");
        }

        console.log(`✅ Date range ${startDate} → ${endDate} selected successfully`);

    } catch (error) {

        console.error("❌ Error selecting date range:", error);
        throw error;
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
        logSession(`[${reportName}] Applied Rating Start: ${min}`, false, { filter: "rating", bound: "start", value: min });
    } catch (e) {
        console.error(`[${reportName}] Failed to apply start rating:`, e.message);
        logSession(`[${reportName}] Failed to apply start rating: ${e.message}`);
    }

    try {
        const endInput = page.locator("//label[contains(text(), 'Ratings')]/following::input[2]");
        await endInput.fill(String(max));
        console.log(`[${reportName}] Applied Rating End: ${max}`);
        logSession(`[${reportName}] Applied Rating End: ${max}`, false, { filter: "rating", bound: "end", value: max });
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
            logSession(`[${reportName}] Applied Review Count Start: ${min}`, false, { filter: "review_count", bound: "start", value: min });
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start review count:`, e.message);
            logSession(`[${reportName}] Failed to apply start review count: ${e.message}`);
        }

        try {
            const endInput = page.locator("//label[contains(text(), 'Review Count')]/following::input[2]");
            await endInput.fill(String(max));
            console.log(`[${reportName}] Applied Review Count End: ${max}`);
            logSession(`[${reportName}] Applied Review Count End: ${max}`, false, { filter: "review_count", bound: "end", value: max });
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
        logSession(`[${reportName}] Applied Visit Duration Start: ${min}`, false, { filter: "visit_duration", bound: "start", value: min });

        const endInput = page.locator("//label[contains(text(), 'Visit Duration(min)')]/following::input[2]");
        await endInput.fill(String(max));
        console.log(`[${reportName}] Applied Visit Duration End: ${max}`);
        logSession(`[${reportName}] Applied Visit Duration End: ${max}`, false, { filter: "visit_duration", bound: "end", value: max });
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
            logSession(`[${reportName}] Applied Average Daily Visits Start: ${min}`, false, { filter: "avg_daily_visits", bound: "start", value: min });
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Daily Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Daily Visits: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Daily Visits')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Daily Visits End: ${max}`);
            logSession(`[${reportName}] Applied Average Daily Visits End: ${max}`, false, { filter: "avg_daily_visits", bound: "end", value: max });
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
            logSession(`[${reportName}] Applied Average Monthly Visits Start: ${min}`, false, { filter: "avg_monthly_visits", bound: "start", value: min });
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Monthly Visits:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Monthly Visits: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Monthly Visits')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Monthly Visits End: ${max}`);
            logSession(`[${reportName}] Applied Average Monthly Visits End: ${max}`, false, { filter: "avg_monthly_visits", bound: "end", value: max });
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
            logSession(`[${reportName}] Applied Average Daily Devices Start: ${min}`, false, { filter: "avg_daily_devices", bound: "start", value: min });
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Daily Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Daily Devices: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Daily Devices')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Daily Devices End: ${max}`);
            logSession(`[${reportName}] Applied Average Daily Devices End: ${max}`, false, { filter: "avg_daily_devices", bound: "end", value: max });
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
            logSession(`[${reportName}] Applied Average Monthly Devices Start: ${min}`, false, { filter: "avg_monthly_devices", bound: "start", value: min });
        } catch (e) {
            console.error(`[${reportName}] Failed to apply start Average Monthly Devices:`, e.message);
            logSession(`[${reportName}] Failed to apply start Average Monthly Devices: ${e.message}`);
        }

        try {
            const maxInput = page.locator("//label[contains(text(), 'Average Monthly Devices')]/following::input[2]");
            await maxInput.fill(String(max));
            console.log(`[${reportName}] Applied Average Monthly Devices End: ${max}`);
            logSession(`[${reportName}] Applied Average Monthly Devices End: ${max}`, false, { filter: "avg_monthly_devices", bound: "end", value: max });
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
        logSession(`[${reportName}] Applied Quality of Life Score: ${min}–${max}`, false, { filter: "quality_of_life_score", value_min: min, value_max: max });
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
        logSession(successMsg, false, { report: reportName });
    } catch (error) {
        const errorMsg = `❌ Failed to click 'Create Report' button for report '${reportName}': ${error.message}`;
        console.error(errorMsg);
        logSession(errorMsg, false, { report: reportName });
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
        logSession(`✅ Report name '${reportName}' entered successfully.`, false, { report: reportName });
        return reportName;   // ✅ Return the report name
    } catch (err) {
        console.error(`❌ Failed to enter report name '${reportName}': ${err.message}`);
        logSession(`❌ Failed to enter report name '${reportName}': ${err.message}`, false, { report: reportName });
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

        logSession("Kepler Report Result", false, {
            report: result.reportName,
            url: result.url,
            status: result.status,
            datasets: result.text,
            duration_sec: result.timeSeconds,
        });

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

        return reportExists;

    } catch (error) {
        console.error(`❌ Error in Report_To_Persona_Flow: ${error.message}`);
        logSession(`❌ Error in Report_To_Persona_Flow: ${error.message}`);
        return false;
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
    const RETRY_DELAY = 2000;

    if (!reportName || reportName.trim() === "") {
        const msg = "⚠️ Report name is required for search.";
        console.log(msg);
        logSession(msg);
        return false;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(
                `🔎 Searching report "${reportName}" - Attempt ${attempt}/${MAX_RETRIES}`
            );

            logSession(
                `🔎 Searching report "${reportName}" - Attempt ${attempt}/${MAX_RETRIES}`
            );

            // ==========================================
            // 1. Ensure we are on Explore
            // ==========================================

            const currentUrl = page.url();

            if (!currentUrl.endsWith("/explore")) {
                await page.goto(
                    `${new URL(currentUrl).origin}/explore`,
                    {
                        waitUntil: "domcontentloaded",
                        timeout: 60000
                    }
                );
            }

            await page.waitForURL("**/explore", {
                timeout: 30000
            });

            // ==========================================
            // 2. Wait for Explore sidebar
            // ==========================================

            const exploreBtn = page.locator(
                "//a[@href='/explore' and @data-sidebar='menu-button']"
            );

            try {
                await exploreBtn.waitFor({
                    state: "visible",
                    timeout: 10000
                });
            } catch {
                console.log(
                    `⚠️ Explore sidebar not ready on attempt ${attempt}. Reloading...`
                );

                logSession(
                    `⚠️ Explore sidebar not ready on attempt ${attempt}. Reloading...`
                );

                await page.reload({
                    waitUntil: "domcontentloaded",
                    timeout: 60000
                });

                await page.waitForURL("**/explore", {
                    timeout: 30000
                });

                await exploreBtn.waitFor({
                    state: "visible",
                    timeout: 20000
                });
            }

            // ==========================================
            // 3. Make sure Explore page is active
            // ==========================================

            if (!page.url().endsWith("/explore")) {
                await exploreBtn.click();

                await page.waitForURL("**/explore", {
                    timeout: 30000
                });
            }

            // ==========================================
            // 4. Search report
            // ==========================================

            const searchInput = page.locator(
                "//input[@placeholder='Search for a file']"
            );

            await searchInput.waitFor({
                state: "visible",
                timeout: 30000
            });

            await searchInput.fill("");

            await searchInput.fill(reportName);

            await page.waitForTimeout(2000);

            // ==========================================
            // 5. Find report
            // ==========================================
            // A Persona-derived report keeps the exact same display name as its source report
            // (e.g. once Report_To_Persona_Flow has run for this report, it shows up twice -
            // once as its own type, once as "Insight type: Persona") so matching on name alone
            // is ambiguous; excluding the Persona row disambiguates it.

            const reportRow = page.locator(
                `xpath=//div[contains(@class,'mt-2 w-full')][.//a[normalize-space(text())='${reportName}']][not(.//p[contains(.,'Insight type:') and contains(.,'Persona')])]`
            ).first();

            await reportRow.waitFor({
                state: "visible",
                timeout: 30000
            });

            // ==========================================
            // 6. Open three-dot menu
            // ==========================================

            const threeDotButton = reportRow.locator(
                "button[aria-haspopup='menu']"
            );

            await threeDotButton.waitFor({
                state: "visible",
                timeout: 30000
            });

            await threeDotButton.click();

            console.log(
                `✅ Report "${reportName}" found and 3-dot menu clicked (Attempt ${attempt}/${MAX_RETRIES}).`
            );

            logSession(
                `✅ Report "${reportName}" found and 3-dot menu clicked (Attempt ${attempt}/${MAX_RETRIES}).`
            );

            return true;

        } catch (err) {

            console.log(
                `⚠️ Attempt ${attempt}/${MAX_RETRIES} failed for report "${reportName}": ${err.message}`
            );

            logSession(
                `⚠️ Attempt ${attempt}/${MAX_RETRIES} failed for report "${reportName}": ${err.message}`
            );

            if (attempt < MAX_RETRIES) {

                console.log(
                    `🔁 Retrying report search in ${RETRY_DELAY / 1000}s...`
                );

                logSession(
                    `🔁 Retrying report search in ${RETRY_DELAY / 1000}s...`
                );

                await page.waitForTimeout(RETRY_DELAY);
            }
        }
    }

    const errMsg =
        `❌ Report "${reportName}" not found after ${MAX_RETRIES} attempts — continuing script.`;

    console.log(errMsg);
    logSession(errMsg);

    return false;
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

        const loadStartTime = Date.now();
        const keplerResult = await finalizeCompletedMultilayerReport(page, reportName, reportContainer);
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

// One-shot status read for a multilayer report — no polling loop. Used by the
// batched multilayer flow, which checks several triggered reports at once
// instead of blocking on each one individually.
async function checkMultilayerReportStatusOnce(page, reportName) {
    try {
        const reportContainer = await searchReportWithRetry(page, reportName);

        if (!reportContainer) {
            return { reportName, status: "not_found", reason: "Report not found" };
        }

        let statusText = await reportContainer
            .locator("xpath=.//p[contains(text(),'Status:')]//span")
            .textContent();
        statusText = statusText?.trim().toLowerCase() || "unknown";

        if (statusText === "completed") return { reportName, status: "completed" };
        if (statusText === "failed") return { reportName, status: "failed", reason: "Report generation failed" };
        return { reportName, status: "processing", reason: `Status: ${statusText}` };

    } catch (error) {
        return { reportName, status: "error", reason: error.message };
    }
}

// Opens a completed multilayer report and waits for its map/kepler datasets to
// load. Accepts an optional already-located reportContainer to avoid a
// redundant search when the caller has just found it.
async function finalizeCompletedMultilayerReport(page, reportName, reportContainer = null) {
    const container = reportContainer || await searchReportWithRetry(page, reportName);
    if (!container) throw new Error(`Report ${reportName} not found when finalizing`);

    const reportLink = container.locator(`xpath=.//a[contains(normalize-space(.),'${reportName}')]`);

    await safeWait(page, 10000); // wait for the page to be stable before clicking the report link

    const MAX_CLICK_RETRIES = 3;

    for (let i = 1; i <= MAX_CLICK_RETRIES; i++) {
        try {
            console.log(`🖱️ Attempting to click report (Attempt ${i}/${MAX_CLICK_RETRIES})...`);

            await safeWait(page, 5000); // Small stability buffer
            await reportLink.click({ force: true });

            // Wait for URL to change to contain "explore/" (timeout after 60s)
            await page.waitForURL(url => url.href.includes('explore/'), { timeout: 60000 });

            console.log(`🔗 URL changed successfully. Navigation confirmed.`);
            break;
        } catch (e) {
            console.warn(`⚠️ Click attempt ${i} failed or URL did not change: ${e.message}`);
            if (i === MAX_CLICK_RETRIES) throw new Error("Failed to navigate to report details after multiple click attempts.");
        }
    }

    return keplerDatasetsFetch(page, reportName);
}

// Function to verify default Bento charts for a given report type and name

async function verifyDefaultBentoCharts(
    page,
    reportType,
    reportName
) {

    const defaultCharts = {

        "place level visits": {
            heading: "Observed Visits",
            count: 8
        },

        "device level visits": {
            heading: "Total Unique Audiences",
            count: 7
        },

        "places": {
            heading: "Total Places",
            count: 4
        },

        "quality of life index": {
            heading: "Average Quality Of Life Index",
            count: 2
        },

        "population": {
            heading: "Total Population",
            count: 2
        },

        "home locations": {
            heading: "Total IFA Count",
            count: 2
        },

        "places internal": {
            heading: "Total Places",
            count: 4
        }
    };


    const config =
        defaultCharts[reportType.trim().toLowerCase()];


    if (!config) {

        console.log(
            `ℹ️ No Bento validation configured for ${reportType}`
        );

        logSession(
            `ℹ️ No Bento validation configured for ${reportType}`
        );

        return;
    }


    console.log(
        `🔍 Starting Bento validation for '${reportName}'...`
    );

    logSession(
        `🔍 Starting Bento validation for '${reportName}'...`
    );


    // =====================================================
    // 1. WAIT FOR DEFAULT BENTO CARD
    // =====================================================

    const heading = page.getByText(
        config.heading,
        {
            exact: true
        }
    );

    try {

        await heading.waitFor({
            state: "visible",
            timeout: 120000
        });

    } catch (err) {

        const currentUrl = page.url();

        console.error(
            `❌ Bento report content did not load for '${reportName}'.`
        );

        console.error(
            `❌ Expected Bento heading: '${config.heading}'`
        );

        console.error(
            `🔗 Current URL: ${currentUrl}`
        );

        logSession(
            `❌ Bento report content did not load for '${reportName}'.`,
            false,
            { report: reportName, url: currentUrl, metric: config.heading }
        );

        logSession(
            `❌ Expected Bento heading: '${config.heading}'`
        );

        logSession(
            `🔗 Current URL: ${currentUrl}`
        );

        throw new Error(
            `Bento report content did not load for '${reportName}'. ` +
            `Expected heading '${config.heading}' was not visible.`
        );
    }


    console.log(
        `✅ Bento report content loaded for '${reportName}'.`
    );

    logSession(
        `✅ Bento report content loaded for '${reportName}'.`
    );


    // =====================================================
    // 2. VERIFY CHART COUNT
    // =====================================================

    const expectedChartsText =
        `${config.count} charts loaded out of ${config.count}`;


    /*
     * This text can be transient.
     * Therefore we DO NOT use it as the primary
     * indication that the Bento report has loaded.
     */

    const chartsLoadedText = page.getByText(
        expectedChartsText,
        {
            exact: true
        }
    );


    if (
        await chartsLoadedText
            .waitFor({
                state: "visible",
                timeout: 30000
            })
            .then(() => true)
            .catch(() => false)
    ) {

        const loadedText =
            (
                await chartsLoadedText
                    .textContent()
            )?.trim();


        if (loadedText !== expectedChartsText) {

            throw new Error(
                `Bento chart count mismatch for '${reportName}'.\n` +
                `Expected: '${expectedChartsText}'\n` +
                `Actual: '${loadedText}'`
            );
        }


        console.log(
            `✅ Bento charts loaded verified for '${reportName}' | ${loadedText}`
        );

        logSession(
            `✅ Bento charts loaded verified for '${reportName}' | ${loadedText}`,
            false,
            { report: reportName, charts_loaded_text: loadedText }
        );

    } else {

        /*
         * The chart count message may disappear after
         * the charts finish rendering.
         *
         * Since the actual Bento heading is already
         * visible, we don't fail here.
         */

        console.log(
            `ℹ️ Chart loading count '${expectedChartsText}' is no longer visible. ` +
            `Bento content itself is already loaded.`
        );

        logSession(
            `ℹ️ Chart loading count '${expectedChartsText}' is no longer visible. ` +
            `Bento content itself is already loaded.`
        );
    }


    // =====================================================
    // 3. VERIFY FIRST BENTO CARD
    // =====================================================

    const value = heading.locator(
        "xpath=following::p[1]"
    );


    await value.waitFor({
        state: "visible",
        timeout: 60000
    });


    const cardValue =
        (
            await value.textContent()
        )?.trim();


    if (!cardValue) {

        throw new Error(
            `Default Bento card '${config.heading}' ` +
            `does not contain a value for '${reportName}'.`
        );
    }


    console.log(
        `✅ Default Bento verified for '${reportName}' | ` +
        `${config.heading}: ${cardValue}`
    );

    logSession(
        `✅ Default Bento verified for '${reportName}' | ` +
        `${config.heading}: ${cardValue}`,
        false,
        { report: reportName, metric: config.heading, value: cardValue }
    );


    // =====================================================
    // 4. FINAL SUCCESS
    // =====================================================

    console.log(
        `🎉 Bento validation completed successfully for '${reportName}'.`
    );

    logSession(
        `🎉 Bento validation completed successfully for '${reportName}'.`
    );
}



async function verifyAggregatedCount(page, reportName) {

    // Navigate to Explore
    await page.goto(`${new URL(page.url()).origin}/explore`);

    await page.waitForURL("**/explore", {
        timeout: 30000
    });

    // Search report
    const searchBox = page.getByPlaceholder("Search for a file");

    await searchBox.fill(reportName);

    // Find created report
    const reportText = page
        .getByText(reportName, { exact: true })
        .last();

    await expect(reportText).toBeVisible({
        timeout: 30000
    });

    // Find report row and click its 3-dot menu (same reliable pattern as searchAndClickReport)
    const menuButton = reportText.locator(
        "xpath=ancestor::div[contains(@class,'mt-2 w-full')]//button[@aria-haspopup='menu']"
    );

    await expect(menuButton).toBeVisible({
        timeout: 10000
    });

    await menuButton.click();

    // Click Aggregated Count
    await page.getByText("Aggregated Count", {
        exact: true
    }).click();

    // Wait for summary page
    await page.waitForURL(
        "**/explore/summary?id=*",
        {
            timeout: 30000
        }
    );

    console.log("✅ Aggregated Count summary page loaded");

    // ==========================================
    // Wait for Total value to render
    // ==========================================

    const totalValueLocator = page.locator(
        'div.truncate.text-left.font-medium.leading-tight.false:visible'
    );

    try {

        await expect(totalValueLocator.first()).toBeVisible({
            timeout: 60000
        });

    } catch (err) {

        const currentUrl = page.url();

        console.error(
            `❌ Aggregated Count Total value did not render for '${reportName}'.`
        );

        logSession(
            `❌ Aggregated Count Total value did not render for '${reportName}'.`,
            false,
            { report: reportName, url: currentUrl }
        );

        console.error(
            `🔗 Current URL: ${currentUrl}`
        );

        // ------------------------------------------
        // Check whether we are still on summary page
        // ------------------------------------------

        if (currentUrl.includes("/explore/summary")) {

            console.error(
                `⚠️ Aggregated Count summary page opened, but the Total value is missing/not loaded.`
            );

            logSession(
                `⚠️ Aggregated Count summary page opened, but the Total value is missing/not loaded.`,
                false,
                { report: reportName }
            );

        } else {

            console.error(
                `⚠️ Unexpected page while verifying Aggregated Count.`
            );

            logSession(
                `⚠️ Unexpected page while verifying Aggregated Count.`,
                false,
                { report: reportName }
            );
        }

        return null;
    }

    // ==========================================
    // Get value
    // ==========================================

    const totalValue = (
        await totalValueLocator.first().getAttribute("title")
    )?.trim();

    if (!totalValue) {

        console.error(
            `⚠️ Aggregated Count Total value is empty for '${reportName}'.`
        );

        logSession(
            `⚠️ Aggregated Count Total value is empty for '${reportName}'.`,
            false,
            { report: reportName }
        );

        return null;
    }

    // ==========================================
    // Convert value to number
    // ==========================================

    const numericValue = Number(
        totalValue.replace(/,/g, "")
    );

    expect(numericValue).not.toBeNaN();

    expect(numericValue).toBeGreaterThan(0);

    console.log(
        `✅ Aggregated Count verified for '${reportName}' | Total: ${totalValue}`
    );

    logSession(
        `✅ Aggregated Count verified for '${reportName}' | Total: ${totalValue}`,
        false,
        { report: reportName, total: totalValue }
    );

    return totalValue;
}

async function verifyAudienceUploadStatus(
    page,
    reportName,
    platform,
    maxWaitMinutes = 30
) {
    const startTime = Date.now();
    const MAX_WAIT_MS = maxWaitMinutes * 60 * 1000;
    const CHECK_INTERVAL = 60 * 1000; // 1 minute

    try {
        // ==========================================
        // 1. Open Profile Menu
        // ==========================================

        const profileIcon = page.locator(
            "//div[@type='button']//*[name()='svg']"
        );

        await expect(profileIcon).toBeVisible({
            timeout: 30000
        });

        await profileIcon.click();

        console.log("✅ Profile menu clicked");
        logSession("✅ Profile menu clicked");

        // ==========================================
        // 2. Open Settings
        // ==========================================

        const settingsOption = page.getByRole("button", {
            name: "Settings",
            exact: true
        });

        await expect(settingsOption).toBeVisible({
            timeout: 15000
        });

        await settingsOption.click();

        console.log("✅ Settings opened");
        logSession("✅ Settings opened");

        // ==========================================
        // 3. Open Uploaded Audience
        // ==========================================

        const uploadedAudienceTab = page.getByText(
            "Uploaded Audience",
            {
                exact: true
            }
        );

        await expect(uploadedAudienceTab).toBeVisible({
            timeout: 30000
        });

        await uploadedAudienceTab.click();

        // ==========================================
        // 4. Wait for Status column
        // ==========================================

        const statusHeader = page.getByText("Status", {
            exact: true
        });

        await expect(statusHeader).toBeVisible({
            timeout: 30000
        });

        console.log("✅ Uploaded Audience page loaded");
        logSession("✅ Uploaded Audience page loaded");

        // ==========================================
        // 5. Find Status column dynamically
        // ==========================================

        const headers = page
            .locator("thead tr")
            .first()
            .locator("th");

        const headerCount = await headers.count();

        let statusColumnIndex = -1;

        for (let i = 0; i < headerCount; i++) {
            const headerText = (
                await headers.nth(i).innerText()
            ).trim();

            if (headerText.toLowerCase() === "status") {
                statusColumnIndex = i;
                break;
            }
        }

        expect(statusColumnIndex).toBeGreaterThanOrEqual(0);

        console.log(
            `🔎 Status column index: ${statusColumnIndex}`
        );

        // ==========================================
        // Find Audience Count column dynamically
        // ==========================================

        let audienceCountColumnIndex = -1;

        for (let i = 0; i < headerCount; i++) {
            const headerText = (
                await headers.nth(i).innerText()
            ).trim();

            if (headerText.toLowerCase() === "audience count") {
                audienceCountColumnIndex = i;
                break;
            }
        }

        expect(audienceCountColumnIndex).toBeGreaterThanOrEqual(0);

        console.log(
            `🔎 Audience Count column index: ${audienceCountColumnIndex}`
        );

        logSession(
            `🔎 Audience Count column index: ${audienceCountColumnIndex}`
        );

        // ==========================================
        // Function to find current report row
        // ==========================================

        const findReportRow = async () => {
            const rows = page.locator("tbody tr");

            await expect(rows.first()).toBeVisible({
                timeout: 30000
            });

            const rowCount = await rows.count();

            for (let i = 0; i < rowCount; i++) {
                const row = rows.nth(i);

                const rowText = (await row.innerText()).trim();

                if (
                    rowText.includes(reportName) &&
                    rowText.toLowerCase().includes(platform.toLowerCase())
                ) {
                    return row;
                }
            }

            return null;
        };
        // ==========================================
        // 6. Check status
        // ==========================================

        while (Date.now() - startTime < MAX_WAIT_MS) {

            const elapsedMinutes = (
                (Date.now() - startTime) / 60000
            ).toFixed(1);

            const reportRow = await findReportRow();

            if (!reportRow) {
                throw new Error(
                    `Audience report '${reportName}' not found in Uploaded Audience table.`
                );
            }

            const statusCell = reportRow
                .locator("td")
                .nth(statusColumnIndex);

            const status = (
                await statusCell.innerText()
            ).trim();

            console.log(
                `🔄 Audience upload status for '${reportName}': ${status} | Elapsed: ${elapsedMinutes} min`
            );

            logSession(
                `🔄 Audience upload status for '${reportName}': ${status} | Elapsed: ${elapsedMinutes} min`
            );

            // ==========================================
            // Read Audience Count
            // ==========================================

            const audienceCountCell = reportRow
                .locator("td")
                .nth(audienceCountColumnIndex);

            const audienceCount = (
                await audienceCountCell.innerText()
            ).trim();

            console.log(
                `🔢 Audience Count for '${reportName}' [${platform}]: ${audienceCount}`
            );

            logSession(
                `🔢 Audience Count for '${reportName}' [${platform}]: ${audienceCount}`
            );

            // ==========================================
            // SUCCESS
            // ==========================================

            if (
                status.toLowerCase() === "successful" ||
                status.toLowerCase() === "completed"
            ) {
                const cleanAudienceCount = audienceCount
                    .replace(/,/g, "")
                    .trim();

                const numericAudienceCount = Number(
                    cleanAudienceCount
                );

                if (Number.isNaN(numericAudienceCount)) {
                    throw new Error(
                        `Unable to parse Audience Count '${audienceCount}' for '${reportName}'.`
                    );
                }

                console.log(
                    `✅ Audience upload successful for '${reportName}' | Status: ${status}`
                );

                console.log(
                    `🔢 Final Audience Count for '${reportName}' [${platform}]: ${numericAudienceCount}`
                );

                logSession(
                    `✅ Audience upload successful for '${reportName}' | Status: ${status}`
                );

                logSession(
                    `🔢 Final Audience Count for '${reportName}' [${platform}]: ${numericAudienceCount}`
                );

                return {
                    status,
                    audienceCount: numericAudienceCount
                };
            }

            // ==========================================
            // FAILURE
            // ==========================================

            if (
                status.toLowerCase() === "unsuccessful" ||
                status.toLowerCase() === "error"
            ) {
                throw new Error(
                    `Audience upload failed for '${reportName}' | Status: ${status}`
                );
            }

            // ==========================================
            // PENDING
            // ==========================================

            if (status.toLowerCase() === "pending") {

                const remainingMinutes = (
                    (MAX_WAIT_MS - (Date.now() - startTime)) /
                    60000
                ).toFixed(1);

                console.log(
                    `⏳ Audience upload still Pending. Waiting 1 minute before checking again. Remaining: ${remainingMinutes} min`
                );

                logSession(
                    `⏳ Audience upload still Pending. Waiting 1 minute before checking again. Remaining: ${remainingMinutes} min`
                );

                // ==========================================
                // Wait exactly 1 minute
                // ==========================================

                await page.waitForTimeout(CHECK_INTERVAL);

                // ==========================================
                // Go to Personal tab
                // ==========================================

                const personalTab = page.getByText("Personal", {
                    exact: true
                });

                await expect(personalTab).toBeVisible({
                    timeout: 30000
                });

                await personalTab.click();

                console.log("🔄 Navigated to Personal tab");
                logSession("🔄 Navigated to Personal tab");

                // ==========================================
                // Go back to Uploaded Audience
                // ==========================================

                const uploadedAudienceTab = page.getByText(
                    "Uploaded Audience",
                    {
                        exact: true
                    }
                );

                await expect(uploadedAudienceTab).toBeVisible({
                    timeout: 30000
                });

                await uploadedAudienceTab.click();

                console.log(
                    "🔄 Navigated back to Uploaded Audience tab - fetching latest status..."
                );

                logSession(
                    "🔄 Navigated back to Uploaded Audience tab - fetching latest status..."
                );

                // ==========================================
                // Wait for Status column to render
                // ==========================================

                await expect(
                    page.getByText("Status", {
                        exact: true
                    })
                ).toBeVisible({
                    timeout: 30000
                });

                console.log(
                    "✅ Uploaded Audience data refreshed"
                );

                logSession(
                    "✅ Uploaded Audience data refreshed"
                );

                continue;
            }

            // ==========================================
            // UNKNOWN STATUS
            // ==========================================

            console.log(
                `⚠️ Unknown audience status: ${status}`
            );

            logSession(
                `⚠️ Unknown audience status: ${status}`
            );

            await page.waitForTimeout(CHECK_INTERVAL);
        }

        // ==========================================
        // 7. 30 MINUTE TIMEOUT
        // ==========================================

        throw new Error(
            `Audience upload verification timed out for '${reportName}' after ${maxWaitMinutes} minutes.`
        );

    } catch (err) {

        console.error(
            `❌ Audience upload verification failed for '${reportName}': ${err.message}`
        );

        logSession(
            `❌ Audience upload verification failed for '${reportName}': ${err.message}`
        );

        throw err;
    }
}

async function verifyAppendAudience(
    page,
    reportName,
    platform,
    previousAudienceCount,
    maxWaitMinutes = 30
) {
    try {
        // =========================================================
        // VALIDATE PREVIOUS AUDIENCE COUNT
        // =========================================================

        const previousCount = Number(previousAudienceCount);

        if (Number.isNaN(previousCount)) {
            throw new Error(
                `Invalid previous audience count: '${previousAudienceCount}'`
            );
        }

        console.log(
            `🔢 Previous Audience Count before Append: ${previousCount}`
        );

        logSession(
            `🔢 Previous Audience Count before Append: ${previousCount}`
        );

        // =========================================================
        // 1. GO TO EXPLORE
        // =========================================================

        console.log(
            `🔄 Starting Append Audience flow for '${reportName}'`
        );

        logSession(
            `🔄 Starting Append Audience flow for '${reportName}'`
        );

        await page.goto(
            `${new URL(page.url()).origin}/explore`,
            {
                waitUntil: "networkidle",
                timeout: 60000
            }
        );

        await page.waitForURL("**/explore", {
            timeout: 30000
        });

        await page.locator(
            "//a[@href='/explore' and @data-sidebar='menu-button']"
        ).waitFor({
            state: "visible",
            timeout: 30000
        });

        // =========================================================
        // 2. FIND ORIGINAL REPORT
        // =========================================================

        console.log(
            `🔎 Searching original report '${reportName}' for Append Audience...`
        );

        logSession(
            `🔎 Searching original report '${reportName}' for Append Audience...`
        );

        const reportFound = await searchAndClickReport(
            page,
            reportName
        );

        if (!reportFound) {
            throw new Error(
                `Report '${reportName}' could not be found in Explore.`
            );
        }

        console.log(
            `✅ Report '${reportName}' found and 3-dot menu opened`
        );

        logSession(
            `✅ Report '${reportName}' found and 3-dot menu opened`
        );

        // =========================================================
        // 3. CLICK EDIT
        // =========================================================

        const editOption = page.getByText("Edit", {
            exact: true
        }).last();

        await expect(editOption).toBeVisible({
            timeout: 15000
        });

        await editOption.click();

        console.log(
            `✅ Edit option clicked for '${reportName}'`
        );

        logSession(
            `✅ Edit option clicked for '${reportName}'`
        );

        // =========================================================
        // 4. OPEN DATE RANGE
        // =========================================================

        const dateRangeButton = page.locator("#date");

        await expect(dateRangeButton).toBeVisible({
            timeout: 30000
        });

        const currentDateRange = (
            await dateRangeButton.innerText()
        ).trim();

        console.log(
            `📅 Existing Date Range: ${currentDateRange}`
        );

        logSession(
            `📅 Existing Date Range: ${currentDateRange}`
        );

        // =========================================================
        // 5. PARSE EXISTING DATE RANGE
        // =========================================================

        const dateParts = currentDateRange.split("-");

        if (dateParts.length !== 2) {
            throw new Error(
                `Unable to parse date range: '${currentDateRange}'`
            );
        }

        const endDateText = dateParts[1].trim();

        const existingEndDate = new Date(endDateText);

        if (Number.isNaN(existingEndDate.getTime())) {
            throw new Error(
                `Invalid end date: '${endDateText}'`
            );
        }

        // =========================================================
        // 6. INCREASE END DATE BY ONE DAY
        // =========================================================

        const newEndDate = new Date(existingEndDate);

        newEndDate.setDate(
            newEndDate.getDate() + 1
        );

        const formatDate = date => {
            return date.toLocaleDateString(
                "en-US",
                {
                    month: "short",
                    day: "2-digit",
                    year: "numeric"
                }
            );
        };

        const oldEndDateFormatted =
            formatDate(existingEndDate);

        const newEndDateFormatted =
            formatDate(newEndDate);

        console.log(
            `📅 Increasing date range: ${oldEndDateFormatted} → ${newEndDateFormatted}`
        );

        logSession(
            `📅 Increasing date range: ${oldEndDateFormatted} → ${newEndDateFormatted}`
        );

        // =========================================================
        // 7. OPEN CALENDAR
        // =========================================================

        await dateRangeButton.click();

        const calendarDays = page.locator(
            'button[name="day"]'
        );

        await expect(calendarDays.first()).toBeVisible({
            timeout: 10000
        });

        // =========================================================
        // 8. BUILD TARGET DATE ARIA LABEL
        // =========================================================

        const monthName = newEndDate.toLocaleString(
            "en-US",
            {
                month: "long"
            }
        );

        const dayNumber =
            newEndDate.getDate();

        const year =
            newEndDate.getFullYear();

        const getOrdinal = number => {
            if (
                number >= 11 &&
                number <= 13
            ) {
                return `${number}th`;
            }

            switch (number % 10) {
                case 1:
                    return `${number}st`;

                case 2:
                    return `${number}nd`;

                case 3:
                    return `${number}rd`;

                default:
                    return `${number}th`;
            }
        };

        const targetDateText =
            `${monthName} ${getOrdinal(dayNumber)}, ${year}`;

        console.log(
            `🎯 Selecting new end date: ${targetDateText}`
        );

        // =========================================================
        // 9. SELECT NEW END DATE
        // =========================================================

        let targetDay = page.locator(
            `button[name="day"][aria-label*="${targetDateText}"]`
        );

        let targetCount =
            await targetDay.count();

        // Fallback
        if (targetCount === 0) {
            targetDay = page
                .locator('button[name="day"]')
                .filter({
                    hasText: String(dayNumber)
                });

            targetCount =
                await targetDay.count();
        }

        if (targetCount === 0) {
            throw new Error(
                `Could not find date '${targetDateText}' in calendar.`
            );
        }

        let selectedDay = null;

        for (
            let i = 0;
            i < targetCount;
            i++
        ) {
            const candidate =
                targetDay.nth(i);

            if (
                await candidate.isVisible()
            ) {
                selectedDay = candidate;
                break;
            }
        }

        if (!selectedDay) {
            throw new Error(
                `Target date '${targetDateText}' was found but is not visible.`
            );
        }

        await selectedDay.click();

        console.log(
            `✅ New end date '${newEndDateFormatted}' selected`
        );

        logSession(
            `✅ New end date '${newEndDateFormatted}' selected`
        );

        // =========================================================
        // 10. CLOSE CALENDAR
        // =========================================================

        await page.keyboard.press("Escape");

        await page.waitForTimeout(500);

        // =========================================================
        // 11. VERIFY UPDATED DATE RANGE
        // =========================================================

        const updatedDateRange = (
            await dateRangeButton.innerText()
        ).trim();

        console.log(
            `📅 Updated Date Range: ${updatedDateRange}`
        );

        logSession(
            `📅 Updated Date Range: ${updatedDateRange}`
        );

        if (
            !updatedDateRange.includes(
                newEndDateFormatted
            )
        ) {
            throw new Error(
                `Date range was not updated correctly. Expected end date '${newEndDateFormatted}', received '${updatedDateRange}'.`
            );
        }

        console.log(
            `✅ Date range successfully increased by 1 day`
        );

        logSession(
            `✅ Date range successfully increased by 1 day`
        );

        // =========================================================
        // 12. CLICK EDIT REPORT
        // =========================================================

        const editReportButton =
            page.getByRole("button", {
                name: "Edit Report"
            });

        await expect(editReportButton).toBeVisible({
            timeout: 15000
        });

        await editReportButton.click();

        console.log(
            `✅ Edit Report clicked`
        );

        logSession(
            `✅ Edit Report clicked`
        );

        // =========================================================
        // 13. WAIT FOR EXPLORE PAGE
        // =========================================================

        await page.waitForTimeout(3000);

        await expect
            .poll(
                async () => page.url(),
                {
                    timeout: 30000,
                    intervals: [1000, 2000, 3000]
                }
            )
            .toMatch(/\/explore$/);

        console.log(
            `✅ Returned to Explore after editing report`
        );

        logSession(
            `✅ Returned to Explore after editing report`
        );

        await page.waitForTimeout(3000);

        // =========================================================
        // 14. FIND EDITED REPORT
        // =========================================================

        console.log(
            `🔎 Searching for edited report '${reportName}'...`
        );

        logSession(
            `🔎 Searching for edited report '${reportName}'...`
        );

        const searchInput =
            page.getByPlaceholder("Search for a file");

        await expect(searchInput).toBeVisible({
            timeout: 30000
        });

        await searchInput.fill(reportName);

        await page.waitForTimeout(2000);

        const reportLink = page.locator(
            `//a[normalize-space(text())='${reportName}']`
        );

        await expect(reportLink).toBeVisible({
            timeout: 60000
        });

        console.log(
            `✅ Edited report '${reportName}' found in Explore`
        );

        logSession(
            `✅ Edited report '${reportName}' found in Explore`
        );

        // =========================================================
        // 15. OPEN THREE-DOT MENU
        // =========================================================

        const threeDotButton =
            reportLink.locator(
                "xpath=ancestor::div[contains(@class,'mt-2 w-full')]//button[@aria-haspopup='menu']"
            );

        await expect(threeDotButton).toBeVisible({
            timeout: 30000
        });

        await threeDotButton.click();

        console.log(
            `✅ Three-dot menu opened for edited report '${reportName}'`
        );

        logSession(
            `✅ Three-dot menu opened for edited report '${reportName}'`
        );

        // =========================================================
        // 16. CLICK UPLOAD AUDIENCE
        // =========================================================

        const uploadAudienceOption =
            page.getByText(
                "Upload Audience",
                {
                    exact: true
                }
            ).last();

        await expect(
            uploadAudienceOption
        ).toBeVisible({
            timeout: 15000
        });

        await uploadAudienceOption.click();

        console.log(
            `✅ Upload Audience selected for '${reportName}'`
        );

        logSession(
            `✅ Upload Audience selected for '${reportName}'`
        );

        // =========================================================
        // 17. WAIT FOR UPLOAD DIALOG
        // =========================================================

        await page.waitForTimeout(2000);

        console.log(
            `⏳ Upload Audience dialog opened for '${reportName}'`
        );

        logSession(
            `⏳ Upload Audience dialog opened for '${reportName}'`
        );

        // =========================================================
        // 18. UPLOAD AUDIENCE
        // =========================================================
        //
        // IMPORTANT:
        //
        // Your existing uploadAudiences() function is responsible
        // for performing the actual Google/Meta audience upload.
        //
        // Call it here.
        // =========================================================

        const uploadResult = await uploadAudiences(
            page,
            [platform]
        );

        console.log(
            `✅ Append Audience upload action completed for '${reportName}'`
        );

        logSession(
            `✅ Append Audience upload action completed for '${reportName}'`
        );

        // =========================================================
        // 19. VERIFY UPLOAD RESULT IF AVAILABLE
        // =========================================================

        if (
            uploadResult &&
            Array.isArray(uploadResult)
        ) {
            console.log(
                `📦 Upload result received for '${reportName}':`,
                uploadResult
            );

            logSession(
                `📦 Upload result received for '${reportName}'`
            );
        }

        // =========================================================
        // 20. WAIT FOR APPEND AUDIENCE PROCESSING
        // =========================================================

        console.log(
            `⏳ Waiting for Append Audience operation to complete...`
        );

        logSession(
            `⏳ Waiting for Append Audience operation to complete...`
        );

        // =========================================================
        // 21. VERIFY NEW AUDIENCE STATUS + COUNT
        // =========================================================

        const appendResult =
            await verifyAudienceUploadStatus(
                page,
                reportName,
                platform,
                maxWaitMinutes
            );

        if (
            !appendResult ||
            typeof appendResult.audienceCount !== "number"
        ) {
            throw new Error(
                `Append Audience verification did not return a valid audience count for '${reportName}'.`
            );
        }

        const newAudienceCount =
            appendResult.audienceCount;

        // =========================================================
        // 22. LOG COUNTS
        // =========================================================

        console.log(
            `🔢 Previous Audience Count: ${previousCount}`
        );

        console.log(
            `🔢 New Audience Count after Append: ${newAudienceCount}`
        );

        logSession(
            `🔢 Previous Audience Count: ${previousCount}`
        );

        logSession(
            `🔢 New Audience Count after Append: ${newAudienceCount}`
        );

        // =========================================================
        // 24. CALCULATE APPEND RESULT
        // =========================================================

        const isGreater =
            newAudienceCount > previousCount;

        console.log(
            `📊 Append comparison: ${newAudienceCount} > ${previousCount} = ${isGreater}`
        );

        logSession(
            `📊 Append comparison: ${newAudienceCount} > ${previousCount} = ${isGreater}`
        );

        // =========================================================
        // 25. VERIFY APPEND
        // =========================================================

        if (!isGreater) {
            throw new Error(
                `APPEND AUDIENCE FAILED: ${newAudienceCount} is NOT greater than ${previousCount}`
            );
        }

        console.log(
            `✅ APPEND AUDIENCE PASSED: ${newAudienceCount} > ${previousCount}`
        );

        logSession(
            `✅ APPEND AUDIENCE PASSED: ${newAudienceCount} > ${previousCount}`
        );

        // =========================================================
        // 26. RETURN RESULT
        // =========================================================

        return {
            success: true,
            isGreater: true,
            reportName,
            platform,
            previousAudienceCount: previousCount,
            newAudienceCount,
            audienceIncrease:
                newAudienceCount - previousCount
        };

    } catch (err) {

        console.error(
            `❌ Append Audience verification failed for '${reportName}': ${err.message}`
        );

        logSession(
            `❌ Append Audience verification failed for '${reportName}': ${err.message}`
        );

        throw err;
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
    searchReportWithRetry,
    monitorMultilayerReport,
    checkMultilayerReportStatusOnce,
    finalizeCompletedMultilayerReport,
    verifyDefaultBentoCharts,
    verifyAggregatedCount,
    verifyAudienceUploadStatus,
    verifyAppendAudience
}