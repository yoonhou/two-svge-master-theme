# Free gift implementation and theme migration

## What the feature does

- Uses the global **Free gift** theme settings to enable or disable the promotion, select the gift product, set its storefront label, set the checkout line item property value, and configure the qualified-cart message.
- Treats any non-gift cart item as a qualifying purchase. There is no minimum spend.
- Uses the selected product's first available variant for the gift.
- Adds one gift line with quantity `1`, marked with the private line item property `_free_gift=true` and the visible property `Free Gift=<configured value>`.
- Reconciles the live Shopify cart from `/cart.js`; cart events are triggers, not the source of truth. It listens for `product:added`, `cart:refresh`, `acc:cart:updated`, browser `pageshow`, and checkout form submission. It removes marked gifts when the cart no longer qualifies or the feature is disabled, removes stale/duplicate marked gift lines, and refreshes the cart UI after mutations.
- The bundle modal adds its products with its own Ajax request, so the theme does not emit `product:added` for that request. The modal dispatches `acc:cart:updated`; the free gift manager attaches its reconciliation promise to the event, allowing the modal to wait before refreshing and opening the ACC drawer. This event is also used by ACC drawer cart changes.
- Puts the marked gift last in cart lists. The gift has no product hyperlink, quantity controls, or remove control. Cart displays the free price and compare-at/original price where available, plus an icon and configurable label.
- Shows the configured gift label on the selected product and products tagged `free-gift` or `free gift`.
- Shows the configured qualified-cart message above the items when the manager newly adds the gift. It stays hidden on ordinary page loads when the gift is already in the cart, then dismisses three seconds after becoming visible. A one-time `sessionStorage` flag carries the notice through a cart-page reload when browser storage is available.
- The checkout submit listener reconciles and checks the live cart before proceeding. This is storefront JavaScript, not server-side Shopify cart validation; it cannot guarantee enforcement for every checkout path.

## Files changed for the free gift feature

| File | Purpose |
| --- | --- |
| `assets/free-gift.js` | Shared cart reconciliation, gift add/remove/deduplication, event listeners, cart UI refresh, checkout preflight, and the one-time three-second qualified-message behavior. |
| `config/settings_schema.json` | Adds the global Free gift settings. |
| `layout/theme.liquid` | Publishes those settings as `window.freeGiftSettings`, loads `free-gift.js`, and renders the ACC drawer section. |
| `snippets/cart-items.liquid` | Cart page/legacy cart item presentation: gift last, label and icon, compare-at price, hidden link/controls, and hidden internal/checkout properties. Also adjusts image wrapper markup to fix cart spacing. |
| `assets/theme.css` | Styling for product labels, the cart gift label, and the qualified-cart notice. |
| `snippets/product-item.liquid` | Adds the configured label to product cards. |
| `snippets/product-item-collection.liquid` | Adds the configured label to collection product cards. |
| `snippets/product-meta.liquid` | Adds the configured label to the product detail page. |
| `sections/acc-cart-drawer.liquid` | ACC drawer markup and gift line presentation, including price, label, icon, hidden link/controls, and gift-last ordering. |
| `assets/acc-cart-drawer.js` | Custom ACC drawer cart behavior; emits `acc:cart:updated` after drawer cart changes so the gift manager can reconcile. |
| `assets/acc-cart-drawer.css` | ACC drawer styling, including the gift label and gift item title/price layout. |

The bundle modal has an additional integration described below. Its other bundle-modal code is not required by the free gift feature.

## What to copy to another theme

For the **free gift behavior and UI**, copy/port these pieces:

1. `assets/free-gift.js`.
2. The **Free gift** settings group from `config/settings_schema.json` (merge it into the target theme's existing schema; do not replace the whole file).
3. The `window.freeGiftSettings` configuration and `free-gift.js` script include from `layout/theme.liquid`. Place it after Shopify/theme globals are available and ensure it is loaded site-wide, including cart and product pages.
4. Gift-aware rendering in the cart item template used by the target cart page and drawer. In this repo that is `snippets/cart-items.liquid`; copy the gift marker detection, gift-last ordering, label/price treatment, suppression of link/quantity/remove actions, and property filtering.
5. The product-label markup from `snippets/product-item.liquid`, `snippets/product-item-collection.liquid`, and `snippets/product-meta.liquid`, if those placements are wanted. Merge into equivalent snippets in the target theme; snippet names and markup vary by theme.
6. The corresponding free-gift CSS from `assets/theme.css`.
7. If using this ACC drawer, copy its complete component set: `sections/acc-cart-drawer.liquid`, `assets/acc-cart-drawer.js`, and `assets/acc-cart-drawer.css`; render the section from the layout and ensure the drawer JS keeps the `acc:cart:updated` notification. If the other theme has its own drawer, keep that drawer and add an equivalent post-cart-update event or hook to trigger `FreeGiftManager` reconciliation. Do not replace a different theme's cart drawer wholesale just to add the gift behavior.

If the target theme also uses this bundle modal, port the bundle-specific integration in `assets/cw-bundle-modal.js`: after a successful Ajax add, dispatch `acc:cart:updated` and wait for the reconciliation promise before refreshing/opening the drawer, then call `FreeGiftManager.showQualifiedMessage()` after the modal's final drawer refresh. The main feature does not depend on the bundle modal; other add-to-cart flows should use the target theme's add event or dispatch an event the free gift manager listens for.

Theme-specific selections and text are merchant configuration, not reusable code. Set the product and labels in the target store's Theme settings after copying the schema. `config/settings_data.json` contains this store's configured values and should not be copied wholesale to another store/theme.

## Dependencies and integration notes

- The free gift manager expects Shopify Ajax Cart endpoints (`cart.js`, `cart/add.js`, `cart/change.js`) and the `Shopify.routes.root` value when available.
- It recognizes its own lines only by `_free_gift=true`. A manually added copy of the same product is a normal purchase and can coexist with one promotional gift.
- For custom cart drawers, verify that a cart update triggers reconciliation and that the drawer can be refreshed after the gift is added/removed. The ACC implementation exposes `window.AccCartDrawer.refresh()` and dispatches `acc:cart:updated`.
- The theme's product form uses `product:added`; custom Ajax cart flows must send a reconciliation signal themselves. In the bundle modal integration, `acc:cart:updated` carries a `reconciliation` promise added by the free gift manager so the caller can wait before rendering the drawer.
- The `free_gift_qualified_message` setting is rendered above the cart items after the manager adds the gift. The notice is hidden by default and dismissed three seconds after it becomes visible.
- For strict checkout enforcement across accelerated/direct checkout routes, add a server-side Shopify Cart and Checkout Validation Function or equivalent supported validation. The theme script is only a client-side safeguard.

## Files changed in this working tree for other theme work

The current worktree also contains changes that are not part of the free gift feature. Review and migrate these separately rather than copying them as free gift dependencies. `assets/cw-bundle-modal.js` has a bundle-specific integration described above; its other changes belong to the bundle modal itself and are not required by the free gift feature.

- `config/markets.json`, `config/settings_data.json`
- `sections/product-template.liquid`, `snippets/acc_ts_product_38.liquid`
- `templates/index.json`, `templates/index.context.us.json`, `templates/product.json`, `templates/product.coming-soon.json`, `templates/product.pre-order.json`
- Deleted assets: `assets/cursor-zoom-in.svg`, `assets/cursor-zoom-in-2x.svg`

Some whole files above include unrelated theme content or store configuration. Merge only the feature-specific edits into another theme.
