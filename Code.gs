// Inventory Movement Monitor - Good vs Bad
// Paste this file into Google Apps Script as Code.gs.
// Create a second Apps Script file named index.html and paste the companion HTML there.

const IM_CONFIG = {
  SHEET_ID: '1dT7h1m8y3b97-58Bd6RG78H5WIuw4aGtSBhJ1kWGm7o',
  SUBJECT_FILTER: 'Export Job Complete - All facility Shelfwise Inventory',
  SEARCH_DAYS: 7,
  TARGET_EXPORT_HOUR: 9,
  FACILITIES: [
    'Aramex',
    'SL Ambient',
    'SL B2B ECOM',
    'SL BW',
    'SL Damage',
    'SL LJ',
    'SL Mother Hub',
    'SL MM',
    'SL B2B Offline',
    'SL Returns',
    'SL RX',
    'SL PM',
    'SL RM'
  ],
  TIMEZONE: 'Asia/Kolkata',
  EVENTS_SHEET: 'IM_Events',
  SNAPSHOT_SHEET: 'IM_TodaySnapshot',
  REMARK_ARCHIVE_SHEET: 'IM_RemarkArchive'
};

const IM_EVENT_HEADERS = [
  'EH_ID',
  'Date',
  'SKU',
  'Name',
  'Batch',
  'Facility',
  'MovementType',
  'Direction',
  'Impact',
  'ReasonGuess',
  'YesterdayGood',
  'YesterdayBad',
  'TodayGood',
  'TodayBad',
  'MovementQty',
  'TodayBadStatus',
  'Remark',
  'RemarkBy',
  'RemarkDate',
  'Status'
];

const IM_SNAPSHOT_HEADERS = [
  'Date',
  'SKU',
  'Name',
  'Batch',
  'Facility',
  'GoodQty',
  'BadQty',
  'GoodStatus',
  'BadStatus',
  'TotalQty'
];

const IM_REMARK_ARCHIVE_HEADERS = [
  'ArchiveDate',
  'EH_ID',
  'Date',
  'SKU',
  'Batch',
  'Facility',
  'Remark',
  'RemarkBy',
  'RemarkDate',
  'Status'
];

function runDailyInventoryMovementReport(options) {
  options = options || {};
  const exports = getLastTwoShelfwiseExports_();
  if (!exports) {
    throw new Error('Could not find two recent all-facility Shelfwise Inventory exports in Gmail.');
  }

  const yesterdayRows = fetchCsvAsObjects_(exports.yesterday.url);
  const todayRows = fetchCsvAsObjects_(exports.today.url);
  const result = analyzeInventoryMovement_(yesterdayRows, todayRows, exports.yesterday.date, exports.today.date);
  const coverage = buildImportCoverage_(yesterdayRows, todayRows);
  const preservedRemarks = options.flush === true ? collectExistingRemarkMap_() : {};
  const archivedRemarks = options.flush === true ? archiveRemarkMap_(preservedRemarks) : 0;

  if (options.flush === true) {
    clearReportData_();
  }
  saveEvents_(result.events, result.todayDateText, preservedRemarks);
  saveTodaySnapshot_(result.todaySnapshot, result.todayDateText);
  return {
    ok: true,
    flushed: options.flush === true,
    archivedRemarks: archivedRemarks,
    today: result.todayDateText,
    yesterday: result.yesterdayDateText,
    events: result.events.length,
    subject: IM_CONFIG.SUBJECT_FILTER,
    source: {
      today: exports.today.emailDateText,
      yesterday: exports.yesterday.emailDateText
    },
    rows: {
      today: todayRows.length,
      yesterday: yesterdayRows.length
    },
    facilities: {
      today: coverage.todayFacilities,
      yesterday: coverage.yesterdayFacilities
    },
    warnings: coverage.warnings
  };
}

function flushAndReimportInventoryMovementReport() {
  return runDailyInventoryMovementReport({ flush: true });
}

