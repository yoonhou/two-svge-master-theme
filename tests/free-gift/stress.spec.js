const { test, expect } = require('@playwright/test');
const { mount, line, GIFT, PRODUCT } = require('./cart-harness');

test('50 rapid successful product adds settle on one marked gift', async ({ page }) => {
  const state = await mount(page);
  const statuses = await page.evaluate(async (productId) => {
    const adds = Array.from({ length: 50 }, async () => {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, quantity: 1 }),
      });
      if (response.ok) document.documentElement.dispatchEvent(new CustomEvent('product:added', { bubbles: true }));
      return response.status;
    });
    const results = await Promise.all(adds);
    await window.FreeGiftManager.reconcile();
    return results;
  }, PRODUCT);
  expect(statuses).toEqual(Array(50).fill(200));
  expect(state.addRequests.filter((item) => item.id === PRODUCT)).toHaveLength(50);
  expect(state.items.filter((item) => item.variant_id === PRODUCT).reduce((sum, item) => sum + item.quantity, 0)).toBe(50);
  expect(state.addRequests.filter((item) => item.id === GIFT)).toHaveLength(1);
  expect(state.items.filter((item) => item.properties._free_gift === 'true')).toHaveLength(1);
  expect(state.items.find((item) => item.properties._free_gift === 'true').quantity).toBe(1);
});

test('serializes 100 rapid cart update signals without adding duplicate gifts', async ({ page }) => {
  const state = await mount(page, { items: [line(PRODUCT)] });
  const promisesAttached = await page.evaluate(async () => {
    const tasks = [];
    for (let i = 0; i < 100; i++) {
      const event = new CustomEvent('acc:cart:updated', { bubbles: true, detail: {} });
      document.documentElement.dispatchEvent(event);
      tasks.push(event.detail.reconciliation);
    }
    await Promise.all(tasks);
    return tasks.every((task) => task instanceof Promise);
  });
  expect(promisesAttached).toBe(true);
  expect(state.reads).toBe(100);
  expect(state.adds).toBe(1);
  expect(state.items.filter((item) => item.properties._free_gift === 'true')).toHaveLength(1);
});
