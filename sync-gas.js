/**
 * GAS: Gold Leaf CRM — Offline-First Google Sheets Sync
 * 1. Öffne https://script.google.com/
 * 2. Neues Projekt → füge dieses Skript ein
 * 3. Ändere SHEET_ID in deine tatsächliche Tabellen-ID
 * 4. Ändere SYNC_TOKEN unten in ein eigenes, geheimes Passwort
 *    (dasselbe Token dann in der App unter Sync → "Sync-Token" eintragen)
 * 5. Bereitstellen → "Neue Bereitstellung" → Typ: Web-App
 *    - Wer: Jeder
 *    - Zugriff: Jeder, auch anonym
 *    (Das ist bei Apps Script Web Apps normal — die Absicherung läuft über
 *    das SYNC_TOKEN unten, nicht über den Google-Zugriffslevel.)
 * 6. URL kopieren und in die App einfügen
 */

const SHEET_ID = 'DEINE_SHEET_ID_HIER';
const SYNC_TOKEN = 'AENDERE_MICH_ZU_EINEM_GEHEIMEN_PASSWORT';
const app = SpreadsheetApp.openById(SHEET_ID);

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== SYNC_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ok: false, error: 'Unauthorized'})).setMimeType(ContentService.MimeType.JSON);
    }
    const appId = body.appId;
    const payload = body.payload || {};
    const customers = payload.customers || [];
    const visits = payload.visits || [];
    const payments = payload.payments || [];

    let sheet = app.getSheetByName('CRM Data');
    if (!sheet) {
      sheet = app.insertSheet('CRM Data');
      sheet.appendRow(['type', 'id', 'customerId', 'name', 'shop', 'phone', 'email', 'address', 'lat', 'lng', 'role', 'category', 'date', 'visitType', 'amount', 'paid', 'qty', 'method', 'note', 'createdAt', 'updatedAt', '_synced', 'appId']);
      sheet.setFrozenRows(1);
    }

    const records = [];
    customers.forEach(function(c) {
      records.push(['customer', c.id, '', c.name||'', c.shop||'', c.phone||'', c.email||'', c.address||'', c.lat||'', c.lng||'', c.role||'', c.category||'', '', '', '', '', '', '', c.createdAt||'', c.updatedAt||'', 'true', appId]);
    });
    visits.forEach(function(v) {
      records.push(['visit', v.id, v.customerId||'', '', v.shop||'', '', '', '', '', '', '', '', v.date||'', v.type||'', v.amount||0, v.paid||0, v.qty||0, '', v.notes||'', v.createdAt||'', v.updatedAt||'', 'true', appId]);
    });
    payments.forEach(function(p) {
      records.push(['payment', p.id, p.customerId||'', '', '', '', '', '', '', '', '', '', p.date||'', '', p.amount||0, '', '', p.method||'', p.note||'', p.createdAt||'', p.updatedAt||'', 'true', appId]);
    });

    if (records.length > 0) {
      const lastRow = sheet.getLastRow();
      const existingKeys = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
      const rowByKey = {};
      existingKeys.forEach(function(r, i) {
        rowByKey[r[0] + '|' + r[1]] = i + 2;
      });

      const toAppend = [];
      records.forEach(function(rec) {
        const key = rec[0] + '|' + rec[1];
        const rowNum = rowByKey[key];
        if (rowNum) {
          sheet.getRange(rowNum, 1, 1, rec.length).setValues([rec]);
        } else {
          toAppend.push(rec);
        }
      });

      if (toAppend.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ok: true, message: records.length + ' Zeilen verarbeitet'})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok: false, error: err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput('CRM Sync ist bereit.');
}
