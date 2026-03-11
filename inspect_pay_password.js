import { chromium } from "playwright";
import fs from "fs";

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. 로그인
    console.log("Logging in...");
    await page.goto('https://www.musinsa.com/auth/login');
    await page.fill('input[title=\"통합계정 또는 이메일\"]', 'wnsgk4441');
    await page.fill('input[title=\"비밀번호 입력\"]', 'wkdqor@12');
    await page.click('button.login-v2-button__item--black');

    // 메인 페이지 진입 대기
    await page.waitForURL(/www.musinsa.com|main/, { timeout: 15000 });

    console.log('Login complete. Please manually navigate to the payment password screen in the opened browser within 60 seconds.');

    // 60초 대기 (이 시간 동안 수동으로 결제 비번 창까지 진입)
    await new Promise(r => setTimeout(r, 60000));

    console.log('Time is up. Extracting DOM...');
    // 현재 페이지 HTML 덤프
    const html = await page.content();
    fs.writeFileSync('pay_password_dom.html', html);
    console.log('Saved DOM to pay_password_dom.html');

    // 스크린샷 덤프
    await page.screenshot({ path: 'pay_password_screen.png' });
    console.log('Saved Screenshot to pay_password_screen.png');

    await browser.close();
})();
