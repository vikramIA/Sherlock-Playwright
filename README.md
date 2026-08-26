# Sherlock Playwright Automation

Playwright-based automation that logs into [The Sherlock](http://dev.thesherlock.ai/), drives its report-generation flows (Explore, Persona, Multilayer, Watson AI, CS Agent), and captures logs, a video recording, and a Playwright trace for every run.

## Prerequisites

- Node.js 18+
- Repo dependencies installed:

```bash
npm install
npx playwright install chromium
```

- For the `npm run daily:*` / `detail:*` scripts on a headless Linux server or CI runner, `xvfb` must be installed (`sudo apt install xvfb` on Debian/Ubuntu) — those scripts run the browser non-headless inside a virtual display via `xvfb-run`.

## Project layout

| File | Purpose |
|---|---|
| [HomeDashboard.spec.js](HomeDashboard.spec.js) | Main entry point — launches the browser, logs in, and runs Explore/Persona/Multilayer/Watson AI/CS Agent |
| [Environments.json](Environments.json) | Per-environment base URL + credentials (`dev`, `qa`, `prod`, `qa_automation`) |
| [input.json](input.json) | Full test data ("detail" check type) — which reports to generate and with what parameters |
| [input-daily.json](input-daily.json) | Smaller test data ("daily" check type) — a fast smoke subset of the same schema as `input.json` |
| [functions.js](functions.js) | Login and shared UI helpers |
| [ExploreReport.js](ExploreReport.js) | Explore report flow (Places, Place/Device Level Visits, Population, QLI, Home Locations, ...) |
| [PersonaReport.js](PersonaReport.js) | Persona / Custom Audience flows |
| [PostUploadExploreReport.js](PostUploadExploreReport.js) | Reports generated after a Persona audience upload |
| [MultilayerReport.js](MultilayerReport.js) | Merges multiple reports (Unified batched / Layered) |
| [WatsonAIFlow.js](WatsonAIFlow.js) / [WatsonAIFunctions.js](WatsonAIFunctions.js) | Watson AI chat-driven report flow |
| [CSAgentFlow.js](CSAgentFlow.js) / [CSAgentFunctions.js](CSAgentFunctions.js) | CS Agent chat flow (fresh company onboarding, or resuming a saved Phase 2/3 run) |
| [PersonaStatusFlow.spec.js](PersonaStatusFlow.spec.js) / [PersonaStatusFlow.js](PersonaStatusFlow.js) / [PersonaStatusFunctions.js](PersonaStatusFunctions.js) | Separate follow-up script: checks the status of previously-created Persona reports and validates them once complete |
| [personaTracking.json](personaTracking.json) | Per-env list of Persona reports awaiting a status check, written by Explore/Persona/Multilayer flows and consumed by `PersonaStatusFlow.spec.js` |
| [Logger.js](Logger.js) | Writes structured (logfmt) session logs to `logs/<env>_log.txt` |
| [networkLogger.js](networkLogger.js) | Captures network activity to `network.log` per session |
| [Recording.js](Recording.js) | Wraps Playwright's built-in video recording |
| [clearLogs.js](clearLogs.js) | Utility to wipe log files |
| [data/](data) | CSV files used as audience/upload inputs |
| [session_artifacts/](session_artifacts) | Output per run: video, trace, network log (auto-pruned, last 5 kept per env+check type) |

## Main case: run everything against one environment

```bash
node HomeDashboard.spec.js <env> [checkType]
```

- `<env>` must be a key from [Environments.json](Environments.json): `dev`, `qa`, `prod`, or `qa_automation`.
- `[checkType]` is optional: `detail` (default — reads [input.json](input.json)) or `daily` (reads [input-daily.json](input-daily.json)).

Example:

```bash
node HomeDashboard.spec.js qa daily
```

This will:
1. Launch Chromium (visible, not headless, by default) and log in using the credentials for that env.
2. Log the planned run scope (report counts per flow, from the chosen input file) to the session log.
3. Run every report from the input file: `explore`, then `Persona`, then `Multilayer` (if any `Report_TO_Merge` entries exist), then `WatsonAI`, then `CSAgent` (if present).
4. Save a video, a Playwright trace (`trace.zip`), and a network log into `session_artifacts/<env>_<checkType>_Session_<timestamp>/`.
5. Append a structured entry to `logs/<env>_log.txt` and print a run summary (success/failure/skipped counts) to the console.

If no env is passed (an optional lone `checkType` is still allowed), it runs **all** environments in parallel, each as its own child process:

```bash
node HomeDashboard.spec.js          # detail check, all envs
node HomeDashboard.spec.js daily    # daily check, all envs
```

### npm scripts (daily / detail, per env)

```bash
npm run daily:dev     # daily check_type against dev
npm run daily:qa
npm run daily:prod
npm run detail:dev    # full detail check_type against dev
npm run detail:qa
npm run detail:prod
```

These wrap the same `node HomeDashboard.spec.js <env> <checkType>` call in `xvfb-run` so they work unattended on a headless Linux host (see Prerequisites). Combine with `RUN_ON_VM=true` (below) if that host has no GPU.

## Modifications

### Run headless
Add a `headless` key to [input.json](input.json) (or [input-daily.json](input-daily.json), whichever check type you're running):

```json
{
  "headless": "YES",
  "explore": [ ... ]
}
```

Anything other than `"YES"` (or omitting the key) runs with the browser visible.

### Choose which reports run
The input file (`input.json` for `detail`, `input-daily.json` for `daily`) drives everything — comment out/remove entries or trim arrays to run a subset. Both share the same schema:

- `explore` — array of report definitions. `reportType` can be `Places`, `Place Level Visits`, `Device Level Visits`, `Population`, `Quality of Life Index`, `Quality of Life Index Raw`, `Places Internal`, or `Home Locations`. A `Places` entry can also chain into a PLV/DLV report by adding `PLACES_TO_Place_Level_Visit_Report`/`PLACES_TO_Device_Level_Visit_Report` plus a `PLVReportDetails`/`DLVReportDetails` block.
- `Persona` — array of audience-building flows (`Custom Audience to IFAs`, `Custom Places`, `Custom Place Codes`, `Occasion and Behavior Based Audiences`). Each can define `postUploadReports` to generate a Persona/QLI-style report against the built audience.
- `ReportForMultilayer` + `Multilayer` — `ReportForMultilayer` defines the individual reports (tagged with a numeric `ReportNumber`); `Multilayer` entries reference those numbers via `Report_TO_Merge` and merge them with `MergeType: "Unified"` (processed in batches of 3, with async status polling) or `"Layered"` (processed one at a time).
- `WatsonAI` — array of natural-language queries sent to the Watson AI chat flow, each with an expected result to verify against (e.g. a `location`/`state` check or an `expectedMessage`).
- `CSAgent` — array of CS Agent chat test cases. `mode: "fresh"` starts a brand-new company (`companyName`, `problemStatement`, `questionnaire`, optionally chaining into Phase 2/3 via `continueToPhase2`/`continueToPhase3`); `mode: "resume"` picks up an existing `savedRun` at `phase: "Phase2"` or `"Phase3"`.

Any report that creates a Persona output with `Persona: "YES"` gets recorded into [personaTracking.json](personaTracking.json) for the given env, so a later `PersonaStatusFlow.spec.js` run can check on it (see below). Only the sections present and non-empty in the input file run — remove a top-level key (e.g. `Multilayer`) or empty its array to skip that flow entirely.

### Running on a VM / CI runner without a GPU
Window-sizing and DPI-consistency args are always on. GPU/software-rendering args (SwiftShader fallback) are off by default and only added when `RUN_ON_VM=true`:

```bash
RUN_ON_VM=true node HomeDashboard.spec.js qa
```

### Add/change environments
Edit [Environments.json](Environments.json) — add a new top-level key with `baseUrl`, `email`, `password`, and TOTP `secret`, then run with that key as the CLI arg.

### Upload data files
CSV files referenced by `Persona` entries (via `UploadFilePath`) live in [data/](data). Add a new CSV there and point a `Persona` entry's `UploadFilePath` at it (relative to the repo root).

### Clear logs
```bash
node clearLogs.js dev        # clear one env's log
node clearLogs.js qa prod    # clear multiple
node clearLogs.js all        # clear every file in logs/
```

### Follow up on Persona report status
Some Persona-derived reports take a long time to finish processing on the server side, so `HomeDashboard.spec.js` doesn't wait for them — it just records them in [personaTracking.json](personaTracking.json) and moves on. Run this separately (e.g. on a later cron tick) to check on and validate anything still pending for an env:

```bash
node PersonaStatusFlow.spec.js <env>
```

For each tracked report still in `Queued`/`In Progress`, it re-checks the status; once `Complete`, it runs validation (and, if configured, audience export) and updates `personaTracking.json` in place. Reports found `Incomplete` or missing are marked done (won't be retried).

### Inspect a run afterward
- Video/network log: `session_artifacts/<env>_<checkType>_Session_<timestamp>/`
- Trace: open `session_artifacts/<env>_<checkType>_Session_<timestamp>/trace.zip` with `npx playwright show-trace <path>`
- Structured session log: `logs/<env>_log.txt` (logfmt — `key=value` pairs, one line per event; `outcome=` lines feed the run summary; a `flow=run_plan` line at the start of each run records the planned report counts)

Only the 5 most recent session folders per environment+check-type combination are kept — older ones are deleted automatically at the start of the next run for that env/checkType.
