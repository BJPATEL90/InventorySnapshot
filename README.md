# Inventory Snapshot

Good vs Bad inventory movement tracker for selected Mosaic facilities.

## Scope

The report compares yesterday vs today inventory using:

```text
SKU + Batch + Facility
```

It tracks only:

- `GOOD_INVENTORY`
- `BAD_INVENTORY`

## Facilities

- Aramex
- SL Ambient
- SL B2B ECOM
- SL BW
- SL Damage
- SL LJ
- SL Mother Hub
- SL MM
- SL B2B Offline
- SL Returns
- SL RX
- SL PM
- SL RM

## Movement Types

- `GOOD_TO_BAD`: Good quantity decreased and Bad quantity increased.
- `DIRECT_BAD_GRN`: Bad quantity appeared where no Good/Bad record existed yesterday.
- `BAD_INCREASE`: Bad increased beyond the matched Good decrease.
- `BAD_TO_GOOD`: Bad decreased and Good increased, treated as recovery.

## Files

- `Code.gs`: Google Apps Script backend.
- `index.html`: dashboard UI. Works inside Apps Script and on GitHub Pages.
- `docs/implementation-notes.md`: detailed logic notes.

## Apps Script Setup

1. Open the target Google Sheet.
2. Open Extensions > Apps Script.
3. Paste `Code.gs`.
4. Create an HTML file named `index`.
5. Paste `index.html`.
6. Run `runDailyInventoryMovementReport()` once and approve permissions.
7. Deploy as Web App with access allowed for the intended users.

The configured sheet ID is:

```text
1dT7h1m8y3b97-58Bd6RG78H5WIuw4aGtSBhJ1kWGm7o
```

## GitHub Pages Setup

After deploying Apps Script as a Web App, copy the `/exec` URL and paste it into this line in `index.html`:

```js
var GAS_WEB_APP_URL = 'PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Then enable GitHub Pages for this repository.
