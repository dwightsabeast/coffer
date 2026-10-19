1. **Install Coffer** from the plugin registry, then open **Monero payments** in your admin. The Setup checklist walks
   you through the rest: press **Connect wallet host** and run the one command it shows on a separate Linux machine
   (it asks for your shop wallet's address and view key; never the spend key). Setup ends with a test tip to your own
   wallet.

2. **Add the pay page** to your theme:

   ```sh
   npm install @cofferhq/astro
   ```

   `src/pages/pay/coffer/[token].astro`:

   ```astro
   ---
   import PayPage from "@cofferhq/astro/PayPage.astro";
   import { preparePayPage } from "@cofferhq/astro/page";
   const pay = await preparePayPage(Astro, Astro.params.token);
   ---
   <PayPage pay={pay} />
   ```

   The page sets its own privacy headers (no caching, no Referer, no indexing, a strict Content-Security-Policy) and
   loads nothing from other sites. Restyle it with the `--coffer-*` CSS custom properties, or your own stylesheet:
   `<link slot="head" rel="stylesheet" href="/your.css">` inside `<PayPage>`.

3. **Add the tip button.** Required: tips are this release's only payment mode. Create `src/pages/pay/coffer/tip.ts`:

   ```ts
   import { tipEndpoint } from "@cofferhq/astro/tip";
   export const POST = tipEndpoint();
   ```

   Then place the button wherever you like, e.g. an entry template:

   ```astro
   ---
   import TipButton from "@cofferhq/astro/TipButton.astro";
   ---
   <TipButton collection="posts" id={entry.data.id} />
   ```

   No JavaScript. Tips appear under **Tips** on the Monero payments page.

If your site is behind a login or access rules, let `/_emdash/api/plugins/coffer/*` through without one, and don't
add an `Origin` or `Authorization` header to those requests: the wallet host and buyers' pay pages call them.
