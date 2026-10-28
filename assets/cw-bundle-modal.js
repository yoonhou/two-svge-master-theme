(() => {
  const MAX_SELECTION = 3;
  const DISCOUNT_RATE = 0.8;
  const DESKTOP_ITEMS_PER_ROW = 5;
  const MOBILE_ITEMS_PER_ROW = 2;
  const ROWS_PER_PAGE = 2;
  const MOBILE_BREAKPOINT = '(max-width: 767px)';
  const ROOT_SELECTOR = '#cw-bundle-modal';
  const nativePush = Array.prototype.push;

  const root = document.querySelector(ROOT_SELECTOR);

  if (!root) {
    return;
  }

  const popup = root.querySelector('[data-bundle-popup]');
  const selectedList = root.querySelector('#selectedProductsList');
  const addToCartButton = root.querySelector('[data-bundle-add-to-cart]');
  const selectedTotal = root.querySelector('[data-bundle-selected-total]');
  const saveButton = root.querySelector('[data-bundle-save]');
  const choosePairs = root.querySelector('[data-bundle-open]');
  const mobileQuery = window.matchMedia(MOBILE_BREAKPOINT);
  const carousels = new Map();
  const state = {
    currentTab: '',
    isAdding: false,
    previouslyFocused: null,
    selection: []
  };

  const toCents = value => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  };

  const defaultTo = (value, defaultValue) => (
    typeof value === 'undefined' || value === null ? defaultValue : value
  );

  const formatWithDelimiters = (number, precision = 2, thousands = ',', decimal = '.') => {
    if (!Number.isFinite(number)) {
      return '0';
    }

    const fixed = (number / 100).toFixed(precision);
    const parts = fixed.split('.');
    const dollars = parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, `$1${thousands}`);
    const cents = parts[1] && parts[1] !== '00' ? `${decimal}${parts[1]}` : '';

    return `${dollars}${cents}`;
  };

  const formatMoney = (cents, format = window.cw_market_money_format || '${{amount}}') => {
    const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
    const match = format.match(placeholderRegex);

    if (!match) {
      return String(cents);
    }

    let value = '';

    switch (match[1]) {
      case 'amount':
        value = formatWithDelimiters(toCents(cents), 2);
        break;
      case 'amount_no_decimals':
        value = formatWithDelimiters(toCents(cents), 0);
        break;
      case 'amount_with_comma_separator':
        value = formatWithDelimiters(toCents(cents), 2, '.', ',');
        break;
      case 'amount_no_decimals_with_comma_separator':
        value = formatWithDelimiters(toCents(cents), 0, '.', ',');
        break;
      default:
        value = formatWithDelimiters(toCents(cents), 2);
    }

    return format.replace(placeholderRegex, value);
  };

  const formatSaleMoney = cents => formatMoney(cents).replace(/([.,]00)(?!\d)/, '');

  window.cwFormatMoney = formatMoney;

  const getBundleMinPrice = () => toCents(window.cw_min_collection_product_price) * MAX_SELECTION;
  const getDiscountedCents = cents => Math.round(toCents(cents) * DISCOUNT_RATE);
  const getSelectionCents = () => state.selection.reduce((sum, product) => sum + toCents(product.fullPriceCents), 0);

  const getPdpPriceNodes = () => ({
    priceFrom: document.querySelector('.ProductMeta__Price .price-from'),
    regular: document.querySelector('.ProductMeta__Price .regular--price'),
    discount: document.querySelector('.ProductMeta__Price .discount--price')
  });

  const updatePdpPrice = () => {
    const { priceFrom, regular, discount } = getPdpPriceNodes();
    const hasFullSelection = state.selection.length === MAX_SELECTION;
    const regularCents = hasFullSelection ? getSelectionCents() : getBundleMinPrice();
    const discountCents = getDiscountedCents(regularCents);

    if (priceFrom) {
      priceFrom.style.display = hasFullSelection ? 'none' : 'inline';
    }

    if (regular) {
      regular.innerText = formatMoney(regularCents);
    }

    if (discount) {
      discount.innerText = formatMoney(discountCents);
    }
  };

  const replaceImageSize = (src, size) => src.replace(/x150(?=[._?])|x150/g, size);

  const updatePdpImages = () => {
    if (state.selection.length !== MAX_SELECTION) {
      return;
    }

    const slideshowImages = document.querySelectorAll('.Product__Slideshow img');
    const navImages = document.querySelectorAll('.Product__SlideshowNav img');

    state.selection.forEach((product, index) => {
      if (slideshowImages[index + 1]) {
        slideshowImages[index + 1].src = replaceImageSize(product.img, 'x1400');
      }

      if (navImages[index + 1]) {
        navImages[index + 1].src = replaceImageSize(product.img, 'x160');
      }
    });
  };

  const getSelectedVariantElement = card => {
    const select = card.querySelector('[data-bundle-variant-select]');

    if (select) {
      return select.selectedOptions[0];
    }

    return card.querySelector('input[name="variant"]');
  };

  const getVariantData = card => {
    const variantElement = getSelectedVariantElement(card);
    const variantId = variantElement ? variantElement.value : card.dataset.variant;
    const variantTitle = variantElement ? defaultTo(variantElement.dataset.title, variantElement.textContent).trim() : '';
    const fullPriceCents = toCents(variantElement ? variantElement.dataset.price : 0);
    const productTitle = defaultTo(card.dataset.productTitle, '').trim();
    const hasVariantSelect = Boolean(card.querySelector('[data-bundle-variant-select]'));
    const title = hasVariantSelect ? `${productTitle.split(' - ')[0]} - ${variantTitle}` : productTitle;

    return {
      fullPriceCents,
      priceCents: getDiscountedCents(fullPriceCents),
      title,
      variantId
    };
  };

  const getProductData = card => {
    const variantData = getVariantData(card);

    return {
      id: card.dataset.productId,
      img: card.dataset.productImage || '',
      rating: Number.parseFloat(card.dataset.productRating || '0') || 0,
      reviews: Number.parseInt(card.dataset.productReviews || '0', 10) || 0,
      ...variantData
    };
  };

  const updateCardPrice = card => {
    const { fullPriceCents, priceCents } = getVariantData(card);
    const regular = card.querySelector('.price-product s');
    const discount = card.querySelector('.price-product span');

    if (regular) {
      regular.innerText = formatSaleMoney(fullPriceCents);
    }

    if (discount) {
      discount.innerText = formatSaleMoney(priceCents);
    }
  };

  const getSelectionCount = productId => state.selection.filter(product => product.id === productId).length;
  const isProductSelected = productId => getSelectionCount(productId) > 0;

  const getStarsCount = (rating, type) => {
    const full = Math.max(0, Math.min(5, Math.round((Number.parseFloat(rating) || 0) - 0.25)));
    const half = (Number.parseFloat(rating) || 0) % 1 !== 0 && full < 5 ? 1 : 0;
    const none = Math.max(0, 5 - full - half);

    if (type === 'full') {
      return full;
    }

    if (type === 'half') {
      return half;
    }

    return none;
  };

  const appendStars = (target, rating) => {
    const starTypes = [
      { count: getStarsCount(rating, 'full'), className: 'jdgm-star jdgm--on' },
      { count: getStarsCount(rating, 'half'), className: 'jdgm-star jdgm--half' },
      { count: getStarsCount(rating, 'none'), className: 'jdgm-star' }
    ];

    starTypes.forEach(({ count, className }) => {
      for (let index = 0; index < count; index += 1) {
        const star = document.createElement('span');
        star.className = className;
        target.appendChild(star);
      }
    });
  };

  const renderSelectedList = () => {
    if (!selectedList) {
      return;
    }

    selectedList.innerHTML = '';
    selectedList.hidden = state.selection.length !== MAX_SELECTION;

    if (selectedList.hidden) {
      return;
    }

    state.selection.forEach(product => {
      const item = document.createElement('div');
      item.className = 'ProductMeta__Selected-item';

      const detail = document.createElement('div');
      detail.className = 'product-detail';

      const media = document.createElement('div');
      media.className = 'product-media';

      const image = document.createElement('img');
      image.src = product.img;
      image.alt = product.title;
      media.appendChild(image);

      const titleWrap = document.createElement('div');
      titleWrap.className = 'product-title';

      const title = document.createElement('h2');
      title.textContent = product.title;

      const review = document.createElement('div');
      review.className = 'product-review';

      const stars = document.createElement('div');
      stars.className = 'star-rating';
      stars.dataset.rating = String(getStarsCount(product.rating, 'half'));
      appendStars(stars, product.rating);

      const reviews = document.createElement('span');
      reviews.textContent = ` ${product.reviews} reviews`;

      const price = document.createElement('p');
      const fullPrice = document.createElement('s');
      fullPrice.textContent = formatSaleMoney(product.fullPriceCents);
      price.appendChild(fullPrice);
      price.append(` ${formatSaleMoney(product.priceCents)}`);

      review.append(stars, reviews);
      titleWrap.append(title, review, price);
      detail.append(media, titleWrap);

      const remove = document.createElement('span');
      remove.className = 'removeProduct';
      remove.dataset.bundleOpen = '';
      remove.textContent = 'REMOVE';
      remove.insertAdjacentHTML('beforeend', `
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M23.5685 25.1594L18 19.5909L12.4315 25.1594L10.8405 23.5684L16.409 17.9999L10.8405 12.4314L12.4315 10.8404L18 16.4089L23.5685 10.8404L25.1595 12.4314L19.591 17.9999L25.1595 23.5684L23.5685 25.1594Z" fill="black"/>
        </svg>
      `);

      item.append(detail, remove);
      selectedList.appendChild(item);
    });
  };

  const updateCardSelectionState = () => {
    const hasFullSelection = state.selection.length === MAX_SELECTION;

    root.querySelectorAll('[data-bundle-product]').forEach(card => {
      const selectedCount = getSelectionCount(card.dataset.productId);
      const addControl = card.querySelector('.add-product');
      const selectedControl = card.querySelector('[data-bundle-selected-controls]');
      const count = card.querySelector('[data-bundle-selected-count]');

      card.classList.toggle('selected', selectedCount > 0);

      if (addControl) {
        addControl.hidden = selectedCount > 0;
      }

      if (selectedControl) {
        selectedControl.hidden = selectedCount === 0;
      }

      if (count) {
        count.textContent = String(selectedCount);
      }
    });

    if (popup) {
      popup.classList.toggle('all-selected', hasFullSelection);
    }

    if (choosePairs) {
      choosePairs.hidden = hasFullSelection;
    }

    if (addToCartButton) {
      addToCartButton.disabled = !hasFullSelection || state.isAdding;
    }

    if (selectedTotal) {
      selectedTotal.textContent = `${state.selection.length}/3 selected`;
    }

    if (saveButton) {
      saveButton.setAttribute('disabled', hasFullSelection ? 'false' : 'true');
    }
  };

  const render = () => {
    updateCardSelectionState();
    renderSelectedList();
    updatePdpPrice();
  };

  const selectProduct = card => {
    if (!card || state.selection.length === MAX_SELECTION) {
      return;
    }

    state.selection.push(getProductData(card));
    render();
    updatePdpImages();
  };

  const unselectProduct = productId => {
    const selectedIndex = state.selection.findIndex(product => product.id === productId);

    if (selectedIndex > -1) {
      state.selection.splice(selectedIndex, 1);
      render();
    }
  };

  const updateSelectedVariant = card => {
    if (!card) {
      return;
    }

    updateCardPrice(card);

    if (!isProductSelected(card.dataset.productId)) {
      return;
    }

    const updatedProduct = getProductData(card);

    state.selection = state.selection.map(product => (
      product.id === card.dataset.productId ? { ...product, ...updatedProduct } : product
    ));

    render();
    updatePdpImages();
  };

  const openModal = () => {
    if (!popup) {
      return;
    }

    state.previouslyFocused = document.activeElement;
    popup.classList.add('opened');
    popup.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('pdp-bundle-modal-opened');
    popup.focus({ preventScroll: true });
    document.addEventListener('keydown', handleModalKeydown);
    refreshActiveCarousel(0);
  };

  const closeModal = () => {
    if (!popup) {
      return;
    }

    popup.classList.remove('opened');
    popup.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('pdp-bundle-modal-opened');
    document.removeEventListener('keydown', handleModalKeydown);

    if (state.previouslyFocused && document.contains(state.previouslyFocused)) {
      state.previouslyFocused.focus({ preventScroll: true });
    }
  };

  const saveSelection = () => {
    if (state.selection.length === MAX_SELECTION) {
      closeModal();
    }
  };

  const clearSelection = () => {
    state.selection = [];
    render();
  };

  const redirectOrOpenDrawer = () => {
    if (window.CartRedirect === 0) {
      document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
      document.querySelector('a[data-action="open-drawer"].Header__Icon')?.click();
      return;
    }

    window.location.href = '/cart';
  };

  const addToCart = () => {
    if (state.selection.length !== MAX_SELECTION || state.isAdding) {
      return;
    }

    state.isAdding = true;
    render();

    fetch('/cart/add.js', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: state.selection.map(product => ({
          id: product.variantId,
          quantity: 1
        }))
      })
    })
      .then(response => {
        if (!response.ok) {
          return response.json()
            .catch(() => ({}))
            .then(error => {
              throw new Error(error.description || error.message || 'Unable to add bundle products to cart');
            });
        }

        const discountCode = (window.cw_pdp_bundle_modal_discount_code || '').trim();

        if (!discountCode) {
          redirectOrOpenDrawer();
          return null;
        }

        return fetch(`/discount/${discountCode}`).then(redirectOrOpenDrawer);
      })
      .catch(error => {
        console.error('Unable to add bundle products to cart', error);
        state.isAdding = false;
        render();
      });
  };

  const getFocusableElements = () => {
    if (!popup) {
      return [];
    }

    return Array.from(popup.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
  };

  const handleModalKeydown = event => {
    if (!popup || popup.getAttribute('aria-hidden') === 'true') {
      return;
    }

    if (event.key === 'Escape') {
      closeModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = getFocusableElements();

    if (focusableElements.length === 0) {
      event.preventDefault();
      popup.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  const chunkProducts = (products, size) => {
    const chunks = [];

    for (let index = 0; index < products.length; index += size) {
      chunks.push(products.slice(index, index + size));
    }

    return chunks;
  };

  const getItemsPerRow = () => (mobileQuery.matches ? MOBILE_ITEMS_PER_ROW : DESKTOP_ITEMS_PER_ROW);

  const setCarouselPage = (carousel, pageIndex) => {
    const maxIndex = carousel.pages.length - 1;
    carousel.currentPage = Math.max(0, Math.min(pageIndex, maxIndex));

    carousel.pages.forEach((page, index) => {
      const isActive = index === carousel.currentPage;
      page.hidden = !isActive;
      page.classList.toggle('slick-current', isActive);
      page.classList.toggle('slick-active', isActive);
      page.setAttribute('aria-hidden', String(!isActive));
    });

    carousel.dots.forEach((dot, index) => {
      dot.classList.toggle('slick-active', index === carousel.currentPage);
    });

    if (carousel.prevButton) {
      carousel.prevButton.classList.toggle('slick-disabled', carousel.currentPage === 0);
      carousel.prevButton.setAttribute('aria-disabled', String(carousel.currentPage === 0));
    }

    if (carousel.nextButton) {
      carousel.nextButton.classList.toggle('slick-disabled', carousel.currentPage === maxIndex);
      carousel.nextButton.setAttribute('aria-disabled', String(carousel.currentPage === maxIndex));
    }
  };

  const rebuildCarousel = container => {
    const existing = carousels.get(container);
    const products = existing
      ? existing.products
      : Array.from(container.querySelectorAll(':scope > [data-bundle-product]'));
    const itemsPerPage = getItemsPerRow() * ROWS_PER_PAGE;
    const pages = chunkProducts(products, itemsPerPage);

    container.innerHTML = '';
    container.classList.add('slick-slider', 'slick-initialized');

    const list = document.createElement('div');
    list.className = 'slick-list';

    const track = document.createElement('div');
    track.className = 'slick-track';

    pages.forEach((pageProducts, pageIndex) => {
      const page = document.createElement('div');
      page.className = 'slick-slide';
      page.dataset.slickIndex = String(pageIndex);

      chunkProducts(pageProducts, getItemsPerRow()).forEach(rowProducts => {
        const row = document.createElement('div');
        rowProducts.forEach(product => row.appendChild(product));
        page.appendChild(row);
      });

      track.appendChild(page);
    });

    list.appendChild(track);

    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'slick-prev slick-arrow';
    prevButton.setAttribute('aria-label', 'Previous products');

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'slick-next slick-arrow';
    nextButton.setAttribute('aria-label', 'Next products');

    const dots = document.createElement('ul');
    dots.className = 'slick-dots';

    const dotItems = pages.map((_, pageIndex) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(pageIndex + 1);
      button.addEventListener('click', () => setCarouselPage(carousels.get(container), pageIndex));
      item.appendChild(button);
      dots.appendChild(item);
      return item;
    });

    let touchStartX = 0;

    list.addEventListener('touchstart', event => {
      touchStartX = event.touches[0]?.clientX || 0;
    }, { passive: true });

    list.addEventListener('touchend', event => {
      const carousel = carousels.get(container);
      const touchEndX = event.changedTouches[0]?.clientX || 0;
      const delta = touchEndX - touchStartX;

      if (!carousel || Math.abs(delta) < 40) {
        return;
      }

      setCarouselPage(carousel, carousel.currentPage + (delta < 0 ? 1 : -1));
    }, { passive: true });

    prevButton.addEventListener('click', () => {
      const carousel = carousels.get(container);
      setCarouselPage(carousel, carousel.currentPage - 1);
    });

    nextButton.addEventListener('click', () => {
      const carousel = carousels.get(container);
      setCarouselPage(carousel, carousel.currentPage + 1);
    });

    container.append(list, prevButton, nextButton, dots);

    const carousel = {
      container,
      currentPage: existing ? Math.min(existing.currentPage, pages.length - 1) : 0,
      dots: dotItems,
      nextButton,
      pages: Array.from(track.children),
      prevButton,
      products
    };

    carousels.set(container, carousel);
    setCarouselPage(carousel, carousel.currentPage);
  };

  const buildCarousels = () => {
    root.querySelectorAll('.products-second.products').forEach(rebuildCarousel);
  };

  const refreshActiveCarousel = (preferredPage = 0) => {
    const activeContainer = root.querySelector('.products-second.products.opened');
    const carousel = activeContainer ? carousels.get(activeContainer) : null;

    if (carousel) {
      setCarouselPage(carousel, preferredPage);
    }
  };

  const changeTab = handle => {
    if (!handle) {
      return;
    }

    state.currentTab = handle;

    root.querySelectorAll('[data-bundle-tab]').forEach(tab => {
      const isActive = tab.dataset.bundleTab === handle;
      tab.classList.toggle('opened', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    root.querySelectorAll('.products-second.products').forEach(container => {
      container.classList.toggle('opened', container.dataset.collection === handle);
    });

    refreshActiveCarousel(0);
  };

  const handleClick = event => {
    const openTrigger = event.target.closest('[data-bundle-open]');
    const closeTrigger = event.target.closest('[data-bundle-close]');
    const tab = event.target.closest('[data-bundle-tab]');
    const unselectTrigger = event.target.closest('[data-bundle-unselect]');
    const selectTrigger = event.target.closest('[data-bundle-select]');
    const clearTrigger = event.target.closest('[data-bundle-clear]');
    const saveTrigger = event.target.closest('[data-bundle-save]');
    const addTrigger = event.target.closest('[data-bundle-add-to-cart]');

    if (openTrigger) {
      openModal();
      return;
    }

    if (closeTrigger) {
      closeModal();
      return;
    }

    if (tab) {
      changeTab(tab.dataset.bundleTab);
      return;
    }

    if (unselectTrigger) {
      event.stopPropagation();
      unselectProduct(unselectTrigger.closest('[data-bundle-product]')?.dataset.productId);
      return;
    }

    if (selectTrigger) {
      selectProduct(selectTrigger.closest('[data-bundle-product]'));
      return;
    }

    if (clearTrigger) {
      clearSelection();
      return;
    }

    if (saveTrigger) {
      saveSelection();
      return;
    }

    if (addTrigger) {
      event.preventDefault();
      addToCart();
    }
  };

  const handleKeydown = event => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    const action = event.target.closest('[data-bundle-tab], [data-bundle-close], [data-bundle-select], [data-bundle-unselect], [data-bundle-clear], [data-bundle-save]');

    if (action) {
      event.preventDefault();
      action.click();
    }
  };

  const handleResize = () => {
    buildCarousels();
    refreshActiveCarousel(0);
  };

  const init = () => {
    if (root.dataset.bundleInitialized === 'true') {
      return;
    }

    root.dataset.bundleInitialized = 'true';
    buildCarousels();

    const firstTab = root.querySelector('[data-bundle-tab]');

    if (firstTab) {
      changeTab(firstTab.dataset.bundleTab);
    }

    root.addEventListener('click', handleClick);
    root.addEventListener('change', event => {
      if (event.target.matches('[data-bundle-variant-select]')) {
        updateSelectedVariant(event.target.closest('[data-bundle-product]'));
      }
    });
    root.addEventListener('keydown', handleKeydown);
    document.addEventListener('cw-bundle-modal:open', openModal);

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', handleResize);
    } else if (typeof mobileQuery.addListener === 'function') {
      mobileQuery.addListener(handleResize);
    }

    render();
    document.dispatchEvent(new Event('cw-bundle-modal:mounted'));
    document.dispatchEvent(new Event('cw-bundle-modal:initiated'));
  };

  const triggerInit = () => {
    if (!window.cwBundleModal.includes('initiated')) {
      nativePush.call(window.cwBundleModal, 'initiated');
    }

    document.dispatchEvent(new Event('cw-bundle-modal:init'));
    init();
  };

  window.cwBundleModal = window.cwBundleModal || [];
  window.cwBundleModal.push = function pushBundleModalQueue(...items) {
    const result = nativePush.apply(this, items);

    if (this.includes('init') && !this.includes('initiated')) {
      triggerInit();
    }

    return result;
  };

  window.cwBundleModal.push('initial_array_check');
  window.cwBundleModal.push('init');
})();
