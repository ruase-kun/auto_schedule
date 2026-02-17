/**
 * 02_SheetGateway.js — シートI/Oコア
 *
 * SpreadsheetApp への直接アクセスをこのモジュールに集約する。
 * 全Service関数はシート名を引数で受け取り、部署非依存に設計。
 */

// eslint-disable-next-line no-unused-vars
var SheetGateway = (function () {
  'use strict';

  /**
   * シートを名前で取得する
   * @param {string} name - シート名
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {Error} シート不存在時
   */
  function getSheet(name) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      throw new Error('SheetGateway.getSheet: シートが見つかりません: ' + name);
    }
    return sheet;
  }

  /**
   * シートの存在チェック
   * @param {string} name - シート名
   * @returns {boolean}
   */
  function sheetExists(name) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(name) !== null;
  }

  /**
   * シートの全データを一括読込する
   * @param {string} sheetName - シート名
   * @returns {Array<Array<*>>} 2次元配列
   */
  function getValues(sheetName) {
    var sheet = getSheet(sheetName);
    return sheet.getDataRange().getValues();
  }

  /**
   * 指定範囲に一括書込する
   * @param {string} sheetName - シート名
   * @param {number} startRow  - 開始行（1始まり）
   * @param {number} startCol  - 開始列（1始まり）
   * @param {Array<Array<*>>} values - 書込データ
   */
  function setValues(sheetName, startRow, startCol, values) {
    var sheet = getSheet(sheetName);
    var numRows = values.length;
    var numCols = values[0].length;
    sheet.getRange(startRow, startCol, numRows, numCols).setValues(values);
  }

  /**
   * テンプレートシートから持ち場一覧を検出する (§13.1)
   * ヘッダー行（1行目）のC列から右へ走査し、セル値が 0 で終了。
   *
   * @param {string} templateSheetName - テンプレートシート名
   * @returns {Array<{name: string, colIndex: number}>} 持ち場一覧（colIndexは0始まり）
   * @throws {Error} 終端マーカー 0 が見つからない場合 (V1)
   */
  function detectPosts(templateSheetName) {
    var data = getValues(templateSheetName);
    if (data.length === 0) {
      throw new Error('detectPosts: テンプレートシートが空です: ' + templateSheetName);
    }
    var headerRow = data[0];
    var posts = [];
    // C列 = index 2 から走査
    var foundTerminator = false;
    for (var c = 2; c < headerRow.length; c++) {
      var val = headerRow[c];
      // 終端マーカー: 数値の0 または 文字列の"0"
      if (val === 0 || val === '0') {
        foundTerminator = true;
        break;
      }
      if (val !== '' && val !== null && val !== undefined) {
        posts.push({ name: String(val), colIndex: c });
      }
    }
    if (!foundTerminator) {
      throw new Error('detectPosts: 終端マーカー 0 が見つかりません (V1): ' + templateSheetName);
    }
    return posts;
  }

  /**
   * テンプレートシートから時間行を取得する (§13.2)
   * A列を読み、時刻値を持つ行を抽出する。
   * GASがDate型に自動変換するケースに対応。
   *
   * @param {string} templateSheetName - テンプレートシート名
   * @returns {TimeRow[]} 時間行一覧
   */
  function getTimeRows(templateSheetName) {
    var data = getValues(templateSheetName);
    var rows = [];
    // 2行目以降（index 1〜）を走査（1行目はヘッダー）
    for (var r = 1; r < data.length; r++) {
      var cell = data[r][0]; // A列
      if (cell === '' || cell === null || cell === undefined) {
        continue;
      }
      var timeStr = null;
      var timeMin = null;

      if (cell instanceof Date) {
        // GASがDate型に自動変換した場合
        var h = cell.getHours();
        var m = cell.getMinutes();
        timeStr = h + ':' + (m < 10 ? '0' + m : '' + m);
        timeMin = h * 60 + m;
      } else {
        var s = String(cell).trim();
        // H:MM or HH:MM パターンかチェック
        if (/^\d{1,2}:\d{2}$/.test(s)) {
          try {
            timeMin = TimeUtils.parseTimeToMin(s);
            timeStr = s;
          } catch (e) {
            // パース失敗 → スキップ
            continue;
          }
        } else {
          continue;
        }
      }

      rows.push({
        rowNumber: r + 1, // 1始まり行番号
        timeMin: timeMin,
        timeStr: timeStr
      });
    }
    return rows;
  }

  /**
   * テンプレートシートをコピーして新シートを作成する
   * @param {string} srcName  - コピー元シート名
   * @param {string} destName - コピー先シート名
   * @returns {GoogleAppsScript.Spreadsheet.Sheet} 新規シート
   */
  function copyTemplate(srcName, destName) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var src = getSheet(srcName);
    var newSheet = src.copyTo(ss);
    newSheet.setName(destName);
    return newSheet;
  }

  /**
   * シート末尾に1行追記する
   * @param {string} sheetName - シート名
   * @param {Array<*>} rowArray - 1次元配列
   */
  function appendRow(sheetName, rowArray) {
    var sheet = getSheet(sheetName);
    sheet.appendRow(rowArray);
  }

  /**
   * シートが存在すれば削除する（再生成時のクリーンアップ用）
   * @param {string} name - シート名
   */
  function deleteSheetIfExists(name) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      ss.deleteSheet(sheet);
    }
  }

  return {
    getSheet: getSheet,
    sheetExists: sheetExists,
    getValues: getValues,
    setValues: setValues,
    detectPosts: detectPosts,
    getTimeRows: getTimeRows,
    appendRow: appendRow,
    copyTemplate: copyTemplate,
    deleteSheetIfExists: deleteSheetIfExists
  };
})();
