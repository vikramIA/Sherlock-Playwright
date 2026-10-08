// Shared "did the report page show an error?" check, used wherever a report/map
// is opened (Explore, Multilayer, WatsonAI, Persona status).
//
// The old check was page.locator("div:has-text('No Data'), div:has-text('Failed')"),
// which matches EVERY div whose text contains those words anywhere inside it —
// including the outermost app container. So .first() returned the whole page
// and the reason came out as "Toast detected: Home" (the sidebar's first word).
//
// This version only looks at leaf elements (no child elements), so the text it
// returns is the actual message. <script>/<style> are skipped because their
// source text can contain the word "failed".

const LOWER = "translate(normalize-space(.),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')";
const LEAF = "*[not(*)][not(self::script)][not(self::style)][not(self::noscript)]";

// deck.gl prints this into the page when the browser can no longer create a
// WebGL context (seen late in long VM runs: "GLVENDOR = Disabled"). The map
// cannot render, but it is a browser/VM problem, not a report failure.
const WEBGL_ERROR_XPATH = `//${LEAF}[contains(${LOWER}, 'webgl context')]`;

const ERROR_TOAST_XPATH = `//${LEAF}[contains(${LOWER}, 'no data') or contains(${LOWER}, 'failed')]`;

const WEBGL_LOST_TEXT = "Browser WebGL context lost — map could not render (VM browser issue, not a report failure)";

// Returns null when the page shows no error, otherwise
// { status: "no_data" | "error", text, webglLost }.
// Uses allTextContents() (no waiting) because these toasts auto-dismiss.
async function detectErrorToast(page) {
    const webglTexts = await page.locator(`xpath=${WEBGL_ERROR_XPATH}`).allTextContents();
    if (webglTexts.length > 0) {
        return { status: "error", text: WEBGL_LOST_TEXT, webglLost: true };
    }

    const texts = await page.locator(`xpath=${ERROR_TOAST_XPATH}`).allTextContents();
    const toastText = texts.map(t => t.split("\n")[0].trim()).find(Boolean);
    if (!toastText) return null;

    return {
        status: toastText.toLowerCase().includes("no data") ? "no_data" : "error",
        text: `Toast detected: ${toastText}`,
        webglLost: false,
    };
}

module.exports = { detectErrorToast };
