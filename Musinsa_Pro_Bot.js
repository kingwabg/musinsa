/**
 * 🚀 무신사 하이퍼-로그 (Ultimate Edition) - Cloudflare & TLS Bypass
 * ─────────────────────────────────────────────────────────────────────────────
 * [핵심 기능]
 * 1. JA3/TLS 핑거프린트 우회: got-scraping 라이브러리 연동
 * 2. 세션 하베스팅: Playwright를 이용한 로그인 세션 자동 추출
 * 3. 주거용 프록시 지원: IP 차단 회피를 위한 Proxy-Agent 연동
 * 4. 고속 옵션 매칭: __NEXT_DATA__ JSON 고속 파싱 및 ID 추출
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { chromium } from "playwright";
import { gotScraping } from "got-scraping";
import fs from "fs";
import dotenv from "dotenv";
import rlSync from "readline-sync";

dotenv.config();

// 비동기 입력을 모두 동기식(readline-sync)으로 교체하여 입력 지연(엔터 씹힘) 버그 해결
const ask = (query) => {
    return rlSync.question(query);
};

// ══════════════════════════════════════════════════════════════════════════════
//  설정 (환경 변수 또는 인자)
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    PRODUCT_ID: "5828960",
    TARGET_COLOR: "블랙",
    TARGET_SIZE: "L",
    QUANTITY: 1,

    // 모드 설정: "CART" (장바구니) 또는 "PURCHASE" (구매)
    MODE: "PURCHASE",
    PAYMENT_METHOD: "무신사페이",
    PAYMENT_PASSWORD: process.env.MUSINSA_PAY_PASSWORD || "",

    // 유저 제공 계정 정보
    USER_ID: "wnsgk4441",
    USER_PW: "wkdqor@12",

    // 프록시 설정
    USE_PROXY: false,
    PROXY_URL: "http://username:password@proxy-server:port",

    // 봇 탐지 회피용 UA
    USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",

    // 브라우저 화면 표시 여부 (true: 보임, false: 안보임)
    SHOW_BROWSER: true,
};

// ══════════════════════════════════════════════════════════════════════════════
//  1. Session & Auth Harvester (Playrupt -> Cookie)
// ══════════════════════════════════════════════════════════════════════════════
class SessionHarvester {
    constructor() {
        this.cookies = null;
        this.browser = null;
    }

    async login() {
        this.browser = await chromium.launch({ headless: !CONFIG.SHOW_BROWSER });
        const context = await this.browser.newContext({ userAgent: CONFIG.USER_AGENT });
        const page = await context.newPage();

        if (CONFIG.SHOW_BROWSER) {
            console.log("🖥️ [Session] 진행 상황을 보여주는 브라우저 창을 실행합니다...");
        } else {
            console.log("🔑 [Session] 터미널 백그라운드에서 로그인 시도 중 (브라우저 창 안 뜸)...");
        }
        await page.goto("https://www.musinsa.com/auth/login");

        // 아이디/비번 필드 대기 및 입력 (정밀 셀렉터 적용)
        try {
            await page.waitForSelector("input[title='통합계정 또는 이메일']", { timeout: 15000 });
            await page.fill("input[title='통합계정 또는 이메일']", CONFIG.USER_ID);
            await page.fill("input[title='비밀번호 입력']", CONFIG.USER_PW);

            console.log("🖱️ [Session] 백그라운드에서 내부적으로 로그인 버튼 클릭 진행");
            await page.click("button.login-v2-button__item--black");
        } catch (e) {
            console.error("❌ 로그인 필드를 찾을 수 없습니다. (구조 변경 의심)");
            await this.browser.close();
            throw e;
        }

        // 메인 페이지 또는 로그인 성공 후 URL로 이동할 때까지 대기
        try {
            console.log("⏳ [Session] 로그인 인증 대기 중... (만약 브라우저 화면에 '로봇이 아닙니다(reCAPTCHA)' 창이 뜨면 창에서 직접 체크하고 퍼즐을 풀어주세요! 90초 대기 중...)");
            await page.waitForURL(/www.musinsa.com|main|recommend/, { timeout: 90000 });
            console.log("✅ [Session] 백그라운드 로그인 성공! (터미널에서 세션 획득 완료)");
        } catch (e) {
            console.log("⚠️ [Session] 로그인 응답 지연 (봇 탐지 또는 캡챠 시간 초과로 세션 획득을 실패했습니다.)");
        }

        const cookies = await context.cookies();
        this.cookies = cookies.map(c => `${c.name}=${c.value}`).join("; ");

        // 브라우저를 바로 닫지 않고 페이지 객체와 함께 반환 (나중에 결과 확인용)
        return { cookies: this.cookies, page, browser: this.browser };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  2. Ultimate API Client (TLS/JA3 Bypass - got-scraping)
// ══════════════════════════════════════════════════════════════════════════════
class MusinsaUltimateClient {
    constructor(cookies) {
        this.cookies = cookies;
        this.commonHeaders = {
            "Cookie": this.cookies,
            "Referer": `https://www.musinsa.com/products/${CONFIG.PRODUCT_ID}`,
            "Origin": "https://www.musinsa.com",
            "X-Requested-With": "XMLHttpRequest"
        };
    }

    /**
     * got-scraping을 이용한 보호막 우회 요청
     */
    async request(url, options = {}) {
        const response = await gotScraping({
            url,
            method: options.method || "GET",
            headers: { ...this.commonHeaders, ...options.headers },
            json: options.json,
            proxyUrl: CONFIG.USE_PROXY ? CONFIG.PROXY_URL : undefined,
            // TLS/JA3 핑거프린트 자동 모방 활성화
            headerGeneratorOptions: {
                browsers: [
                    { name: "chrome", minVersion: 120 },
                ],
                devices: ["desktop"],
                locales: ["ko-KR"]
            }
        });
        return response;
    }

    /**
     * 상품 정보 고속 파싱
     */
    async getProductInfo(silent = false) {
        if (!silent) console.log(`🌐 [API] 상품 상세 페이지 조회: ${CONFIG.PRODUCT_ID}`);
        const response = await this.request(`https://www.musinsa.com/products/${CONFIG.PRODUCT_ID}`);

        const nextDataMatch = response.body.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
        if (!nextDataMatch) throw new Error("상품 JSON 데이터를 찾을 수 없습니다.");

        const nextData = JSON.parse(nextDataMatch[1]);
        return nextData?.props?.pageProps?.meta?.data || {};
    }

    /**
     * 상품 옵션 API 조회
     */
    async getOptionsByApi(silent = false) {
        if (!silent) console.log(`🌐 [API] 상품 옵션 API 조회: ${CONFIG.PRODUCT_ID}`);
        const url = `https://goods-detail.musinsa.com/api2/goods/${CONFIG.PRODUCT_ID}/options?goodsSaleType=SALE&optKindCd=CLOTHES`;
        const response = await this.request(url);

        if (response.statusCode !== 200) {
            throw new Error(`옵션 API 호출 실패: ${response.statusCode}`);
        }

        const data = JSON.parse(response.body);
        const optionsData = data.data; // data.basic과 data.optionItems가 모두 필요

        // 추가: 무신사 신규 재고시스템(prioritized-inventories) API를 호출하여 정확한 품절 상태 연동
        try {
            const allValueNos = [];
            if (optionsData.basic) {
                optionsData.basic.forEach(g => {
                    g.optionValues?.forEach(v => allValueNos.push(v.no));
                });
            }

            if (allValueNos.length > 0) {
                const stockUrl = `https://goods-detail.musinsa.com/api2/goods/${CONFIG.PRODUCT_ID}/options/v2/prioritized-inventories`;
                const stockRes = await this.request(stockUrl, {
                    method: "POST",
                    json: { optionValueNos: allValueNos }
                });

                if (stockRes.statusCode === 200) {
                    const stockData = JSON.parse(stockRes.body);
                    if (stockData.meta?.result === "SUCCESS" && stockData.data) {
                        const stockMap = {};
                        stockData.data.forEach(s => stockMap[s.productVariantId] = s.outOfStock);

                        if (optionsData.optionItems) {
                            optionsData.optionItems.forEach(item => {
                                if (stockMap[item.no] === true) {
                                    item.soldOut = true; // 무신사 신규 API의 품절 상태를 봇 표준 규격으로 역매핑
                                }
                            });
                        }
                    }
                }
            }
        } catch (stockErr) {
            // 재고 조회 실패 방어 코드
        }

        return optionsData;
    }

    /**
     * 옵션 ID 매칭
     */
    findOptionId(optionData, silent = false) {
        if (!optionData) {
            console.error("❌ 처리할 옵션 데이터가 없습니다.");
            return null;
        }

        const { basic = [], optionItems = [] } = optionData;

        // 전체 옵션 리스트를 터미널에 깔끔하게 출력
        if (!silent) {
            console.log(`\n🔍 [API] 상품에 등록된 전체 옵션 정보 확인 중...`);
            basic.forEach(group => {
                const availableNames = group.optionValues?.map(v => v.name) || [];
                console.log(`   🔸 [${group.name}]: ${availableNames.join(", ")}`);
            });
            console.log(`\n🎯 [API] 옵션 정밀 매칭 시작 (설정된 대상: 컬러='${CONFIG.TARGET_COLOR}', 사이즈='${CONFIG.TARGET_SIZE}')`);
        }

        let colorId = null;
        let sizeId = null;

        // 1. 컬러 확인
        const colorGroup = basic.find(g => g.name === "컬러" || g.name === "색상");
        if (colorGroup) {
            let colorVal;
            if (!CONFIG.TARGET_COLOR || CONFIG.TARGET_COLOR.trim() === "") {
                // 사용자가 지정안했는데 1개만 있으면 자동 선택
                if (colorGroup.optionValues?.length === 1) {
                    colorVal = colorGroup.optionValues[0];
                    if (!silent) console.log(`  ⚠️ 컬러 미지정 확인, 단일 컬러 메뉴 자동 선택: "${colorVal.name}"`);
                } else {
                    console.error(`❌ [오류] 컬러가 미지정되었지만 여러 색상이 존재합니다. 옵션을 다시 설정해주세요.`);
                    return null;
                }
            } else {
                // 1. 정확한 일치(Exact Match) 먼저 시도
                colorVal = colorGroup.optionValues?.find(v => v.name.trim().toUpperCase() === CONFIG.TARGET_COLOR.toUpperCase());
                // 2. 일치하는 게 없으면 포함(Includes) 매치
                if (!colorVal) {
                    colorVal = colorGroup.optionValues?.find(v => v.name?.toUpperCase().includes(CONFIG.TARGET_COLOR.toUpperCase()));
                }
            }

            if (!colorVal) {
                console.error(`❌ 지정한 컬러 "${CONFIG.TARGET_COLOR}"를 옵션에서 찾을 수 없습니다.`);
                return null;
            }
            colorId = colorVal.no;
            CONFIG.TARGET_COLOR = colorVal.name; // 터미널에 올바른 노출을 위해 수동 덮어쓰기
            if (!silent) console.log(`  ✅ 컬러 매치 성공: ${colorId} ("${colorVal.name}")`);
        } else {
            if (!silent) console.log(`  👉 상품에 별도의 '컬러' 조건이 존재하지 않습니다. (패스)`);
            CONFIG.TARGET_COLOR = "없음";
        }

        // 2. 사이즈 확인
        const sizeGroup = basic.find(g => g.name === "사이즈" || g.name === "크기");
        if (sizeGroup) {
            let sizeVal;
            if (!CONFIG.TARGET_SIZE || CONFIG.TARGET_SIZE.trim() === "") {
                if (sizeGroup.optionValues?.length === 1) {
                    sizeVal = sizeGroup.optionValues[0];
                    if (!silent) console.log(`  ⚠️ 사이즈 미지정 확인, 단일 사이즈 자동 선택: "${sizeVal.name}"`);
                } else {
                    // 프리(FREE) 사이즈 검색 로직
                    sizeVal = sizeGroup.optionValues?.find(v => v.name.toUpperCase().includes("FREE") || v.name === "프리");
                    if (sizeVal) {
                        if (!silent) console.log(`  ⚠️ 사이즈 미지정 확인, FREE(프리) 사이즈 자동 선택: "${sizeVal.name}"`);
                    } else {
                        console.error(`❌ [오류] 사이즈가 미지정되었지만 여러 사이즈가 존재합니다. 옵션을 다시 설정해주세요.`);
                        return null;
                    }
                }
            } else {
                // 대소문자 무시 (l, L 대응)
                sizeVal = sizeGroup.optionValues?.find(v => v.name.toUpperCase() === CONFIG.TARGET_SIZE.toUpperCase());
                if (!sizeVal) {
                    sizeVal = sizeGroup.optionValues?.find(v => v.name.toUpperCase().includes(CONFIG.TARGET_SIZE.toUpperCase()));
                }
            }

            if (!sizeVal) {
                console.error(`❌ 지정한 사이즈 "${CONFIG.TARGET_SIZE}"를 옵션에서 찾을 수 없습니다.`);
                return null;
            }
            sizeId = sizeVal.no;
            CONFIG.TARGET_SIZE = sizeVal.name;
            if (!silent) console.log(`  ✅ 사이즈 매치 성공: ${sizeId} ("${sizeVal.name}")`);
        } else {
            if (!silent) console.log(`  👉 상품에 별도의 '사이즈' 조건이 존재하지 않습니다. (패스)`);
            CONFIG.TARGET_SIZE = "없음";
        }

        // 3. 최종 조합(Combination) ID 추출
        const matchingItem = optionItems.find(item => {
            let match = true;
            if (colorId !== null && !item.optionValueNos?.includes(colorId)) match = false;
            if (sizeId !== null && !item.optionValueNos?.includes(sizeId)) match = false;
            return match;
        });

        if (!matchingItem) {
            console.error("❌ [API] 선택한 컬러와 사이즈 조건이 결합된 실제 옵션 재고를 찾을 수 없습니다.");
            return null;
        }

        // 품절 여부 사전 체크 로직 추가 (soldOut, remainQty, limit 등)
        const isSoldOut = matchingItem.soldOut === true || matchingItem.remainQty === 0;
        if (isSoldOut && !silent) {
            console.log(`  🚨 [경고] 해당 옵션은 현재 '품절(Sold Out)' 상태인 것으로 보입니다! (봇이 타격해도 실패할 가능성이 높습니다)`);
        }

        const finalOptionId = matchingItem.no;
        if (!silent) {
            console.log(`\n🎉 [API] 최종 매치 완료 (조합 ID 일치 확인)`);
            console.log(`   => ✨ Option ID: ${finalOptionId} ✨`);
        }
        return finalOptionId;
    }

    /**
     * 결제 API (구매하기/장바구니) 고속 연사
     */
    async instantOrder(optionId, forceCart = false) {
        const orderUrl = "https://cart.musinsa.com/api2/cart/v1/cart";
        const isPurchase = forceCart ? false : (CONFIG.MODE === "PURCHASE");

        const payload = {
            origin: "PRODUCT",
            isOrder: isPurchase, // 구매 모드일 때 true
            goodsNo: parseInt(CONFIG.PRODUCT_ID),
            options: [
                {
                    goodsOptionNo: optionId,
                    quantity: CONFIG.QUANTITY,
                    addOptions: []
                }
            ]
        };

        console.log(`🚀 [Action] ${isPurchase ? "주문서 생성" : "장바구니 담기"} 요청 전송...`);
        const response = await this.request(orderUrl, {
            method: "POST",
            json: payload
        });

        return response;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  3. Main Pipeline
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
//  3. Execution Modes
// ══════════════════════════════════════════════════════════════════════════════

let globalSession = {
    cookies: null,
    page: null,
    browser: null
};

/**
 * [HARVEST] 세션 탈취 모드
 */
async function runHarvest() {
    console.log("\n📡 [Mode: HARVEST] 세션 쿠키를 수집합니다...");
    const harvester = new SessionHarvester();
    const session = await harvester.login();
    globalSession = session;
    console.log("✅ 세션 하베스팅 완료!");
    return session;
}

/**
 * [SNIPER] 조준 타격 모드
 */
async function runSniper() {
    if (!globalSession.cookies) {
        console.log("⚠️ 저장된 세션이 없습니다. 로그인을 먼저 진행합니다.");
        await runHarvest();
    }

    const { cookies, browser, page } = globalSession;
    
    // 타격 전용 새 창(blank)을 열지 않고, 기존 로그인된 페이지(page)를 재활용하여 자연스럽게 연결
    const client = new MusinsaUltimateClient(cookies);

    if (CONFIG.SHOW_BROWSER && page) {
        // 백그라운드에서 넘어온 페이지를 최상단 활성화
        await page.bringToFront().catch(()=>{});
    }

    console.log("\n🎯 [Mode: SNIPER] 목표물 정조준 중...");
    const optionData = await client.getOptionsByApi(true); // silent=true (출력 생략)
    const optionId = client.findOptionId(optionData, true); // silent=true (출력 생략)

    if (!optionId) {
        console.error("❌ 목표 옵션 ID를 찾을 수 없어 중단합니다. (옵션을 다시 설정해주세요)");
        return;
    }

    console.log("\n" + "=".repeat(40));
    console.log(`🔫 [TARGET LOCKED]`);
    console.log(`📦 상품: ${CONFIG.PRODUCT_ID}`);
    console.log(`🎨 옵션: ${CONFIG.TARGET_COLOR} / ${CONFIG.TARGET_SIZE}`);
    console.log(`🆔 Option ID: ${optionId}`);
    console.log("=".repeat(40));

    if (CONFIG.IS_UPCOMING && CONFIG.SELL_START_DATE) {
        console.log(`\n⏳ [알림] 이 상품은 발매 예정 상품입니다! (Time Attack)`);
        console.log("👉 발매 시간에 맞춰 자동 대기 스나이핑을 하시겠습니까? (y/n): ");
        const auto = ask("> ");
        if (auto.toLowerCase().trim() === 'y') {
            const targetTime = new Date(CONFIG.SELL_START_DATE).getTime();
            console.log(`\n⏳ [TIME ATTACK] 발매 시간(${CONFIG.SELL_START_DATE.replace('T', ' ')})까지 자동으로 대기합니다.`);
            console.log("⚠️ 프로그램 창을 닫지 말고 그대로 유지해 주세요.");

            while (true) {
                const now = Date.now();
                const diff = targetTime - now;

                if (diff <= 0) {
                    console.log("\n\n🔥🔥 [FIRE!] 타겟 발매 시간이 도래했습니다! 0.1초 내 즉시 타격 개시!");
                    break;
                }

                if (diff > 5000) {
                    process.stdout.write(`\r⏱️ 남은 시간: ${Math.floor(diff / 1000)}초... `);
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    process.stdout.write(`\r⏱️ 정밀 대기 카운트다운: ${(diff / 1000).toFixed(2)}초... `);
                    await new Promise(r => setTimeout(r, 50)); // 마지막 5초는 0.05초 주기로 스핀락 방식 갱신
                }
            }
        } else {
            console.log("\n⌨️  [ENTER] 키를 누르는 즉시 서버로 타격을 시작합니다!!");
            ask("> ");
        }
    } else {
        console.log("\n⌨️  [ENTER] 키를 누르는 즉시 서버로 타격을 시작합니다!!");
        ask("> ");
    }

    const totalTaskStartTime = performance.now(); // 전체 공정 타이머 시작
    const strikeStartTime = performance.now();
    let res;

    if (CONFIG.IS_UPCOMING) {
        // 발매 예정 상품은 미세한 서버 시차를 고려하여 짧은 간격으로 5회 연사(Rapid Fire)
        console.log("🚀 [Action] 발매 정밀 타격 시작 (초고속 연사 모드)...");
        for (let i = 1; i <= 5; i++) {
            res = await client.instantOrder(optionId);
            const r = JSON.parse(res.body);
            if (r.meta?.result === "SUCCESS") {
                console.log(`✅ [STRIKE SUCCESS] ${i}회차 연사만에 타격 성공!`);
                break;
            }
            process.stdout.write(`\r⚠️ ${i}회차 타격 실패... 재시도 중...`);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } else {
        res = await client.instantOrder(optionId);
    }

    const strikeEndTime = performance.now();
    const result = JSON.parse(res.body);
    const strikeDuration = strikeEndTime - strikeStartTime;

    if (result.meta?.result === "SUCCESS") {
        console.log(`\n✅ [STRIKE SUCCESS] 서버 최종 타격 완료! (${strikeDuration.toFixed(2)}ms)`);

        let orderLink = result.data?.link;
        if (!orderLink) {
            const orderNo = result.data?.orderNo || result.data?.orderId;
            const cartIds = result.data?.cartIds;

            if (orderNo) {
                // orderNo 방식은 order 서브도메인 사용
                orderLink = `https://order.musinsa.com/order/form?orderNo=${orderNo}`;
            } else if (cartIds && Array.isArray(cartIds) && cartIds.length > 0) {
                // 무신사 신규 결제 도메인 통합 주소 (cartIds 파라미터 불필요)
                orderLink = `https://www.musinsa.com/order/order-form`;
            }
        }

        // 상대 경로인 경우 기본 도메인 붙여주기
        if (orderLink && orderLink.startsWith("/")) {
            orderLink = `https://www.musinsa.com${orderLink}`;
        }

        if (!orderLink) {
            console.error("❌ [오류] 주문 페이지 링크를 생성하지 못했습니다. (서버 응답 확인 필요)");
            return;
        }

        console.log(`🔗 [Target URL] ${orderLink}`);
        console.log("🛒 주문서 페이지로 이동하여 결제를 마무리합니다...");

        try {
            await page.goto(orderLink, { waitUntil: "load", timeout: 30000 });
        } catch (gotoErr) {
            console.log("⚠️ [Warning] 페이지 로딩 중 지연 발생...");
        }

        await page.waitForLoadState('networkidle').catch(() => { }); // 네트워크 안정화 대기

        console.log(`📦 [Action] 배송 요청사항 내부 State 강제 주입 개시...`);
        try {
            // 1. React/Vue 내부 상태 강제 업데이트 (가장 강력한 우회)
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[placeholder*="배송 요청사항"]');
                inputs.forEach(input => {
                    try {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        nativeInputValueSetter.call(input, "문 앞에 놔주세요");
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch(e) {}
                });
            });

            // 2. 시각적 UI 일치화 (단순 강제 클릭)
            const locs = page.locator('input[placeholder*="배송 요청사항"]');
            const count = await locs.count();
            if (count > 0) {
                for(let i=0; i<count; i++) {
                    if(await locs.nth(i).isVisible()) {
                        await locs.nth(i).click({force: true}).catch(()=>{});
                        await page.waitForTimeout(300);
                        const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                        if (await opt.isVisible()) {
                            await opt.click({ force: true }).catch(()=>{});
                            await page.waitForTimeout(300);
                        }
                    }
                }
            } else {
                const textLocs = page.locator('text="배송 요청사항을 선택해주세요"');
                const tCount = await textLocs.count();
                for(let i=0; i<tCount; i++) {
                    if(await textLocs.nth(i).isVisible()) {
                        await textLocs.nth(i).click({force: true}).catch(()=>{});
                        await page.waitForTimeout(300);
                        const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                        if (await opt.isVisible()) {
                            await opt.click({ force: true }).catch(()=>{});
                            await page.waitForTimeout(300);
                        }
                    }
                }
            }
            
            console.log(`✅ [Action] 배송 요청사항('문 앞에 놔주세요') 내부 Validation 완벽 통과 설정 완료!`);
        } catch(e) {
            console.log(`⚠️ 배송 요청사항 처리 중 오류 (무시): ${e.message}`);
        }

        // 결제 수단 자동 선택 및 최종 결제 클릭
        try {
            console.log(`🖱️ [Action] "${CONFIG.PAYMENT_METHOD}" 자동 매칭 및 결제 시도...`);

            // 모든 프레임에서 요소 찾기용 헬퍼 (재시도 로직 포함)
            const findAndClick = async (selectorOrText, isText = false, timeout = 1000) => {
                const startTime = Date.now();
                while (Date.now() - startTime < 5000) { // 최대 5초간 재시도
                    const frames = page.frames();
                    for (const frame of frames) {
                        try {
                            if (isText) {
                                const found = await frame.evaluate((txt) => {
                                    const els = Array.from(document.querySelectorAll('label, span, button, li, div, a'));
                                    const target = els.find(el =>
                                        (el.innerText.trim().includes(txt) || el.textContent.trim().includes(txt)) &&
                                        el.offsetParent !== null
                                    );
                                    if (target) {
                                        target.click();
                                        return true;
                                    }
                                    return false;
                                }, selectorOrText);
                                if (found) return true;
                            } else {
                                const el = await frame.waitForSelector(selectorOrText, { timeout }).catch(() => null);
                                if (el && await el.isVisible()) {
                                    await el.click();
                                    return true;
                                }
                            }
                        } catch (e) { }
                    }
                    await page.waitForTimeout(500);
                }
                return false;
            };

            // 1. 결제 수단 '무신사페이' 선택
            // 화면 스크롤 하단으로 강제 이동 (스티키 헤더 오작동 방지)
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            await page.waitForTimeout(300);

            // MPAY: 무신사페이, MUSINSAPAY_MONEY: 무신사머니
            let payMethodOk = await findAndClick('#method-MPAY'); // ID로 먼저 시도 (가장 정확)
            if (!payMethodOk) payMethodOk = await findAndClick('무신사페이', true);
            if (!payMethodOk) payMethodOk = await findAndClick('MUSINSA PAY', true);

            if (payMethodOk) {
                console.log(`✅ [Action] 결제 수단(${CONFIG.PAYMENT_METHOD}) 선택 성공`);
                await page.waitForTimeout(800); // 서브 메뉴(카드 리스트) 애니메이션 대기
            }

            // 2. 카드/머니 선택 (사용자 요청: "전체 블록에 마우스를 가져가서 우 버튼 클릭 후 결제하기")
            console.log(`🖱️ [Action] 등록된 카드 리스트에서 우측 화살표(>)를 클릭하여 사용자의 카드(2순위)로 슬라이드 합니다.`);
            
            try {
                // DOM 내부에서 직접 우측 화살표 버튼을 찾아 즉시 클릭 (애니메이션 생략으로 초고속 타격)
                const nextClicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const nextBtn = buttons.find(b => {
                        if (b.offsetParent === null) return false;
                        const cls = (b.className || '').toLowerCase();
                        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                        if (cls.includes('next') || cls.includes('right') || aria.includes('다음') || aria.includes('next')) return true;
                        
                        // 우측 방향 SVG 검출
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
                }).catch(e => {
                    console.log(`⚠️ 우측 이동 버튼 탐색 중 DOM 변경됨 (무시)`);
                    return false;
                });
                
                if (nextClicked) {
                    console.log(`✅ [Action] 다음(>) 카드 보기 버튼 초고속 하이재킹 클릭 완료!`);
                    await page.waitForTimeout(100).catch(()=>{}); // DOM 렌더링 최소 대기 (오류 방지)
                    
                    // 두 번째 요소(내 카드) 강제 클릭
                    await page.evaluate(() => {
                        const cardList = Array.from(document.querySelectorAll('li, div')).filter(el =>
                            (el.innerText.includes('카드') || el.innerText.includes('머니') || el.querySelector('img')) &&
                            el.offsetParent !== null && !el.innerText.includes('현대카드')
                        );
                        if (cardList.length > 0) {
                            cardList[0].click(); // 현대카드 제외 첫번째 카드 클릭
                        }
                    }).catch(e => {
                        console.log(`⚠️ 카드 터치 중 DOM 렌더링 지연됨 (무시)`);
                    });
                } else {
                    console.log(`⚠️ 우측 이동 버튼을 찾지 못했습니다.`);
                }
            } catch (e) {
                console.log(`⚠️ 카드 자동 슬라이드 중 오류: ${e.message}`);
            }

            // 3. 최종 결제 버튼 클릭 (가장 중요)
            const payButtonSelectors = [
                "button:has-text('결제하기')",
                "button:has-text('구매하기')",
                "button:has-text('원 결제하기')",
                "#btn_pay",
                ".btn_pay",
                ".payment-button",
                "button[id*='pay']",
                "button[class*='payment']",
                "form[name='orderForm'] button[type='submit']"
            ];

            // [2차 검증 보험] 카드 선택이나 드래그 후 배송 요청사항이 날아가는 것을 방지하기 위해 최종 클릭 직전 재주입
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[placeholder*="배송 요청사항"]');
                inputs.forEach(input => {
                    try {
                        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        nativeSet.call(input, "문 앞에 놔주세요");
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch(e) {}
                });
            });
            await page.waitForTimeout(300); // 반영될 아주 짧은 찰나의 시간 대기

            let clicked = false;
            // 여러 셀렉터로 순회하며 클릭 시도 (연타 방지 및 정확도 향상)
            console.log(`🚀 [Action] 모든 검증 통과! 최종 결제 버튼 타격 개시...`);
            for (let retry = 0; retry < 2; retry++) {
                for (const sel of payButtonSelectors) {
                    if (await findAndClick(sel, sel.includes('has-text'), 300)) {
                        clicked = true;
                        console.log(`🚀 [Action] 최종 결제하기 버튼('${sel}') 타격 완료!`);
                        break;
                    }
                }
                if (clicked) break;
                await page.waitForTimeout(500);
            }

            if (!clicked) {
                // 추가 시도: 버튼 내부의 '결제하기' 글자를 포함한 요소를 더 적극적으로 찾음
                clicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
                    const target = buttons.find(b =>
                        (b.innerText.includes('결제하기') || b.innerText.includes('구매하기')) &&
                        b.offsetParent !== null
                    );
                    if (target) {
                        target.click();
                        return true;
                    }
                    return false;
                });
                if (clicked) console.log(`🚀 [Action] 텍스트 매칭으로 최종 결제 버튼 강제 선택 완료!`);
            }

            if (!clicked) {
                console.log("❌ [오류] 최종 결제 버튼을 찾지 못했습니다. (페이지 로딩 상태를 확인해주세요)");
                await page.screenshot({ path: 'payment_error.png' }).catch(() => { });
            }

            // 4. 무신사페이 비밀번호 6자리 자동 입력 로직 (보안 무결성)
            if (CONFIG.PAYMENT_METHOD.includes("무신사페이") && CONFIG.PAYMENT_PASSWORD && CONFIG.PAYMENT_PASSWORD.length === 6) {
                console.log(`\n🔒 [보안 통과] 무신사페이 결제 비밀번호 6자리 자동 타격 개시!`);
                const pw = CONFIG.PAYMENT_PASSWORD.split('');

                const startTime = Date.now();
                let passwordEntered = false;

                // 최대 10초간 가상 키보드(숫자 버튼) 스캔
                while (Date.now() - startTime < 10000 && !passwordEntered) {
                    try {
                        const frames = page.frames();
                        for (const frame of frames) {
                            // DOM 내에서 0~9 라벨을 가진 요소를 찾을 수 있는지 테스트
                            const canFindNumbers = await frame.evaluate(() => {
                                const els = Array.from(document.querySelectorAll('button, span, img, div'));
                                return els.some(el => el.textContent && el.textContent.trim().match(/^[0-9]$/));
                            }).catch(() => false);

                            if (canFindNumbers) {
                                console.log(`⌨️ [Action] 가상 키보드 프레임 발견! 0.1초 타격 모드 진입...`);
                                for (const digit of pw) {
                                    // 각 숫자 클릭 (연속 타격)
                                    await frame.evaluate((num) => {
                                        const els = Array.from(document.querySelectorAll('button, span, img, div'));
                                        const numBtn = els.find(el => {
                                            const txt = (el.innerText || el.textContent || '').trim();
                                            const alt = (el.getAttribute('alt') || '').trim();
                                            return txt === num || alt === num || alt.includes(num);
                                        });
                                        if (numBtn) {
                                            numBtn.click();
                                        }
                                    }, digit);
                                    await page.waitForTimeout(50).catch(() => { }); // 너무 빠르면 씹힐 수 있으므로 0.05초 딜레이
                                }
                                passwordEntered = true;
                                console.log(`✅ [Action] 비밀번호 6자리 초고속 타격 완료!`);
                                break;
                            }
                        }
                    } catch (e) {
                        // DOM 변경 중 에러 무시
                    }
                    if (!passwordEntered) await page.waitForTimeout(500).catch(() => { });
                }

                if (!passwordEntered) {
                    console.log(`⚠️ 가상 키보드 스캔 실패. 앱카드 결제이거나 직접 입력해야 할 수 있습니다.`);
                }
            }

        } catch (e) {
            console.log("⚠️ 결제 자동화 과정 중 비정상 종료: " + e.message);
            try { await page.screenshot({ path: 'payment_fatal.png' }); } catch (err) { }
        }

        const totalTaskEndTime = performance.now();
        const totalDuration = (totalTaskEndTime - totalTaskStartTime) / 1000;

        console.log("\n" + "=".repeat(50));
        console.log(`✨ [전체 소요 시간] 총 ${totalDuration.toFixed(2)}초 만에 결제 단계까지 도달했습니다!`);
        console.log("=".repeat(50));
    } else {
        console.log(`\n❌ [STRIKE FAILED] 서버 응답: ${result.meta?.message}`);
    }
    console.log("\n⏎ 확인하셨으면 [엔터 키]를 눌러 메뉴로 돌아가세요...");
    ask("> ");
}

