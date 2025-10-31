const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'log.txt');
const reportLogPath = path.join(__dirname, 'ReportLog.txt');

// Get command line arguments
const args = process.argv.slice(2).map(arg => arg.toLowerCase());

const clearLog = args.includes('log');
const clearReport = args.includes('report');

if (!clearLog && !clearNetwork && !clearReport) {
    console.log('❗ Please specify what to clear: `log`, `report`, or a combination.');
    console.log('👉 Example: node clearLogs.js log');
    console.log('👉 Example: node clearLogs.js report');
    console.log('👉 Example: node clearLogs.js log network report');
    process.exit(0);
}

function clearFile(filePath, label) {
    try {
        fs.writeFileSync(filePath, '', 'utf-8');
        console.log(`✅ ${label} has been cleared.`);
    } catch (err) {
        console.error(`❌ Failed to clear ${label}:`, err.message);
    }
}

if (clearLog) clearFile(logPath, 'log.txt');
if (clearReport) clearFile(reportLogPath, 'ReportLog.txt');

/*

# Clear only log.txt
node clearLogs.js log

# Clear only ReportLog.txt
node clearLogs.js report

# Clear all logs
node clearLogs.js log report
 
*/