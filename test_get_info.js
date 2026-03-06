import { gotScraping } from "got-scraping";

const headers = {
    "accept": "text/html,application/xhtml+xml,application/xml",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
};

async function getProductInfo(pid) {
    const response = await gotScraping({
        url: `https://www.musinsa.com/products/${pid}`,
        method: "GET",
        headers
    });
    const match = response.body.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    const nextData = JSON.parse(match[1]);
    return nextData?.props?.pageProps?.meta?.data || {};
}

(async () => {
    const pInfo = await getProductInfo('4311692');
    console.log("sellStartDate:", pInfo.sellStartDate);
    const dt = new Date(pInfo.sellStartDate);
    console.log("isUpcoming:", dt > new Date());
})();
