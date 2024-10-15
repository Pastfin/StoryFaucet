const { connect } = require("puppeteer-real-browser");
const path = require('path');
const ExcelJS = require('exceljs');
const { initMetamask, addNetwork  }  = require('./metamask');
const { logMessage, waitForAndClick, waitForAndSmartClick } = require ('./helpers');
const { error } = require("console");

async function loadBrowser(privateKey, proxyOptions, metamaskVersion) {
    let browser;
    try {
        const metamaskPath = path.join(__dirname, metamaskVersion);
        const connectOptions = {
            headless: false,
            args: [
                '--window-size=1280,1024',
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
        };

        if (proxyOptions) {
            connectOptions.proxy = {
                host: proxyOptions.host,
                port: proxyOptions.port,
                username: proxyOptions.username,
                password: proxyOptions.password
            };
        }

        const { page, browser: launchedBrowser } = await connect(connectOptions);
        browser = launchedBrowser;
        logMessage('Browser launched successfully');

        await new Promise(resolve => setTimeout(resolve, 4500));

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

        logMessage('MetaMask page found, starting automation...', "Debug");

        await initMetamask(metamaskPage, privateKey);
        const privateKeyLast10 = privateKey.slice(-10);
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

        await new Promise(resolve => setTimeout(resolve, 1500));
        await waitForAndClick(metamaskPage, 'button.home__new-network-added__switch-to-button', 'Switch to New Network button');
        await page.bringToFront();

        // Setup response interception with CDP
        const interceptUrl = "https://faucet.story.foundation/";
        const client = await page.createCDPSession();

        await client.send('Network.enable');
        await client.send('Fetch.enable', {
            patterns: [{ urlPattern: '*', requestStage: 'Response' }],
        });

        client.on('Fetch.requestPaused', async (event) => {
            const { requestId, request, responseHeaders } = event;
        
            if (!requestId) {
                logMessage('Request ID is missing, skipping this request.');
                return;
            }
        
            try {
                if (request.url === interceptUrl && request.method === 'POST') {
                    const response = await client.send('Fetch.getResponseBody', { requestId });
        
                    if (!response || !response.body) {
                        logMessage('No response body available, skipping this request.');
                        await client.send('Fetch.continueRequest', { requestId });
                        return;
                    }
        
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
                } else {
                    await client.send('Fetch.continueRequest', { requestId });
                }
            } catch (error) {
                if (error.message.includes('Invalid InterceptionId')) {
                    logMessage(`Invalid InterceptionId for request ${requestId}. Skipping.`);
                } else {
                    logMessage(`Unexpected error for request ${requestId}: ${error.message}`);
                }
            }
        });

        await passSepoilaCaptcha(page);

        await page.waitForSelector('button[data-testid="rk-connect-button"]', { visible: true });
        await page.evaluate(() => {
            document.querySelector('button[data-testid="rk-connect-button"]').click();
        });
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        await waitForAndSmartClick(page, 'button[data-testid="rk-wallet-option-io.metamask"]', 'MetaMask Wallet Option button');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const currentPages = await browser.pages();
        let metaMaskPageConnect;
        for (let currentPage of currentPages) {
            const url = await currentPage.url();
            if (url.includes('connect')) {
                metaMaskPageConnect = currentPage;
                break;
            }
            else if (url.includes('coinbase')){
                currentPage.close();
            }
        }

        if (metaMaskPageConnect) {
            metaMaskPageConnect.bringToFront();
            await waitForAndSmartClick(metaMaskPageConnect, '[data-testid="page-container-footer-next"]', 'Connect Next button');
            await waitForAndSmartClick(metaMaskPageConnect, '[data-testid="page-container-footer-next"]', 'Connect Confirm button');
        } else {
            logMessage("Connection confirmation page not found");
            throw error;
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
            logMessage(`IP Claimed! Private key ending in: ${privateKeyLast10}`);
        } else {
            logMessage("Claim button not found.");
        }

        await new Promise(resolve => setTimeout(resolve, 5000));

        await page.close();
        await browser.close();

    } catch (error) {
        logMessage(`Error in loadBrowser function: ${error.message}`);
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

async function passSepoilaCaptcha(page) { // very dumb way idk why first attempt in 50% fails. 
    await page.goto('https://faucet.story.foundation/');
    await new Promise(resolve => setTimeout(resolve, 5500));
    await page.goto('https://faucet.story.foundation/');
    await new Promise(resolve => setTimeout(resolve, 7500));
}

async function runThreads(batchList, worksheet, numOfRetriesPerWallet, metamaskVersion) {
    const tasks = batchList.map(async (rowNumber) => {
        const row = worksheet.getRow(rowNumber);
        const privateKey = row.getCell('B').value;
        const proxy = row.getCell('C').value;

        if (privateKey) {
            let proxyOptions = null;

            if (proxy) {
                const [host, port, username, password] = proxy.replace(' ', '').split(':');
                proxyOptions = { host, port, username, password };
            }

            let attempts = 0;
            let success = false;

            while (attempts < numOfRetriesPerWallet && !success) {
                try {
                    await loadBrowser(privateKey, proxyOptions, metamaskVersion);
                    success = true;
                } catch (error) {
                    attempts++;
                    logMessage(`Attempt ${attempts} failed: ${error.message}`);
                    if (attempts < numOfRetriesPerWallet) {
                        logMessage(`Retrying... (${attempts + 1}/${numOfRetriesPerWallet})`);
                    }
                }
            }

            if (!success) {
                logMessage(`Failed to process wallet with private key ending in: ${privateKey.slice(-10)} after ${numOfRetriesPerWallet} attempts`);
            }

        }
    });

    await Promise.all(tasks);
}

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(__dirname, 'wallets.xlsx'));
    
    const worksheet = workbook.getWorksheet(1);
    
    const numOfRetriesPerWallet = 3;
    const numOfThreads = 1;
    const metamaskVersion = '/12.3.1_0';

    let rowNumbers = Array.from({ length: worksheet.rowCount - 1}, (_, i) => i + 2);
    rowNumbers = rowNumbers.sort(() => Math.random() - 0.5);
    
    const numOfIteration = Math.ceil(rowNumbers.length/numOfThreads);
    
    for (let i = 0; i < numOfIteration; i++) {
        let batchList = rowNumbers.slice(i*numOfThreads, (i+1)*numOfThreads);
        await runThreads(batchList, worksheet, numOfRetriesPerWallet, metamaskVersion);
    }
}

if (require.main === module) {
    main();
}