import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Login
    await page.goto('https://www.musinsa.com/auth/login');
    await page.fill('input[title="통합계정 또는 이메일"]', 'wnsgk4441');
    await page.fill('input[title="비밀번호 입력"]', 'wkdqor@12');
    await page.click('button.login-v2-button__item--black');
    await page.waitForURL(/main|recommend/, { timeout: 15000 });
    
    console.log("Logged in");
    
    // Listen for all navigations and new pages
    context.on('page', async newPage => {
        newPage.on('framenavigated', frame => {
            if (frame === newPage.mainFrame()) {
                console.log("NEW PAGE NAVIGATED TO:", frame.url());
            }
        });
    });
    
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
            console.log("NAVIGATED TO:", frame.url());
        }
    });

    // Go to product
    await page.goto('https://www.musinsa.com/products/5828960');
    console.log("At product page");
    
    // Select options safely using Musinsa's current DOM
    try {
        await page.click('.option-btn, .btn-option', { timeout: 2000 }).catch(e => {});
        await page.waitForTimeout(500);
        await page.click('.option-ul li:not(.sold-out)', { timeout: 2000 }).catch(e => {});
        await page.waitForTimeout(500);
        await page.click('.option-ul li:not(.sold-out)', { timeout: 2000 }).catch(e => {});
    } catch(e) {}
    
    // Click Buy Now (구매하기)
    try {
        await page.click('button:has-text("구매하기"), .btn-buy, .goods-buy-btn', { timeout: 5000 });
        console.log("Clicked Buy Now");
    } catch (e) {
        console.log("Failed to click Buy Now:", e.message);
    }
    
    await page.waitForTimeout(6000); // Wait for navigation
    
    const currentUrl = page.url();
    console.log("FINAL URL:", currentUrl);
    
    await browser.close();
})();
