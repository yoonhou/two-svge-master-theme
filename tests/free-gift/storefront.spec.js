const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { GIFT, PRODUCT } = require('./cart-harness');

const store = 'https://two-svge-test-app.myshopify.com';
const enabled = process.env.RUN_STOREFRONT_TESTS === '1';
const throttledPages = new WeakSet();

// Traces can contain storefront credentials and customer session data.
test.use({ trace: 'off' });

test.describe('test storefront', () => {
  test.skip(!enabled, 'Run explicitly with npm run test:storefront');
  test.setTimeout(90000);

  async function openStore(page) {
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.hostname === new URL(store).hostname && url.pathname.startsWith('/cart') && response.status() === 429) throttledPages.add(page);
    });
    await page.goto(`${store}/products/alpha-redline`, { waitUntil: 'domcontentloaded' });
    const password = page.locator('input[name="password"]');
    if (await password.isVisible().catch(() => false)) {
      const passwordFile = process.env.STOREFRONT_PASSWORD_FILE;
      if (!passwordFile) throw new Error('Storefront is password protected; set STOREFRONT_PASSWORD_FILE to a file containing its password.');
      await password.fill(fs.readFileSync(passwordFile, 'utf8').trim());
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        password.press('Enter'),
      ]);
      await page.goto(`${store}/products/alpha-redline`, { waitUntil: 'domcontentloaded' });
    }
    if (new URL(page.url()).hostname !== new URL(store).hostname) {
      throw new Error('The test store redirected to a different host; stopping before changing a cart.');
    }
    await page.waitForFunction(() => window.FreeGiftManager && window.freeGiftSettings, { timeout: 15000 });
    const settings = await page.evaluate(() => window.freeGiftSettings);
    expect(settings.enabled, 'The storefront theme must have the gift enabled.').toBe(true);
    expect(Number(settings.variantId), 'The storefront gift must be the sticker variant.').toBe(GIFT);
  }

  async function cart(page) {
    if (throttledPages.has(page)) throw new Error('A cart request returned HTTP 429; stopping this shopper.');
    const response = await page.evaluate(async () => {
      const result = await fetch('/cart.js');
      return { status: result.status, data: result.ok ? await result.json() : null };
    });
    expect(response.status, `Reading the isolated test cart returned HTTP ${response.status}.`).toBe(200);
    return response.data;
  }

  async function clear(page) {
    if (throttledPages.has(page)) throw new Error('A cart request returned HTTP 429; stopping this shopper.');
    const status = await page.evaluate(async () => (await fetch('/cart/clear.js', { method: 'POST' })).status);
    expect(status, `Clearing the isolated test cart returned HTTP ${status}.`).toBe(200);
  }

  async function change(page, id, quantity) {
    if (throttledPages.has(page)) throw new Error('A cart request returned HTTP 429; stopping this shopper.');
    return page.evaluate(async ({ id, quantity }) => {
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantity }),
      });
      return response.status;
    }, { id, quantity });
  }

  async function addProduct(page) {
    await page.goto(`${store}/products/alpha-redline`, { waitUntil: 'domcontentloaded' });
    const button = page.locator('.ProductForm__AddToCart:visible').first();
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(async () => {
      const current = await cart(page);
      return current.items.filter((item) => item.variant_id === PRODUCT).reduce((sum, item) => sum + item.quantity, 0);
    }, { timeout: 20000 }).toBeGreaterThan(0);
    await expect.poll(async () => {
      const current = await cart(page);
      return current.items.filter((item) => item.properties?._free_gift === 'true').reduce((sum, item) => sum + item.quantity, 0);
    }, { timeout: 20000 }).toBe(1);
  }

  test('product form adds one marked gift; cart updates repair and remove it', async ({ page }) => {
    await openStore(page);
    await clear(page);
    let failure;
    try {
      await addProduct(page);
      let current = await cart(page);
      let gift = current.items.find((item) => item.properties?._free_gift === 'true');
      expect(gift.variant_id).toBe(GIFT);
      expect(gift.properties['Free Gift']).toBe('Black Friday');

      expect(await change(page, gift.key, 2)).toBe(200);
      await page.evaluate(async () => window.FreeGiftManager.reconcile());
      await expect.poll(async () => {
        const updated = await cart(page);
        return updated.items.filter((item) => item.properties?._free_gift === 'true').reduce((sum, item) => sum + item.quantity, 0);
      }).toBe(1);

      current = await cart(page);
      const product = current.items.find((item) => item.variant_id === PRODUCT && item.properties?._free_gift !== 'true');
      expect(product).toBeTruthy();
      expect(await change(page, product.key, 0)).toBe(200);
      await page.evaluate(async () => window.FreeGiftManager.reconcile());
      await expect.poll(async () => (await cart(page)).items.length).toBe(0);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      if (!throttledPages.has(page)) {
        try { await clear(page); } catch (error) { if (!failure) throw error; }
      }
    }
  });

  test('rapid clicks on the product button leave one marked gift', async ({ page }) => {
    await openStore(page);
    await clear(page);
    let failure;
    try {
      await page.goto(`${store}/products/alpha-redline`, { waitUntil: 'domcontentloaded' });
      const button = page.locator('.ProductForm__AddToCart:visible').first();
      await expect(button).toBeEnabled();
      await button.evaluate((element) => {
        for (let i = 0; i < 20; i++) element.click();
      });
      await expect.poll(async () => (await cart(page)).items.some((item) => item.variant_id === PRODUCT), { timeout: 20000 }).toBe(true);
      await expect.poll(async () => {
        const current = await cart(page);
        return current.items.filter((item) => item.properties?._free_gift === 'true').reduce((sum, item) => sum + item.quantity, 0);
      }, { timeout: 20000 }).toBe(1);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      if (!throttledPages.has(page)) {
        try { await clear(page); } catch (error) { if (!failure) throw error; }
      }
    }
  });

  test('an unmarked sticker can reach checkout', async ({ page }) => {
    await openStore(page);
    await clear(page);
    let failure;
    try {
      const status = await page.evaluate(async (variantId) => {
        const response = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
        });
        return response.status;
      }, GIFT);
      expect(status).toBe(200);
      let current = await cart(page);
      expect(current.items.some((item) => item.variant_id === GIFT && item.properties?._free_gift !== 'true')).toBe(true);
      await page.goto(`${store}/cart`, { waitUntil: 'domcontentloaded' });
      await expect.poll(async () => {
        current = await cart(page);
        return current.items.some((item) => item.variant_id === GIFT && item.properties?._free_gift === 'true');
      }, { timeout: 20000 }).toBe(true);
      await page.locator('button[name="checkout"]:visible').first().click();
      await expect(page).toHaveURL(/\/checkouts?(?:\/|\?)/, { timeout: 30000 });
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      if (!throttledPages.has(page)) {
        try {
          if (new URL(page.url()).hostname !== new URL(store).hostname) await page.goto(`${store}/products/alpha-redline`, { waitUntil: 'domcontentloaded' });
          await clear(page);
        } catch (error) { if (!failure) throw error; }
      }
    }
  });

  test('three isolated shoppers add an item at roughly the same time', async ({ browser }) => {
    const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
    try {
      const pages = await Promise.all(contexts.map((context) => context.newPage()));
      await Promise.all(pages.map(async (page) => {
        await openStore(page);
        await clear(page);
        await addProduct(page);
        const current = await cart(page);
        const gifts = current.items.filter((item) => item.properties?._free_gift === 'true');
        expect(gifts).toHaveLength(1);
        expect(gifts[0].quantity).toBe(1);
      }));
      await Promise.all(pages.map(clear));
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
