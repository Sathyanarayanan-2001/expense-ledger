# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [2.1.0] - 2026-11-05

### Added

- Online wallet accounts, such as RailOne and Paytm. They count in the closing balance, reconcile against the wallet app's balance and have a Wallet payment mode.
- Savings or investment accounts, such as EPFO, PPF, NPS, deposits and funds. You record the value from the passbook or statement, and the Dashboard shows each account's latest value, its change since the previous value, the total, and your net worth.
- Quick-add buttons in Setup for common wallets and savings accounts.
- Guide text and troubleshooting for wallets, savings values and net worth.

### Changed

- The closing balance leaves savings and investment accounts out. They add to net worth instead.
- The bank reconciliation, the Add page, the Records bank filter and import matching list spendable accounts only.

## [2.0.0] - 2026-11-02

First public release. The ledger previously lived in a single private page whose data was kept in a shared database. It now runs from GitHub Pages and keeps data on your own devices.

### Added

- Install as an app on laptops and Android phones, with offline use.
- Sync between devices through a chosen folder (OneDrive or any sync app). Each record merges on its own and the newest edit wins, so entries added on two devices both survive.
- Backup and restore as one JSON file. Restoring merges and never deletes.
- Guide page with set-up steps for laptops and Android, moving an existing ledger, and troubleshooting.
- Automated unit and browser tests, and a build and deploy pipeline.

### Changed

- Entries are stored in the browser (IndexedDB) instead of the shared database.
- Excel and CSV import and export use built-in code, so the page needs no outside libraries.
- The page can only talk to itself (Content-Security-Policy).

### Removed

- The shared database and the external spreadsheet library fallback.
