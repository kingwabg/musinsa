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
    
    const url = page.url();
    console.log("Checkout URL:", url);

    console.log("Running checkout slide automation...");
    
    try {
        const nextClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextBtn = buttons.find(b => {
                if (b.offsetParent === null) return false;
                const cls = (b.className || '').toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                if (cls.includes('next') || cls.includes('right') || aria.includes('다음') || aria.includes('next')) return true;
                if (b.querySelector('svg') && !b.innerText.trim()) {
                    const rect = b.getBoundingClientRect();
                    return rect.right > (window.innerWidth / 2) && rect.width < 100 && rect.width > 10; 
                }
                return false;
            });
            if (nextBtn) {
                nextBtn.click();
                return true;
            }
            return false;
        });

        console.log("Right Button clicked?", nextClicked);
        await page.waitForTimeout(50);
        
        await page.evaluate(() => {
            const cardList = Array.from(document.querySelectorAll('li, div')).filter(el =>
                (el.innerText.includes('카드') || el.innerText.includes('머니') || el.querySelector('img')) &&
                el.offsetParent !== null && !el.innerText.includes('현대카드')
            );
            if (cardList.length > 0) {
                cardList[0].click();
                console.log("Second card clicked");
            }
        });
        
    } catch (e) {
        console.log("Evaluate crashed:", e.message);
    }
    
    await page.waitForTimeout(2000);
    await browser.close();
})();
