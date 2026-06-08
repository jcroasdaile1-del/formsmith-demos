# C&C Equipment — Google Apps Script files

These four files are the deployable backend + frontend for the C&C Equipment app.

| File | Purpose |
| ---- | ---- |
| `Code.gs`         | Server-side: web app entry (`doGet`), all CRUD endpoints called by `google.script.run`, photo upload to Drive, CSV exports. |
| `Index.html`      | The HTML body. Pulls in `Stylesheet` and `JavaScript` via Apps Script template `include()` calls. |
| `Stylesheet.html` | All CSS (wrapped in `<style>` tags). |
| `JavaScript.html` | All frontend logic (wrapped in `<script>` tags). Calls server functions via `google.script.run`. |

**Setup instructions:** see [`../SETUP.md`](../SETUP.md).

## API surface (client → server)

```
getAllData()            -> { inventory, expenses, sales, categories, settings }
saveItem(item)          -> { ok, id }
deleteItem(id)          -> { ok }
saveExpense(expense)    -> { ok, id }
deleteExpense(id)       -> { ok }
markSold(saleData)      -> { ok, profit, daysHeld }
undoSale(itemId)        -> { ok }
addCategory(name)       -> { ok, id } | { ok:false, error }
deleteCategory(id)      -> { ok }      | { ok:false, error }
uploadPhoto(base64,fn)  -> "https://drive.google.com/uc?export=view&id=..."
exportInventoryCsv()    -> csv string
exportProfitLossCsv()   -> csv string
```

All writes are append-or-update by ID; the script reads back via `getAllData()` after every mutation, so the client cache stays in sync.

## Sheet schema

Sheets and headers are created automatically by `ensureSheets_()`:

```
Inventory:  Item ID | Item Name | Category | Brand | Model | Year | Serial Number | Date Purchased | Purchase Cost | Asking Price | Status | Photo URL | Notes | Date Created | Last Updated
Categories: Category ID | Category Name | Active
Expenses:   Expense ID | Item ID | Date | Expense Type | Description | Amount | Notes
Sales:      Sale ID | Item ID | Date Sold | Final Sale Price | Buyer Name | Notes | Total Expenses | Profit/Loss | Days Held
Settings:   Setting Name | Setting Value
```

The user can edit any cell directly in the spreadsheet — the app re-reads everything on next refresh.
