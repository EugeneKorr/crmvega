import { chromium, Browser, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');
const BASE_URL = 'http://localhost:3000';

// Создать директорию для скриншотов
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface LoginCredentials {
  email: string;
  password: string;
}

// Credentials для входа
const loginCredentials: LoginCredentials = {
  email: 'pilotec12@gmail.com',
  password: '123123',
};

async function login(page: Page) {
  console.log('🔐 Попытка входа...');

  // Перейти на страницу логина
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });

  // Ввести email
  await page.fill('input[type="email"]', loginCredentials.email);

  // Ввести пароль
  await page.fill('input[type="password"]', loginCredentials.password);

  // Нажать кнопку входа
  await page.click('button[type="submit"]');

  // Ждём пока страница загрузится
  await page.waitForNavigation({ waitUntil: 'networkidle' });

  console.log('✅ Вход выполнен');
}

async function takeScreenshot(page: Page, name: string, url: string) {
  try {
    console.log(`📸 Снимаю скриншот: ${name}...`);
    await page.goto(url, { waitUntil: 'networkidle' });

    // Подождать загрузки контента
    await page.waitForTimeout(1000);

    // Сделать скриншот
    const fileName = `${name}.png`;
    const filePath = path.join(SCREENSHOTS_DIR, fileName);
    await page.screenshot({ path: filePath, fullPage: true });

    console.log(`✅ Сохранён: ${filePath}`);
  } catch (error) {
    console.error(`❌ Ошибка при снятии скриншота ${name}:`, error);
  }
}

async function main() {
  let browser: Browser | null = null;

  try {
    console.log('🚀 Запускаю браузер...');
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Установить viewport для desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    console.log(`\n📱 Desktop (1440x900):`);

    // Попытаться залогиниться
    try {
      await login(page);

      // Снимать скриншоты основных страниц
      await takeScreenshot(page, 'orders-page', `${BASE_URL}/orders`);
      await takeScreenshot(page, 'contacts-page', `${BASE_URL}/contacts`);
      await takeScreenshot(page, 'inbox-page', `${BASE_URL}/inbox`);
      await takeScreenshot(page, 'settings-page', `${BASE_URL}/settings`);
    } catch (loginError) {
      console.warn('⚠️ Вход не удался, снимаю скриншоты доступных страниц...');
      await takeScreenshot(page, 'login-page', `${BASE_URL}/login`);
    }

    // Мобильный viewport
    console.log(`\n📱 Mobile (375x667):`);
    await page.setViewportSize({ width: 375, height: 667 });

    try {
      await takeScreenshot(page, 'mobile-orders-page', `${BASE_URL}/orders`);
      await takeScreenshot(page, 'mobile-contacts-page', `${BASE_URL}/contacts`);
    } catch (error) {
      console.warn('⚠️ Не удалось снять мобильные скриншоты');
    }

    await context.close();

    console.log(`\n✅ Скриншоты сохранены в: ${SCREENSHOTS_DIR}`);
    console.log(`📂 Используйте для сравнения при редизайне`);

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
