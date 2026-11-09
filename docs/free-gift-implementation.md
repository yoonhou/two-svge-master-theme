# Free gift implementation and theme migration

## Copying the latest cart changes

For a theme that already has this free gift implementation and ACC drawer, transfer these changes from this repository:

| File | What to transfer |
| --- | --- |
| `assets/acc-cart-drawer.css` | The marked free gift CSS sections, including the bold gift name and vertically stacked, right-aligned gift prices. |
| `assets/theme.css` | The start/end comments around the existing free gift styles; no appearance changes were made there. |
| `sections/acc-cart-drawer.liquid` | The `upsell_enabled` checkbox in the Bundle upsell settings and the condition around the upsell card. It defaults to on. |
| `sections/cart-template.liquid` | The condition that connects the Bundle card's **Hide cart bundle card** checkbox to its display. |

Merge these changes into the corresponding files in the destination theme; replacing entire files can overwrite other theme customizations. The full free gift feature has additional dependencies listed below. This documentation file is for reference and does not need to be copied for the storefront to work.

After transferring the code, check the settings in the destination theme's editor:

- **ACC cart drawer → Bundle upsell → Show bundle upsell** controls the drawer card. It defaults to on; it does not control the cart page.
- **Cart page → Bundle card → Hide cart bundle card** controls the cart page card. Checked hides it; unchecked shows it. The repository's `templates/cart.json` has this checked, so the card will be hidden when the newly connected setting is used with that template. Another theme can have a different saved value. Copying `templates/cart.json` is not required for the code change; review its settings rather than replacing the destination template wholesale.

Preview both settings in the destination theme after transfer. These switches hide promotional cards; they do not enable or disable the underlying bundle or its discount.

## Setup reminder: hide the gift product's add-to-cart button

Before launching the promotion or moving it to another theme:

1. Make sure the theme has a view-only product template for the gift. This theme includes `templates/product.free-gift.json`; in another theme, copy or recreate an equivalent template without a purchase form or add-to-cart button.
2. In Shopify admin, open the free gift product and assign the `free-gift` product template. The template must be available in the store's active theme for it to be selectable.
3. Keep the `free-gift` template guard around the sticky add-to-cart bar in `layout/theme.liquid`, or add an equivalent guard in the target theme.
4. Preview the gift product page and confirm that neither the regular nor sticky add-to-cart button appears.

Selecting the gift in Theme settings or adding a `free-gift` product tag does **not** assign the product template automatically.

## What the feature does

- Uses the global **Free gift** theme settings to enable or disable the promotion, select the gift product, set its storefront label, set the checkout line item property value, and configure the qualified-cart message.
- Treats any cart item without the `_free_gift=true` marker as a qualifying purchase, including an unmarked copy of the gift product. There is no minimum spend or eyewear-only restriction.
- Uses the selected gift product's `selected_or_first_available_variant`. Shopify returns a selected variant if present, otherwise the first available variant; if none is available, it falls back to the first variant.
- Adds one gift line with quantity `1`, marked with the private line item property `_free_gift=true` and the visible property `Free Gift=<configured value>`.
- Reconciles the live Shopify cart from `/cart.js`; cart events are triggers, not the source of truth. It listens for `product:added`, `cart:refresh`, `acc:cart:updated`, browser `pageshow`, and checkout form submission. It removes marked gifts when the cart no longer qualifies or the feature is disabled, removes stale/duplicate marked gift lines, and refreshes the cart UI after mutations.
- The bundle modal adds its products with its own Ajax request, so the theme does not emit `product:added` for that request. When the ACC drawer is present, the modal dispatches `acc:cart:updated`; the free gift manager attaches its reconciliation promise to the event, allowing the modal to wait before refreshing and opening the drawer. This event is also used by ACC drawer cart changes.
- Puts the marked gift last in cart lists. The gift has no product hyperlink, quantity controls, or remove control. Cart displays its final price and compare-at/original price where available, plus an icon and configurable label.
- Shows the configured gift label on the selected product and products tagged `free-gift` or `free gift`.
- Shows the configured qualified-cart message above the items when the manager newly adds the gift. It stays hidden on ordinary page loads when the gift is already in the cart, then dismisses three seconds after becoming visible. A one-time `sessionStorage` flag carries the notice through a cart-page reload when browser storage is available. The bundle modal also calls `showQualifiedMessage()` after its final drawer refresh, which can reveal a notice for an existing gift.
- The checkout submit listener intercepts checkout forms with a `[name="checkout"]` control, including the cart page, ACC drawer, and legacy theme drawer. It reconciles and reads the live cart, then resubmits the form. If the final cart read fails, it attempts to let checkout proceed; reconciliation errors are logged and the cart read is still attempted. The entire pre-check has a two-second timeout, including time waiting for earlier reconciliations. If it times out, the script aborts checkout-initiated cart requests where possible and attempts to proceed to checkout; an earlier reconciliation is not canceled, and a request already received by Shopify may still complete. The timer depends on the browser continuing to run JavaScript. It intentionally leaves the customer on the page if the verified cart is empty or contains only marked gifts. This is storefront JavaScript, not server-side Shopify cart validation; it cannot guarantee enforcement for every checkout path.

