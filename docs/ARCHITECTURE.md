# Architecture

Expense ledger is a static single-page app with no backend.

## Source layout

| File | Purpose |
| --- | --- |
| `src/model.js` | Stored data shape and merge. Pure functions with no DOM or storage, so they also run in Node tests. |
| `src/core.js` | Dates, accounts, categories, totals, budgets, reconciliation, import and export rows. No DOM access. |
| `src/store.js` | IndexedDB storage on the device, and backup and restore. |
| `src/sync.js` | Folder sync using the File System Access API. |
| `src/main.js` | Page shell, navigation, themes, install prompt and start-up. |
| `src/page-*.js` | One file per page: dash (Start and Dashboard), entry, records, budget, setup and import. |
| `src/xlsx.js`, `src/ioformat.js` | Reading and writing Excel and CSV without outside libraries. |
| `src/app.css` | Styles and light and dark themes. |
| `src/sw.js` | Service worker: network first, cached page offline. |
| `src/manifest.webmanifest` | Lets the page be installed as an app. |

## Data model

Everything lives in one object, so it can be saved to a file and merged with another copy:

```text
txns    id -> entry (date, slot, type, bank, amount, category, notes ...)
marks   'YYYY-MM-DD|slot' -> { v }        a slot marked "no spend"
recon   id -> bank balance check
cfg     start date and targets, banks and categories (by id), budgets (by category), display order
```

Money is held in whole paise, so totals are exact. Financial years run 1 April to 31 March.

Accounts have a kind: bank, cash, online wallet, credit card, or savings or investment.

- Bank, cash, wallet and card accounts are computed from entries: opening balance plus deposits minus withdrawals. They make up the closing balance, and each is reconciled against a balance you record.
- A savings or investment account is a holding. It takes no entries. Its value on a date is the latest value you recorded on or before that date, or the value entered in Setup when nothing is recorded yet. A record dated the start day beats the start value. `Core.holdings` returns each account's value, its previous value and the change, and the net worth is the closing balance plus the total.
- Recorded values share the `recon` table with bank balance checks, so they merge, sync and delete the same way.

## Sync

Every record has an update time `u`. Deleted entries and balance checks stay behind as `{ d: 1, u }` so the deletion travels to other devices too.

- Two copies of a record meet: the newer `u` wins. An exact tie is settled by comparing the records' text, so every device ends up with the same result.
- Settings are stored as separate items, and only items that really changed get a new time. A device that never touched a setting can't overwrite another device's change to it.
- Save files are named `ledger-save-<UTC time>-<device>.json.gz`. A session writes one file, overwriting it as work continues, and files beyond the newest 3 are removed.
- When the page opens or comes back into view, every unread save is merged. A file that can't be read yet is skipped and tried again, because sync apps can deliver files partway through.
- Saving happens about 3 seconds after a change, and straight away when the page is hidden.

The merge is commutative, associative and idempotent, so the order and number of times saves are read doesn't matter. `tests/sync.js` checks this on randomised data.

## Offline and updates

The service worker serves the newest page when online and the cached page otherwise. It only deletes caches whose names start with `expense-ledger-`, because every project on one GitHub Pages account shares a browser origin.

## Privacy

The page's Content-Security-Policy allows only the page's own files, so it can't send data anywhere. Tests confirm the page makes no outside requests.

## Build

`scripts/build.mjs` inlines the font, CSS and JavaScript into `dist/index.html`, and copies the icons, manifest and service worker beside it. Update the font by changing `package.json`, then run `npm test`.

## Tests

| Command | What it checks |
| --- | --- |
| `node tests/unit.js` | Totals, budgets, reconciliation and dates, checked against hand-worked figures. |
| `node tests/io.js` | Excel and CSV reading and writing. |
| `node tests/sync.js` | Merge rules (including randomised checks that merging is commutative, associative and idempotent), settings merging and folder sync against a fake folder. |
| `node tests/e2e.mjs` | Every page in a real browser, several devices, install files and privacy. |
