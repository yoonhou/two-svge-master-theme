/**
 * ACC_TS_Cart_10 - Custom cart drawer.
 * Markup lives in sections/acc-cart-drawer.liquid. After every cart change the
 * section is re-rendered by Shopify (Section Rendering API) and swapped in here.
 */
(function () {
  if (window.AccCartDrawer) return;

  const tn = 'ACC_TS_Cart_10';
  const sectionId = 'acc-cart-drawer';
  const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  const cartPath = root + 'cart';

  const drawer = () => document.querySelector(`.${tn}-cart-drawer`);
  const overlay = () => document.getElementById(`${tn}-cart-drawer-overlay`);

  function open() {
    if (!drawer() || !overlay()) return;
    drawer().classList.add(`${tn}-cart-drawer-open`);
    overlay().classList.remove(`${tn}-cart-drawer-overlay-hide`);
    document.body.classList.add(`${tn}-no-scroll`);
  }

  function close() {
    if (!drawer() || !overlay()) return;
    drawer().classList.remove(`${tn}-cart-drawer-open`);
    overlay().classList.add(`${tn}-cart-drawer-overlay-hide`);
    document.body.classList.remove(`${tn}-no-scroll`);
  }

  // Swap in freshly rendered section HTML, keeping the open state and scroll position.
  function renderSection(html) {
    const current = drawer();
    if (!html || !current) return;

    const next = new DOMParser().parseFromString(html, 'text/html').querySelector(`.${tn}-cart-drawer`);
    if (!next) return;

    const body = current.querySelector(`.${tn}-cart-drawer-body`);
    const scrollTop = body ? body.scrollTop : 0;

    current.innerHTML = next.innerHTML;
    current.dataset.itemCount = next.dataset.itemCount;

    const newBody = current.querySelector(`.${tn}-cart-drawer-body`);
    if (newBody) newBody.scrollTop = scrollTop;

    updateHeader(parseInt(next.dataset.itemCount, 10) || 0);
  }

  function updateHeader(count) {
    document.querySelectorAll('.Header__CartCount').forEach((el) => {
      el.textContent = count;
    });
    document.querySelectorAll('.Header__CartDot').forEach((el) => {
      el.classList.toggle('is-visible', count > 0);
    });
  }

  async function refresh() {
    const res = await fetch(`${root}?sections=${sectionId}`);
    const data = await res.json();
    renderSection(data[sectionId]);
  }

  // Notify shared cart features (such as the free gift manager) after this
  // drawer successfully changes cart contents. The event carries no cart data;
  // listeners should read /cart.js as the source of truth.
  function notifyCartUpdated(action) {
    document.documentElement.dispatchEvent(new CustomEvent('acc:cart:updated', {
      bubbles: true,
      detail: { source: 'acc-cart-drawer', action },
    }));
  }

  // Cart updates run one after another so fast clicks do not overwrite each other.
  let queue = Promise.resolve();

  function updateLineItem(line, quantity) {
    queue = queue
      .then(() =>
        fetch(root + 'cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            line,
            quantity: Math.max(0, quantity),
            sections: sectionId,
            sections_url: window.location.pathname,
          }),
        })
      )
      .then((res) => res.json())
      .then((cart) => {
        if (cart.sections) renderSection(cart.sections[sectionId]);
        else return refresh();
      })
      .then(() => notifyCartUpdated('change'))
      .catch((err) => console.error('[ACC cart drawer]', err));
    return queue;
  }

  function isCartLink(link) {
    try {
      const url = new URL(link.href, window.location.origin);
      return url.origin === window.location.origin && (url.pathname === cartPath || url.pathname === '/cart');
    } catch (e) {
      return false;
    }
  }

  // Header cart links open the drawer instead of going to the cart page.
  document.addEventListener(
    'click',
    (e) => {
      const link = e.target.closest('a[href]');
      if (!link || !drawer() || !isCartLink(link) || drawer().contains(link)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    },
    true
  );

  // Drawer controls (delegated, so they keep working after a re-render).
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.closest(`.${tn}-close-btn`) || target.id === `${tn}-cart-drawer-overlay`) {
      close();
      return;
    }

    const increase = target.closest(`.${tn}-quantity-increase`);
    const decrease = target.closest(`.${tn}-quantity-decrease`);
    const remove = target.closest(`.${tn}-remove-item`);

    if (increase || decrease) {
      const btn = increase || decrease;
      const line = parseInt(btn.dataset.line, 10);
      const qtyEl = drawer().querySelector(`.${tn}-quantity-value[data-line="${line}"]`);
      const qty = parseInt(qtyEl.textContent, 10) || 1;
      updateLineItem(line, increase ? qty + 1 : qty - 1);
    } else if (remove) {
      updateLineItem(parseInt(remove.dataset.line, 10), 0);
    }
  });

  // Editable quantity: digits only, Enter to confirm.
  document.addEventListener('keydown', (e) => {
    const el = e.target.closest && e.target.closest(`.${tn}-quantity-value`);
    if (!el) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
      return;
    }
    if (!/^([0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab)$/.test(e.key)) e.preventDefault();
  });

  document.addEventListener('focusout', (e) => {
    const el = e.target.closest && e.target.closest(`.${tn}-quantity-value`);
    if (!el || !el.isConnected) return;
    const qty = parseInt(el.textContent, 10) || 0;
    if (qty === parseInt(el.dataset.original, 10)) return;
    updateLineItem(parseInt(el.dataset.line, 10), qty);
  });

  // Keep wheel scrolling inside the drawer list.
  document.addEventListener(
    'wheel',
    (e) => {
      const el = e.target.closest && e.target.closest(`.${tn}-cart-items`);
      if (!el || el.scrollHeight <= el.clientHeight) return;
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        e.preventDefault();
        e.stopPropagation();
      }
      el.scrollTop += e.deltaY;
    },
    { passive: false }
  );

  // Product forms: add with Ajax and open the drawer instead of redirecting to /cart.
  document.addEventListener(
    'submit',
    async (e) => {
      const form = e.target;
      if (!drawer() || !form.action || !form.action.includes('/cart/add')) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.setAttribute('disabled', 'disabled');

      try {
        const formData = new FormData(form);
        formData.append('sections', sectionId);
        formData.append('sections_url', window.location.pathname);

        const res = await fetch(root + 'cart/add.js', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          // Same inline error the theme shows on the product form
          const error = document.createElement('span');
          error.className = 'ProductForm__Error Alert Alert--error';
          error.textContent = data.description || data.message || 'Unable to add to cart';
          (submitBtn || form).insertAdjacentElement('afterend', error);
          setTimeout(() => error.remove(), 2500);
          return;
        }

        if (data.sections) renderSection(data.sections[sectionId]);
        else await refresh();
        open();
        notifyCartUpdated('add');
      } catch (err) {
        console.error('[ACC cart drawer]', err);
        form.submit();
      } finally {
        if (submitBtn) submitBtn.removeAttribute('disabled');
      }
    },
    true
  );

  window.AccCartDrawer = { open, close, refresh };
})();
