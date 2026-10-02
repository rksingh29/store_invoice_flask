# Store Invoice & Purchase Order Tracker

A simple web application for store keepers to record vendor invoices (with many items per invoice), compare every item against its Purchase Order (PO), track payment and invoice-received status, review daily differences, and move data in and out of Excel. It can also read an invoice photo with OCR and pre-fill the form for you to check.

- **Backend:** Python Flask
- **Database:** SQLite (a single file, no database server needed)
- **Frontend:** HTML + CSS + vanilla JavaScript (the UI is built by `static/app.js`)
- **Excel:** openpyxl
- Works on desktop and mobile browsers.

---

## 1. Installation

You need **Python 3.9 or newer**. There are three ways to install and run the app. Pick one.

### Option A: one command (recommended)

```bash
cd store_invoice_flask
python buildall.py
```

`buildall.py` does everything:

1. Checks Python.
2. Gets **uv**. If uv is missing, it installs it with pip.
3. Runs `uv build`, which creates a wheel and a source package in `dist/`.
4. Creates a virtual environment in `.venv`.
5. Installs the app and all its dependencies there.
6. Runs a quick self-test.
7. Tells you whether Tesseract (for OCR) is installed.

Start the app with:

```bash
.venv\Scripts\store-invoice          (Windows)
.venv/bin/store-invoice              (macOS / Linux)
```

Useful options for `buildall.py`:

| Option | Effect |
|---|---|
| `--run` | Start the app after installing |
| `--system` | Install into the current Python instead of `.venv` |
| `--venv PATH` | Use another folder for the virtual environment |
| `--skip-build` | Reinstall the existing wheel in `dist/` without rebuilding |
| `--no-test` | Skip the self-test |

### Option B: install the wheel with pip (e.g. on another computer)

Build once, either with `python buildall.py` or by running `uv build` yourself. Then copy `dist/store_invoice_tracker-2.0.0-py3-none-any.whl` to the other computer and run:

```bash
python -m venv venv
venv\Scripts\activate
pip install store_invoice_tracker-2.0.0-py3-none-any.whl
store-invoice
```

`pip install` installs Flask, openpyxl, Pillow, pytesseract and pypdf automatically.

### Option C: run from the source folder (no install)

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Opening the app

Whichever option you used, the app opens your browser automatically at:

```text
http://127.0.0.1:5000
```

Command options (`store-invoice` and `python app.py` accept the same ones):

```text
store-invoice --port 8080              use another port
store-invoice --db D:\Data\store.db    use a specific database file
store-invoice --host 0.0.0.0           allow phones / other PCs on the network
store-invoice --no-browser             don't open the browser
store-invoice --version
```

With `--host 0.0.0.0`, other devices open `http://<this-computer-ip>:5000`. `python -m store_invoice` also works.

---

## 2. How to add an invoice

1. Click **+ Add Invoice** (top menu or the button on any page).
2. Fill in the invoice details: **Invoice Date**, **Invoice No.**, **Vendor Name** (required), then Invoice Type, Payment Status, Invoice Received and Remarks.
3. Fill in the first item: **Particulars**, **Rate** and **Quantity** are required. HSN, Unit, GST %, PO Date, PO Number, PO Rate and PO Amount are optional.
4. Click **Save Invoice**.

You never type the calculated values. The form fills these in as you type:

| Value | Formula |
|---|---|
| Without GST | Rate × Quantity |
| Amount | Rate × Quantity × (1 + GST% / 100) |
| GST Amount | Amount − Without GST |
| PO Rate Difference | Rate − PO Rate |
| PO Amount Difference | Amount − PO Amount |

The form also shows the invoice totals: total before GST, GST amount, invoice grand total, PO total and the difference.

If something is missing or wrong (for example an empty Invoice No. or a negative quantity), the field turns red and a list explains what to fix. The app does not let you save the same **Invoice No. from the same Vendor** twice.

## 3. How to add multiple items

