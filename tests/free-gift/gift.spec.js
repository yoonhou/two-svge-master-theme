const { test, expect } = require('@playwright/test');
const { mount, reconcile, line, gift, GIFT, PRODUCT } = require('./cart-harness');

test('adds one marked gift and leaves it alone across repeated checks', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT, 5)] });
  await reconcile(page);
  await reconcile(page);
  expect(state.adds).toBe(1);
  expect(state.items.filter((item) => item.properties._free_gift === 'true')).toEqual([gift(1, 'added-1')]);
});

test('does not add a gift to an empty cart', async ({ page }) => {
  const state = await mount(page);
  await reconcile(page);
  expect(state.items).toEqual([]);
  expect(state.adds).toBe(0);
});

test('removes a gift when the last qualifying item is removed', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()] });
  state.items = state.items.filter((item) => item.variant_id !== PRODUCT);
  await page.evaluate(() => document.documentElement.dispatchEvent(new CustomEvent('acc:cart:updated', { bubbles: true, detail: {} })));
  await reconcile(page);
  expect(state.items).toEqual([]);
});

test('removes marked gifts when disabled', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()], settings: { enabled: false } });
  await reconcile(page);
  expect(state.items).toEqual([line(PRODUCT)]);
});

test('reduces the gift quantity, removes duplicates, and restores checkout text', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift(3, 'first', { 'Free Gift': 'Old' }), gift(2, 'duplicate')] });
  await reconcile(page);
  expect(state.items).toEqual([line(PRODUCT), gift(1, 'first')]);
});

test('replaces a previously configured marked gift', async ({ page }) => {
  const oldGift = line(12345, 1, { _free_gift: 'true' }, 'old-gift');
  const state = await mount(page, { items: [line(PRODUCT), oldGift] });
  await reconcile(page);
  expect(state.items).toEqual([line(PRODUCT), gift(1, 'added-1')]);
});

test('removes a marked gift when no gift variant is configured', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()], settings: { variantId: null } });
  await reconcile(page);
  expect(state.items).toEqual([line(PRODUCT)]);
});

test('leaves the qualifying product in the cart if a sold-out gift cannot be added', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  state.unavailableVariantIds.add(GIFT);
  await reconcile(page);
  expect(state.addRequests.filter((item) => item.id === GIFT)).toHaveLength(1);
  expect(state.items).toEqual([line(PRODUCT)]);
});

test('removes an existing marked gift when its variant becomes sold out', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()] });
  state.unavailableVariantIds.add(GIFT);
  await reconcile(page);
  expect(state.items.filter((item) => item.properties._free_gift === 'true')).toHaveLength(0);
});

test('treats an unmarked sticker as a normal cart item', async ({ page }) => {
  const state = await mount(page, { items: [line(GIFT, 2, {}, 'unmarked')] });
  await reconcile(page);
  expect(state.items).toEqual([line(GIFT, 2, {}, 'unmarked'), gift(1, 'added-1')]);
});

test('allows checkout with an unmarked sticker and adds a marked gift', async ({ page }) => {
  const state = await mount(page, { items: [line(GIFT, 1, {}, 'unmarked')] });
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
  expect(state.items).toEqual([line(GIFT, 1, {}, 'unmarked'), gift(1, 'added-1')]);
});

test('shows a new gift notice once and dismisses it', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()] });
  await reconcile(page);
  const notice = page.locator('.FreeGiftQualifiedMessage');
  await expect(notice).toBeHidden();
  state.items = [line(PRODUCT)];
  await reconcile(page);
  await expect(notice).toBeVisible();
  await expect(notice).toBeHidden({ timeout: 6000 });
});

test('does not reveal a notice injected after a failed drawer refresh', async ({ page }) => {
  await mount(page, { items: [line(PRODUCT)] });
  await page.locator('.FreeGiftQualifiedMessage').evaluate((node) => node.remove());
  await page.evaluate(() => { window.AccCartDrawer.refresh = async () => { throw new Error('Refresh failed'); }; });
  await reconcile(page);
  await page.evaluate(() => {
    const message = document.createElement('div');
    message.className = 'FreeGiftQualifiedMessage';
    message.hidden = true;
    document.body.appendChild(message);
  });
  await expect(page.locator('.FreeGiftQualifiedMessage')).toBeHidden();
});

test('product-added events cannot pass an abort signal into reconciliation', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  await page.evaluate(() => {
    const controller = new AbortController();
    controller.abort();
    const event = new CustomEvent('product:added', { bubbles: true });
    Object.defineProperty(event, 'signal', { value: controller.signal });
    document.documentElement.dispatchEvent(event);
  });
  await expect.poll(() => state.adds).toBe(1);
});

test('cart page stops reloading if a property update does not persist', async ({ page }) => {
  const state = await mount(page, {
    items: [line(PRODUCT), gift(1, 'gift', { 'Free Gift': 'Old' })],
    cartPage: true,
    ignorePropertyChanges: true,
    changeKeyOnNoop: true,
  });
  await expect.poll(() => state.changes).toBe(2);
  await page.waitForTimeout(300);
  expect(state.navigations).toBe(2);
  expect(state.changes).toBe(2);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
});

test('cart page stops reloading if a quantity correction does not persist', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift(2)], cartPage: true, ignoreQuantityChanges: true });
  await expect.poll(() => state.changes).toBe(2);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  expect(state.navigations).toBe(2);
  await page.evaluate(() => document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true })));
  await expect.poll(() => state.changes).toBe(3);
  expect(state.navigations).toBe(2);
});

