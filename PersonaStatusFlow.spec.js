const { chromium } = require("@playwright/test");
const { loginAndNavigate } = require("./functions");
const { runPersonaStatusCheckFlow } = require("./PersonaStatusFlow.js");
const input = require("./input.json");
const envConfig = require("./Environments.json");
const { initLogger, getSessionHeader, getLastSessionNumber, logSession } = require("./Logger");

const cliEnvs = process.argv.slice(2);
const allEnvs = Object.keys(envConfig);

if (cliEnvs.length === 0) {
  throw new Error(`❌ Please provide an environment. Use: node PersonaStatusFlow.spec.js <${allEnvs.join("|")}>`);
}

const env = cliEnvs[0];

if (!envConfig[env]) {
  throw new Error(`❌ Environment "${env}" not found. Use: ${allEnvs.join(", ")}`);
}

const { baseUrl, email, password, secret } = envConfig[env];
initLogger(env);

async function main() {
  const newSession = getLastSessionNumber() + 1;
  logSession(getSessionHeader(newSession), true);

  let browser, context, page;

  try {
    const isHeadless = input.headless?.toUpperCase() === "YES";

    browser = await chromium.launch({
      headless: isHeadless,
      args: ['--start-maximized', '--force-device-scale-factor=1', '--high-dpi-support=1'],
    });

    context = await browser.newContext({ viewport: null });
    page = await context.newPage();

    await loginAndNavigate(page, baseUrl, email, password, secret);
    console.log("✅ Login completed.");
    logSession("✅ Login completed.");

    const results = await runPersonaStatusCheckFlow(page, env);

    console.log("📊 Final Persona Status Check Results:", results);
    logSession(`📊 Final Persona Status Check Results: ${JSON.stringify(results)}`);

  } catch (err) {
    console.error(`❌ Persona Status Check script failed: ${err.message}`);
    logSession(`❌ PERSONA STATUS CHECK SCRIPT FAILED: ${err.message}\n${err.stack}`);
  } finally {
    if (browser) await browser.close();
    console.log("✅ Browser closed, Persona status check session complete.");
    logSession("✅ Browser closed, Persona status check session complete.");
  }
}

main();
