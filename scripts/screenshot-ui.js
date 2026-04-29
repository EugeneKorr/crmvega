const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');
const BASE_URL = 'http://localhost:3000';

// Создать директорию для скриншотов
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const loginCredentials = {
  email: 'pilotec12@gmail.com',
  password: '123123',
};

async function login(page) {
  console.log('🔐 Попытка входа...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  const emailInput = await page.$('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
  const passwordInput = await page.$('input[type="password"], input[placeholder*="password"], input[placeholder*="Password"]');

  if (emailInput && passwordInput) {
    await emailInput.fill(loginCredentials.email);
    await passwordInput.fill(loginCredentials.password);

    const submitButton = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
    if (submitButton) {
      await submitButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
      console.log('✅ Вход выполнен');
      return true;
    }
  }
  console.log('⚠️ Не удалось найти форму входа');
  return false;
}

async function takeScreenshot(page, name, url) {
  try {
    console.log(`📸 Снимаю скриншот: ${name}...`);
    await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(1500);

    const fileName = `${name}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, fileName);
    await page.screenshot({ path: filePath, fullPage: true });

    console.log(`✅ Сохранён: ${fileName}`);
  } catch (error) {
    console.error(`❌ Ошибка ${name}:`, error.message);
  }
}

async function main() {
  let browser = null;

  try {
    console.log('🚀 Запускаю браузер...');
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Desktop
    console.log('\n📱 Desktop (1440x900):');
    await page.setViewportSize({ width: 1440, height: 900 });

    const loggedIn = await login(page);

    if (loggedIn) {
      await takeScreenshot(page, '01-orders-page', `${BASE_URL}/orders`);
      await takeScreenshot(page, '02-contacts-page', `${BASE_URL}/contacts`);
      await takeScreenshot(page, '03-inbox-page', `${BASE_URL}/inbox`);
      await takeScreenshot(page, '04-settings-page', `${BASE_URL}/settings`);
      await takeScreenshot(page, '05-analytics-page', `${BASE_URL}/analytics`);
    }

    // Mobile
    console.log('\n📱 Mobile (375x667):');
    await page.setViewportSize({ width: 375, height: 667 });

    if (loggedIn) {
      await takeScreenshot(page, '06-mobile-orders', `${BASE_URL}/orders`);
      await takeScreenshot(page, '07-mobile-contacts', `${BASE_URL}/contacts`);
    }

    // Всегда снимаем login
    await page.setViewportSize({ width: 1440, height: 900 });
    await takeScreenshot(page, '00-login-page', `${BASE_URL}/login`);

    await context.close();

    console.log(`\n✅ Скриншоты сохранены в: ${SCREENSHOTS_DIR}`);
    console.log(`📂 ${fs.readdirSync(SCREENSHOTS_DIR).length} файлов`);

  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
