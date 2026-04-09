const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');

// Get CLI args
const args = process.argv.slice(2).map(arg => arg.toLowerCase());

// Supported envs
const envs = ['dev', 'qa', 'prod'];

// Detect env-specific clear
const selectedEnvs = args.filter(arg => envs.includes(arg));

// Clear all logs flag
const clearAll = args.includes('all');

// Validation
if (args.length === 0) {
    console.log('❗ Please specify what to clear:');
    console.log('👉 node clearLogs.js dev');
    console.log('👉 node clearLogs.js qa prod');
    console.log('👉 node clearLogs.js all');
    process.exit(0);
}

// Utility function
function clearFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', 'utf-8');
            console.log(`✅ Cleared: ${path.basename(filePath)}`);
        }
    } catch (err) {
        console.error(`❌ Failed to clear ${filePath}:`, err.message);
    }
}

// 🔥 Case 1: Clear ALL logs
if (clearAll) {
    if (!fs.existsSync(logDir)) {
        console.log("⚠️ No logs folder found.");
        process.exit(0);
    }

    const files = fs.readdirSync(logDir);

    files.forEach(file => {
        clearFile(path.join(logDir, file));
    });

    console.log("🧹 All logs cleared.");
    process.exit(0);
}

// 🔥 Case 2: Clear specific env logs
if (selectedEnvs.length > 0) {
    selectedEnvs.forEach(env => {
        const filePath = path.join(logDir, `${env}_log.txt`);
        clearFile(filePath);
    });

    return;
}

// ❌ Invalid input
console.log("❌ Invalid input.");
console.log("👉 Use: dev | qa | prod | all");