const { connect } = require("puppeteer-real-browser");
const path = require('path');
const ExcelJS = require('exceljs');
const { logMessage, waitForAndClick, typeInput, addNetwork } = require('./metamask');

async function loadBrowser(privateKey) {
    try {
        const metamaskPath = path.join(__dirname, '/12.3.0_0');
        const { page, browser } = await connect({
            headless: false,
            args: [
                '--window-size=1920,1080',
                '--disable-web-security',
                `--disable-extensions-except=${metamaskPath}`, 
                `--load-extension=${metamaskPath}`,
            ],
            customConfig: {},
            turnstile: true,
            connectOption: {
                defaultViewport: null
            },
            disableXvfb: false,
            ignoreAllFlags: false,
        });

        logMessage('Browser launched successfully');

        await new Promise(resolve => setTimeout(resolve, 3000));

        const pages = await browser.pages();
        let metamaskPage;

        for (const page of pages) {
            const url = await page.url();
            if (url.includes('chrome-extension://')) {
                metamaskPage = page;
                break;
            }
        }

        if (!metamaskPage) {
            logMessage('MetaMask page not found');
            return;
        }

        logMessage('MetaMask page found, starting automation...');

        await waitForAndClick(metamaskPage, '#onboarding__terms-checkbox', 'Terms checkbox');
        await waitForAndClick(metamaskPage, 'button[data-testid="onboarding-create-wallet"]:not([disabled])', 'Create Wallet button');
        await waitForAndClick(metamaskPage, 'button[data-testid="metametrics-no-thanks"]', 'No Thanks button');

        const password = 'pwdpwdpwd123$$$';
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
        logMessage('Clicked on Import account button');

        const privateKeyLast10 = privateKey.slice(-10);

        await typeInput(metamaskPage, 'input#private-key-box', privateKey, `Private Key (last 10: ${privateKeyLast10})`);
        await waitForAndClick(metamaskPage, 'button[data-testid="import-account-confirm-button"]:not([disabled])', 'Import Account Confirm button');

        logMessage(`Successfully imported account with private key ending in: ${privateKeyLast10}`);

        await new Promise(resolve => setTimeout(resolve, 2000));

        const networkData = {
            name: 'iliad',
            rpcUrl: 'https://testnet.storyrpc.io',
            chainId: '1513',
            currencySymbol: 'IP',
            blockExplorerUrl: 'https://testnet.storyscan.xyz/'
        };
        
        await addNetwork(metamaskPage, networkData);
        logMessage('Network added successfully');

        await new Promise(resolve => setTimeout(resolve, 1500));
        await waitForAndClick(metamaskPage, 'button.home__new-network-added__switch-to-button', 'Switch to New Network button');
        await page.bringToFront();

        // Setup response interception with CDP
        const interceptUrl = "https://faucet.story.foundation/";
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Fetch.enable', {
            patterns: [{ urlPattern: '*', requestStage: 'Response' }],
        });

        client.on('Fetch.requestPaused', async (event) => {
            const { requestId, request, responseHeaders } = event;

            if (request.url === interceptUrl && request.method === 'POST') {
                try {
                    const response = await client.send('Fetch.getResponseBody', { requestId });
                    const originalBody = Buffer.from(response.body, 'base64').toString();
                    const randomValue = (Math.random() * (20 - 10) + 10).toFixed(20);
                    const preciseValue = parseFloat(randomValue).toPrecision(25);
                    const modifiedBody = originalBody.replace(/"data":"[^"]+"/, `"data":"${preciseValue}"`);

                    const modifiedHeaders = responseHeaders
                        .filter(header => header.name.toLowerCase() !== 'content-encoding')
                        .map(header => {
                            if (header.name.toLowerCase() === 'content-length') {
                                return { name: 'Content-Length', value: String(Buffer.byteLength(modifiedBody)) };
                            }
                            return header;
                        });

                    await client.send('Fetch.fulfillRequest', {
                        requestId,
                        responseCode: 200,
                        responseHeaders: modifiedHeaders,
                        body: Buffer.from(modifiedBody).toString('base64'),
                    });

                    logMessage('Modified response from faucet');
                } catch (error) {
                    logMessage(`Error modifying response: ${error.message}`);
                }
            } else {
                await client.send('Fetch.continueRequest', { requestId });
            }
        });

        logMessage('Started request interception for faucet URL');

        await passSepoilaCaptcha(page);

        await waitForAndClick(page, 'button[data-testid="rk-connect-button"]', 'Connect Wallet button');
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await page.waitForSelector('button[data-testid="rk-wallet-option-io.metamask"]', { timeout: 1000 });
            logMessage('MetaMask Wallet Option button is visible after the first click');
        } catch (error) {
            logMessage('MetaMask Wallet Option button did not appear, performing a second click');
            await waitForAndClick(page, 'button[data-testid="rk-connect-button"]', 'Connect Wallet button');
        }
        
        await waitForAndClick(page, 'button[data-testid="rk-wallet-option-io.metamask"]', 'MetaMask Wallet Option button');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentPages = await browser.pages();
        let metaMaskPageConnect;

        for (let page of currentPages) {
            const url = await page.url();
            if (url.includes('connect')) {
                metaMaskPageConnect = page;
                break;
            }
        }

        if (metaMaskPageConnect) {
            await waitForAndClick(metaMaskPageConnect, '[data-testid="page-container-footer-next"]', 'Connect Next button');
            await waitForAndClick(metaMaskPageConnect, '[data-testid="page-container-footer-next"]', 'Connect Confirm button');
        } else {
            logMessage("Connection confirmation page not found");
        }

        await page.bringToFront();

        await new Promise(resolve => setTimeout(resolve, 3000));

        const claimButtonExists = await page.evaluate(() => {
            const buttons = [...document.querySelectorAll('button')];
            const claimButton = buttons.find(button => button.textContent.includes('Claim 1 $IP on Story Iliad'));
            if (claimButton) {
                claimButton.click();
                return true;
            }
            return false;
        });
        
        if (claimButtonExists) {
            logMessage("IP Claimed!");
        } else {
            logMessage("Claim button not found.");
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        await page.close();
        await browser.close();

    } catch (error) {
        logMessage(`Error in loadBrowser function: ${error.message}`);
    }
}

async function passSepoilaCaptcha(page) { // very dump way idk why first attempt in 50% fails. 
    await page.goto('https://faucet.story.foundation/');
    await new Promise(resolve => setTimeout(resolve, 5500));
    await page.goto('https://faucet.story.foundation/');
    await new Promise(resolve => setTimeout(resolve, 7500));
}

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(__dirname, 'wallets.xlsx'));

    const worksheet = workbook.getWorksheet(1);

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const privateKey = row.getCell('B').value;

        if (privateKey) {
            await loadBrowser(privateKey);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

if (require.main === module) {
    main();
}