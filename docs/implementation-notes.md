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