function flushInventoryMovementReportOnly() {
  const preservedRemarks = collectExistingRemarkMap_();
  const archivedRemarks = archiveRemarkMap_(preservedRemarks);
  clearReportData_();
  return {
    ok: true,
    flushed: true,
    archivedRemarks: archivedRemarks,
    message: 'Old movement events and snapshot have been cleared. Existing remarks were archived first.'
  };
}

function doGet(e) {
  const action = e && e.parameter ? e.parameter.action : '';
  if (action === 'events') {
    return jsonResponse_(e, getEventsForDashboard());
  }
  if (action === 'run') {
    return jsonResponse_(e, runDailyInventoryMovementReport());
  }
  if (action === 'flushRun' || action === 'reimport') {
    return jsonResponse_(e, flushAndReimportInventoryMovementReport());
  }
  if (action === 'flush') {
    return jsonResponse_(e, flushInventoryMovementReportOnly());
  }
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Inventory Movement Monitor')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    if (payload.action === 'saveRemark') {
      return jsonOutput_(saveMovementRemark(payload.ehId, payload.remark, payload.remarkBy));
    }
    if (payload.action === 'flushRun' || payload.action === 'reimport') {
      return jsonOutput_(flushAndReimportInventoryMovementReport());
    }
    if (payload.action === 'flush') {
      return jsonOutput_(flushInventoryMovementReportOnly());
    }
    return jsonOutput_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function getEventsForDashboard() {
  const rows = readSheetObjects_(IM_CONFIG.EVENTS_SHEET);
  const currentMonthRows = rows.filter(function(row) {
    const d = parseDateText_(row.Date);
    const now = new Date();
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const summary = currentMonthRows.reduce(function(acc, row) {
    const qty = toNumber_(row.MovementQty);
    if (row.Impact === 'Negative') {
      acc.negativeQty += qty;
      acc.negativeEvents += 1;
    } else if (row.Impact === 'Positive') {
      acc.positiveQty += qty;
      acc.positiveEvents += 1;
    }
    if (!acc.byFacility[row.Facility]) {
      acc.byFacility[row.Facility] = { negativeQty: 0, positiveQty: 0, events: 0 };
    }
    if (row.Impact === 'Negative') acc.byFacility[row.Facility].negativeQty += qty;
    if (row.Impact === 'Positive') acc.byFacility[row.Facility].positiveQty += qty;
    acc.byFacility[row.Facility].events += 1;
    if (row.Impact === 'Negative' && !String(row.Remark || '').trim()) acc.pendingRemarks += 1;
    return acc;
  }, {
    negativeQty: 0,
    positiveQty: 0,
    negativeEvents: 0,
    positiveEvents: 0,
    pendingRemarks: 0,
    byFacility: {}
  });

  return {
    ok: true,
    importSubject: IM_CONFIG.SUBJECT_FILTER,
    facilities: IM_CONFIG.FACILITIES,
    rows: currentMonthRows.reverse(),
    summary: summary
  };
}

function saveMovementRemark(ehId, remark, remarkBy) {
  ehId = String(ehId || '').trim();
  remark = String(remark || '').trim();
  remarkBy = String(remarkBy || '').trim();
  if (!ehId) return { ok: false, error: 'Missing event id' };
  if (!remark) return { ok: false, error: 'Remark is required' };

  const sh = ensureSheet_(IM_CONFIG.EVENTS_SHEET, IM_EVENT_HEADERS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: false, error: 'No events found' };

  const headers = values[0].map(String);
  const idCol = headers.indexOf('EH_ID') + 1;
  const remarkCol = headers.indexOf('Remark') + 1;
  const byCol = headers.indexOf('RemarkBy') + 1;
  const dateCol = headers.indexOf('RemarkDate') + 1;
  const statusCol = headers.indexOf('Status') + 1;

  for (let r = 2; r <= values.length; r++) {
    if (String(sh.getRange(r, idCol).getValue()).trim() === ehId) {
      sh.getRange(r, remarkCol).setValue(remark);
      sh.getRange(r, byCol).setValue(remarkBy);
      sh.getRange(r, dateCol).setValue(formatDate_(new Date()));
      sh.getRange(r, statusCol).setValue('Remarked');
      return { ok: true };
    }
  }

  return { ok: false, error: 'Event not found' };
}

function analyzeInventoryMovement_(yesterdayRows, todayRows, yesterdayDate, todayDate) {
  const yesterdayMap = buildInventoryMap_(yesterdayRows);
  const todayMap = buildInventoryMap_(todayRows);
  const allKeys = {};
  Object.keys(yesterdayMap).forEach(function(k) { allKeys[k] = true; });
  Object.keys(todayMap).forEach(function(k) { allKeys[k] = true; });

  const todayDateText = formatDate_(todayDate);
  const yesterdayDateText = formatDate_(yesterdayDate);
  const events = [];

  Object.keys(allKeys).forEach(function(key) {
    const y = yesterdayMap[key] || emptyInventoryRecordFrom_(todayMap[key]);
    const t = todayMap[key] || emptyInventoryRecordFrom_(yesterdayMap[key]);
    if (!t || !y) return;

    const goodDecrease = Math.max(0, y.goodQty - t.goodQty);
    const badIncrease = Math.max(0, t.badQty - y.badQty);
    const badDecrease = Math.max(0, y.badQty - t.badQty);
    const goodIncrease = Math.max(0, t.goodQty - y.goodQty);

    let matchedBadQty = 0;

    if (badIncrease > 0 && goodDecrease > 0) {
      matchedBadQty = Math.min(badIncrease, goodDecrease);
      const systemExpiry = isExpiryStatus_(t.badStatus);
      events.push(makeMovementEvent_({
        dateText: todayDateText,
        sku: t.sku,
        name: t.name || y.name,
        batch: t.batch,
        facility: t.facility,
        movementType: systemExpiry ? 'System Expiry to Bad' : 'Good to Bad',
        direction: 'GOOD_TO_BAD',
        impact: 'Negative',
        reasonGuess: systemExpiry ? 'System Triggered - Expiry workflow' : 'Manual movement to Bad - remark required',
        yGood: y.goodQty,
        yBad: y.badQty,
        tGood: t.goodQty,
        tBad: t.badQty,
        qty: matchedBadQty,
        badStatus: t.badStatus
      }));
    }

    const residualBadIncrease = Math.max(0, badIncrease - matchedBadQty);
    if (residualBadIncrease > 0) {
      const isNewBad = y.goodQty === 0 && y.badQty === 0;
      events.push(makeMovementEvent_({
        dateText: todayDateText,
        sku: t.sku,
        name: t.name || y.name,
        batch: t.batch,
        facility: t.facility,
        movementType: isNewBad ? 'Direct Bad GRN' : 'Bad Inventory Increase',
        direction: isNewBad ? 'DIRECT_BAD_GRN' : 'BAD_INCREASE',
        impact: 'Negative',
        reasonGuess: isExpiryStatus_(t.badStatus) ? 'Bad GRN with expiry status' : 'Bad stock added - remark required',
        yGood: y.goodQty,
        yBad: y.badQty,
        tGood: t.goodQty,
        tBad: t.badQty,
        qty: residualBadIncrease,
        badStatus: t.badStatus
      }));
    }

    if (badDecrease > 0 && goodIncrease > 0) {
      const recoveryQty = Math.min(badDecrease, goodIncrease);
      events.push(makeMovementEvent_({
        dateText: todayDateText,
        sku: t.sku,
        name: t.name || y.name,
        batch: t.batch,
        facility: t.facility,
        movementType: 'Bad to Good Recovery',
        direction: 'BAD_TO_GOOD',
        impact: 'Positive',
        reasonGuess: 'Recovery / correction - remark optional',
        yGood: y.goodQty,
        yBad: y.badQty,
        tGood: t.goodQty,
        tBad: t.badQty,
        qty: recoveryQty,
        badStatus: t.badStatus || y.badStatus
      }));
    }
  });

  events.sort(function(a, b) {
    if (a.Facility !== b.Facility) return a.Facility.localeCompare(b.Facility);
    if (a.Impact !== b.Impact) return a.Impact === 'Negative' ? -1 : 1;
    return toNumber_(b.MovementQty) - toNumber_(a.MovementQty);
  });

  return {
    todayDateText: todayDateText,
    yesterdayDateText: yesterdayDateText,
    events: events,
    todaySnapshot: Object.keys(todayMap).map(function(k) { return todayMap[k]; })
  };
}

function buildInventoryMap_(rows) {
  const map = {};
  rows.forEach(function(row) {
    const sku = getField_(row, ['Item Type SKU Code', 'SKU Code', 'SKU']);
    const name = getField_(row, ['Item Type Name', 'Item Name', 'Name', 'Product Name', 'Item Description']);
    const batch = getField_(row, ['Batch Code', 'Batch ID', 'Vendor Batch Number', 'Batch']);
    const facilityRaw = getField_(row, ['Facility']);
    const facility = canonicalFacility_(facilityRaw);
    const inventoryType = String(getField_(row, ['Inventory Type'])).trim().toUpperCase();
    const batchStatus = normalizeStatus_(getField_(row, ['Batch Status', 'Status']));
    const qty = toNumber_(getField_(row, ['Quantity', 'Qty', 'Available Quantity']));

    if (!sku || !facility || !batch || qty === 0) return;
    if (inventoryType !== 'GOOD_INVENTORY' && inventoryType !== 'BAD_INVENTORY') return;

    const key = [sku, batch, facility].join('||');
    if (!map[key]) {
      map[key] = {
        sku: sku,
        name: name,
        batch: batch,
        facility: facility,
        goodQty: 0,
        badQty: 0,
        goodStatus: '',
        badStatus: '',
        goodStatusQty: {},
        badStatusQty: {}
      };
    }

    if (name && !map[key].name) map[key].name = name;
    if (inventoryType === 'GOOD_INVENTORY') {
      map[key].goodQty += qty;
      addStatusQty_(map[key].goodStatusQty, batchStatus, qty);
      map[key].goodStatus = dominantStatus_(map[key].goodStatusQty);
    }
    if (inventoryType === 'BAD_INVENTORY') {
      map[key].badQty += qty;
      addStatusQty_(map[key].badStatusQty, batchStatus, qty);
      map[key].badStatus = dominantStatus_(map[key].badStatusQty);
    }
  });
  return map;
}

function makeMovementEvent_(x) {
  const id = [x.dateText, x.sku, x.batch || '', x.facility, x.direction].join('|');
  return {
    EH_ID: id,
    Date: x.dateText,
    SKU: x.sku || '',
    Name: x.name || '',
    Batch: x.batch || '',
    Facility: x.facility || '',
    MovementType: x.movementType || '',
    Direction: x.direction || '',
    Impact: x.impact || '',
    ReasonGuess: x.reasonGuess || '',
    YesterdayGood: x.yGood || 0,
    YesterdayBad: x.yBad || 0,
    TodayGood: x.tGood || 0,
    TodayBad: x.tBad || 0,
    MovementQty: x.qty || 0,
    TodayBadStatus: x.badStatus || '',
    Remark: '',
    RemarkBy: '',
    RemarkDate: '',
    Status: x.impact === 'Negative' ? 'Pending Remark' : 'Open'
  };
}

function saveEvents_(events, dateText, preservedRemarks) {
  preservedRemarks = preservedRemarks || {};
  const sh = ensureSheet_(IM_CONFIG.EVENTS_SHEET, IM_EVENT_HEADERS);
  const data = sh.getDataRange().getValues();
  const oldById = {};
  const keptRows = [];

  if (data.length > 1) {
    const headers = data[0].map(String);
    const idIdx = headers.indexOf('EH_ID');
    const dateIdx = headers.indexOf('Date');
    data.slice(1).forEach(function(row) {
      const id = String(row[idIdx] || '').trim();
      if (String(row[dateIdx] || '').trim() === dateText) {
        oldById[id] = row;
      } else {
        keptRows.push(row);
      }
    });
  }

  const newRows = events.map(function(event) {
    const old = oldById[event.EH_ID];
    if (old) {
      const oldRemark = String(old[16] || '').trim();
      const oldBy = String(old[17] || '').trim();
      const oldDate = String(old[18] || '').trim();
      event.Remark = oldRemark;
      event.RemarkBy = oldBy;
      event.RemarkDate = oldDate;
      event.Status = oldRemark ? 'Remarked' : event.Status;
    } else if (preservedRemarks[event.EH_ID]) {
      event.Remark = preservedRemarks[event.EH_ID].Remark;
      event.RemarkBy = preservedRemarks[event.EH_ID].RemarkBy;
      event.RemarkDate = preservedRemarks[event.EH_ID].RemarkDate;
      event.Status = event.Remark ? 'Remarked' : event.Status;
    }
    return IM_EVENT_HEADERS.map(function(h) { return event[h]; });
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, IM_EVENT_HEADERS.length).setValues([IM_EVENT_HEADERS]).setFontWeight('bold');
  const out = keptRows.concat(newRows);
  if (out.length) sh.getRange(2, 1, out.length, IM_EVENT_HEADERS.length).setValues(out);
  sh.setFrozenRows(1);
}

function saveTodaySnapshot_(records, dateText) {
  const sh = ensureSheet_(IM_CONFIG.SNAPSHOT_SHEET, IM_SNAPSHOT_HEADERS);
  const rows = records.map(function(r) {
    return [
      dateText,
      r.sku,
      r.name || '',
      r.batch,
      r.facility,
      r.goodQty,
      r.badQty,
      r.goodStatus,
      r.badStatus,
      r.goodQty + r.badQty
    ];
  });
  sh.clearContents();
  sh.getRange(1, 1, 1, IM_SNAPSHOT_HEADERS.length).setValues([IM_SNAPSHOT_HEADERS]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, IM_SNAPSHOT_HEADERS.length).setValues(rows);
  sh.setFrozenRows(1);
}

function clearReportData_() {
  resetSheet_(IM_CONFIG.EVENTS_SHEET, IM_EVENT_HEADERS);
  resetSheet_(IM_CONFIG.SNAPSHOT_SHEET, IM_SNAPSHOT_HEADERS);
}

function collectExistingRemarkMap_() {
  const rows = readSheetObjects_(IM_CONFIG.EVENTS_SHEET);
  return rows.reduce(function(acc, row) {
    const id = String(row.EH_ID || '').trim();
    const remark = String(row.Remark || '').trim();
    if (!id || !remark) return acc;
    acc[id] = {
      EH_ID: id,
      Date: row.Date || '',
      SKU: row.SKU || '',
      Batch: row.Batch || '',
      Facility: row.Facility || '',
      Remark: remark,
      RemarkBy: row.RemarkBy || '',
      RemarkDate: row.RemarkDate || '',
      Status: row.Status || ''
    };
    return acc;
  }, {});
}

function archiveRemarkMap_(remarkMap) {
  const ids = Object.keys(remarkMap || {});
  if (!ids.length) return 0;
  const sh = ensureSheet_(IM_CONFIG.REMARK_ARCHIVE_SHEET, IM_REMARK_ARCHIVE_HEADERS);
  const archiveDate = formatDateTime_(new Date());
  const rows = ids.map(function(id) {
    const r = remarkMap[id];
    return [
      archiveDate,
      r.EH_ID,
      r.Date,
      r.SKU,
      r.Batch,
      r.Facility,
      r.Remark,
      r.RemarkBy,
      r.RemarkDate,
      r.Status
    ];
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, IM_REMARK_ARCHIVE_HEADERS.length).setValues(rows);
  return rows.length;
}

function resetSheet_(sheetName, headers) {
  const sh = ensureSheet_(sheetName, headers);
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
}

function buildImportCoverage_(yesterdayRows, todayRows) {
  const yesterdayFacilities = listFacilitiesInRows_(yesterdayRows);
  const todayFacilities = listFacilitiesInRows_(todayRows);
  const warnings = [];
  const missingYesterday = missingFacilities_(yesterdayFacilities);
  const missingToday = missingFacilities_(todayFacilities);

  if (yesterdayFacilities.length <= 1) {
    warnings.push('Yesterday import has only ' + yesterdayFacilities.length + ' facility. Please verify the all-facility export email.');
  }
  if (todayFacilities.length <= 1) {
    warnings.push('Today import has only ' + todayFacilities.length + ' facility. Please verify the all-facility export email.');
  }
  if (missingYesterday.length) {
    warnings.push('Yesterday missing facilities: ' + missingYesterday.join(', '));
  }
  if (missingToday.length) {
    warnings.push('Today missing facilities: ' + missingToday.join(', '));
  }

  return {
    yesterdayFacilities: yesterdayFacilities,
    todayFacilities: todayFacilities,
    warnings: warnings
  };
}

function listFacilitiesInRows_(rows) {
  const seen = {};
  rows.forEach(function(row) {
    const facility = canonicalFacility_(getField_(row, ['Facility']));
    if (facility) seen[facility] = true;
  });
  return Object.keys(seen).sort();
}

function missingFacilities_(foundFacilities) {
  const found = {};
  foundFacilities.forEach(function(f) { found[f] = true; });
  return IM_CONFIG.FACILITIES.filter(function(f) { return !found[f]; });
}

function getLastTwoShelfwiseExports_() {
  const threads = GmailApp.search('subject:"' + IM_CONFIG.SUBJECT_FILTER + '" newer_than:' + IM_CONFIG.SEARCH_DAYS + 'd', 0, 60);
  const found = [];

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (String(msg.getSubject() || '').trim() !== IM_CONFIG.SUBJECT_FILTER) return;
      const body = msg.getPlainBody() + '\n' + msg.getBody();
      const url = extractCsvUrl_(body);
      if (!url) return;
      const d = msg.getDate();
      const hour = parseInt(Utilities.formatDate(d, IM_CONFIG.TIMEZONE, 'HH'), 10);
      found.push({
        url: url,
        date: d,
        emailDateText: Utilities.formatDate(d, IM_CONFIG.TIMEZONE, 'dd MMM yyyy HH:mm'),
        dayKey: Utilities.formatDate(d, IM_CONFIG.TIMEZONE, 'yyyy-MM-dd'),
        hour: hour
      });
    });
  });

  const byDay = {};
  const seenUrls = {};
  found.sort(function(a, b) { return a.date - b.date; }).forEach(function(item) {
    if (seenUrls[item.url]) return;
    seenUrls[item.url] = true;
    if (!byDay[item.dayKey]) byDay[item.dayKey] = [];
    byDay[item.dayKey].push(item);
  });

  const days = Object.keys(byDay).sort().reverse();
  if (days.length < 2) return null;

  function pickBest(dayKey) {
    return byDay[dayKey].slice().sort(function(a, b) {
      return Math.abs(a.hour - IM_CONFIG.TARGET_EXPORT_HOUR) - Math.abs(b.hour - IM_CONFIG.TARGET_EXPORT_HOUR);
    })[0];
  }

  return {
    today: pickBest(days[0]),
    yesterday: pickBest(days[1])
  };
}

