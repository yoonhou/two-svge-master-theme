/**
 * Shared free gift cart rule for the cart page and ACC cart drawer.
 * Cart events are only signals to reconcile; /cart.js remains the source of truth.
 */
(function () {
  if (window.FreeGiftManager) return;

  const settings = window.freeGiftSettings || {};
  const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const giftProperty = '_free_gift';
  const checkoutGiftProperty = 'Free Gift';
  const checkoutGiftValue = settings.checkoutPropertyValue || 'Black Friday';
  const qualifiedMessageSelector = '.FreeGiftQualifiedMessage';
  const pendingMessageStorageKey = 'freeGiftQualifiedMessagePending';
  const cartReloadStorageKey = 'freeGiftCartReloadStates';
  const maxCartReloads = 3;
  const checkoutCheckTimeout = 2000;
  let reconciliation = Promise.resolve();
  let checkoutInFlight = false;
  let allowNextCheckout = false;
  let revealMessageWhenRendered = false;

  // Start the three-second display period only once the notice is actually visible.
  function watchQualifiedMessage(node) {
    if (!(node instanceof Element) || !node.matches(qualifiedMessageSelector) || node.dataset.dismissTimerStarted) return;
    node.dataset.dismissTimerStarted = 'true';

    const dismiss = () => window.setTimeout(() => node.remove(), 3000);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          dismiss();
        }
      }, { threshold: 0.01 });
      observer.observe(node);
    } else {
      dismiss();
    }
  }

  function watchQualifiedMessages(root = document) {
    if (root instanceof Element) watchQualifiedMessage(root);
    root.querySelectorAll(qualifiedMessageSelector).forEach(watchQualifiedMessage);
  }

  function revealQualifiedMessages(root = document) {
    const messages = [];
    if (root instanceof Element && root.matches(qualifiedMessageSelector)) messages.push(root);
    messages.push(...root.querySelectorAll(qualifiedMessageSelector));
    messages.forEach((node) => {
      node.hidden = false;
      watchQualifiedMessage(node);
    });
    if (messages.length) revealMessageWhenRendered = false;
    return messages.length > 0;
  }

  function consumePendingMessageRequest() {
    try {
      const pending = window.sessionStorage.getItem(pendingMessageStorageKey) === 'true';
      if (pending) {
        window.sessionStorage.removeItem(pendingMessageStorageKey);
        revealQualifiedMessages();
      }
    } catch (error) {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  watchQualifiedMessages();
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof Element) {
        watchQualifiedMessages(node);
        if (revealMessageWhenRendered) revealQualifiedMessages(node);
      }
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });
  consumePendingMessageRequest();

  function emitThemeCartRefresh() {
    document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { source: 'free-gift' },
    }));
  }

  function allowCartReload(giftLines, hasQualifyingPurchase) {
    const gifts = giftLines.map((gift) => JSON.stringify([
      gift.variant_id,
      gift.quantity,
      gift.properties[checkoutGiftProperty] === undefined ? null : gift.properties[checkoutGiftProperty],
    ])).sort();
    const fingerprint = JSON.stringify([settings.enabled, settings.variantId, checkoutGiftValue, hasQualifyingPurchase, gifts]);

    try {
      const stored = JSON.parse(window.sessionStorage.getItem(cartReloadStorageKey) || '[]');
      const previous = Array.isArray(stored) ? stored : [];
      if (previous.includes(fingerprint) || previous.length >= maxCartReloads) return false;
      window.sessionStorage.setItem(cartReloadStorageKey, JSON.stringify([...previous, fingerprint]));
      return true;
    } catch (error) {
      // Refresh without navigation if storage is unavailable or invalid.
      return false;
    }
  }

  function clearCartReloadHistory() {
    try {
      window.sessionStorage.removeItem(cartReloadStorageKey);
    } catch (error) {
      // Storage may be unavailable in restricted browser contexts.
    }
  }

  async function getCart(signal) {
    const response = await fetch(root + 'cart.js', { headers: { Accept: 'application/json' }, signal });
    if (!response.ok) throw new Error('Unable to read cart');
    return response.json();
  }

  async function addGift(signal) {
    const response = await fetch(root + 'cart/add.js', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        items: [{
          id: Number(settings.variantId),
          quantity: 1,
          // Keep the private marker for theme logic and expose the promotion in checkout.
          properties: {
            [giftProperty]: 'true',
            [checkoutGiftProperty]: checkoutGiftValue,
          },
        }],
      }),
    });
    if (!response.ok) throw new Error('Unable to add free gift');
  }

  async function setGiftQuantity(key, quantity, properties, signal) {
    const payload = { id: key, quantity };
    if (properties) payload.properties = properties;

    const response = await fetch(root + 'cart/change.js', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('Unable to update free gift');
  }

  async function reconcile(signal) {
    if (signal && signal.aborted) return;

    const cart = await getCart(signal);
    // The private marker identifies a gift even if its configured product changes later.
    const giftLines = cart.items.filter((item) => item.properties && item.properties[giftProperty] === 'true');
    const matchingGiftLines = giftLines.filter((item) => Number(item.variant_id) === Number(settings.variantId));
    const hasQualifyingPurchase = cart.items.some((item) => !giftLines.includes(item));
    let changed = false;
    let giftWasAdded = false;
    let mutationError = null;

    try {
      if (!settings.enabled || !settings.variantId || !hasQualifyingPurchase) {
        // Remove marked gifts when the cart no longer qualifies or the feature is disabled.
        for (const gift of giftLines) {
          await setGiftQuantity(gift.key, 0, undefined, signal);
          changed = true;
        }
      } else {
        // Remove a prior selected gift product before maintaining the configured one.
        for (const gift of giftLines.filter((item) => !matchingGiftLines.includes(item))) {
          await setGiftQuantity(gift.key, 0, undefined, signal);
          changed = true;
        }

        if (matchingGiftLines.length === 0) {
          await addGift(signal);
          changed = true;
          giftWasAdded = true;
        } else {
          // Retain one configured gift and enforce quantity one.
          for (const gift of matchingGiftLines.slice(1)) {
            await setGiftQuantity(gift.key, 0, undefined, signal);
            changed = true;
          }
          const gift = matchingGiftLines[0];
          const properties = Object.assign({}, gift.properties, {
            [giftProperty]: 'true',
            [checkoutGiftProperty]: checkoutGiftValue,
          });
          const needsCheckoutProperty = gift.properties[checkoutGiftProperty] !== checkoutGiftValue;
          if (gift.quantity !== 1 || needsCheckoutProperty) {
            // Backfill the visible checkout property on gifts already in the cart.
            await setGiftQuantity(gift.key, 1, properties, signal);
            changed = true;
          }
        }
      }
    } catch (error) {
      // Refresh any partial cart changes before reporting a later mutation failure.
      mutationError = error;
    }

    if (signal && signal.aborted) return;

    if (!changed && document.body.classList.contains('template-cart')) clearCartReloadHistory();

    if (changed) {
      // The cart page uses full-page navigation for item updates; reload after
      // reconciling so its server-rendered lines cannot keep showing a stale gift.
      if (document.body.classList.contains('template-cart') && allowCartReload(giftLines, hasQualifyingPurchase)) {
        if (giftWasAdded) {
          try {
            window.sessionStorage.setItem(pendingMessageStorageKey, 'true');
          } catch (error) {
            // The notice can still show after a drawer refresh if storage is unavailable.
          }
        }
        if (mutationError) console.error('[free gift]', mutationError);
        window.location.reload();
        return;
      }

      // Keep checkout's original form intact if a cart-page reload was suppressed.
      if (document.body.classList.contains('template-cart') && signal) {
        if (mutationError) throw mutationError;
        return;
      }

      // Ask the theme cart page to redraw before refreshing the drawer section.
      revealMessageWhenRendered = giftWasAdded;
      emitThemeCartRefresh();

      // The ACC drawer has its own renderer, so refresh it separately.
      if (window.AccCartDrawer && typeof window.AccCartDrawer.refresh === 'function') {
        try {
          await window.AccCartDrawer.refresh();
        } catch (error) {
          console.error('[free gift] Unable to refresh ACC cart drawer', error);
        }
      }
      if (giftWasAdded) {
        revealQualifiedMessages();
        revealMessageWhenRendered = false;
      }
    }

    if (mutationError) throw mutationError;
  }

  function scheduleReconcile({ signal } = {}) {
    reconciliation = reconciliation
      .then(() => reconcile(signal))
      .catch((error) => console.error('[free gift]', error));
    return reconciliation;
  }

  // Theme product forms, theme cart refreshes, and the ACC drawer each have
  // separate update paths, so listen to all three signals and serialize checks.
  document.addEventListener('product:added', () => scheduleReconcile());
  document.addEventListener('cart:refresh', (event) => {
    if (event.detail && event.detail.source === 'free-gift') return;
    scheduleReconcile();
  });
  document.addEventListener('acc:cart:updated', (event) => {
    // Let custom cart flows (such as the bundle modal) wait for reconciliation
    // before rendering their cart UI. Existing dispatchers can ignore this.
    const task = scheduleReconcile();
    if (event.detail && typeof event.detail === 'object') {
      event.detail.reconciliation = task;
    }
  });
  window.addEventListener('pageshow', () => scheduleReconcile());

  function submitCheckout(form, checkoutButton) {
    allowNextCheckout = true;
    try {
      if (typeof form.requestSubmit === 'function') form.requestSubmit(checkoutButton);
      else form.submit();
    } finally {
      allowNextCheckout = false;
    }
  }

  // Reconcile and verify the live cart before allowing checkout. This covers a
  // fast checkout click while the cart page is still removing an ineligible gift.
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.querySelector('[name="checkout"]')) return;
    if (event.submitter && event.submitter.name !== 'checkout') return;
    if (allowNextCheckout) {
      allowNextCheckout = false;
      return;
    }

    event.preventDefault();
    if (checkoutInFlight) return;
    checkoutInFlight = true;

    let timeoutId;
    try {
      const controller = new AbortController();
      const deadline = new Promise((resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new Error('Checkout cart check timed out'));
        }, checkoutCheckTimeout);
      });
      const cart = await Promise.race([
        (async () => {
          await scheduleReconcile({ signal: controller.signal });
          if (controller.signal.aborted) throw new Error('Checkout cart check timed out');
          return getCart(controller.signal);
        })(),
        deadline,
      ]);
      window.clearTimeout(timeoutId);
      const currentGiftLines = cart.items.filter((item) => item.properties && item.properties[giftProperty] === 'true');
      const hasQualifyingPurchase = cart.items.some((item) => !currentGiftLines.includes(item));

      // Keep checkout on the cart page if it still contains only the ineligible gift.
      if (!cart.items.length || (currentGiftLines.length && !hasQualifyingPurchase)) {
        emitThemeCartRefresh();
        if (window.AccCartDrawer && typeof window.AccCartDrawer.refresh === 'function') {
          await window.AccCartDrawer.refresh().catch((error) => console.error('[free gift] Unable to refresh ACC cart drawer', error));
        }
        return;
      }

      const checkoutButton = event.submitter || form.querySelector('[name="checkout"]');
      submitCheckout(form, checkoutButton);
    } catch (error) {
      // Do not block checkout if cart state cannot be verified.
      console.error('[free gift] Unable to verify cart before checkout', error);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const checkoutButton = event.submitter || form.querySelector('[name="checkout"]');
      submitCheckout(form, checkoutButton);
    } finally {
      window.clearTimeout(timeoutId);
      checkoutInFlight = false;
    }
  }, true);

  window.FreeGiftManager = {
    reconcile: scheduleReconcile,
    showQualifiedMessage: revealQualifiedMessages,
  };
})();
