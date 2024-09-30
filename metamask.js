const fs = require('fs');
const path = require('path');

// Log file setup
const logFile = path.join(__dirname, 'log.txt');

function logMessage(message) {
    const timestamp = new Date().toLocaleString(); // Local time logging
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

async function waitForAndClick(page, selector, description) {
    try {
        await page.waitForSelector(selector, { visible: true });
        await page.click(selector);
        logMessage(`Clicked on: ${description}`);
    } catch (error) {
        logMessage(`Error clicking on: ${description} - ${error.message}`);
    }
}

async function typeInput(page, selector, value, description) {
    try {
        await page.waitForSelector(selector, { visible: true });
        await page.type(selector, value);
        logMessage(`Typed value in: ${description}`);
    } catch (error) {
        logMessage(`Error typing in: ${description} - ${error.message}`);
    }
}

async function addNetwork(page, networkData) {
    try {
        await page.goto('chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/home.html#settings/networks/add-network', { waitUntil: 'networkidle2' });

        await typeInput(page, 'input[data-testid="network-form-network-name"]', networkData.name, 'Network Name');
        await typeInput(page, 'input[data-testid="network-form-rpc-url"]', networkData.rpcUrl, 'RPC URL');
        await typeInput(page, 'input[data-testid="network-form-chain-id"]', networkData.chainId, 'Chain ID');
        await typeInput(page, 'input[data-testid="network-form-ticker-input"]', networkData.currencySymbol, 'Currency Symbol');

        if (networkData.blockExplorerUrl) {
            await typeInput(page, 'input[data-testid="network-form-block-explorer-url"]', networkData.blockExplorerUrl, 'Block Explorer URL');
        }

        await waitForAndClick(page, 'button[datatestid="network-form-network-save-button"]:not([disabled])', 'Save Network button');
        logMessage('Network added: ' + networkData.name);
    } catch (error) {
        logMessage(`Error adding network: ${error.message}`);
    }
}

module.exports = {
    logMessage,
    waitForAndClick,
    typeInput,
    addNetwork,
};
