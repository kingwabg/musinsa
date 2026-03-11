import { chromium } from "playwright";
import fs from "fs";

(async () => {
    console.log("Starting visual debug trace for shipping request...");
    const browser = await chromium.launch({ headless: true }); // Headless so I can run it
    const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 1024 }
    });
    const page = await context.newPage();
    
    await page.goto("https://www.musinsa.com/auth/login");
    await page.fill("input[title='통합계정 또는 이메일']", "wnsgk4441");
    await page.fill("input[title='비밀번호 입력']", "wkdqor@12");
    await page.click("button.login-v2-button__item--black");
    
    console.log("Waiting for login...");
    try {
        await page.waitForURL(/www.musinsa.com|main|recommend/, { timeout: 15000 });
        console.log("Login success.");
    } catch(e) {
        console.log("Login failed or captcha triggered. Falling back to cookies if possible. Error:", e);
        await page.screenshot({ path: "debug_login_failed.png" });
        await browser.close();
        return;
    }

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
    await page.waitForTimeout(2000);
    
    console.log("Taking initial screenshot...");
    await page.screenshot({ path: "debug_shipping_before.png", fullPage: true });
    fs.writeFileSync("debug_shipping_before.html", await page.content());

    console.log("Applying shipping logic...");
    try {
        const inputLocs = page.locator('input[placeholder*="배송 요청사항"]');
        const count = await inputLocs.count();
        console.log("Found placeholder inputs:", count);
        
        if (count > 0) {
            for (let i = 0; i < count; i++) {
                const loc = inputLocs.nth(i);
                if (await loc.isVisible()) {
                    await loc.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500); // 넉넉히
                    const box = await loc.boundingBox();
                    console.log(`Input ${i} bounding box:`, box);
                    if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                        await page.mouse.down();
                        await page.waitForTimeout(50);
                        await page.mouse.up();
                        await page.waitForTimeout(1000);
                        await page.screenshot({ path: `debug_shipping_opened_${i}.png` });
                    }
                    
                    const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                    if (await opt.isVisible()) {
                        const optBox = await opt.boundingBox();
                        console.log(`Option bounding box:`, optBox);
                        if (optBox) {
                            await page.mouse.move(optBox.x + optBox.width / 2, optBox.y + optBox.height / 2);
                            await page.mouse.down();
                            await page.waitForTimeout(50);
                            await page.mouse.up();
                        }
                    } else {
                        console.log("Option not visible!");
                    }
                }
            }
        } else {
            console.log("Fallback to text locators...");
            let textLocs = page.locator('text="배송 요청사항을 선택해주세요"');
            let tCount = await textLocs.count();
            for (let i = 0; i < tCount; i++) {
                const loc = textLocs.nth(i);
                if (await loc.isVisible()) {
                    await loc.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(500);
                    const box = await loc.boundingBox();
                    console.log(`Text fallback ${i} bounding box:`, box);
                    if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                        await page.mouse.down();
                        await page.waitForTimeout(50);
                        await page.mouse.up();
                        await page.waitForTimeout(1000);
                        await page.screenshot({ path: `debug_shipping_fallback_opened_${i}.png` });

                        const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                        if (await opt.isVisible()) {
                            const optBox = await opt.boundingBox();
                            console.log(`Option bounding box:`, optBox);
                            if (optBox) {
                                await page.mouse.move(optBox.x + optBox.width / 2, optBox.y + optBox.height / 2);
                                await page.mouse.down();
                                await page.waitForTimeout(50);
                                await page.mouse.up();
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error during click:", e);
    }
    
    await page.waitForTimeout(1000);
    console.log("Taking post-action screenshot...");
    await page.screenshot({ path: "debug_shipping_after.png", fullPage: true });
    
    // 결제하기 버튼 클릭 테스트
    console.log("Trying to click payment button...");
    const payBtn = page.locator('button:has-text("결제하기"), button.btn-pay').first();
    if (await payBtn.isVisible()) {
        await payBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: "debug_shipping_pay_clicked.png", fullPage: true });
        
        // 에러 메세지가 떴는지 확인
        const errAlert = page.locator('.alert, .toast, .dialog, .modal').last();
        if (await errAlert.isVisible()) {
            console.log("Validation Error text:", await errAlert.innerText());
        }
    }
    
    await browser.close();
    console.log("Done.");
})();
