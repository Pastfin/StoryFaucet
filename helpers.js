const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'log.txt');

function logMessage(message, logLevel = "Info") {
    if (logLevel == "Info"){ // Can be "Info" or "Debug"
        const timestamp = new Date().toLocaleString(); // Local time logging
        const logText = `[${timestamp}] ${message}`;
        console.log(logText);
        fs.appendFileSync(logFile, logText + '\n');
    }
}

async function waitForAndClick(page, selector, description) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.click(selector);
        logMessage(`Clicked on: ${description}`, "Debug");
    } catch (error) {
        logMessage(`Error clicking on: ${description} - ${error.message}`);
        throw error; 
    }
}

async function waitForAndSmartClick(page, selector, description) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.realClick(selector);
        logMessage(`Clicked on: ${description}`, "Debug");
    } catch (error) {
        logMessage(`Error clicking on: ${description} - ${error.message}`);
        throw error; 
    }
}

async function typeInput(page, selector, value, description) {
    try {
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.type(selector, value);
        logMessage(`Typed value in: ${description}`, "Debug");
    } catch (error) {
        logMessage(`Error typing in: ${description} - ${error.message}`);
        throw error; 
    }
}


module.exports = {
    logMessage,
    waitForAndClick,
    typeInput,
    waitForAndSmartClick
};