- Click **+ Add Item** to add another row. You can add as many rows as you need. A new row copies the GST %, Unit and PO Date of the row above to save typing.
- Click **Remove** on a row to delete it. An invoice must keep at least one item.
- On a phone, each item is shown as a card.

To change an invoice later, open **Invoices**, then click **View** or **Edit**. To delete one, click **Delete** and confirm. Deleting an invoice also deletes all its items.

## 4. How PO matching works

Each item gets a status automatically:

| Status | When |
|---|---|
| **Matched** (green) | Invoice rate = PO rate **and** invoice amount = PO amount |
| **Rate Mismatch** (red) | The PO exists but the invoice rate is different from the PO rate |
| **PO Pending** (yellow) | PO Number or PO Rate is blank |
| **Check Rate** (grey) | Required data is incomplete, e.g. the rate matches but PO Amount is blank, or the rate matches but the amounts don't (usually a quantity difference) |

Details:

- **Tolerances.** Rates within ₹0.005 count as equal. Amounts within ₹1.00 count as equal, so rounding does not cause false mismatches. You can change `RATE_TOLERANCE` and `AMOUNT_TOLERANCE` at the top of `app.py`.
- **PO amount before GST.** Many POs show the amount before GST. If the PO Amount equals either the invoice Amount (with GST) **or** the Without GST value, the item counts as matched.
- **Invoice status.** If any item is *Rate Mismatch*, the invoice is *Rate Mismatch*. Otherwise, if any item is *PO Pending*, the invoice is *PO Pending*. Otherwise, if any item is *Check Rate*, the invoice is *Check Rate*. Only when every item is *Matched* is the invoice *Matched*.
- **Differences.** The amount difference is only counted for items that have a PO Amount, so items whose PO is still pending do not inflate the difference.

Hover over a status badge to see why it was given.

## 5. Dashboard

The dashboard shows totals for the chosen **Start Date** and **End Date**. It opens on the current month; quick buttons give Today, Yesterday, This Week, This Month, Last 30 Days and All.

- Cards: Total invoices, Total invoice value, Total PO value, Total difference, Matched items, Rate mismatch items, PO pending items and Total quantity. Click a status card to open the matching invoices.
- Charts: invoice value vs PO value by date, item PO status breakdown, and top vendors.
- Date-wise summary table: Date, Invoice Count, Invoice Value, PO Value, Difference. Click a date to open that day's invoices. This is the end-of-day check.

## 6. Search and filters (Invoices page)

- **Search** looks in Invoice No., Vendor Name, item Particulars, PO Number and HSN.
- **Filters:** Start Date, End Date, Vendor, Payment Status, PO Status and Invoice Received.

## 7. How to download the template

Click **Excel Template** in the top menu (or the link in the Import dialog). The file `invoice_import_template.xlsx` contains:

- an **Invoices** sheet with the correct headers, a sample invoice with 3 items (INV1001) and a second invoice with 1 item, plus drop-down lists for Invoice Type, Payment Status and Invoice Received;
- an **Instructions** sheet that explains every column.

Delete the sample rows before you enter your own data.

## 8. How to import Excel

1. Click **Import Excel**.
2. Choose or drag in an `.xlsx` file.
3. Choose what happens when an invoice already exists (same Invoice No. and Vendor): **Skip it** (the default) or **Replace it** with the data from Excel.
4. Click **Import**.

**Import format.** One row = one item. Columns (header names are not case-sensitive, and extra columns are ignored):

`Invoice Date, Invoice No., Vendor Name, Invoice Type, Payment Status, Invoice Received, Remarks, Particulars, HSN, Rate, Quantity, Unit, GST %, PO Date, PO Number, PO Rate, PO Amount`

Required: Invoice Date, Invoice No., Vendor Name, Particulars, Rate, Quantity.

**Grouping.** Rows with the same **Invoice Date + Invoice No. + Vendor Name** become **one invoice**. For example, three rows *INV1001 + Maida*, *INV1001 + Sugar* and *INV1001 + Salt* become one invoice with three items.

