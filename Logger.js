const fs = require('fs');
const path = require('path');

let sessionLogPath;

function initLogger(env) {
    const logDir = path.join(__dirname, 'logs');

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }

    sessionLogPath = path.join(logDir, `${env}_log.txt`);
}

function getSessionHeader(sessionNumber) {
    const timestamp = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });
    return `\n========= Session ${sessionNumber} | ${timestamp} =========\n`;
}

function getLastSessionNumber() {
    if (!fs.existsSync(sessionLogPath)) return 0;
    const logData = fs.readFileSync(sessionLogPath, 'utf-8');
    const matches = logData.match(/========= Session (\d+) \|/g);
    if (!matches) return 0;
    const numbers = matches.map(m => parseInt(m.match(/Session (\d+)/)[1]));
    return Math.max(...numbers);
}

function logToFile(filePath, message, isSessionStart = false) {
    const timestamp = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });

    const logMessage = isSessionStart 
        ? message 
        : `[${timestamp}] ${message}\n`;

    fs.appendFileSync(filePath, logMessage, 'utf-8');
}

function logSession(message, isSessionStart = false) {
    logToFile(sessionLogPath, message, isSessionStart);
}

module.exports = {
    initLogger,
    getSessionHeader,
    getLastSessionNumber,
    logSession
};