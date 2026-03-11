import { chromium } from "playwright";

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto("https://www.musinsa.com/auth/login");
    await page.fill("input[title='통합계정 또는 이메일']", "wnsgk4441");
    await page.fill("input[title='비밀번호 입력']", "wkdqor@12");
    await page.click("button.login-v2-button__item--black");
    await page.waitForURL(/main|recommend/, { timeout: 15000 });
    
    
    console.log("Logged in");
    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    
    // API request for checkout
    const gotScraping = (await import('got-scraping')).gotScraping;
    const optionId = "27974492"; // Black / L
    const reqBody = {
        "storeCode": "musinsa",
        "cartItems": [
            {
                "goodsNo": "5828960",
                "itemNo": optionId,
                "quantity": 1,
                "sellPrice": 50000,
                "subPrice": 50000,
                "salePrice": 0,
                "subSalePrice": 0,
            }
        ]
    };
    
    console.log("Getting order link...");
    const res = await gotScraping({
        url: "https://api.musinsa.com/api2/dp/v1/order/instant-order",
        method: "POST",
        headers: { "Cookie": cookieString, "Content-Type": "application/json" },
        json: reqBody
    });
    
    const result = JSON.parse(res.body);
    let orderLink = result.data?.link || `https://www.musinsa.com/order/order-form`;
    if (orderLink.startsWith("/")) orderLink = "https://www.musinsa.com" + orderLink;
    
    console.log("Checkout URL:", orderLink);
    await page.goto(orderLink);
    await page.waitForLoadState('networkidle').catch(()=>{});
    
    console.log("Testing native shipping request selection");
    try {
        const inputLoc = page.locator('input[placeholder*="배송 요청사항"]');
        if (await inputLoc.count() > 0) {
            await inputLoc.first().scrollIntoViewIfNeeded();
            await page.waitForTimeout(200);
            await inputLoc.first().click(); 
            console.log("Clicked input natively");
        } else {
            console.log("Input not found");
        }

        await page.waitForTimeout(1000);
        
        const optionLoc = page.locator('text="문 앞에 놔주세요"').first();
        if (await optionLoc.isVisible()) {
            await optionLoc.click();
            console.log("Option clicked natively!");
        } else {
            console.log("Option not visible natively.");
        }
        
    } catch(e) {
        console.error(e);
    }
    
    console.log("Done");
})();
