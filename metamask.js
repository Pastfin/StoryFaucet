
const { logMessage, waitForAndClick, typeInput } = require ('./helpers');

async function initMetamask(metamaskPage, privateKey) {
    await waitForAndClick(metamaskPage, '#onboarding__terms-checkbox', 'Terms checkbox');
    await waitForAndClick(metamaskPage, 'button[data-testid="onboarding-create-wallet"]:not([disabled])', 'Create Wallet button');
    await waitForAndClick(metamaskPage, 'button[data-testid="metametrics-no-thanks"]', 'No Thanks button');

    const password = 'pwdpwdpwd123$$$'; // it doesn't matter
    await typeInput(metamaskPage, 'input[data-testid="create-password-new"]', password, 'Create Password');
    await typeInput(metamaskPage, 'input[data-testid="create-password-confirm"]', password, 'Confirm Password');
    await waitForAndClick(metamaskPage, 'input[data-testid="create-password-terms"]', 'Password Terms checkbox');
    await waitForAndClick(metamaskPage, 'button[data-testid="create-password-wallet"]:not([disabled])', 'Create Password Wallet button');
    await waitForAndClick(metamaskPage, 'button[data-testid="secure-wallet-later"]', 'Secure Wallet Later button');
    await waitForAndClick(metamaskPage, 'input[data-testid="skip-srp-backup-popover-checkbox"]', 'Skip SRP Backup checkbox');
    await waitForAndClick(metamaskPage, 'button[data-testid="skip-srp-backup"]:not([disabled])', 'Skip SRP Backup button');
    await waitForAndClick(metamaskPage, 'button[data-testid="onboarding-complete-done"]', 'Onboarding Complete button');
    await waitForAndClick(metamaskPage, 'button[data-testid="pin-extension-next"]', 'Pin Extension Next button');
    await waitForAndClick(metamaskPage, 'button[data-testid="pin-extension-done"]', 'Pin Extension Done button');

    await new Promise(resolve => setTimeout(resolve, 3000));

    await waitForAndClick(metamaskPage, 'button[data-testid="account-menu-icon"]', 'Account Menu Icon');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await waitForAndClick(metamaskPage, 'button[data-testid="multichain-account-menu-popover-action-button"]', 'Multichain Account Menu button');

    await new Promise(resolve => setTimeout(resolve, 500));
    await metamaskPage.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find(el => el.textContent.includes('Import account'));
        if (button) {
            button.click();
        }
    });

    logMessage('Clicked on Import account button', "Debug");

    const privateKeyLast10 = privateKey.slice(-10);

    await typeInput(metamaskPage, 'input#private-key-box', privateKey, `Private Key (last 10: ${privateKeyLast10})`);
    await waitForAndClick(metamaskPage, 'button[data-testid="import-account-confirm-button"]:not([disabled])', 'Import Account Confirm button');
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
        throw error; 
    }
}

module.exports = {
    addNetwork,
    initMetamask
};