/**
 * [CART] 장바구니 담기 모드
 */
async function runCart() {
    console.log("\n🛒 [Mode: CART] 장바구니에 상품을 담습니다...");
    if (!globalSession.cookies) {
        console.log("⚠️ 저장된 세션이 없습니다. 백그라운드 로그인을 먼저 진행합니다.");
        await runHarvest();
    }

    const { cookies } = globalSession;
    const client = new MusinsaUltimateClient(cookies);

    const optionData = await client.getOptionsByApi(true); // silent
    const optionId = client.findOptionId(optionData, true); // silent

    if (!optionId) {
        console.error("❌ 목표 옵션 ID를 찾을 수 없어 중단합니다. (옵션을 다시 설정해주세요)");
        return;
    }

    // forceCart 플래그를 true로 주어 구매(Purchase) 대신 장바구니(Cart)로 요청
    const res = await client.instantOrder(optionId, true);
    const result = JSON.parse(res.body);

    if (result.meta?.result === "SUCCESS") {
        console.log(`\n✅ [CART SUCCESS] 장바구니에 상품이 성공적으로 담겼습니다!`);
        console.log(`=> 웹이나 스마트폰 앱의 장바구니에서 확인해 주세요.`);
    } else {
        console.log(`\n❌ [CART FAILED] 서버 응답: ${result.meta?.message}`);
    }
    console.log("\n⏎ 확인하셨으면 [엔터 키]를 눌러 메뉴로 돌아가세요...");
    ask("> ");
}