function fetchCsvAsObjects_(url) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('CSV fetch failed with HTTP ' + response.getResponseCode());
  }
  const csv = Utilities.parseCsv(response.getContentText());
  if (csv.length < 2) return [];
  const headers = csv[0].map(function(h) { return String(h || '').trim(); });
  return csv.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = String(row[i] == null ? '' : row[i]).trim();
    });
    return obj;
  });
}

function extractCsvUrl_(text) {
  const match = String(text || '').match(/https:\/\/[^\s"'<>]+\.csv(?:\?[^\s"'<>]+)?/i);
  return match ? match[0].trim() : '';
}

function canonicalFacility_(facility) {
  const raw = String(facility || '').trim();
  if (!raw) return '';
  const normalized = normalizeText_(raw);
  const aliases = {
    'aramex': 'Aramex',
    'sl ambient': 'SL Ambient',
    'sl ambien': 'SL Ambient',
    'sl b2b ecom': 'SL B2B ECOM',
    'sl b2b eco': 'SL B2B ECOM',
    'sl bw': 'SL BW',
    'sl damage': 'SL Damage',
    'sl lj': 'SL LJ',
    'sl mother hub': 'SL Mother Hub',
    'sl mm': 'SL MM',
    'sl b2b offline': 'SL B2B Offline',
    'sl b2b offl': 'SL B2B Offline',
    'sl returns': 'SL Returns',
    'sl return': 'SL Returns',
    'sl rx': 'SL RX',
    'sl pm': 'SL PM',
    'sl rm': 'SL RM'
  };
  if (aliases[normalized]) return aliases[normalized];
  const exact = IM_CONFIG.FACILITIES.find(function(f) {
    return normalizeText_(f) === normalized;
  });
  return exact || '';
}

function normalizeText_(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeStatus_(status) {
  const s = String(status || '').trim();
  const n = normalizeText_(s);
  if (!n) return '';
  if (n === 'about to expire' || n === 'about to expiry' || n === 'about to expired') return 'About_to_expire';
  if (n === 'about_to_expire') return 'About_to_expire';
  if (n === 'expired' || n === 'expire') return 'Expired';
  if (n === 'active') return 'Active';
  return s;
}

function isExpiryStatus_(status) {
  return status === 'About_to_expire' || status === 'Expired';
}

function addStatusQty_(bucket, status, qty) {
  const key = status || 'Unknown';
  bucket[key] = (bucket[key] || 0) + qty;
}

function dominantStatus_(bucket) {
  let best = '';
  let bestQty = -1;
  Object.keys(bucket).forEach(function(status) {
    if (bucket[status] > bestQty) {
      best = status;
      bestQty = bucket[status];
    }
  });
  return best;
}

function emptyInventoryRecordFrom_(rec) {
  if (!rec) return null;
  return {
    sku: rec.sku,
    name: rec.name,
    batch: rec.batch,
    facility: rec.facility,
    goodQty: 0,
    badQty: 0,
    goodStatus: '',
    badStatus: '',
    goodStatusQty: {},
    badStatusQty: {}
  };
}

function getField_(row, names) {
  for (let i = 0; i < names.length; i++) {
    if (row[names[i]] != null && String(row[names[i]]).trim() !== '') {
      return String(row[names[i]]).trim();
    }
  }
  const keys = Object.keys(row);
  const normalizedNames = names.map(normalizeText_);
  for (let k = 0; k < keys.length; k++) {
    if (normalizedNames.indexOf(normalizeText_(keys[k])) >= 0) {
      return String(row[keys[k]] == null ? '' : row[keys[k]]).trim();
    }
  }
  return '';
}

function ensureSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.openById(IM_CONFIG.SHEET_ID);
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSheetObjects_(sheetName) {
  const ss = SpreadsheetApp.openById(IM_CONFIG.SHEET_ID);
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  return data.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = row[i] instanceof Date ? formatDate_(row[i]) : String(row[i] == null ? '' : row[i]).trim();
    });
    return obj;
  });
}

function parseDateText_(text) {
  if (text instanceof Date) return text;
  const s = String(text || '').trim();
  if (!s) return null;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const parts = s.split(/[\s\-\/]+/);
  if (parts.length >= 3) {
    const m = months[String(parts[1]).toLowerCase().slice(0, 3)];
    const d = parseInt(parts[0], 10);
    const y = parseInt(parts[2], 10);
    if (m !== undefined && d && y) return new Date(y, m, d);
  }
  return null;
}

function formatDate_(date) {
  return Utilities.formatDate(date, IM_CONFIG.TIMEZONE, 'dd MMM yyyy');
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, IM_CONFIG.TIMEZONE, 'dd MMM yyyy HH:mm:ss');
}

function toNumber_(value) {
  const n = parseFloat(String(value == null ? '' : value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse_(e, payload) {
  const callback = e && e.parameter ? String(e.parameter.callback || '').trim() : '';
  if (callback && /^[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOutput_(payload);
}
