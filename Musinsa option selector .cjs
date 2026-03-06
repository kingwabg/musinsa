/**
 * 무신사 상품 옵션 스캐너 & 매칭 체커
 * ─────────────────────────────────────────────────────────────────────────────
 * 사용법:
 *   node musinsa_scanner.js <상품ID> <원하는컬러> <원하는사이즈>
 *
 * 예시:
 *   node musinsa_scanner.js 5828960 "블랙" "L"
 *   node musinsa_scanner.js 5828960 "Black" "XL"
 *
 * 설치:
 *   npm install playwright
 *   npx playwright install chromium
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { chromium } = require("playwright");

// ══════════════════════════════════════════════════════════════════════════════
//  CLI 인자 파싱
// ══════════════════════════════════════════════════════════════════════════════
const [, , PRODUCT_ID = "5828960", TARGET_COLOR = "", TARGET_SIZE = ""] =
    process.argv;

const BASE_URL = `https://www.musinsa.com/products/${PRODUCT_ID}`;
const HEADLESS = false;   // false = 브라우저 창 표시 (동작 확인용)
const SLOW_MO = 500;     // 각 동작 사이 딜레이 ms

// ══════════════════════════════════════════════════════════════════════════════
//  유틸
// ══════════════════════════════════════════════════════════════════════════════
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(str) {
    return str.replace(/\s+/g, " ").trim().toLowerCase();
}

function isMatch(scanned, target) {
    if (!target) return false;
    return normalize(scanned).includes(normalize(target));
}

function printBanner(msg) {
    console.log("\n" + "═".repeat(60));
    console.log("  " + msg);
    console.log("═".repeat(60));
}

// ══════════════════════════════════════════════════════════════════════════════
//  드롭다운 내부 데이터 스캔
//  무신사 옵션 UI 패턴:
//    [A] <select>  태그
//    [B] button 클릭 → ul>li 리스트 (커스텀 드롭다운)
//    [C] Next.js __NEXT_DATA__ JSON 에 옵션 전체가 내장
// ══════════════════════════════════════════════════════════════════════════════
async function scanOptions(page) {
    const result = { color: [], size: [], raw: {} };

    // ── 방법 1: __NEXT_DATA__ JSON 파싱 (가장 신뢰도 높음) ───────────────────
    try {
        const nextData = await page.evaluate(() => {
            const el = document.getElementById("__NEXT_DATA__");
            return el ? JSON.parse(el.textContent) : null;
        });

        if (nextData) {
            console.log("  ✔ __NEXT_DATA__ JSON 발견");
            result.raw.nextData = nextData;

            // 옵션 데이터가 있을 수 있는 경로 탐색
            const pageProps = nextData?.props?.pageProps || {};
            const goodsData =
                pageProps?.goods ||
                pageProps?.product ||
                pageProps?.goodsDetail ||
                pageProps?.initialData?.goods ||
                null;

            if (goodsData) {
                // 컬러 옵션
                const colorOptions =
                    goodsData?.colorList ||
                    goodsData?.optionColor ||
                    goodsData?.option?.color ||
                    [];
                for (const c of colorOptions) {
                    result.color.push({
                        label: c.colorName || c.name || c.label || String(c),
                        value: c.colorNo || c.id || c.value || "",
                        soldOut: c.soldOut || c.isSoldOut || false,
                        key: c.optionKey || c.key || "",
                    });
                }

                // 사이즈 옵션
                const sizeOptions =
                    goodsData?.sizeList ||
                    goodsData?.optionSize ||
                    goodsData?.option?.size ||
                    [];
                for (const s of sizeOptions) {
                    result.size.push({
                        label: s.sizeName || s.name || s.label || String(s),
                        value: s.sizeNo || s.id || s.value || "",
                        soldOut: s.soldOut || s.isSoldOut || false,
                        key: s.optionKey || s.key || "",
                    });
                }
            }
        }
    } catch (e) {
        console.log("  ⚠ __NEXT_DATA__ 파싱 실패:", e.message);
    }

    // ── 방법 2: 페이지 전역 window 변수 탐색 ────────────────────────────────
    if (result.color.length === 0 && result.size.length === 0) {
        try {
            const windowVars = await page.evaluate(() => {
                const keys = Object.keys(window).filter(
                    (k) =>
                        k.includes("goods") ||
                        k.includes("product") ||
                        k.includes("option") ||
                        k.includes("color") ||
                        k.includes("size")
                );
                const out = {};
                for (const k of keys.slice(0, 20)) {
                    try {
                        out[k] = JSON.parse(JSON.stringify(window[k]));
                    } catch { }
                }
                return out;
            });
            if (Object.keys(windowVars).length > 0) {
                console.log("  ✔ window 전역 변수 발견:", Object.keys(windowVars).join(", "));
                result.raw.window = windowVars;
            }
        } catch { }
    }

    // ── 방법 3: DOM 직접 스캔 ────────────────────────────────────────────────
    // 3-A: <select> 태그
    const selectData = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll("select"));
        return selects.map((sel) => ({
            name: sel.name || sel.id || sel.className,
            options: Array.from(sel.options)
                .filter((o) => o.value)
                .map((o) => ({
                    value: o.value,
                    label: o.textContent.trim(),
                    disabled: o.disabled,
                    dataset: { ...o.dataset },
                })),
        }));
    });

    if (selectData.length > 0) {
        console.log(`  ✔ <select> 태그 ${selectData.length}개 발견`);
        result.raw.selects = selectData;

        for (const sel of selectData) {
            const isColor = /color|컬러|색/i.test(sel.name);
            const isSize = /size|사이즈|치수/i.test(sel.name);
            const target = isSize ? result.size : isColor ? result.color : result.color;
            for (const o of sel.options) {
                target.push({
                    label: o.label,
                    value: o.value,
                    soldOut: o.disabled || o.label.includes("품절") || o.label.includes("sold out"),
                    dataset: o.dataset,
                });
            }
        }
    }

    // 3-B: 커스텀 드롭다운 버튼 + 리스트 (DOM 속성 스캔)
    const customData = await page.evaluate(() => {
        // 드롭다운 트리거 버튼 후보
        const triggerSels = [
            "button[class*='OptionSelect']",
            "button[class*='option_select']",
            "button[class*='SelectBox']",
            "[class*='select_box'] button",
            "[class*='goods_option'] button",
            "[data-option-type]",
        ];

        const buttons = [];
        for (const sel of triggerSels) {
            document.querySelectorAll(sel).forEach((el) => {
                buttons.push({
                    text: el.textContent.trim(),
                    class: el.className,
                    dataset: { ...el.dataset },
                    ariaLabel: el.getAttribute("aria-label") || "",
                    ariaExpanded: el.getAttribute("aria-expanded"),
                    ariaControls: el.getAttribute("aria-controls"),
                    selector: sel,
                });
            });
        }

        // 숨겨진 ul/li 리스트 속 데이터도 추출
        const listSels = [
            "ul[class*='OptionList'] li",
            "ul[class*='option_list'] li",
            "[role='listbox'] [role='option']",
            "[class*='OptionItem']",
            "[class*='option_item']",
        ];

        const listItems = [];
        for (const sel of listSels) {
            document.querySelectorAll(sel).forEach((el) => {
                listItems.push({
                    text: el.textContent.trim(),
                    class: el.className,
                    dataset: { ...el.dataset },
                    ariaDisabled: el.getAttribute("aria-disabled"),
                    dataValue: el.getAttribute("data-value") || el.getAttribute("value") || "",
                });
            });
        }

        return { buttons, listItems };
    });

    if (customData.buttons.length > 0 || customData.listItems.length > 0) {
        console.log(
            `  ✔ 커스텀 드롭다운: 버튼 ${customData.buttons.length}개, 리스트 항목 ${customData.listItems.length}개`
        );
        result.raw.custom = customData;
    }

    // 3-C: 클릭해서 드롭다운 열고 li 스캔
    await scanByClickingDropdowns(page, result);

    return result;
}

// 드롭다운을 실제로 클릭해서 열고 li 텍스트 + data 속성 수집
async function scanByClickingDropdowns(page, result) {
    const dropdownSelectors = [
        "input[placeholder='컬러']",
        "input[placeholder='사이즈']",
        "button[class*='OptionSelect']",
        "button[class*='option-select']",
        "[class*='SelectBox__button']",
        "[class*='select-box'] button",
        "[class*='goods_option'] > button",
        "[class*='ProductOption'] button",
        "div[class*='SelectBox']", // 전체 박스 클릭용
    ];

    let dropdownIndex = 0;
    for (const sel of dropdownSelectors) {
        const btns = await page.$$(sel);
        for (const btn of btns) {
            const isVisible = await btn.isVisible().catch(() => false);
            if (!isVisible) continue;

            const btnText = (await btn.textContent()).trim();
            console.log(`\n  🖱  드롭다운 클릭 시도 #${dropdownIndex + 1}: "${btnText}"`);

            await btn.click().catch(() => { });
            await sleep(600);

            // 열린 리스트 항목 수집
            const itemSelectors = [
                "div[class*='DropdownScrollContainer'] div[role='button']",
                "div[class*='DropdownScrollContainer'] li",
                "ul[class*='OptionList'] li:not([class*='disabled'])",
                "ul[class*='option_list'] li",
                "[role='listbox'] li",
                "[role='option']",
                "[class*='OptionItem']",
                "[class*='option-item']",
                "[class*='SelectItem']",
            ];

            let collected = [];
            for (const iSel of itemSelectors) {
                const items = await page.$$(iSel);
                if (items.length === 0) continue;

                for (const item of items) {
                    const text = (await item.textContent()).trim();
                    if (!text || text === btnText) continue;

                    const dataset = await item.evaluate((el) => {
                        const out = {};
                        for (const [k, v] of Object.entries(el.dataset)) out[k] = v;
                        return out;
                    });

                    // 품절 여부 체크: "(품절)" 텍스트 포함 또는 "재입고 알림" 버튼 존재
                    const hasSoldOutText = text.includes("품절") || text.includes("Sold Out");
                    const hasRestockButton = await item.$("button:has-text('재입고')").then(b => !!b).catch(() => false);

                    const classList = await item.getAttribute("class") || "";
                    const soldOut =
                        hasSoldOutText ||
                        hasRestockButton ||
                        classList.includes("disable") ||
                        classList.includes("soldout") ||
                        (await item.getAttribute("aria-disabled")) === "true";

                    collected.push({ label: text, soldOut, dataset, selector: iSel });
                }
                if (collected.length > 0) break;
            }

            if (collected.length > 0) {
                console.log(`     → ${collected.length}개 항목 수집:`);
                collected.forEach((c) =>
                    console.log(`       • "${c.label}"${c.soldOut ? " [품절]" : ""}  data=${JSON.stringify(c.dataset)}`)
                );

                // 컬러/사이즈 분류 (버튼 텍스트 or 순서 기준)
                const isFirst = dropdownIndex === 0;
                const target = isFirst ? result.color : result.size;
                if (target.length === 0) target.push(...collected);
            } else {
                console.log("     → 항목 없음 (이미 닫혔거나 다른 셀렉터 필요)");
            }

            // 드롭다운 닫기 (ESC)
            await page.keyboard.press("Escape");
            await sleep(300);
            dropdownIndex++;
        }
        if (dropdownIndex >= 2) break;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  스캔된 옵션과 원하는 값 비교 + 체크
// ══════════════════════════════════════════════════════════════════════════════
function checkMatch(scannedOptions, targetLabel, type) {
    if (!targetLabel) {
        console.log(`  ⏭  ${type} 타겟 미지정 — 스킵`);
        return null;
    }

    const found = scannedOptions.find((o) => isMatch(o.label, targetLabel));

    if (!found) {
        console.log(`  ❌ ${type} "${targetLabel}" — 옵션 없음`);
        return { found: false, target: targetLabel };
    }

    if (found.soldOut) {
        console.log(`  ⚠️  ${type} "${found.label}" — 발견됐으나 품절`);
        return { found: true, soldOut: true, option: found };
    }

    console.log(`  ✅ ${type} "${found.label}" — 일치! 재고 있음`);
    return { found: true, soldOut: false, option: found };
}

// ══════════════════════════════════════════════════════════════════════════════
//  실제 드롭다운에서 옵션 선택 (체크 통과 시)
// ══════════════════════════════════════════════════════════════════════════════
async function clickOption(page, targetLabel, dropdownIndex) {
    const colorSelectors = [
        "input[placeholder='컬러']",
        "button[class*='OptionSelect']", // 특정 테마에선 이게 컬러일 수 있음
    ];
    const sizeSelectors = [
        "input[placeholder='사이즈']",
    ];
    const generalSelectors = [
        "div[class*='SelectBox']",
        "button[class*='OptionSelect']",
        "button[class*='option-select']",
        "[class*='SelectBox__button']",
        "[class*='select-box'] button",
        "[class*='goods_option'] > button",
    ];

    let btnClicked = false;

    // 1. 특정 필드 셀렉터 먼저 시도
    const specificSels = dropdownIndex === 0 ? colorSelectors : sizeSelectors;
    for (const sel of specificSels) {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
            console.log(`  🖱  특정 드롭다운 #${dropdownIndex} 버튼 클릭: "${sel}"`);
            await btn.click().catch(() => { });
            btnClicked = true;
            break;
        }
    }

    // 2. 실패 시 인덱스 기반 범용 셀렉터 시도
    if (!btnClicked) {
        for (const sel of generalSelectors) {
            const btns = await page.$$(sel);
            const visibleBtns = [];
            for (const b of btns) {
                if (await b.isVisible()) visibleBtns.push(b);
            }
            if (visibleBtns[dropdownIndex]) {
                console.log(`  🖱  범용 드롭다운 #${dropdownIndex} (인덱스기반) 클릭: "${sel}"`);
                await visibleBtns[dropdownIndex].click().catch(() => { });
                btnClicked = true;
                break;
            }
        }
    }

    if (!btnClicked) return;

    // targetLabel이 없으면 드롭다운만 열고 종료
    if (!targetLabel) {
        console.log(`  ✔ 드롭다운 #${dropdownIndex} 오픈 완료`);
        return;
    }

    await sleep(500);

    // 열린 리스트에서 타겟 찾아 클릭
    const itemSelectors = [
        "[data-mds='StaticDropdownMenuItem']",
        "div[class*='SelectOptionItemContainer']",
        "div[class*='DropdownScrollContainer'] div[role='button']",
        "div[class*='DropdownScrollContainer'] li",
        "ul[class*='OptionList'] li",
        "[role='listbox'] li",
        "[role='option']",
        "[class*='OptionItem']",
        "[class*='SelectItem']",
    ];

    for (const sel of itemSelectors) {
        const items = await page.$$(sel);
        for (const item of items) {
            const text = await item.textContent();
            if (isMatch(text, targetLabel)) {
                await item.click().catch(() => { });
                console.log(`  ✔ 클릭 선택 완료: "${text.trim()}"`);
                await sleep(400);
                return;
            }
        }
    }

    if (targetLabel) {
        await page.keyboard.press("Escape");
        console.log(`  ⚠ 리스트에서 "${targetLabel}" 클릭 실패`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  메인
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    printBanner(`무신사 옵션 스캐너 & 매칭 체커`);
    console.log(`  상품 ID    : ${PRODUCT_ID}`);
    console.log(`  URL        : ${BASE_URL}`);
    console.log(`  찾는 컬러  : ${TARGET_COLOR || "(미지정)"}`);
    console.log(`  찾는 사이즈: ${TARGET_SIZE || "(미지정)"}`);

    const browser = await chromium.launch({
        headless: HEADLESS,
        slowMo: SLOW_MO,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/124.0.0.0 Safari/537.36",
        locale: "ko-KR",
        viewport: { width: 1280, height: 900 },
    });

    const page = await context.newPage();
    const options = { color: [], size: [], raw: {} };

    // 이미지/폰트 차단 (속도 개선)
    await page.route(
        "**/*.{gif,woff,woff2,ttf,otf,mp4,webm}",
        (r) => r.abort()
    );

    // 네트워크 요청 중 옵션 API 응답 감청
    const interceptedOptionData = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (
            url.includes("option") ||
            url.includes("goods/detail") ||
            url.includes("products/") && url.includes("api")
        ) {
            try {
                const ct = res.headers()["content-type"] || "";
                if (ct.includes("json")) {
                    const json = await res.json().catch(() => null);
                    if (json) {
                        interceptedOptionData.push({ url, json });
                        console.log(`  📡 API 응답 감청: ${url.slice(0, 80)}`);
                    }
                }
            } catch { }
        }
    });

    console.log("\n🌐 페이지 로딩 중...");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await sleep(2500);

    // 팝업 닫기
    for (const sel of [
        "button[aria-label*='닫기']",
        "button[aria-label*='close']",
        ".popup-close",
        "[class*='Modal'] button[class*='close']",
    ]) {
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
            await el.click().catch(() => { });
            await sleep(200);
        }
    }

    // ── 옵션 스캔 ─────────────────────────────────────────────────────────────
    // ── STEP 1: 컬러 스캔 및 선택 ──────────────────────────────────────────
    printBanner("STEP 1 : 컬러 옵션 스캔 및 선택");
    // 컬러 드롭다운 클릭해서 열기 (첫 번째 드롭다운)
    await clickOption(page, "", 0); // 일단 열기만 함 (label ""이면 열기만)
    await sleep(1000);

    const colorItems = await scanCurrentItems(page);
    options.color = colorItems;

    console.log(`  컬러 옵션 (${options.color.length}개):`);
    options.color.forEach((c) => console.log(`    • "${c.label}"${c.soldOut ? " [품절]" : ""}`));

    let colorSelected = false;
    if (TARGET_COLOR) {
        const match = checkMatch(options.color, TARGET_COLOR, "컬러");
        if (match?.found && !match?.soldOut) {
            console.log(`  ▶ 컬러 선택 시도: "${match.option.label}"`);
            await selectItemFromList(page, TARGET_COLOR);
            colorSelected = true;
            console.log("  ⏳ 사이즈 옵션 로딩 대기 (2초)...");
            await sleep(2000);
        } else {
            await page.keyboard.press("Escape");
            await sleep(500);
        }
    } else {
        console.log("  ⏭ 컬러 미지정 - 첫 번째 사용 가능 옵션 선택 시도");
        const firstAvail = options.color.find(o => !o.soldOut);
        if (firstAvail) {
            await selectItemFromList(page, firstAvail.label);
            colorSelected = true;
            await sleep(1500);
        } else {
            await page.keyboard.press("Escape");
        }
    }

    // ── STEP 2: 사이즈 스캔 및 선택 ──────────────────────────────────────────
    printBanner("STEP 2 : 사이즈 옵션 스캔 및 선택");
    if (colorSelected) {
        await clickOption(page, "", 1); // 두 번째 드롭다운 열기
        await sleep(1000);

        const sizeItems = await scanCurrentItems(page);
        options.size = sizeItems;

        console.log(`  사이즈 옵션 (${options.size.length}개):`);
        options.size.forEach((s) => console.log(`    • "${s.label}"${s.soldOut ? " [품절]" : ""}`));

        if (TARGET_SIZE) {
            const match = checkMatch(options.size, TARGET_SIZE, "사이즈");
            if (match?.found && !match?.soldOut) {
                console.log(`  ▶ 사이즈 선택 시도: "${match.option.label}"`);
                await selectItemFromList(page, TARGET_SIZE);
            } else {
                await page.keyboard.press("Escape");
            }
        } else {
            console.log("  ⏭ 사이즈 미지정 - 스캔만 종료");
            await page.keyboard.press("Escape");
        }
    } else {
        console.log("  ⚠ 컬러가 선택되지 않아 사이즈 스캔을 진행할 수 없습니다.");
    }

    // ── STEP 3: 최종 결과 ──────────────────────────────────────────────────
    printBanner("STEP 3 : 최종 결과");
    const colorFinal = TARGET_COLOR ? options.color.find(o => isMatch(o.label, TARGET_COLOR)) : { found: true };
    const sizeFinal = TARGET_SIZE ? options.size.find(o => isMatch(o.label, TARGET_SIZE)) : { found: true };

    const success = (colorFinal && !colorFinal.soldOut) && (sizeFinal && !sizeFinal.soldOut);

    if (success) {
        console.log("  🎉 원하는 옵션이 모두 존재하고 선택 완료!");
    } else {
        console.log("  ❌ 일부 옵션이 없거나 품절입니다.");
    }

    // 스크린샷
    const shot = `musinsa_${PRODUCT_ID}_result.png`;
    const fullShotPath = `C:/mnt/user-data/outputs/${shot}`;
    await page.screenshot({ path: fullShotPath });
    console.log(`\n  📸 스크린샷: ${fullShotPath}`);

    await sleep(2000);
    await browser.close();
    console.log("\n✅ 완료\n");
}