**Dates.** Real Excel date cells, Excel date numbers and text such as `01-10-2026`, `01/10/2026`, `2026-10-01` or `01 Oct 2026` are all accepted. Text dates are read **day first** (Indian format).

**Validation.** If any row has a problem, **nothing** is imported, and you get a list of the problems with their Excel row numbers (for example *"Row 5: Rate must be a number."*). Fix them and import again.

A file made with **Export Excel** can be imported again, so you can use it for backup and restore.

## 9. How to export Excel

Click **Export Excel**. The download contains the invoices you are currently looking at:

- on the **Invoices** page: the current search and all filters;
- on the **Dashboard**: the selected date range.

The `.xlsx` file has:

- an **Invoices** sheet with one row per item and these columns: SL No., Invoice Date, Invoice No., Vendor Name, Invoice Type, Payment Status, Invoice Received, Remarks, Particulars, HSN, Rate, Quantity, Unit, GST %, Without GST, Amount, PO Date, PO Number, PO Rate, PO Amount, PO Rate Difference, PO Amount Difference, PO Match Status;
- bold coloured headers, auto-filters, a frozen header row, number and date (DD-MM-YYYY) formatting, automatic column widths and colour-coded statuses;
- a **Summary** sheet with the totals and the filters that were used.

## 10. How OCR (Scan Invoice) works

1. Click **Scan Invoice** and choose a **JPG / JPEG / PNG** photo or a **PDF** of the invoice.
2. Click **Extract Data**. The app reads the text and tries to find the Invoice Date, Invoice Number, Vendor Name, PO Number, invoice total and the item lines (Particulars, HSN, Quantity, Unit, Rate, GST).
3. The **Add Invoice** form opens with those values filled in. Values found by OCR have a **yellow dashed background**, and a banner reminds you to check them. The banner also compares the total read from the image with the calculated total, and lets you see the raw text that was read.
4. Check and correct every value, add any PO details, then click **Save Invoice**.

**The invoice is never saved automatically.**

OCR is best-effort. Invoice layouts vary a lot, so expect to correct some values. For better results:

- photograph the invoice flat, straight, well lit and in focus;
- crop away the background;
- use a scanner app if you have one.

PDF support:

- **Digital PDFs** (created by billing software) are read directly from their text layer. This is accurate and does not need Tesseract.
- **Scanned PDFs** contain only an image. Take a photo or screenshot of the page and upload it as JPG/PNG instead.

## 11. How to configure OCR

Local OCR uses the free **Tesseract** engine through `pytesseract`. Tesseract is a separate program and must be installed on its own; `pip install` does not install it.

**Windows**

