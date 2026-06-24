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

# Inventory Movement Monitor

## What This Module Tracks

This version is scoped to the facilities you confirmed and compares only:

- `GOOD_INVENTORY`
- `BAD_INVENTORY`

The matching key is:

```text
SKU + Batch + Facility
```

Shelf is intentionally not included.

## Facility List

The module filters to these facilities:

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

The script also accepts close variants like `SL Ambien`, `SL B2B ECO`, and `SL B2B Offl`.

## Movement Logic

### Good to Bad

If yesterday Good decreases and today Bad increases for the same SKU, batch, and facility, it records:

```text
GOOD_TO_BAD
```

If today Bad status is `About_to_expire` or `Expired`, the reason guess is:

```text
System Triggered - Expiry workflow
```

Otherwise it is marked:

```text
Manual movement to Bad - remark required
```

### Direct Bad GRN

If there was no Good or Bad quantity yesterday and today Bad appears, it records:

```text
DIRECT_BAD_GRN
```

### Bad Inventory Increase

If Bad increases but there is not enough Good decrease to explain it, the extra quantity is recorded separately:

```text
BAD_INCREASE
```

This catches partial cases cleanly.

### Bad to Good Recovery

If yesterday Bad decreases and today Good increases, it records:

```text
BAD_TO_GOOD
```

This is treated as positive recovery.

## Dashboard Rework Added

- Status filter for values such as `Active`, `Recalled`, `About_to_expire`, and `Expired`.
- Movement filter for `Good to Bad`, `Bad to Good Recovery`, `Bad Inventory Increase`, `Direct Bad GRN`, and other movement labels present in the data.
- Top date ribbon showing:
  - Today date
  - Latest movement done date captured in the current month data
- Facility Dashboard with KPI cards for:
  - Good to Bad quantity
  - Direct Bad GRN quantity
  - Bad Inventory Increase quantity
  - Bad to Good Recovery quantity
  - Pending comments
  - Event count

The Facility Dashboard responds to the active filters, so it can be used for facility-level review after filtering by status, movement, or impact.

## Sheets Created

The Apps Script creates and maintains:

- `IM_Events`: movement rows plus free-text remarks
- `IM_TodaySnapshot`: today's filtered Good/Bad stock summary

## Setup

1. Create or open a Google Sheet for your report.
2. Open Apps Script.
3. Paste `Code.gs` into Apps Script.
4. Create an HTML file named `index`.
5. Paste `index.html` into that file.
6. Confirm the configured Google Sheet ID is:

```text
1dT7h1m8y3b97-58Bd6RG78H5WIuw4aGtSBhJ1kWGm7o
```

7. Run `runDailyInventoryMovementReport()` once and approve permissions.
8. Deploy as a web app to use the dashboard.
9. Optional: create a daily trigger for `runDailyInventoryMovementReport`.

## GitHub Pages Setup

If the dashboard is hosted from GitHub Pages, update this line in `index.html` after deploying Apps Script:

```text
var GAS_WEB_APP_URL = 'PASTE_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE';
```

Use the Apps Script `/exec` web app URL.

The same HTML also works inside Apps Script. In that case it uses `google.script.run` and does not need the GitHub Pages URL.