async function scanCurrentItems(page) {
    const itemSelectors = [
        "[data-mds='StaticDropdownMenuItem']",
        "div[class*='SelectOptionItemContainer']",
        "div[class*='DropdownScrollContainer'] div[role='button']",
        "div[class*='DropdownScrollContainer'] li",
        "ul[class*='OptionList'] li",
        "[role='listbox'] li",
        "[role='option']",
    ];

    let collected = [];
    for (const sel of itemSelectors) {
        const items = await page.$$(sel);
        if (items.length === 0) continue;

        console.log(`  🔍 셀렉터 "${sel}"로 ${items.length}개 항목 감지`);

        for (const item of items) {
            // 텍스트 추출 시 자실 요소들의 텍스트를 고르게 수집
            const rawText = await item.innerText();
            const text = rawText.replace(/\s+/g, " ").trim();
            if (!text) continue;

            // 1. 텍스트에 "(품절)" 또는 "(Sold Out)"이 명시적으로 포함된 경우
            const hasSoldOutText = text.includes("(품절)") || text.includes("(Sold Out)");

            // 2. "재입고 알림" 버튼이 내부에 존재하는 경우
            const hasRestockButton = await item.$("button:has-text('재입고')").then(b => !!b).catch(() => false);

            // 3. 속성으로 명시적 비활성화된 경우 (주의: 클래스명에 'disabled'가 포함된 Tailwind 수식어는 무시)
            const ariaDisabled = await item.getAttribute("aria-disabled");
            const dataDisabled = await item.getAttribute("data-disabled");
            const isExplicitlyDisabled = ariaDisabled === "true" || dataDisabled !== null;

            const soldOut = hasSoldOutText || hasRestockButton || isExplicitlyDisabled;

            console.log(`    - 스캔됨: "${text}" [품절여부: ${soldOut}]`);

            collected.push({
                label: text,
                soldOut: soldOut
            });
        }
        if (collected.length > 0) break;
    }
    return collected;
}

async function selectItemFromList(page, targetLabel) {
    const itemSelectors = [
        "[data-mds='StaticDropdownMenuItem']",
        "div[class*='SelectOptionItemContainer']",
        "div[class*='DropdownScrollContainer'] div[role='button']",
        "div[class*='DropdownScrollContainer'] li",
        "ul[class*='OptionList'] li",
    ];
    for (const sel of itemSelectors) {
        const items = await page.$$(sel);
        for (const item of items) {
            const text = await item.innerText();
            if (isMatch(text, targetLabel)) {
                console.log(`  ✅ 클릭 대상 발견: "${text.trim()}"`);
                await item.click().catch(() => { });
                return true;
            }
        }
    }
    return false;
}

main().catch((err) => {
    console.error("\n❌ 오류:", err.message);
    process.exit(1);
});