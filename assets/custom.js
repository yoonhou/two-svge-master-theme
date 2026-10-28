/**
 * Include your custom JavaScript here.
 *
 * We also offer some hooks so you can plug your own logic. For instance, if you want to be notified when the variant
 * changes on product page, you can attach a listener to the document:
 *
 * document.addEventListener('variant:changed', event => {
 *   const variant = event.detail.variant; // Gives you access to the whole variant details
 * });
 *
 * You can also add a listener whenever a product is added to the cart:
 *
 * document.addEventListener('product:added', event => {
 *   const variant = event.detail.variant; // Get the variant that was added
 *   const quantity = event.detail.quantity; // Get the quantity that was added
 * });
 *
 * If you just want to force refresh the mini-cart without adding a specific product, you can trigger the event
 * "cart:refresh" in a similar way (in that case, passing the quantity is not necessary):
 *
 * document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', {
 *   bubbles: true
 * }));
 */

document.addEventListener('click', event => {
  const stickyButton = event.target.closest('.sticky-btn-wrapper .sticky-btn');

  if (!stickyButton) {
    return;
  }

  const addToCartButton = document.querySelector('.Product__Info .ProductForm .ProductForm__AddToCart');

  if (addToCartButton) {
    addToCartButton.click();
  }
});
