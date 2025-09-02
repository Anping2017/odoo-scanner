# Odoo Inventory Scanner (Next.js + Odoo 17)

Mobile-friendly stock count app:
- Sign in with your Odoo user
- Scan barcodes with your phone camera
- Lookup product by `barcode` or `default_code`
- Set counted quantity and apply an inventory adjustment

## Quick start

1. Ensure you have Node 18+.
2. Unzip this project: `odoo-inventory-scanner.zip`
3. Copy `.env.local.example` to `.env.local` and set values:
   ```
   ODOO_URL=https://your-odoo-host
   ODOO_DB=your_db_name
   ODOO_LOCATION_ID=WH_STOCK_LOCATION_ID
   ```
   > Tip: Find the numeric Location ID in Odoo (activate Developer mode) under *Inventory → Configuration → Locations*.
4. Install deps and run:
   ```bash
   npm i
   npm run dev
   ```
5. Open http://localhost:3000 on your phone (same Wi‑Fi) or deploy.

## Notes

- Product search uses `barcode` OR `default_code`. Ensure your products have one of them set and that the barcode printed matches Odoo.
- Inventory apply:
  - First tries setting `inventory_quantity` on `stock.quant` and calling `action_apply_inventory` (Odoo 16/17 style).
  - If that isn’t available, it falls back to the legacy `stock.change.product.qty` wizard.
- To target a different location per count, send `location_id` in the POST body to `/api/inventory`.
- This is intentionally minimal. Add auth guards, role checks, and HTTPS in production.

## Customizing

- To show more fields (e.g., `branch_qty`), edit `/app/api/product/route.ts` `fields` list.
- If you maintain per‑location quants, you can also query `stock.quant` directly and surface location‑specific on hand.
- Want a PWA? Add a manifest and service worker.
