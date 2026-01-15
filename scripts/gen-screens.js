
import { chromium } from '@playwright/test';

// Config
const TARGET_URL = 'https://woyken.github.io/where-to-eat/previews/pr-16/'; 
const OUTPUT_DIR = 'public/screenshots';

const connectionId = 'demo-connection';
const userId = 'demo-user';

async function injectData(page) {
    await page.addInitScript(({ connId, usrId }) => {
        const now = Date.now();
        const connections = [{
            id: connId,
            settings: {
                connection: { name: 'Team Lunch', updatedAt: now },
                eateries: [
                    { id: 'e1', name: 'Pizza Palace', updatedAt: now, _deleted: false },
                    { id: 'e2', name: 'Sushi Spot', updatedAt: now, _deleted: false },
                    { id: 'e3', name: 'Burger Joint', updatedAt: now, _deleted: false },
                    { id: 'e4', name: 'Taco Stand', updatedAt: now, _deleted: false },
                    { id: 'e5', name: 'Salad Bar', updatedAt: now, _deleted: false },
                ],
                users: [
                    { id: usrId, name: 'You', email: null, updatedAt: now, _deleted: false },
                    { id: 'u2', name: 'Alice', email: null, updatedAt: now, _deleted: false },
                    { id: 'u3', name: 'Bob', email: null, updatedAt: now, _deleted: false },
                ],
                eateryScores: [],
                eateryVetoes: [],
            },
        }];
        localStorage.setItem('wte-connections', JSON.stringify(connections));
        localStorage.setItem('wte-current-users', JSON.stringify({ userByConnection: { [connId]: usrId } }));
    }, { connId: connectionId, usrId: userId });
}

async function takeScreenshot(browser, name, viewport, isMobile) {
    console.log(`Taking screenshot: ${name}...`);
    const page = await browser.newPage({ 
        viewport,
        colorScheme: 'light',
        isMobile: isMobile,
        hasTouch: isMobile,
        deviceScaleFactor: 2 
    });

    try {
        await injectData(page);
        
        const fullUrl = `${TARGET_URL}wheel/${connectionId}`;
        console.log(`Navigating to ${fullUrl}`);
        
        await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });

        try {
            await page.waitForSelector('svg', { timeout: 15000 });
            await page.waitForSelector('text=Pizza Palace', { timeout: 15000 });
        } catch (e) {
            console.error("Timeout waiting for content:", e);
            console.log("Page title:", await page.title());
            console.log("Page url:", page.url());
            // console.log("Page content:", await page.content());
        }

        await page.waitForTimeout(3000);

        await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png` });
        console.log(`Saved ${OUTPUT_DIR}/${name}.png`);
    } catch (err) {
        console.error(`Error taking ${name}:`, err);
    } finally {
        await page.close();
    }
}

async function run() {
    console.log("Launching browser...");
    const browser = await chromium.launch();
    
    await takeScreenshot(browser, 'desktop', { width: 1280, height: 800 }, false);
    await takeScreenshot(browser, 'mobile', { width: 390, height: 844 }, true);

    await browser.close();
    console.log("Done.");
}

run();
