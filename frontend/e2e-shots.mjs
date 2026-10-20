// Drives the real UI in headless Edge: login with the dev OTP, run an estimate, screenshot each step.
// usage: node e2e-shots.mjs <outDir>
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const out = process.argv[2] ?? "./shots";
mkdirSync(out, { recursive: true });
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ["--no-first-run", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const log = (...a) => console.log(...a);

try {
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
  await page.type("#mobile", "500000001");
  await Promise.all([page.waitForSelector('input[aria-label="الرقم 1"]', { timeout: 20000 }), page.click('button[type="submit"]')]);
  const code = await page.$eval('[role="alert"]', (el) => el.textContent.match(/\d{6}/)?.[0]);
  log("dev code:", code);
  await shot("02-otp");
  await page.type('input[aria-label="الرقم 1"]', code);
  await page.waitForFunction(() => location.pathname === "/", { timeout: 20000 });
  await page.waitForNetworkIdle({ idleTime: 500 });
  await shot("03-home");

  await page.goto("http://localhost:3000/estimate/new?type=apartment", { waitUntil: "networkidle0" });
  await page.waitForSelector("#district");
  await page.type("#district", "الصفا");
  await page.waitForSelector("ul button", { timeout: 15000 });
  await page.click("ul button");
  await page.type("#area", "150");
  await page.type("#age", "5");
  await page.type("#income", "40000");
  await page.click("button.rounded-full"); // first feature chip (مصعد)
  await shot("04-form");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("تعرّف على السعر")).click());
  await page.waitForFunction(() => location.pathname.startsWith("/estimate/") && !location.pathname.endsWith("/new"), { timeout: 30000 });
  await page.waitForNetworkIdle({ idleTime: 800 });
  await shot("05-result");

  await page.goto("http://localhost:3000/my-estimates", { waitUntil: "networkidle0" });
  await shot("06-my-estimates");

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(page.url().replace("/my-estimates", ""), { waitUntil: "networkidle0" });
  await shot("07-home-mobile");
  log("done:", page.url());
} catch (e) {
  console.error("E2E FAILED:", e.message);
  await shot("99-failure");
  process.exitCode = 1;
} finally {
  await browser.close();
}
