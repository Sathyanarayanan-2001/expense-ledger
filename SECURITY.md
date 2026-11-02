# Security

## Reporting a problem

Please report security problems through [private vulnerability reporting](https://github.com/Sathyanarayanan-2001/expense-ledger/security/advisories/new) rather than a public issue.

## Data

Entries stay in your browser and the folder you choose. The folder's protection is whatever your device and OneDrive provide, and save files and backups aren't encrypted. Anyone who can open the folder or a backup file can read your ledger, so keep them in a private folder.

The page can only load its own files and makes no outside requests. A Content-Security-Policy in the page enforces this.

## Dependencies

The built page has no runtime dependencies other than an embedded font. Build and test tools are updated through Dependabot.