1. Download the installer from https://github.com/UB-Mannheim/tesseract/wiki
2. Install it to the default folder `C:\Program Files\Tesseract-OCR\`. The app finds it there automatically.
3. If you installed it somewhere else, set the path before starting the app:

   ```bash
   set TESSERACT_CMD=D:\Tools\Tesseract-OCR\tesseract.exe
   store-invoice
   ```

**macOS:** `brew install tesseract`  **Ubuntu/Debian:** `sudo apt install tesseract-ocr`

If Tesseract is not installed, the rest of the app works normally. **Scan Invoice** shows a clear message and offers to open the form for manual entry.

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `TESSERACT_CMD` | auto | Full path to `tesseract.exe` |
| `TESSERACT_LANG` | `eng` | Tesseract language(s), e.g. `eng+hin` (needs the language data installed) |
| `OCR_PROVIDER` | `tesseract` | Which OCR provider to use |

**Adding another OCR provider (e.g. a cloud API).** The OCR code in `app.py` is modular:

1. Create a class that inherits `BaseOCRProvider` and implements `extract_text(image_bytes, filename)`, returning plain text.
2. Read any API key from an **environment variable**. Never write keys into the code.
3. Register the class in `OCR_PROVIDERS = {...}` and start the app with `OCR_PROVIDER=<name>`.

The text is then passed through the same `parse_invoice_text()` field extractor.

## 12. Where the SQLite database is stored

All data is saved in one SQLite file, **`store_invoice.db`**. The app creates the file and its tables automatically on first start, and prints the exact path when it starts. Where the file lives depends on how you run the app:

| How you run it | Database location |
|---|---|
| `python app.py` (source folder) | `store_invoice.db` next to `app.py` |
| `store-invoice` (installed with buildall / pip) | Windows: `%LOCALAPPDATA%\StoreInvoice\store_invoice.db`; macOS/Linux: `~/.local/share/StoreInvoice/store_invoice.db` |

The installed version keeps the database in your user folder, so reinstalling or upgrading the app never deletes your data.

- **Backup:** close the app and copy `store_invoice.db` somewhere safe, or use **Export Excel**.
- **Different location:** start with `--db PATH`, or set `STORE_INVOICE_DB` (e.g. `set STORE_INVOICE_DB=D:\Data\store_invoice.db`).
- **Same data both ways:** to use the source-folder database with the installed app, run `store-invoice --db G:\path\to\store_invoice_flask\store_invoice.db`.
- **Tables:** `invoices` (header) and `invoice_items` (items, linked by `invoice_id` with `ON DELETE CASCADE`).

## 13. REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/invoices` | List invoices. Query parameters: `search, start_date, end_date, vendor, payment_status, po_status, invoice_received` |
| GET | `/api/invoices/<id>` | One invoice with its items, calculations and statuses |
| POST | `/api/invoices` | Create (JSON body: header fields + `items` list) → `201` |
| PUT | `/api/invoices/<id>` | Update header and replace items |
| DELETE | `/api/invoices/<id>` | Delete invoice and its items |
| GET | `/api/dashboard` | Totals, status counts, date-wise summary (`start_date, end_date`) |
| GET | `/api/export` | Download `.xlsx` (same filters as the list) |
| GET | `/api/template` | Download the import template |
| POST | `/api/import` | Upload `.xlsx` (`file`, optional `mode=skip|replace`) |
| POST | `/api/ocr` | Upload image/PDF (`file`) → extracted fields (nothing is saved) |
| GET | `/api/meta`, `/api/vendors` | Drop-down options and the vendor list for the UI |

Errors return JSON `{"error": "...", "details": [...]}` with status `400` (validation), `404`, `409` (duplicate invoice), `413` (file too large), `422`/`503` (OCR problems) or `500`. Server stack traces are logged to the console only and never sent to the browser.

## 14. Security and reliability notes

- All SQL uses parameterized queries.
- An invoice and all its items are saved in a single transaction, as is a whole Excel import.
- Uploads are checked by file extension **and** by file content, and are limited to **10 MB** (change this with the `MAX_UPLOAD_MB` environment variable).
- The app listens on `127.0.0.1` by default and runs with debug mode **off**.
- This is a single-user / small-team tool with **no login**. Do not expose it to the internet. To use it on a shared network, put it behind a proper web server (e.g. `pip install waitress` then `waitress-serve --port=5000 store_invoice.app:app`) and restrict access.

## 15. Project structure

```text
store_invoice_flask/
├── pyproject.toml          Package definition (uv build / pip install)
├── buildall.py             One-step build + install + self-test
├── app.py                  Run from source: python app.py
├── requirements.txt        Dependencies for running from source
├── README.md
├── store_invoice.db        SQLite database used by python app.py
└── store_invoice/          The installable Python package
    ├── __init__.py         Version number
    ├── __main__.py         python -m store_invoice
    ├── cli.py              store-invoice command (options, starts the server)
    ├── app.py              Flask app: API, calculations, Excel, OCR
    ├── templates/
    │   └── index.html      Minimal page shell
    └── static/
        ├── app.js          All UI: dashboard, lists, forms, dialogs, charts
        └── app.css         Styles (responsive)
```

Building creates `dist/` (the wheel and sdist), and `buildall.py` creates `.venv/`. Both are build output and are not part of the source.

**To release a new version:** change `__version__` in `store_invoice/__init__.py`, then run `python buildall.py`.
