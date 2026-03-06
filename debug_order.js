const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Logging in...');
        await page.goto('https://www.musinsa.com/auth/login');
        await page.fill('input[name="id"]', 'wnsgk4441');
        await page.fill('input[name="pw"]', 'wkdqor@12');
        await page.click('button.login-button, button:has-text("로그인")');
        await page.waitForURL('https://www.musinsa.com/main/musinsa/main');
        console.log('Login success');

        // Go to a product page that is in stock to trigger order form
        const productId = '2086653';
        console.log(`Going to product ${productId}...`);
        await page.goto(`https://www.musinsa.com/products/${productId}`);

        // Find an option and click purchase
        // This is tricky manually, let's just use the API to get an order link if possible
        // Or just try to click around.

        // Wait, the user already had STRIKE SUCCESS!
        // So the instantOrder API worked. I can just log in and go to THAT order link if I had one.
        // But the order link is dynamic.

        // Let's just stay on the login session and let me manually check or try to find selectors.
        // Actually, I can't interact with the browser easily in this environment.

        // I will dump the HTML of a known order page structure if I can.
        // Let's try to find the selectors in the current page after navigating to a dummy order link if possible.

        console.log('Taking screenshot of main page to verify login...');
        await page.screenshot({ path: 'login_verify.png' });

    } catch (e) {
        console.error(e);
    } finally {
        // await browser.close();
    }
})();
