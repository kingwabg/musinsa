import { chromium } from 'playwright';
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        await page.goto('https://www.musinsa.com/products/5344070', { waitUntil: 'load' });
        await page.waitForTimeout(3000);

        // click size select button
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sizeBtn = btns.find(b => b.textContent && b.textContent.includes('사이즈'));
            if (sizeBtn) { sizeBtn.click(); return true; }
            return false;
        });
        await page.waitForTimeout(1000);

        const data = await page.evaluate(() => {
            const items = document.querySelectorAll('li, option');
            return Array.from(items).map(el => ({ text: el.textContent, disabled: el.disabled })).filter(x => x.text.includes('SIZE'));
        });
        console.dir(data, { depth: null });
    } catch (e) { }
    await browser.close();
})();
