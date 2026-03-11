import { chromium } from 'playwright';
import { gotScraping } from 'got-scraping';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://www.musinsa.com/auth/login');
    await page.fill('input[title="통합계정 또는 이메일"]', 'wnsgk4441');
    await page.fill('input[title="비밀번호 입력"]', 'wkdqor@12');
    await page.click('button.login-v2-button__item--black');
    await page.waitForURL(/main|recommend/, { timeout: 15000 });

    const cookies = (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
    const payload = {
        origin: 'PRODUCT',
        isOrder: true,
        goodsNo: 5828960,
        options: [{
            goodsOptionNo: 27974492,
            quantity: 1,
            addOptions: []
        }]
    };

    const res = await gotScraping({
        url: 'https://cart.musinsa.com/api2/cart/v1/cart',
        method: 'POST',
        headers: { Cookie: cookies, 'Content-Type': 'application/json' },
        json: payload,
        headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 120 }] }
    });

    const data = JSON.parse(res.body);
    console.log("Cart Auth Response:", data);

    if (data.data && data.data.cartIds) {
        const cartId = data.data.cartIds[0];
        const checkoutUrl = `https://order.musinsa.com/order/form?cartIds=${cartId}`;
        console.log("Testing Checkout URL:", checkoutUrl);

        const checkRes = await gotScraping({
            url: checkoutUrl,
            method: 'GET',
            headers: { Cookie: cookies },
            followRedirect: false
        });

        console.log("Checkout GET Status:", checkRes.statusCode);
        console.log("Checkout GET headers:", checkRes.headers);
    }

    await browser.close();
})();