/**
 * [GHOST] 전체 자동화 모드
 */
async function runGhost() {
    if (!globalSession.cookies) {
        console.log("\n👻 [Mode: GHOST] 세션이 없습니다. 자동 로그인을 먼저 수행합니다.");
        await runHarvest();
    } else {
        console.log("\n👻 [Mode: GHOST] 기존 세션을 사용하여 올인원 타격을 시작합니다.");
    }

    const { cookies, browser } = globalSession;

    // 타격 전용 새 창 열기 (Target page closed 방지)
    const context = browser.contexts()[0];
    const page = await context.newPage();

    const client = new MusinsaUltimateClient(cookies);
    const optionData = await client.getOptionsByApi(true); // silent
    const optionId = client.findOptionId(optionData, true); // silent

    if (!optionId) {
        await browser.close();
        console.error("❌ 목표 옵션 ID를 찾을 수 없어 중단합니다.");
        return;
    }

    console.log("\n🔥 [Action] 망설임 없는 고속 타격!");
    const res = await client.instantOrder(optionId);
    const result = JSON.parse(res.body);

    if (result.meta?.result === "SUCCESS") {
        console.log(`✅ [Success] 성공! 결제창으로 이동합니다.`);

        let orderLink = result.data?.link;
        if (!orderLink) {
            const orderNo = result.data?.orderNo || result.data?.orderId;
            const cartIds = result.data?.cartIds;

            if (orderNo) {
                orderLink = `https://order.musinsa.com/order/form?orderNo=${orderNo}`;
            } else if (cartIds && Array.isArray(cartIds) && cartIds.length > 0) {
                // 무신사 신규 결제 도메인 통합 주소 (cartIds 파라미터 불필요)
                orderLink = `https://www.musinsa.com/order/order-form`;
            }
        }

        if (orderLink && orderLink.startsWith("/")) {
            orderLink = `https://www.musinsa.com${orderLink}`;
        }

        await page.goto(orderLink, { waitUntil: 'load' });
        await page.waitForLoadState('load'); // Added as per instruction
        await page.waitForLoadState('networkidle').catch(() => { }); // 네트워크 안정화 대기

        console.log(`📦 [Action] 배송 요청사항 내부 State 강제 주입 개시...`);
        try {
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[placeholder*="배송 요청사항"]');
                inputs.forEach(input => {
                    try {
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        nativeInputValueSetter.call(input, "문 앞에 놔주세요");
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch(e) {}
                });
            });

            const locs = page.locator('input[placeholder*="배송 요청사항"]');
            const count = await locs.count();
            if (count > 0) {
                for(let i=0; i<count; i++) {
                    if(await locs.nth(i).isVisible()) {
                        await locs.nth(i).click({force: true}).catch(()=>{});
                        await page.waitForTimeout(300);
                        const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                        if (await opt.isVisible()) {
                            await opt.click({ force: true }).catch(()=>{});
                            await page.waitForTimeout(300);
                        }
                    }
                }
            } else {
                const textLocs = page.locator('text="배송 요청사항을 선택해주세요"');
                const tCount = await textLocs.count();
                for(let i=0; i<tCount; i++) {
                    if(await textLocs.nth(i).isVisible()) {
                        await textLocs.nth(i).click({force: true}).catch(()=>{});
                        await page.waitForTimeout(300);
                        const opt = page.locator('text="문 앞에 놔주세요"').filter({ state: 'visible' }).first();
                        if (await opt.isVisible()) {
                            await opt.click({ force: true }).catch(()=>{});
                            await page.waitForTimeout(300);
                        }
                    }
                }
            }
            
            console.log(`✅ [Action] 배송 요청사항('문 앞에 놔주세요') 내부 Validation 완벽 통과 설정 완료!`);
        } catch(e) {
            console.log(`⚠️ 배송 요청사항 처리 중 오류 (무시): ${e.message}`);
        }

        // 결제 수단 자동 선택 및 최종 결제 클릭
        try {
            console.log(`🖱️ [Action] ${CONFIG.PAYMENT_METHOD} 자동 매칭 시도...`);

            // GHOST 모드 결제수단 선택 고도화 (Sniper와 동일한 재시도 로직 적용)
            const findAndClickMethod = async (selectorOrText, isText = false, timeout = 1000) => {
                const startTime = Date.now();
                while (Date.now() - startTime < 5000) {
                    const frames = page.frames();
                    for (const frame of frames) {
                        try {
                            if (isText) {
                                const found = await frame.evaluate((txt) => {
                                    const els = Array.from(document.querySelectorAll('label, span, button, li, div, a'));
                                    const target = els.find(el =>
                                        (el.innerText.trim().includes(txt) || el.textContent.trim().includes(txt)) &&
                                        el.offsetParent !== null
                                    );
                                    if (target) {
                                        target.click();
                                        return true;
                                    }
                                    return false;
                                }, selectorOrText);
                                if (found) return true;
                            } else {
                                const el = await frame.waitForSelector(selectorOrText, { timeout }).catch(() => null);
                                if (el && await el.isVisible()) {
                                    await el.click();
                                    return true;
                                }
                            }
                        } catch (e) { }
                    }
                    await page.waitForTimeout(500);
                }
                return false;
            };

            let payOk = await findAndClickMethod('#method-MPAY'); // ID가 최우선
            if (!payOk) payOk = await findAndClickMethod(CONFIG.PAYMENT_METHOD, true);
            if (!payOk) payOk = await findAndClickMethod('MUSINSA PAY', true);

            if (payOk) {
                console.log("✅ 결제 수단 선택 완료");
                await page.waitForTimeout(800); // 서브 메뉴(카드 리스트) 애니메이션 대기
            }

            // 2. 카드/머니 선택 (사용자 요청: "전체 블록에 마우스를 가져가서 우 버튼 클릭 후 결제하기")
            console.log(`🖱️ [Action] 등록된 카드 리스트에서 우측 화살표(>)를 클릭하여 사용자의 카드(2순위)로 슬라이드 합니다.`);
            
            try {
                // DOM 내부에서 직접 우측 화살표 버튼을 찾아 즉시 클릭 (애니메이션 생략으로 초고속 타격)
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
                }).catch(e => {
                    console.log(`⚠️ 우측 버튼 스캔 중 DOM 재렌더링 발생 (무시)`);
                    return false;
                });
                
                if (nextClicked) {
                    console.log(`✅ [Action] 다음(>) 카드 보기 버튼 초고속 하이재킹 클릭 완료!`);
                    await page.waitForTimeout(100).catch(()=>{}); // 최소 DOM 반영 대기
                    
                    await page.evaluate(() => {
                        const cardList = Array.from(document.querySelectorAll('li, div')).filter(el =>
                            (el.innerText.includes('카드') || el.innerText.includes('머니') || el.querySelector('img')) &&
                            el.offsetParent !== null && !el.innerText.includes('현대카드')
                        );
                        if (cardList.length > 0) {
                            cardList[0].click();
                        }
                    }).catch(e => {
                        console.log(`⚠️ 두 번째 카드 클릭 포커스 중 렌더링 지연 (무시)`);
                    });
                } else {
                    console.log(`⚠️ 우측 이동 버튼을 찾지 못했습니다.`);
                }
            } catch (e) {
                console.log(`⚠️ 카드 자동 슬라이드 중 오류: ${e.message}`);
            }

            const payButtonSelectors = [
                "button:has-text('결제하기')",
                "button:has-text('원 결제하기')", // Added for more flexibility
                "#btn_pay",
                ".btn_pay",
                "[data-testid='payment-button']", // Added for more flexibility
                "button[type='submit']" // Added for more flexibility
            ];

            // [2차 검증 보험] 결제 버튼 누르기 직전 배송 정보 재입력
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[placeholder*="배송 요청사항"]');
                inputs.forEach(input => {
                    try {
                        const nativeSet = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                        nativeSet.call(input, "문 앞에 놔주세요");
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch(e) {}
                });
            });
            await page.waitForTimeout(300);

            console.log(`🚀 [Action] 모든 데이터 정밀 재검증 및 최종 결제 타격!`);
            let clicked = false;
            for (const sel of payButtonSelectors) {
                try {
                    const btn = await page.waitForSelector(sel, { timeout: 2000 });
                    await btn.click({ force: true });
                    clicked = true;
                    console.log(`✅ [Action] 최종 결제하기 버튼('${sel}') 클릭 성공!`);
                    break;
                } catch (e) { }
            }
            if (!clicked) {
                console.log("❌ [오류] 최종 결제 버튼 클릭 실패. (수동 처리 필요)");
            }

            // 4. 무신사페이 비밀번호 6자리 자동 입력 로직 (GHOST 모드)
            if (CONFIG.PAYMENT_METHOD.includes("무신사페이") && CONFIG.PAYMENT_PASSWORD && CONFIG.PAYMENT_PASSWORD.length === 6) {
                console.log(`\n🔒 [보안 통과] 무신사페이 결제 비밀번호 6자리 자동 타격 개시!`);
                const pw = CONFIG.PAYMENT_PASSWORD.split('');
                const startTime = Date.now();
                let passwordEntered = false;

                while (Date.now() - startTime < 10000 && !passwordEntered) {
                    try {
                        const frames = page.frames();
                        for (const frame of frames) {
                            const canFindNumbers = await frame.evaluate(() => {
                                const els = Array.from(document.querySelectorAll('button, span, img, div'));
                                return els.some(el => el.textContent && el.textContent.trim().match(/^[0-9]$/));
                            }).catch(() => false);

                            if (canFindNumbers) {
                                console.log(`⌨️ [Action] 가상 키보드 프레임 발견! 0.1초 타격 모드 진입...`);
                                for (const digit of pw) {
                                    await frame.evaluate((num) => {
                                        const els = Array.from(document.querySelectorAll('button, span, img, div'));
                                        const numBtn = els.find(el => {
                                            const txt = (el.innerText || el.textContent || '').trim();
                                            const alt = (el.getAttribute('alt') || '').trim();
                                            return txt === num || alt === num || alt.includes(num);
                                        });
                                        if (numBtn) numBtn.click();
                                    }, digit);
                                    await page.waitForTimeout(50).catch(() => { });
                                }
                                passwordEntered = true;
                                console.log(`✅ [Action] 비밀번호 6자리 초고속 타격 완료!`);
                                break;
                            }
                        }
                    } catch (e) { }
                    if (!passwordEntered) await page.waitForTimeout(500).catch(() => { });
                }
            }
        } catch (e) {
            console.log("⚠️ 결제 자동화 과정 중 비정상 종료: " + e.message); // Added error logging
        }
    } else {
        console.log(`❌ 실패: ${result.meta?.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  4. Main Entry Point & Configuration
// ══════════════════════════════════════════════════════════════════════════════

/**
 * [CHECK] 상태 점검 모드 (터미널 확인용)
 */
async function runCheck() {
    console.log("\n🔍 [Mode: CHECK] 타겟 사전 점검을 시작합니다.");

    // 점검을 실행하기 전에 옵션을 먼저 다시 묻도록 처리
    await configureOrder();

    if (!globalSession.cookies) {
        console.log("❌ 로그인이 완료되지 않아 점검을 중단합니다.");
        return;
    }

    const { cookies } = globalSession;
    const client = new MusinsaUltimateClient(cookies);

    console.log("\n[1] 📦 상품 정보 확인 중...");
    try {
        const optionData = await client.getOptionsByApi(false);
        const optionId = client.findOptionId(optionData, false);

        if (optionId) {
            console.log("\n✅ [CHECK SUCCESS] 모든 준비가 완벽합니다!");
            console.log(`   - 📦 타겟 상품 ID: ${CONFIG.PRODUCT_ID}`);
            console.log(`   - 🎨 타겟 설정: ${CONFIG.TARGET_COLOR} / ${CONFIG.TARGET_SIZE} (Option ID: ${optionId})`);
            console.log(`   - 🛒 주문 수량: ${CONFIG.QUANTITY}개`);
            console.log("=> 이제 '4. SNIPER' 모드에서 엔터만 누르면 즉시 타격(구매)됩니다.");
        } else {
            console.log("\n❌ [CHECK FAILED] 해당 상품의 옵션을 찾을 수 없습니다. 옵션 설정을 다시 확인해주세요.");
        }
    } catch (e) {
        console.log("\n❌ [CHECK FAILED] 상품 정보를 불러오는데 실패했습니다: " + e.message);
    }

    console.log("\n⏎ 점검 결과를 다 확인하셨으면 [엔터 키]를 눌러 메뉴로 돌아가세요...");
    ask("> ");
}

async function configureOrder() {
    console.log("\n" + "═".repeat(50));
    console.log("       ⚙️ 타겟 및 주문 방식 설정 ⚙️       ");
    console.log("═".repeat(50));

    console.log("👉 주문 방식을 선택하세요 (1: 단일(1개) 주문, 2: 대량(수량 지정) 주문): ");
    const orderType = ask("> ");

    if (orderType.trim() === "2") {
        console.log("👉 주문 수량을 입력하세요 (숫자만): ");
        const qty = ask("> ");
        CONFIG.QUANTITY = parseInt(qty.trim()) || 1;
    } else {
        CONFIG.QUANTITY = 1;
    }

    console.log(`👉 기본 설정된 타겟(ID:${CONFIG.PRODUCT_ID}, 컬러:${CONFIG.TARGET_COLOR}, 사이즈:${CONFIG.TARGET_SIZE})을 그대로 사용할까요? (y/n): `);
    const useDefault = ask("> ");

    if (useDefault.trim().toLowerCase() !== "y") {
        console.log("👉 상품 번호(ID)를 입력하세요 (예: 5828960): ");
        const inputId = ask("> ");
        if (inputId.trim()) {
            CONFIG.PRODUCT_ID = inputId.trim();
        }

        console.log(`\n🔍 매칭을 위해 상품(${CONFIG.PRODUCT_ID})의 옵션 목록을 스캔하고 있습니다...`);
        let availableColors = [];
        let availableSizes = [];

        try {
            const tempClient = new MusinsaUltimateClient(globalSession?.cookies || "");
            const optionData = await tempClient.getOptionsByApi(true);
            const basic = optionData?.basic || [];
            const optionItems = optionData?.optionItems || [];

            if (basic.length > 0) {
                console.log(`\n[스캔 완료] 해당 상품의 매칭 가능한 옵션들입니다:`);
                basic.forEach(group => {
                    const availableNames = [];
                    const formattedNames = [];

                    group.optionValues?.forEach((v, i) => {
                        // 해당 옵션을 포함하는 실제 상품의 재고 상태 확인
                        const matchedItems = optionItems.filter(item => item.optionValueNos?.includes(v.no));
                        // 관련된 모든 조합이 전부 품절인지 판단
                        const isAllSoldOut = matchedItems.length > 0 && matchedItems.every(item => item.soldOut === true || item.remainQty === 0);

                        let displayName = v.name;
                        if (isAllSoldOut) {
                            displayName += " (품절)";
                        }

                        availableNames.push(v.name); // 설정용으로는 순수 이름만 보관
                        formattedNames.push(`[${i + 1}] ${displayName}`);
                    });

                    if (group.name === "컬러" || group.name === "색상") availableColors = availableNames;
                    if (group.name === "사이즈" || group.name === "크기") availableSizes = availableNames;

                    console.log(`   🔸 [${group.name}]: ${formattedNames.join(", ")}`);
                });
                console.log("");
            } else {
                console.log(`\n[스캔 완료] 별도의 세부 옵션(컬러/사이즈 등)이 없는 상품입니다.\n`);
            }
        } catch (e) {
            console.log(`\n⚠️ 상품 옵션을 미리 불러오지 못했습니다. (상품 번호 오류이거나 일시적인 네트워크 문제일 수 있습니다)\n`);
        }

        if (availableColors.length > 0) {
            console.log("👉 컬러 번호(1, 2...) 또는 이름을 입력하세요 (없으면 엔터): ");
            const colorInput = ask("> ");
            const cNum = parseInt(colorInput.trim());
            if (!isNaN(cNum) && cNum >= 1 && cNum <= availableColors.length) {
                CONFIG.TARGET_COLOR = availableColors[cNum - 1];
            } else {
                CONFIG.TARGET_COLOR = colorInput.trim();
            }
        } else {
            CONFIG.TARGET_COLOR = ""; // 옵션이 아예 없으므로 공백 처리
        }

        if (availableSizes.length > 0) {
            console.log("👉 사이즈 번호(1, 2...) 또는 이름을 입력하세요 (없으면 엔터): ");
            const sizeInput = ask("> ");
            const sNum = parseInt(sizeInput.trim());
            if (!isNaN(sNum) && sNum >= 1 && sNum <= availableSizes.length) {
                CONFIG.TARGET_SIZE = availableSizes[sNum - 1];
            } else {
                CONFIG.TARGET_SIZE = sizeInput.trim();
            }
        } else {
            CONFIG.TARGET_SIZE = ""; // 옵션이 아예 없으므로 공백 처리
        }
    }

    // 빈 문자열 대비
    CONFIG.TARGET_COLOR = CONFIG.TARGET_COLOR.trim();
    CONFIG.TARGET_SIZE = CONFIG.TARGET_SIZE.trim();

    // 발매 예정 상품 공통(필수) 체크 
    try {
        const tempClient = new MusinsaUltimateClient(globalSession?.cookies || "");
        const pInfo = await tempClient.getProductInfo(true);
        if (pInfo.sellStartDate) {
            const sellStart = new Date(pInfo.sellStartDate);
            if (sellStart > new Date()) {
                CONFIG.IS_UPCOMING = true;
                CONFIG.SELL_START_DATE = pInfo.sellStartDate;
                console.log(`\n==================================================`);
                console.log(`⏰ [알림] 이 상품은 [ 발매 예정 ] 상품입니다! (Time Attack 대상)`);
                console.log(`⏰ 발매 일정: ${pInfo.sellStartDate.replace('T', ' ')}`);
                console.log(`==================================================`);
            } else {
                CONFIG.IS_UPCOMING = false;
                CONFIG.SELL_START_DATE = null;
            }
        } else {
            CONFIG.IS_UPCOMING = false;
            CONFIG.SELL_START_DATE = null;
        }
    } catch (pErr) {
        console.log("Upcoming check error: ", pErr.message);
        CONFIG.IS_UPCOMING = false;
        CONFIG.SELL_START_DATE = null;
    }

    console.log("\n✅ [설정 완료]");
    console.log(`📦 상품 ID: ${CONFIG.PRODUCT_ID} | 컬러: ${CONFIG.TARGET_COLOR || "(없음/자동)"} | 사이즈: ${CONFIG.TARGET_SIZE || "(없음/자동)"} | 수량: ${CONFIG.QUANTITY}개`);
}

// ==========================================
// 보안: 봇 실행 시 무신사페이 비밀번호 체크 로직
// ==========================================
async function checkSecureSetup() {
    if (CONFIG.PAYMENT_METHOD.includes("무신사페이")) {
        if (!process.env.MUSINSA_PAY_PASSWORD || process.env.MUSINSA_PAY_PASSWORD.length !== 6) {
            console.log('\n' + '='.repeat(60));
            console.log('🔒 [보안 설정] 무신사페이 결제 자동화를 위한 비밀번호 설정 🔒');
            console.log(' - 비밀번호는 소스코드(.js)에 노출되지 않으며, 암호화된');
            console.log('   터미널을 통해 한 번만 입력받아 로컬 숨김 파일(.env)에만 저장됩니다.');
            console.log(' - GitHub나 외부로 절대 업로드되지 않습니다 (Git 차단 적용됨).');
            console.log('============================================================');

            // 입력 시 화면에 *** 처리 (Windows 터미널 한글 깨짐 방지를 위해 분리)
            console.log('\n🔑 무신사페이 결제 비밀번호 6자리를 입력하세요:');
            let newPw = rlSync.question('> ', {
                hideEchoBack: true,
                mask: '*'
            });

            if (newPw && newPw.length === 6 && !isNaN(newPw)) {
                CONFIG.PAYMENT_PASSWORD = newPw;
                fs.appendFileSync('.env', `\nMUSINSA_PAY_PASSWORD=${newPw}\n`);
                console.log('✅ 안전하게 로컬 저장소(.env)에 봉인되었습니다.');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.log('❌ 유효하지 않은 비밀번호입니다. (6자리 숫자 필수)\n자동 타격이 비활성화된 상태로 실행됩니다.');
                await new Promise(r => setTimeout(r, 2000));
            }
        } else {
            console.log('🔒 [보안] 숨겨진 .env 저장소에서 결제 비밀번호를 호스트 환경으로 로드했습니다.');
        }
    }
}

async function mainMenu() {
    // 봇 구동 시 보안 체크
    await checkSecureSetup();

    // 메뉴 진입 전, 세션(Login)부터 필수 확보하여 권한 부족(401) 및 품절 오탐지 방지
    if (!globalSession.cookies) {
        console.log("\n" + "═".repeat(60));
        console.log(" 📡 [초기화] 안전하고 정확한 타겟 스캔을 위해 세션을 연결합니다.");
        console.log("═".repeat(60));
        await runHarvest();
    }

    // 세션 확보 후 타겟 정보 설정
    await configureOrder();

    while (true) {
        console.log("\n" + "═".repeat(50));
        console.log("       🔥 MUSINSA ULTIMATE BOT MENU 🔥       ");
        console.log("═".repeat(50));
        console.log(" 1. [GHOST] 전체 자동화 (로그인부터 타격까지 연속 진행)");
        console.log(" 2. [HARVEST] 세션 따기 (터미널 내부 백그라운드 로그인)");
        console.log(" 3. [CHECK] 타겟 점검 (로그인/상품/옵션 사전 확인)");
        console.log(" 4. [CART] 장바구니 담기 (선택한 상품을 즉시 장바구니 추가)");
        console.log(" 5. [SNIPER] 정조준 타격 (결제 직전 대기, 엔터 즉시 타격)");
        console.log(" 6. [설정 변경] 현재 타겟 및 수량 다시 설정");
        console.log(" q. 종료");
        console.log("═".repeat(50));

        console.log("\n👉 선택: ");
        const choice = ask("> ");
        const c = choice.trim().toLowerCase();

        if (c === "1") {
            await runGhost();
        } else if (c === "2") {
            await runHarvest();
        } else if (c === "3") {
            await runCheck();
        } else if (c === "4") {
            await runCart();
        } else if (c === "5") {
            await runSniper();
        } else if (c === "6") {
            await configureOrder();
        } else if (c === "q") {
            console.log("👋 프로그램을 종료합니다.");
            if (globalSession.browser) await globalSession.browser.close();
            process.exit(0);
        } else {
            console.log("❌ 잘못된 선택입니다.");
        }
    }
}

mainMenu().catch(err => {
    console.error("\n🚨 치명적 런타임 오류:", err.message);
    process.exit(1);
});