test('checkout can continue when a cart-page reload is suppressed', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift(2)], cartPage: true, ignoreQuantityChanges: true });
  await expect.poll(() => state.changes).toBe(2);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
  expect(state.navigations).toBe(2);
});

test('cart page stops reloading if gift removal does not persist', async ({ page }) => {
  const state = await mount(page, { items: [gift()], cartPage: true, ignoreRemovals: true });
  await expect.poll(() => state.changes).toBe(2);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  expect(state.navigations).toBe(2);
});

test('cart page stops reloading if gift addition does not persist', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)], cartPage: true, ignoreGiftAdds: true });
  await expect.poll(() => state.adds).toBe(2);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  expect(state.navigations).toBe(2);
});

test('cart page stops reloading when cart states alternate', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift(2)], cartPage: true, ignoreQuantityChanges: true, changingQuantities: 'alternate' });
  await expect.poll(() => state.changes).toBe(3);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  expect(state.navigations).toBe(3);
});

test('cart page caps reloads even if every observed state differs', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift(2)], cartPage: true, ignoreQuantityChanges: true, changingQuantities: 'unique' });
  await expect.poll(() => state.changes).toBe(4);
  await expect.poll(() => page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
  expect(state.navigations).toBe(4);
});

test('cart page does not loop if session storage is unavailable', async ({ page }) => {
  const state = await mount(page, {
    items: [line(PRODUCT), gift(1, 'gift', { 'Free Gift': 'Old' })],
    cartPage: true,
    ignorePropertyChanges: true,
    blockStorage: true,
  });
  await expect.poll(() => state.changes).toBe(1);
  await page.waitForTimeout(300);
  expect(state.navigations).toBe(1);
  expect(state.changes).toBe(1);
  expect(await page.evaluate(() => window.freeGiftCartRefreshes)).toBe(1);
});

test('cart page permits a later property update after the previous one converges', async ({ page }) => {
  const state = await mount(page, {
    items: [line(PRODUCT), gift(1, 'gift', { 'Free Gift': 'Old' })],
    cartPage: true,
  });
  await expect.poll(() => state.navigations).toBe(2);
  await expect.poll(() => state.reads).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('freeGiftCartReloadStates'))).toBe(null);
  state.items.find((item) => item.key === 'gift').properties['Free Gift'] = 'Old';
  await page.evaluate(() => document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true })));
  await expect.poll(() => state.navigations).toBe(3);
  expect(state.changes).toBe(2);
});

test('cart page logs a mutation error before reloading partial changes', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const first = line(111, 1, { _free_gift: 'true' }, 'old-1');
  const second = line(222, 1, { _free_gift: 'true' }, 'old-2');
  const state = await mount(page, { items: [line(PRODUCT), first, second], cartPage: true, failChangeAt: 2 });
  await expect.poll(() => errors.some((message) => message.includes('Unable to update free gift'))).toBe(true);
  await expect.poll(() => state.navigations).toBeGreaterThanOrEqual(2);
});

test('allows checkout after a successful verification', async ({ page }) => {
  await mount(page, { items: [line(PRODUCT), gift()] });
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
});

test('a suppressed resubmission does not bypass the next checkout check', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()] });
  await page.evaluate(() => {
    window.resubmissionAttempts = 0;
    HTMLFormElement.prototype.requestSubmit = function () { window.resubmissionAttempts++; };
  });
  const button = page.getByRole('button', { name: 'Checkout' });
  await button.click();
  await expect.poll(() => page.evaluate(() => window.resubmissionAttempts)).toBe(1);
  const readsAfterFirstClick = state.reads;
  await button.click();
  await expect.poll(() => page.evaluate(() => window.resubmissionAttempts)).toBe(2);
  expect(state.reads).toBeGreaterThan(readsAfterFirstClick);
});

test('allows checkout when cart reads return an error', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  state.failReads = true;
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
});

test('allows checkout when adding the gift fails', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  state.failAdds = true;
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
});

test('allows checkout if the timeout controller is unavailable', async ({ page }) => {
  await mount(page, { items: [line(PRODUCT)] });
  await page.evaluate(() => { window.AbortController = undefined; });
  await page.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible();
});

test('allows checkout if the cart request hangs', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  let release;
  state.pauseReads = new Promise((resolve) => { release = resolve; });
  try {
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible({ timeout: 3000 });
  } finally {
    state.pauseReads = null;
    release();
  }
});

test('allows checkout if adding the gift hangs', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  let release;
  state.pauseAdds = new Promise((resolve) => { release = resolve; });
  try {
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect(page.getByRole('heading', { name: 'Checkout reached' })).toBeVisible({ timeout: 3500 });
  } finally {
    state.pauseAdds = null;
    release();
  }
});

test('allows checkout when an earlier reconciliation blocks the queue', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT), gift()] });
  let release;
  state.pauseReads = new Promise((resolve) => { release = resolve; });
  try {
    await page.evaluate(() => {
      window.checkoutResubmitted = false;
      document.addEventListener('submit', (event) => {
        if (!event.defaultPrevented) {
          event.preventDefault();
          window.checkoutResubmitted = true;
        }
      });
      window.previousReconciliation = window.FreeGiftManager.reconcile();
    });
    await expect.poll(() => state.reads).toBe(1);
    await page.getByRole('button', { name: 'Checkout' }).click();
    await expect.poll(() => page.evaluate(() => window.checkoutResubmitted), { timeout: 3500 }).toBe(true);
    state.pauseReads = null;
    release();
    await page.evaluate(async () => {
      await window.previousReconciliation;
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(state.reads).toBe(1);
    expect(state.adds).toBe(0);
    expect(state.changes).toBe(0);
  } finally {
    state.pauseReads = null;
    release();
  }
});
