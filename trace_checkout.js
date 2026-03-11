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
    
    await page.goto("https://www.musinsa.com/products/5575644");
    
    // 무신사 제품 페이지: "구매하기" -> "사이즈" -> "결제하기" 플로우
    try {
        await page.click("button:has-text('구매하기')", { timeout: 3000 }).catch(()=>{});
        await page.waitForTimeout(500);
        
        await page.click("text=L", { timeout: 2000 }).catch(()=>{});
        await page.waitForTimeout(500);
        
        await page.click("button:has-text('바로 구매')", { timeout: 2000 }).catch(()=>{});
        
    } catch(e) {}
    
    await page.waitForURL('**/order/**', { timeout: 15000 }).catch(e => console.log("URL Timeout:", e.message));
    console.log("Checkout URL:", page.url());
    
    // Find shipping elements
    const shippingHtml = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const shippingStrs = [];
        els.forEach(el => {
            if (el.innerText && el.innerText.includes('배송 요청사항')) {
                shippingStrs.push({ tag: el.tagName, cls: el.className, text: el.innerText.slice(0, 50) });
            }
            if (el.getAttribute('placeholder') && el.getAttribute('placeholder').includes('배송 요청사항')) {
                shippingStrs.push({ tag: el.tagName, cls: el.className, placeholder: el.getAttribute('placeholder') });
            }
        });
        return shippingStrs;
    });

    console.log("Shipping elements found:", JSON.stringify(shippingHtml, null, 2));
    
    await page.waitForTimeout(3000);
    await browser.close();
})();
