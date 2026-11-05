const fs = require('node:fs');
const path = require('node:path');

const giftScript = fs.readFileSync(path.resolve(__dirname, '../../assets/free-gift.js'), 'utf8');
const GIFT = 67601514037497;
const PRODUCT = 67601518264569;

function line(variantId, quantity = 1, properties = {}, key = String(variantId)) {
  return { key, variant_id: variantId, quantity, properties };
}

function gift(quantity = 1, key = 'gift', properties = {}) {
  return line(GIFT, quantity, { _free_gift: 'true', 'Free Gift': 'Black Friday', ...properties }, key);
}

async function mount(page, { items = [], settings = {}, cartPage = false, ignorePropertyChanges = false, changeKeyOnNoop = false, ignoreQuantityChanges = false, ignoreRemovals = false, ignoreGiftAdds = false, changingQuantities = '', failChangeAt = 0, blockStorage = false } = {}) {
  const config = { enabled: true, variantId: GIFT, checkoutPropertyValue: 'Black Friday', ...settings };
  const state = {
    items: structuredClone(items),
    reads: 0,
    adds: 0,
    changes: 0,
    failReads: false,
    failAdds: false,
    unavailableVariantIds: new Set(),
    addRequests: [],
    pauseReads: null,
    pauseAdds: null,
    navigations: 0,
  };

  if (blockStorage) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('Storage unavailable'); } });
    });
  }

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.pathname === '/cart.js') {
      state.reads++;
      if (state.pauseReads) await state.pauseReads;
      if (state.failReads) return json({ error: 'Unavailable' }, 429);
      const items = structuredClone(state.items);
      const markedGift = items.find((item) => item.properties?._free_gift === 'true');
      if (markedGift && changingQuantities === 'alternate') markedGift.quantity = state.reads % 2 ? 2 : 3;
      if (markedGift && changingQuantities === 'unique') markedGift.quantity = state.reads + 1;
      return json({ items });
    }
    if (url.pathname === '/cart/add.js') {
      state.adds++;
      if (state.pauseAdds) await state.pauseAdds;
      if (state.failAdds) return json({ error: 'Unavailable' }, 429);
      const body = route.request().postDataJSON();
      const added = body.items || [body];
      state.addRequests.push(...added.map((item) => ({ id: Number(item.id), quantity: Number(item.quantity) })));
      if (added.some((item) => state.unavailableVariantIds.has(Number(item.id)))) {
        return json({ status: 422, description: 'The product is sold out.' }, 422);
      }
      for (const item of added) {
        const properties = item.properties || {};
        if (ignoreGiftAdds && properties._free_gift === 'true') continue;
        const existing = state.items.find((entry) => entry.variant_id === Number(item.id) && JSON.stringify(entry.properties) === JSON.stringify(properties));
        if (existing) existing.quantity += Number(item.quantity);
        else state.items.push(line(Number(item.id), Number(item.quantity), properties, `added-${state.adds}`));
      }
      return json({ items: added });
    }
    if (url.pathname === '/cart/change.js') {
      state.changes++;
      if (state.changes === failChangeAt) return json({ error: 'Unable to update line' }, 404);
      const { id, quantity, properties } = route.request().postDataJSON();
      const item = state.items.find((entry) => entry.key === id);
      if (!item) return json({ error: 'Line not found' }, 404);
      if (quantity === 0) {
        if (!ignoreRemovals) state.items = state.items.filter((entry) => entry.key !== id);
      }
      else {
        if (!ignoreQuantityChanges) item.quantity = quantity;
        if (properties && !ignorePropertyChanges) item.properties = properties;
        if (properties && ignorePropertyChanges && changeKeyOnNoop) item.key += '-changed';
      }
      return json({ items: state.items });
    }
    if (url.pathname === '/checkout') return route.fulfill({ contentType: 'text/html', body: '<h1>Checkout reached</h1>' });
    if (url.pathname === '/') {
      state.navigations++;
      const scripts = cartPage ? `<script>window.freeGiftSettings = ${JSON.stringify(config)}; window.AccCartDrawer = { refresh: async () => {} }; window.freeGiftCartRefreshes = 0; document.addEventListener('cart:refresh', (event) => { if (event.detail && event.detail.source === 'free-gift') window.freeGiftCartRefreshes++; });</script><script>${giftScript}</script>` : '';
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body${cartPage ? ' class="template-cart"' : ''}><div class="FreeGiftQualifiedMessage" hidden>Gift added</div><form action="/checkout"><button name="checkout" type="submit">Checkout</button></form>${scripts}</body></html>` });
    }
    return route.abort();
  });

  await page.goto('https://gift-test.invalid/');
  if (!cartPage) {
    await page.evaluate((giftConfig) => {
      window.freeGiftSettings = giftConfig;
      window.AccCartDrawer = { refresh: async () => {} };
    }, config);
    await page.addScriptTag({ content: giftScript });
  }
  return state;
}

async function reconcile(page) {
  await page.evaluate(() => window.FreeGiftManager.reconcile());
}

module.exports = { mount, reconcile, line, gift, GIFT, PRODUCT };