## Files changed for the free gift feature

| File | Purpose |
| --- | --- |
| `assets/free-gift.js` | Shared cart reconciliation, gift add/remove/deduplication, event listeners, cart UI refresh, checkout preflight, and the one-time three-second qualified-message behavior. |
| `config/settings_schema.json` | Adds the global Free gift settings. |
| `layout/theme.liquid` | Publishes those settings as `window.freeGiftSettings`, loads `free-gift.js`, renders the ACC drawer section, and suppresses the sticky add-to-cart bar on the `free-gift` product template. |
| `templates/product.free-gift.json` | View-only product template with no purchase form block, quantity selector, or share buttons. |
| `snippets/cart-items.liquid` | Cart page/legacy cart item presentation and qualified-message markup: gift last, label and icon, compare-at price, hidden link/controls, and hidden internal/checkout properties. Also adjusts image wrapper markup to fix cart spacing. |
| `assets/theme.css` | Styling for product labels, the cart gift label, and the qualified-cart notice, enclosed in free gift start/end comments. |
| `snippets/product-item.liquid` | Adds the configured label to product cards. |
| `snippets/product-item-collection.liquid` | Adds the configured label to collection product cards. |
| `snippets/product-meta.liquid` | Adds the configured label to the product detail page. |
| `sections/acc-cart-drawer.liquid` | ACC drawer qualified-message markup and gift line presentation, including price, label, icon, hidden link/controls, and gift-last ordering. |
| `assets/acc-cart-drawer.js` | Custom ACC drawer cart behavior; emits `acc:cart:updated` after drawer cart changes so the gift manager can reconcile. |
| `assets/acc-cart-drawer.css` | ACC drawer styling, including marked free gift sections for the label, bold gift title, and stacked, right-aligned prices. |

The bundle modal has an additional integration described below. Its other bundle-modal code is not required by the free gift feature.

## What to copy to another theme

For the **free gift behavior and UI**, copy/port these pieces:

