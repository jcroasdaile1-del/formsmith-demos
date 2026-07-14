# YardStack demo and Apps Script handoff

YardStack is a complete front-end equipment-rental demo. It ships with realistic sample customers, equipment, reservations, agreements, payments, inspections, and maintenance records. All changes persist in the current browser through one isolated repository object.

## Run the standalone demo

Open `index.html`, or use the published GitHub Pages URL. No build, account, Sheet, or network connection is required.

- **Owner workspace:** open the normal URL or use `#dashboard`.
- **Customer booking:** use `#book` or select **Booking site** inside the owner workspace.
- **Reload sample data:** select **Reset** in the demo ribbon or open **Settings → Reload original sample data**.

The seed dates are generated relative to the day the data is reset, so pickups, returns, overdue items, future bookings, and maintenance alerts remain current.

## Paste the demo into Apps Script

1. Go to [script.google.com](https://script.google.com) and create a **New project**.
2. Create the files listed in `google-apps-script/README.md` and paste in their matching contents.
3. In **Project Settings**, enable the manifest file and paste `appsscript.json`.
4. Select **Deploy → New deployment → Web app**.
5. Execute as yourself. Choose a shareable access setting if customers or prospects need to open the booking demo.
6. Authorize and open the deployment URL.

This runs the same local-data demo inside Apps Script. It still does not touch a Sheet.

## Connect a Google Sheet later

The persistence boundary is intentionally concentrated in `DemoRepository` near the top of `app.js` / `JavaScript.html`. The views and workflows never call `localStorage` directly.

Keep the same repository-level operations when replacing the demo backend:

- load application state
- check availability
- create a reservation
- sign an agreement
- record a payment
- check out a reservation
- complete a return inspection
- create or complete a work order

Recommended Sheet tabs:

| Tab | Purpose |
| --- | --- |
| `EquipmentTypes` | Catalog, rates, deposits, specifications |
| `AssetUnits` | Physical unit IDs, meters, serials, status |
| `Customers` | Contact, jobsite, account notes |
| `Reservations` | Dates, lifecycle, totals, delivery |
| `ReservationItems` | Equipment and quantities per reservation |
| `Agreements` | Version, signer, audit reference, timestamp |
| `Payments` | Deposit, payment, refund, and receipt records |
| `ReturnInspections` | Meter, fuel, condition, photos, charges |
| `WorkOrders` | Service holds, technicians, parts, costs |
| `Activity` | Append-only audit events |
| `Settings` | Tax, waiver, deposits, delivery, branding |

For a real public booking deployment:

- Expose only narrow customer-safe server functions; do not expose owner CRUD endpoints anonymously.
- Recalculate availability on the server immediately before writing a reservation.
- Wrap the final availability check and reservation write in `LockService` to prevent simultaneous double bookings.
- Keep the public booking deployment separate from the private owner deployment, or enforce authorization server-side.
- Use a hosted payment provider and verified webhook for real deposits.
- Have rental terms and the electronic-signature process reviewed for the business and jurisdiction.

## Source layout

```text
yardstack/
  index.html                    # GitHub Pages markup
  styles.css                    # Shared responsive design system
  app.js                        # Seed data, repository, views, workflows
  build-appscript-version.mjs   # Generates the Apps Script HTML files
  google-apps-script/
    Code.gs
    Index.html                  # Generated
    Stylesheet.html             # Generated
    JavaScript.html             # Generated
    appsscript.json
```
