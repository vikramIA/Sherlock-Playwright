# Sherlock Playwright Automation

Playwright-based automation that logs into [The Sherlock](http://dev.thesherlock.ai/), drives its report-generation flows (Explore, Persona, Multilayer, Watson AI), and captures logs, a video recording, and a Playwright trace for every run.

## Prerequisites

- Node.js 18+
- Repo dependencies installed:

```bash
npm install
npx playwright install chromium
```

## Project layout

| File | Purpose |
|---|---|
| [HomeDashboard.spec.js](HomeDashboard.spec.js) | Entry point — launches the browser, logs in, and runs all flows |
| [Environments.json](Environments.json) | Per-environment base URL + credentials (`dev`, `qa`, `prod`, `qa_automation`) |
| [input.json](input.json) | The test data: which reports to generate and with what parameters |
| [functions.js](functions.js) | Login and shared UI helpers |
| [ExploreReport.js](ExploreReport.js) | Explore report flow (Places, Place/Device Level Visits, Population, QLI, Home Locations, ...) |
| [PersonaReport.js](PersonaReport.js) | Persona / Custom Audience flows |
| [PostUploadExploreReport.js](PostUploadExploreReport.js) | Reports generated after a Persona audience upload |
| [MultilayerReport.js](MultilayerReport.js) | Merges multiple reports (Unified / Layered) |
| [WatsonAIFlow.js](WatsonAIFlow.js) / [WatsonAIFunctions.js](WatsonAIFunctions.js) | Watson AI chat-driven report flow |
| [Logger.js](Logger.js) | Writes structured (logfmt) session logs to `logs/<env>_log.txt` |
| [networkLogger.js](networkLogger.js) | Captures network activity to `network.log` per session |
| [Recording.js](Recording.js) | Wraps Playwright's built-in video recording |
| [clearLogs.js](clearLogs.js) | Utility to wipe log files |
| [data/](data) | CSV files used as audience/upload inputs |
| [session_artifacts/](session_artifacts) | Output per run: video, trace, network log (auto-pruned, last 5 kept per env) |

## Main case: run everything against one environment

```bash
node HomeDashboard.spec.js <env>
```

`<env>` must be a key from [Environments.json](Environments.json): `dev`, `qa`, `prod`, or `qa_automation`.

Example:

```bash
node HomeDashboard.spec.js qa
```

This will:
1. Launch Chromium (visible, not headless, by default) and log in using the credentials for that env.
2. Run every report defined in `input.json` under `explore`, then `Persona`, then `Multilayer` (if any `Report_TO_Merge` entries exist), then `WatsonAI`.
3. Save a video, a Playwright trace (`trace.zip`), and a network log into `session_artifacts/<env>_Session_<timestamp>/`.
4. Append a structured entry to `logs/<env>_log.txt` and print a run summary (success/failure/skipped counts) to the console.

If no env is passed, it runs **all** environments in parallel, each as its own child process:

```bash
node HomeDashboard.spec.js
```

## Modifications

### Run headless
Add a `headless` key to [input.json](input.json):

```json
{
  "headless": "YES",
  "explore": [ ... ]
}
```

Anything other than `"YES"` (or omitting the key) runs with the browser visible.

### Choose which reports run
[input.json](input.json) drives everything — comment out/remove entries or trim arrays to run a subset:

- `explore` — array of report definitions. `reportType` can be `Places`, `Place Level Visits`, `Device Level Visits`, `Population`, `Quality of Life Index`, `Quality of Life Index Raw`, `Places Internal`, or `Home Locations`. A `Places` entry can also chain into a PLV/DLV report by adding `PLACES_TO_Place_Level_Visit_Report`/`PLACES_TO_Device_Level_Visit_Report` plus a `PLVReportDetails`/`DLVReportDetails` block.
- `Persona` — array of audience-building flows (`Custom Audience to IFAs`, `Custom Places`, `Custom Place Codes`, `Occasion and Behavior Based Audiences`). Each can define `postUploadReports` to generate a Persona/QLI-style report against the built audience.
- `ReportForMultilayer` + `Multilayer` — `ReportForMultilayer` defines the individual reports (tagged with a numeric `ReportNumber`); `Multilayer` entries reference those numbers via `Report_TO_Merge` and merge them with `MergeType: "Unified"` or `"Layered"`.
- `WatsonAI` — array of natural-language queries sent to the Watson AI chat flow, each with an expected result to verify against (e.g. a `location`/`state` check or an `expectedMessage`).

Only the sections present and non-empty in `input.json` run — remove a top-level key (e.g. `Multilayer`) or empty its array to skip that flow entirely.

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

### Inspect a run afterward
- Video/network log: `session_artifacts/<env>_Session_<timestamp>/`
- Trace: open `session_artifacts/<env>_Session_<timestamp>/trace.zip` with `npx playwright show-trace <path>`
- Structured session log: `logs/<env>_log.txt` (logfmt — `key=value` pairs, one line per event; `outcome=` lines feed the run summary)

Only the 5 most recent session folders per environment are kept — older ones are deleted automatically at the start of the next run for that env.