1. `assets/free-gift.js`.
2. The **Free gift** settings group from `config/settings_schema.json` (merge it into the target theme's existing schema; do not replace the whole file).
3. The `window.freeGiftSettings` configuration, `free-gift.js` script include, and the `free-gift` template guard around the sticky add-to-cart bar from `layout/theme.liquid`. Place the settings and script after Shopify/theme globals are available, and include them in every layout where the feature needs to run.
4. Gift-aware rendering in the cart item template used by the target cart page and drawer. In this repo that is `snippets/cart-items.liquid`; copy the gift marker detection, gift-last ordering, label/price treatment, suppression of link/quantity/remove actions, and property filtering.
5. The product-label markup from `snippets/product-item.liquid`, `snippets/product-item-collection.liquid`, and `snippets/product-meta.liquid`, if those placements are wanted. Merge into equivalent snippets in the target theme; snippet names and markup vary by theme.
6. The corresponding free-gift CSS from `assets/theme.css`.
7. If using this ACC drawer, copy its complete component set: `sections/acc-cart-drawer.liquid`, `assets/acc-cart-drawer.js`, and `assets/acc-cart-drawer.css`; render the section from the layout and ensure the drawer JS keeps the `acc:cart:updated` notification. If the other theme has its own drawer, keep that drawer and add an equivalent post-cart-update event or hook to trigger `FreeGiftManager` reconciliation. Do not replace a different theme's cart drawer wholesale just to add the gift behavior.
8. `templates/product.free-gift.json` if the target theme needs the view-only gift product page. Its `product-template` and `product-recommendations` section types and their settings must exist in the target theme. Assign the template to the gift product and preserve the sticky-bar guard described above.

If the target theme also uses this bundle modal, port the bundle-specific integration in `assets/cw-bundle-modal.js`: after a successful Ajax add, dispatch `acc:cart:updated` and wait for the reconciliation promise before refreshing/opening the drawer, then call `FreeGiftManager.showQualifiedMessage()` after the modal's final drawer refresh. The main feature does not depend on the bundle modal; other add-to-cart flows should use the target theme's add event or dispatch an event the free gift manager listens for.

Theme-specific selections and text are merchant configuration, not reusable code. Set the product and labels in the target store's Theme settings after copying the schema. This worktree's `config/settings_data.json` enables the feature and selects `bumper-sticker`; its label, checkout property value, and qualified message use the schema defaults. Do not copy the settings data file wholesale to another store/theme.

## Dependencies and integration notes

- The free gift manager expects Shopify Ajax Cart endpoints (`cart.js`, `cart/add.js`, `cart/change.js`) and the `Shopify.routes.root` value when available.
- `layout/theme.pagefly.liquid` does not include the gift settings, script, or ACC drawer. No template in this worktree currently selects that layout; if a PageFly template starts using it, port the needed integration into that layout as well.
- The manager does not apply a discount or set a price. The configured gift variant must have a zero final price through its product pricing or a separately configured discount if it is to be free.
- It recognizes its own lines only by `_free_gift=true`. A manually added copy of the same product is a qualifying item and can coexist with one promotional gift. The one-gift rule applies to marked lines during client-side reconciliation and is not a server-enforced limit.
- The manager does not check the gift's current availability. If a gift becomes unavailable while its marked line remains in the cart, reconciliation alone does not remove it. A failed gift add is logged; other cart items remain. Shopify's own handling of unavailable items is separate from this script.
- On the cart page, a session storage history limits reconciliation-driven reloads. The manager avoids another reload if it sees a previously attempted gift state, and allows at most three consecutive reloads even if the states keep changing. The history clears when reconciliation makes no changes. If storage is unavailable or a reload is suppressed, the manager requests a theme cart refresh instead; during checkout it avoids that refresh so the original form remains available. A refresh can leave the display stale if it fails, and the guard does not force Shopify to apply a mutation. Partial mutation failures are logged before a reload.
- For custom cart drawers, verify that a cart update triggers reconciliation and that the drawer can be refreshed after the gift is added/removed. The ACC implementation exposes `window.AccCartDrawer.refresh()` and dispatches `acc:cart:updated`.
- The ACC drawer's update queue and the gift manager's reconciliation queue are independent, so a drawer render can temporarily lag a gift mutation until a subsequent refresh.
- The theme's product form uses `product:added`; custom Ajax cart flows must send a reconciliation signal themselves. In the bundle modal integration, `acc:cart:updated` carries a `reconciliation` promise added by the free gift manager so the caller can wait before rendering the drawer.
- When a marked gift is present, the `free_gift_qualified_message` setting is rendered above the cart items. The notice is hidden by default, revealed by the manager or bundle integration, and dismissed three seconds after it becomes visible.
- For strict checkout enforcement across accelerated/direct checkout routes, add a server-side Shopify Cart and Checkout Validation Function or equivalent supported validation. The theme script is only a client-side safeguard.

## Browser tests

The Playwright suite and instructions are in [`tests/free-gift/README.md`](../tests/free-gift/README.md). The default suite runs the local gift script against simulated cart responses; the separately enabled storefront suite targets the test store's active theme. One simulated scenario remains unresolved: reconciliation does not remove an existing marked gift solely because it becomes unavailable. An earlier test storefront attempt returned HTTP 429 during a cart request, so its rapid-click and unmarked-sticker checkout scenarios have not been verified there.

## Other theme files to review separately

The following files have been involved in other theme work and are not free gift dependencies. Review them separately when migrating between themes. `assets/cw-bundle-modal.js` has a bundle-specific integration described above; its other changes belong to the bundle modal itself and are not required by the free gift feature. This list is not a current working-tree status report.

- `config/markets.json`, `config/settings_data.json`
- `sections/product-template.liquid`, `snippets/acc_ts_product_38.liquid`
- `templates/index.json`, `templates/index.context.us.json`, `templates/product.json`, `templates/product.coming-soon.json`, `templates/product.pre-order.json`
- Deleted assets: `assets/cursor-zoom-in.svg`, `assets/cursor-zoom-in-2x.svg`

Some whole files above include unrelated theme content or store configuration. Merge only the feature-specific edits into another theme.
