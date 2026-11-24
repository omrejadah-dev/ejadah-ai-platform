// End-to-end test: the real UI in a headless browser, against a running site (web + API + database).
//   login -> price a property -> the price and its range -> the recommendations -> it is saved in «تسعيراتي»
// Each step prints "ok  <step>"; the first failure stops the run, saves e2e-failure.png and exits non-zero.
//
//   npm run e2e                                   local site, the CI fixtures (db/tests/pricing_fixtures.sql)
//   E2E_DISTRICT=الصفا E2E_TYPE=apartment E2E_AREA=150 E2E_EMAIL=… E2E_PASSWORD=… npm run e2e     real data
// Settings (env): BASE_URL (http://localhost:3000), E2E_EMAIL / E2E_PASSWORD (the dev seed's broker), E2E_TYPE
// (land | villa | apartment | building), E2E_DISTRICT (a name the district search finds), E2E_AREA, E2E_TOTAL (when
// set, the exact total expected), CHROME (the browser; found on Windows / Linux / macOS when not set).
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const env = process.env;
const BASE = (env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = env.E2E_EMAIL ?? "broker@ejadah.test";
const PASSWORD = env.E2E_PASSWORD ?? "ejadah-test";
const TYPE = env.E2E_TYPE ?? "land";
const DISTRICT = env.E2E_DISTRICT ?? "حي أ";
const AREA = env.E2E_AREA ?? "500";
const TOTAL = env.E2E_TOTAL ? Number(env.E2E_TOTAL) : null;
const TYPE_LABEL = { land: "أرض", villa: "فيلا", apartment: "شقة", building: "عمارة" }[TYPE];
const CHROME = env.CHROME ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);

const ok = (step) => console.log(`ok    ${step}`);
const fail = (step, got) => { throw new Error(`${step}  (got: ${got})`); };
const digits = (s) => Number(String(s).replace(/[^\d]/g, ""));

if (!CHROME) { console.error("No browser found: set CHROME to Chrome or Edge"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--no-first-run"] });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.setViewport({ width: 1440, height: 1000 });

try {
  // 1. login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
  await page.type("#email", EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([page.waitForFunction(() => location.pathname === "/", { timeout: 30000 }), page.click('button[type="submit"]')]);
  ok(`login as ${EMAIL}`);

  // 2. price a property: type, district (from the search), area, submit
  await page.goto(`${BASE}/estimate/new`, { waitUntil: "networkidle0", timeout: 120000 });
  let picked = false;
  for (const b of await page.$$('[aria-labelledby="type-label"] button'))
    if ((await b.evaluate((e) => e.innerText)).includes(TYPE_LABEL)) { await b.click(); picked = true; break; }
  if (!picked) fail("the type tile", TYPE_LABEL);
  await page.type("#district", DISTRICT);
  await page.waitForFunction((d) => [...document.querySelectorAll('[role="option"]')].some((o) => o.innerText.includes(d)), { timeout: 20000 }, DISTRICT);
  for (const o of await page.$$('[role="option"]'))
    if ((await o.evaluate((e) => e.innerText)).includes(DISTRICT)) { await o.click(); break; }
  await page.type("#area", AREA);
  await page.click('form button[type="submit"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 30000 });
  ok(`price a ${TYPE_LABEL} of ${AREA} m² in ${DISTRICT}`);

  // 3. the price: a positive total, and (with the fixtures) exactly the expected one; the range around it
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.innerText.includes("النطاق المتوقع"), { timeout: 30000 });
  const dialog = await page.$eval('[role="dialog"]', (e) => e.innerText);
  if (dialog.includes("لا توجد صفقات كافية")) fail("a price", "not enough deals");
  // the first line after «السعر التقديري للعقار» that is only a number and «ريال»
  const lines = dialog.split("\n").map((l) => l.trim());
  const total = lines.slice(lines.indexOf("السعر التقديري للعقار")).find((l) => /^[\d,]+\s*ريال$/.test(l)) ?? "";
  if (!(digits(total) > 0)) fail("the price", total || "none shown");
  if (TOTAL !== null && digits(total) !== TOTAL) fail(`the price = ${TOTAL}`, total);
  ok(`the price: ${total}`);
  const range = dialog.split("\n").find((l) => /\d[\d,]* – [\d,]+/.test(l) || l.includes("السعر تقريبي"));
  if (!range) fail("the range", "none shown");
  ok(`the range: ${range.trim()}`);

  // 4. the recommendations load after the price: at least three, none empty
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll('[role="dialog"] ol')].find((o) => o.closest("div")?.innerText);
    return card && card.querySelectorAll("li").length >= 3;
  }, { timeout: 60000 });
  const tips = await page.$$eval('[role="dialog"] ol li', (lis) => lis.map((l) => l.innerText.replace(/^\d+\s*/, "").trim()));
  if (tips.length < 3 || tips.some((t) => t.length < 10)) fail("three recommendations", JSON.stringify(tips));
  ok(`${tips.length} recommendations, e.g. «${tips[0].slice(0, 60)}…»`);

  // 5. saved: the estimate is at the top of «تسعيراتي»
  await page.goto(`${BASE}/my-estimates`, { waitUntil: "networkidle0", timeout: 120000 });
  const first = await page.$$eval("main button", (bs) => bs.map((b) => b.innerText).find((t) => /ريال/.test(t)) ?? "");
  if (!first.includes(DISTRICT.replace(/^حي /, ""))) fail("saved in «تسعيراتي»", first.slice(0, 80));
  ok("saved at the top of «تسعيراتي»");

  if (errors.length) fail("no errors in the page", errors.join(" | "));
  ok("no errors in the page");
  console.log("e2e: all steps passed");
} catch (e) {
  console.error(`FAIL  ${e.message}`);
  await page.screenshot({ path: "e2e-failure.png", fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
