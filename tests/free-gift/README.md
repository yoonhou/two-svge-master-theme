# Free gift browser tests

Run these commands from this directory:

```sh
npm ci
node ./node_modules/@playwright/test/cli.js install chromium
npm test
```

The default tests execute the local `assets/free-gift.js` in Chromium with simulated Shopify cart responses. They cover gift addition, removal, duplicate marked lines, quantity correction, unavailable gifts, an unmarked sticker, checkout failures, the notice, 50 concurrent successful product-add requests, and 100 rapid event signals. These requests and responses are simulated: they do not measure Shopify's capacity or establish server-side enforcement.

To run the four additional scenarios against `two-svge-test-app.myshopify.com`, save the storefront password in a private file outside this repository and run:

```sh
STOREFRONT_PASSWORD_FILE=/path/to/private/password-file npm run test:storefront
```

These tests create separate browser sessions, add ALPHA - REDLINE and the sticker to their own carts, and attempt to clear those carts. One exercises rapid product-button clicks, another runs three sessions concurrently, and another attempts to reach checkout with an unmarked sticker, without placing an order. They exercise whichever theme is active on the test storefront; deploy the intended theme first. The test aborts before changing a cart if the storefront redirects to a different host. Storefront traces are disabled to avoid recording the password.

The storefront run stops after its first failing test. If a cart endpoint returns HTTP 429, stop and investigate rather than repeatedly retrying.

The latest storefront run returned HTTP 429 during a cart request and stopped before the rapid-click and unmarked-sticker checkout scenarios ran. Those scenarios have not been verified against Shopify checkout.

The checkout tests cover cart reads and gift adds that hang, as well as a previously queued reconciliation that hangs. The pre-check has a two-second timeout, after which the script attempts to continue checkout. The timer requires the browser to keep running JavaScript. Another test checks whether reconciliation removes an existing gift that became sold out; the current script does not receive or check availability, so that test fails when Shopify leaves the line in the simulated cart.

The local suite also covers failed drawer refreshes, checkout resubmission without a submit event, cart-page updates that do not persist, alternating and continually changing cart states, unavailable session storage, and logging a partial mutation failure before reload. The sold-out gift test described above remains an expected unresolved failure.
