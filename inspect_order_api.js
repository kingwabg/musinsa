
import { gotScraping } from "got-scraping";
import fs from 'fs';

// This is a scratch script to inspect the order form API response
// It needs valid cookies from a recent session.
const COOKIES = ""; // I will fill this if I had a way, but I'll use the harvester in the bot instead.

async function inspectOrderForm(orderNo, cookies) {
    const url = `https://order.musinsa.com/api2/order/v1/orders/${orderNo}/form`;
    const response = await gotScraping({
        url,
        headers: {
            'Cookie': cookies,
            'Referer': 'https://www.musinsa.com/',
            'X-Requested-With': 'XMLHttpRequest'
        },
        responseType: 'json'
    });
    console.log(JSON.stringify(response.body, null, 2));
}
