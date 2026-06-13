# C&C Equipment — Setup Guide

A mobile-first inventory + finance tracker for buying and reselling power equipment, implements, farm equipment, and misc. equipment. Backed by a single Google Sheet and built with Google Apps Script — **100% free**, no hosting bills, no monthly fees.

You have two ways to use this app:

| Option | What it is | When to use it |
| ---- | ---- | ---- |
| **A. Live demo** | Web page with sample data. No login. | Show it to someone in 5 seconds. Data is **only on your phone/browser** and resets when you clear browsing data. |
| **B. Real deployment** | Your own copy connected to *your* Google Sheet. | Real day-to-day use. Data is private to your Google account, syncs across phone/laptop, and you can open the Sheet directly if you ever need to. |

---

## A. Just want to try it?

Open the live demo:

> **https://jcroasdaile1-del.github.io/formsmith-demos/cc-equipment/**

Add it to your phone home screen:
- iPhone: open in Safari → tap Share → **Add to Home Screen**
- Android: open in Chrome → tap ⋮ → **Add to Home Screen**

The demo runs entirely in your browser. Sample inventory is pre-loaded so you can tap around.

---

## B. Deploy your real copy (≈ 10 minutes)

### Step 1 — Create the Google Sheet
1. Go to https://sheets.google.com → **Blank** spreadsheet.
2. Rename it: **C&C Equipment** (any name is fine).
3. Leave it empty — the script will set up the tabs automatically.

### Step 2 — Open the Apps Script editor
1. In the new sheet, click **Extensions → Apps Script**.
2. You'll see a blank `Code.gs` file. Delete its contents.

### Step 3 — Paste the files
From `google-apps-script/` in this folder:

| In Apps Script editor | Paste the contents of |
| ---- | ---- |
| `Code.gs`           | `Code.gs` |
| `Index.html` *(File → New → HTML file → name it `Index`)* | `Index.html` |
| `Stylesheet.html` *(File → New → HTML file → name it `Stylesheet`)* | `Stylesheet.html` |
| `JavaScript.html` *(File → New → HTML file → name it `JavaScript`)* | `JavaScript.html` |

> File names **must match exactly** (case-sensitive, no `.html` suffix when you create them — Apps Script adds it automatically).

Click the floppy-disk **Save** icon.

### Step 3b — Paste the manifest (recommended)
This makes Google ask for permissions **once** instead of twice (once for the Sheet, again the first time you upload a photo).

1. Click the **gear ⚙ (Project Settings)** in the left sidebar.
2. Tick **“Show "appsscript.json" manifest file in the editor.”**
3. Go back to the **Editor** (`< >` icon). You'll now see an `appsscript.json` file.
4. Replace its contents with the contents of `appsscript.json` from the `google-apps-script/` folder.
5. **Save**.

### Step 4 — Run setup once
1. In the editor's function dropdown (top toolbar), pick **`setup`**.
2. Click **Run**.
3. The first time, Google will ask for permission. Click **Review permissions** → choose your Google account → **Advanced → Go to (project) (unsafe) → Allow**. (It says "unsafe" only because the script isn't published in the Marketplace. It only touches *your* sheet and *your* Drive.)

Switch back to the spreadsheet tab in your browser. You should now see five tabs: **Inventory**, **Categories**, **Expenses**, **Sales**, **Settings**. Categories will be seeded with `Power Equipment`, `Implements`, `Misc. Equipment`, `Farm Equipment`.

### Step 5 — Deploy as a Web App
1. In Apps Script, click **Deploy → New deployment**.
2. Click the gear ⚙ next to **Select type** → choose **Web app**.
3. Fill in:
   - **Description**: `C&C Equipment v1`
   - **Execute as**: `Me`
   - **Who has access**: `Only myself` (recommended — only you can use it)
4. Click **Deploy**.
5. Approve again if asked.
6. Copy the **Web app URL**. It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

Open that URL on your phone. You'll see the app. Sign in with the same Google account if prompted.

### Step 6 — Install on your phone home screen
The Web App URL is long, so add it to your home screen:
- **iPhone**: open the URL in **Safari** → tap the **Share** icon → **Add to Home Screen** → rename to `C&C Equipment`.
- **Android**: open the URL in **Chrome** → tap the **⋮** menu → **Add to Home screen** → rename to `C&C Equipment`.

It will now open like a real app from your home screen.

### Step 7 (optional) — Use your own logo
The header logo defaults to a built-in gold/green badge. To use your real logo:
1. Upload `assets/logo.jpg` to Google Drive.
2. Right-click → **Share → Anyone with the link** → **Viewer** → copy link.
3. Convert the link to a direct image URL: `https://drive.google.com/uc?export=view&id=FILE_ID`
4. In `Stylesheet.html`, find `.topbar .logo` and change `background-image: url("data:...")` to your URL.
5. Save → **Deploy → Manage deployments → Edit pencil → New version → Deploy**.

---

## What's in your Google Sheet

| Tab | What it stores |
| ---- | ---- |
| **Inventory** | One row per item: name, brand, model, year, serial, dates, cost, asking price, status, photo URL, notes. |
| **Categories** | One row per category. Edit names directly in the Sheet, or use the in-app Settings. |
| **Expenses** | One row per expense, linked to an item by `Item ID`. |
| **Sales** | One row per sale: price, buyer, profit/loss, days held. Filled in when you tap **Mark Sold** in the app. |
| **Settings** | App preferences (currency, etc.). |

You can edit any row directly in the Sheet at any time — the app will read your changes on next refresh.

Photos are stored in a Drive folder named **C&C Equipment Photos** (auto-created on first photo upload). They're shared with "Anyone with the link" so the embedded image URLs work inside the app.

---

## Updating to a newer version
**Your data is safe.** All inventory, expenses, and sales live in the Google Sheet — *not* in the code. Replacing the code never touches the Sheet, so you can push updates as often as you like.

1. Replace the contents of `Code.gs`, `Index.html`, `Stylesheet.html`, `JavaScript.html` (and `appsscript.json` if it changed) with the new files.
2. **Deploy → Manage deployments → Edit pencil → New version → Deploy**. (Editing the *existing* deployment keeps the **same URL**, so the home-screen icon keeps working.)
3. Reload the app on your phone.

---

## Backup
Your sheet *is* your backup. Inside the spreadsheet: **File → Make a copy** any time. Or use **File → Version history** to roll back.

---

## Troubleshooting

| Problem | Fix |
| ---- | ---- |
| "Authorization required" loop | Make sure you're signed in with the same Google account that owns the Sheet. |
| Photos won't upload | The first photo upload triggers a Drive permission prompt — approve it. |
| Charts/numbers look stale | Pull-to-refresh the page (or close + reopen from home screen). |
| Want a fresh start | Delete rows in the Sheet, or duplicate the Sheet and start fresh. |
| Need to share with a helper | **Deploy → Manage deployments → Edit → Who has access → Anyone with Google account**, then share the URL with them. |

---

## Costs

**$0.** Forever, as long as you stay within these very large free limits:
- Apps Script: 6 minutes per execution, plenty of script runs per day. You will not hit these.
- Drive: 15 GB free across Google. One photo ≈ 100 KB after the app downsizes it — that's room for ~150,000 photos.

If you ever want a real domain like `cc-equipment.com` instead of the `script.google.com/...` URL, that's a paid extra and not included.

---

*Made with the C&C Equipment Formsmith template.*
