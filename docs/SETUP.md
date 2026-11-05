# Setup guide

Do this once on each device. It needs no account and no sign-in inside the app.

## How sync works

Each device keeps its own copy of the ledger in its browser. If you choose a sync folder, the app also writes a save file into it, and a OneDrive sync app moves that file between your devices. When the app opens, and whenever you come back to it, it merges every save it hasn't read yet, entry by entry, and the newest edit wins. Entries added on two devices both survive. The folder keeps the last 3 sessions.

## Laptops (Windows, Chrome or Edge)

1. Check the OneDrive desktop app is running.
2. Create a folder such as `OneDrive\Expense ledger`.
3. Open the [app](https://sathyanarayanan-2001.github.io/expense-ledger/). In the address bar choose the install icon, or the browser menu and **Install Daily Expense Ledger**.
4. Open the installed app, go to **Setup** and choose **Choose sync folder**.
5. Pick the folder and allow access. Choose **Allow on every visit** if the browser offers it.

Use the same folder on every laptop. On a work laptop, IT policy may stop a personal OneDrive from syncing.

## Android phone

The OneDrive app doesn't keep a synced folder on the phone, so this needs a separate sync app.

1. Install a OneDrive sync app, such as OneSync, and check its free limits.
2. Set up two-way sync between the `Expense ledger` OneDrive folder and a folder on the phone.
3. Open the app in Chrome, then use the Chrome menu and **Install app** (or **Add to Home screen**). Installed apps keep folder permission.
4. Open it from the home screen, go to **Setup**, choose **Choose sync folder** and pick the phone folder.

Folder access needs Chrome 132 or later on Android.

## iPhone, Firefox and Safari

These browsers can't open folders, so folder sync isn't available. The app still works, and you can move data between devices with a backup file: **Download backup** on one device, then **Restore from backup** on the other.

## Moving a ledger to another device or browser

1. On the device that holds your entries, open the app, go to **Setup** and choose **Download backup**. Note the entry count on the **Records** page.
2. Open the app on the new device, go to **Setup** and choose **Restore from backup**, then pick the file. Check the entry count and the closing balances on the **Dashboard**.
3. Choose the sync folder as above. The first device writes everything into it, and your other devices receive it when they connect.

Restoring merges the file into what is already there and never deletes anything, so doing it twice is safe. A backup is also how you move to a new browser, or onto an iPhone.

## Online wallets and savings accounts

Add these in **Setup**, under **Accounts**. The quick-add buttons fill in the name and type for RailOne, Paytm, PhonePe, Amazon Pay, Mobikwik, EPFO, PPF, NPS, fixed deposits, mutual funds, stocks and gold. You can type any other name.

**Online wallet** (RailOne, Paytm and similar)

1. Add it as an **Online wallet** with the balance it held on the tracking start date.
2. Top it up with an **Own transfer** from your bank to the wallet.
3. Log spends with the wallet as the account. The mode becomes **Wallet**.
4. Cashback or refunds are **Income**.
5. To check it, record the balance shown in the wallet app under **Record bank balance** on the Dashboard.

**Savings or investment** (EPFO, PPF, NPS, deposits, funds)

1. Add it as **Savings or investment** with its value on the tracking start date.
2. Whenever you look at the passbook or statement, record the value on the Dashboard under **Savings and investments value**.
3. The latest value counts. The card shows its change since the previous value, the total, and your net worth (closing balance plus these values).
4. These accounts take no entries and stay out of the closing balance. Money you move into them from your bank is still logged as a **Savings and investment** entry.

## Check it works

1. Log an entry on the phone.
2. Let the sync app run.
3. Open the app on a laptop and check the entry is there.

## Importing from Excel or CSV

Go to **Records** and choose **Import**, or use **Import from Excel or CSV** in **Setup**. Columns are matched by name and you see a preview before anything is saved. **Blank template** in **Setup** gives you a file with the right columns. Rows already present are skipped.

## Backups

The sync folder holds only the last 3 sessions. To keep a long-term copy, go to **Setup** and choose **Download backup**. Keep the file somewhere private. It holds your whole ledger and isn't encrypted.

## Publishing your own copy

1. Fork this repository, or create a new one and push this code to `main`.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Each push to `main` runs the tests and deploys. The address is `https://<your-name>.github.io/<repository>/`.

Every project under one GitHub Pages account shares a browser origin, so an app's saved data is separate only by its database name. This app uses its own database, `expense-ledger`, and only removes its own cached files.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| An entry is missing on another device | Check the sync app has run, then reopen the page. |
| Asked to allow folder access | Choose **Allow**. Browsers can ask again after a restart. |
| New browser, or browser data cleared | Choose the sync folder again and the last save loads, or restore a backup. |
| No folder button | Use Chrome or Edge. Firefox and Safari can't open folders. |
| The page looks out of date | Close every tab of the app and open it again. It updates itself when online. |
