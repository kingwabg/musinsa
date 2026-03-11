import { chromium } from "playwright";

(async () => {
    console.log("Starting visual debug trace for shipping request via Keyboard & Injection...");
    const browser = await chromium.launch({ headless: false }); 
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto("https://www.musinsa.com/auth/login");
    await page.fill("input[title='통합계정 또는 이메일']", "wnsgk4441");
    await page.fill("input[title='비밀번호 입력']", "wkdqor@12");
    await page.click("button.login-v2-button__item--black");
    
    try {
        await page.waitForURL(/www.musinsa.com|main|recommend/, { timeout: 15000 });
        console.log("Login success.");
    } catch(e) {
        console.log("Login failed");
        await browser.close();
        return;
    }

    const cookies = await context.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    
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
    await page.waitForTimeout(2000);
    
    console.log("Applying React Injection & Keyboard Hybrid Logic...");
    try {
        // Strategy 1: React native value setter injection
        await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[placeholder*="배송 요청사항"]');
            inputs.forEach(input => {
                try {
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                    nativeInputValueSetter.call(input, "문 앞에 놔주세요");
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log("Injected value directly to DOM");
                } catch(e) {}
            });
        });

        // Strategy 2: Focus and Keyboard pressing
        const locs = page.locator('input[placeholder*="배송 요청사항"]');
        const count = await locs.count();
        if (count > 0) {
            for(let i=0; i<count; i++) {
                if(await locs.nth(i).isVisible()) {
                    await locs.nth(i).click({force: true}); // Trigger Modal
                    await page.waitForTimeout(500);
                    
                    // Click the option
                    const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                    await opt.waitFor({ state: 'visible', timeout: 2000 }).catch(()=>{});
                    if (await opt.isVisible()) {
                        await opt.click({ force: true });
                        await page.waitForTimeout(500);
                    }
                }
            }
        }
        
        // Wait to see if value changes
        await page.waitForTimeout(1000);
        
        console.log("Trying to click payment button...");
        const payBtn = page.locator('button:has-text("결제하기"), button.btn-pay').first();
        if (await payBtn.isVisible()) {
            await payBtn.click();
            await page.waitForTimeout(1000);
            
            const errAlert = page.locator('.alert, .toast, .dialog, .modal').filter({ hasText: /배송|요청/ });
            if (await errAlert.isVisible()) {
                console.log("Validation Error text:", await errAlert.innerText());
            } else {
                console.log("No validation error! Success!");
            }
        }
    } catch (e) {
        console.error("Error during injection:", e);
    }

    await page.waitForTimeout(3000);
    await browser.close();
    console.log("Done.");
})();
