/**
 * Auto Mercado DOM/network diagnostic.
 *
 * Runs only when `AM_DIAGNOSE=1` is set. Loads the login page and a sample
 * category page through Playwright, dumps every input/button selector,
 * captures network requests, and saves screenshots — all to /tmp/automercado-*.
 *
 * After running this once we can update the real scraper with the captured
 * selectors instead of guessing.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import { desc, eq } from "drizzle-orm";
import { integrationCredentials } from "../../drizzle/schema";
import { decryptCredential } from "../_core/vault";

const ORIGIN = "https://automercado.cr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface AmCredentials {
  email: string;
  password: string;
}

interface LoginInputInfo {
  index: number;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  formControlName: string | null;
  autocomplete: string;
  visible: boolean;
}

interface LoginButtonInfo {
  index: number;
  text: string;
  type: string;
  visible: boolean;
}

interface DiagnosticReport {
  loginUrl: string;
  loginInputs: LoginInputInfo[];
  loginButtons: LoginButtonInfo[];
  loginAttemptResult: {
    attempted: boolean;
    success: boolean;
    finalUrl: string;
    errorMessages: string[];
  };
  categoryUrl: string;
  categoryProductPatterns: Array<{ className: string; elementCount: number }>;
  categorySamples: Array<{
    outerHtmlSnippet: string;
    textPreview: string;
  }>;
  networkCalls: string[];
}

async function loadFirstCred(): Promise<AmCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = drizzle(process.env.DATABASE_URL);
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integration, "automercado"))
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return decryptCredential<AmCredentials>(row.ciphertext);
}

export async function runAutoMercadoDiagnostic(): Promise<void> {
  console.log("[am-diag] starting diagnostic");
  const cred = await loadFirstCred();
  console.log(`[am-diag] credentials found: ${cred ? "yes" : "no"}`);

  // Anti-bot detection: AM serves an empty page when it detects HeadlessChrome.
  // These flags hide the webdriver flag and disable automation-controlled banner.
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
    ],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "es-CR",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      // Override client hints so AM doesn't see HeadlessChrome in sec-ch-ua.
      "sec-ch-ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
  });
  // Remove navigator.webdriver flag (a classic Playwright/Selenium tell).
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  const networkCalls: string[] = [];
  // Also capture POST bodies for AM Azure API — that's where the catalog query params live.
  const productApiCalls: Array<{ url: string; method: string; body: string; status: number; sample: string }> = [];

  page.on("request", (req) => {
    const url = req.url();
    if (
      !/imagekit|cms-production|fonts\.|gstatic|googleapis|\.svg|\.png|\.jpg|\.jpeg|\.webp|\.woff|\.ico|\.css/i.test(url) &&
      /api|graphql|catalog|product|search|customer|cart|login|auth|signin/i.test(url)
    ) {
      networkCalls.push(`${req.method()} ${url}`);
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("automercado.azure-api.net")) return;
    if (!/product|catalog|search|getDynamic|category/i.test(url)) return;
    try {
      const req = res.request();
      const body = req.postData() ?? "";
      const text = await res.text().catch(() => "");
      productApiCalls.push({
        url,
        method: req.method(),
        body: body.slice(0, 2000),
        status: res.status(),
        sample: text.slice(0, 2500),
      });
    } catch {
      // ignore
    }
  });

  const report: DiagnosticReport = {
    loginUrl: `${ORIGIN}/login`,
    loginInputs: [],
    loginButtons: [],
    loginAttemptResult: {
      attempted: false,
      success: false,
      finalUrl: "",
      errorMessages: [],
    },
    categoryUrl: `${ORIGIN}/categorias/abarrotes`,
    categoryProductPatterns: [],
    categorySamples: [],
    networkCalls: [],
  };

  // ===== 1. LOGIN FORM INSPECTION =====
  console.log(`[am-diag] loading ${report.loginUrl}`);
  await page.goto(report.loginUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  await page.screenshot({ path: "/tmp/am-login-page.png", fullPage: false }).catch(() => {});

  report.loginInputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input")).map((el, i) => ({
      index: i,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      formControlName: el.getAttribute("formcontrolname"),
      autocomplete: el.autocomplete,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }))
  );

  report.loginButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button")).map((el, i) => ({
      index: i,
      text: el.textContent?.trim().slice(0, 80) ?? "",
      type: el.type,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }))
  );

  const visibleInputs = report.loginInputs.filter((i) => i.visible);
  const visibleButtons = report.loginButtons.filter((b) => b.visible);
  console.log(`[am-diag] login form: ${visibleInputs.length} visible inputs, ${visibleButtons.length} visible buttons`);

  // ===== 2. ATTEMPT LOGIN IF CREDS PRESENT =====
  if (cred) {
    report.loginAttemptResult.attempted = true;
    try {
      const emailInput = visibleInputs.find(
        (i) => i.type === "email" || /mail|usuario|user/i.test(i.name + i.id + i.placeholder)
      );
      const passInput = visibleInputs.find((i) => i.type === "password");

      if (emailInput && passInput) {
        const emailSelector =
          (emailInput.formControlName && `input[formcontrolname="${emailInput.formControlName}"]`) ||
          (emailInput.name && `input[name="${emailInput.name}"]`) ||
          (emailInput.id && `#${emailInput.id}`) ||
          'input[type="email"]';
        const passSelector =
          (passInput.formControlName && `input[formcontrolname="${passInput.formControlName}"]`) ||
          (passInput.name && `input[name="${passInput.name}"]`) ||
          (passInput.id && `#${passInput.id}`) ||
          'input[type="password"]';

        console.log(`[am-diag] email selector: ${emailSelector}`);
        console.log(`[am-diag] pass  selector: ${passSelector}`);

        await page.locator(emailSelector).first().fill(cred.email);
        await page.locator(passSelector).first().fill(cred.password);

        const submitBtn = visibleButtons.find(
          (b) => b.type === "submit" || /ingresar|iniciar|login|entrar/i.test(b.text)
        );
        if (submitBtn) {
          await page
            .locator(`button >> nth=${submitBtn.index}`)
            .click({ timeout: 5000 })
            .catch(async () => {
              await page.keyboard.press("Enter");
            });
        } else {
          await page.keyboard.press("Enter");
        }

        await page.waitForTimeout(8000);
        report.loginAttemptResult.finalUrl = page.url();
        report.loginAttemptResult.success = !page.url().includes("/login");

        report.loginAttemptResult.errorMessages = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll('[class*="error"], [class*="invalid"], [role="alert"], mat-error')
          )
            .map((el) => el.textContent?.trim() ?? "")
            .filter((t) => t.length > 0 && t.length < 200)
            .slice(0, 5)
        );

        console.log(`[am-diag] login result: success=${report.loginAttemptResult.success}, finalUrl=${report.loginAttemptResult.finalUrl}`);
      } else {
        console.log(`[am-diag] couldn't find email + password inputs to attempt login`);
      }
    } catch (err) {
      console.log(`[am-diag] login attempt threw: ${err instanceof Error ? err.message : err}`);
    }
  }

  await page.screenshot({ path: "/tmp/am-post-login.png", fullPage: false }).catch(() => {});

  // Dismiss known modals (cancelled Plan A subscription upsell, etc.).
  // After login, AM shows a "Continuar Comprando" button that closes the upsell.
  console.log(`[am-diag] dismissing any modals`);
  await page
    .locator('button:has-text("Continuar Comprando"), button:has-text("Continuar"), [class*="close"]')
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(2000);

  // Reset network capture so we only see calls from product browsing.
  networkCalls.length = 0;

  // ===== 3. CATEGORY / PROMO PAGE INSPECTION =====
  // Try /promociones first — usually doesn't need store selection. Fall back to category.
  // Visit /promociones first — it seems to seed cookies/localStorage that
  // /categorias/* needs to render products.
  const productUrls = [
    `${ORIGIN}/promociones`,
    `${ORIGIN}/categorias/bebidas-alcoholicas`,
    `${ORIGIN}/categorias/abarrotes/aceites-y-grasas`,
  ];
  // Visit each URL in order and accumulate session state. Save a screenshot
  // and the body text length for each so we can debug what AM actually rendered.
  let bestUrl = "";
  let bestPriceCount = 0;
  for (const url of productUrls) {
    console.log(`[am-diag] loading ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
      await page.waitForTimeout(8000);
      await page
        .locator('button:has-text("Continuar"), button:has-text("Aceptar"), [class*="close"]')
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
      await page.waitForTimeout(3000);
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await page.waitForTimeout(1200);
      }

      // Count ₡ price occurrences as a signal of how product-rich the page is.
      const stats = await page.evaluate(() => {
        const text = document.body.textContent ?? "";
        const priceMatches = text.match(/₡\s*[\d.,]+/g) ?? [];
        return {
          bodyLength: text.length,
          priceCount: priceMatches.length,
          firstPrices: priceMatches.slice(0, 5),
        };
      });
      console.log(`[am-diag]   ${url}: body=${stats.bodyLength}, prices=${stats.priceCount} (${stats.firstPrices.join(", ")})`);

      const slug = url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 60);
      await page.screenshot({ path: `/tmp/am-${slug}.png`, fullPage: false }).catch(() => {});

      if (stats.priceCount > bestPriceCount) {
        bestPriceCount = stats.priceCount;
        bestUrl = url;
      }
    } catch (err) {
      console.log(`[am-diag]   ${url} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (bestUrl) {
    report.categoryUrl = bestUrl;
    console.log(`[am-diag] best URL by price count: ${bestUrl} (${bestPriceCount} prices)`);
  }

  await page.screenshot({ path: "/tmp/am-category-page.png", fullPage: false }).catch(() => {});

  report.categoryProductPatterns = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll("[class]").forEach((el) => {
      el.className
        .toString()
        .split(/\s+/)
        .forEach((c) => {
          if (!c) return;
          counts.set(c, (counts.get(c) ?? 0) + 1);
        });
    });
    return Array.from(counts.entries())
      .filter(([cls, n]) => n >= 4 && /product|card|item|tile|grid|prod/i.test(cls))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([className, elementCount]) => ({ className, elementCount }));
  });

  if (report.categoryProductPatterns.length > 0) {
    const topClass = report.categoryProductPatterns[0].className;
    report.categorySamples = await page.evaluate((cls: string) => {
      const els = Array.from(document.getElementsByClassName(cls)).slice(0, 2);
      return els.map((el) => ({
        outerHtmlSnippet: el.outerHTML.slice(0, 2000),
        textPreview: (el.textContent ?? "").trim().slice(0, 300),
      }));
    }, topClass);
  }

  console.log(`[am-diag] product patterns: ${report.categoryProductPatterns.length}`);
  if (report.categoryProductPatterns.length > 0) {
    const top = report.categoryProductPatterns[0];
    console.log(`[am-diag] top class: ${top.className} (${top.elementCount} elements)`);
  }

  // ===== 4. CLICK A CATEGORY RADIO TO CAPTURE THE PRODUCT API CALL =====
  console.log(`[am-diag] clicking first category radio to capture XHR`);
  const preClickCount = productApiCalls.length;
  try {
    await page.locator(".container-radio-item").first().click({ timeout: 5000 });
    await page.waitForTimeout(8000);
    // Try clicking multiple categories to surface different endpoints.
    const radioCount = await page.locator(".container-radio-item").count();
    console.log(`[am-diag]   radio buttons visible: ${radioCount}`);
    for (let i = 1; i < Math.min(4, radioCount); i++) {
      await page.locator(".container-radio-item").nth(i).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(4000);
    }
  } catch (err) {
    console.log(`[am-diag]   radio click failed: ${err instanceof Error ? err.message : err}`);
  }
  console.log(`[am-diag]   captured ${productApiCalls.length - preClickCount} new API calls after radio clicks`);

  // Capture HTML for whichever class looks most like a product card. We look
  // for elements that contain BOTH a ₡ price and an "Agregar" button — that's
  // the real signature of a product card on /categorias/* pages.
  const productCardInfo = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("[class]")).filter((el) => {
      const text = el.textContent ?? "";
      return /₡/.test(text) && /agregar/i.test(text) && text.length < 800;
    });
    // Find the smallest enclosing card — likely the most specific selector.
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.textContent ?? "").length - (b.textContent ?? "").length);
    const sample = candidates[0];
    const allClasses = new Set<string>();
    candidates.slice(0, 20).forEach((c) => c.className.toString().split(/\s+/).forEach((cls) => cls && allClasses.add(cls)));
    return {
      count: candidates.length,
      sampleClasses: Array.from(allClasses).slice(0, 20),
      sampleHtml: sample.outerHTML.slice(0, 3500),
      sampleText: (sample.textContent ?? "").trim().slice(0, 400),
    };
  });
  if (productCardInfo) {
    writeFileSync("/tmp/am-product-card.html", productCardInfo.sampleHtml);
    console.log(`[am-diag]   found ${productCardInfo.count} elements with ₡ + Agregar`);
    console.log(`[am-diag]   candidate classes: ${productCardInfo.sampleClasses.join(", ")}`);
    console.log(`[am-diag]   sample text: ${productCardInfo.sampleText.slice(0, 200)}`);
    console.log(`[am-diag]   sample HTML in /tmp/am-product-card.html`);
  } else {
    console.log(`[am-diag]   NO elements with ₡+Agregar found — page didn't render products`);
  }

  report.networkCalls = networkCalls.slice(0, 100);
  console.log(`[am-diag] captured ${networkCalls.length} API-looking calls, saving first 100`);
  console.log(`[am-diag] captured ${productApiCalls.length} product-API calls with bodies`);

  writeFileSync("/tmp/automercado-diagnostic.json", JSON.stringify(report, null, 2));
  writeFileSync("/tmp/automercado-api-calls.json", JSON.stringify(productApiCalls, null, 2));
  console.log(`[am-diag] full report: /tmp/automercado-diagnostic.json`);
  console.log(`[am-diag] product API details: /tmp/automercado-api-calls.json`);
  console.log(`[am-diag] screenshots: /tmp/am-login-page.png, /tmp/am-post-login.png, /tmp/am-category-page.png`);

  await ctx.close();
  await browser.close();
}
