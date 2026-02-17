/**
 * 05_AttendanceService.js — 出勤者抽出
 *
 * 02_販売のみ抽出 シートから指定日付の出勤スタッフを抽出する。
 *
 * シートレイアウト (§5.1):
 *   日付ごとに3列1セット（A/B/C、D/E/F…）
 *   行1: 日付
 *   行2: 曜日
 *   行3〜: カテゴリ(col+0) / スタッフ名(col+1) / シフト種別(col+2)
 *
 * デフォルトシフト時間 (§5.1):
 *   早朝: 08:00〜17:00
 *   午前: 09:30〜18:00
 *   午後: 13:00〜22:00
 *   時差: H:MM-HH:MM パース
 */

// eslint-disable-next-line no-unused-vars
var AttendanceService = (function () {
  'use strict';

  /** デフォルトシフト時間（コンフィグ未指定時のフォールバック） */
  var DEFAULT_SHIFTS = {
    '早朝': { startMin: 480, endMin: 1020 },  // 8:00-17:00
    '午前': { startMin: 570, endMin: 1080 },  // 9:30-18:00
    '午後': { startMin: 780, endMin: 1320 }   // 13:00-22:00
  };

  /**
   * 指定日付の出勤者リストを返却する
   * @param {string} extractSheetName - 抽出シート名
   * @param {Date} targetDate - 対象日付
   * @param {Object<string, ShiftTimeDef>} [shiftTimes] - コンフィグのシフト時間（省略時はデフォルト）
   * @returns {Staff[]}
   */
  function getAttendees(extractSheetName, targetDate, shiftTimes) {
    var data = SheetGateway.getValues(extractSheetName);
    if (data.length < 3) {
      return [];
    }

    var colOffset = findDateBlock_(data, targetDate);
    if (colOffset === -1) {
      return [];
    }

    return parseStaffEntries_(data, colOffset, shiftTimes);
  }

  /**
   * 日付ブロックの列オフセットを検出する（内部）
   * 1行目を3列刻みで走査し、日付が一致するブロックを返す。
   *
   * @param {Array<Array<*>>} data - シートデータ
   * @param {Date} targetDate - 対象日付
   * @returns {number} 列オフセット（0始まり）、見つからなければ -1
   */
  function findDateBlock_(data, targetDate) {
    var targetNorm = normalizeDateForComparison_(targetDate);
    var headerRow = data[0];

    for (var c = 0; c < headerRow.length; c += 3) {
      var cell = headerRow[c];
      if (cell === '' || cell === null || cell === undefined) continue;

      var cellNorm = null;
      if (cell instanceof Date) {
        cellNorm = normalizeDateForComparison_(cell);
      } else {
        // 文字列日付もパース試行
        var parsed = new Date(cell);
        if (!isNaN(parsed.getTime())) {
          cellNorm = normalizeDateForComparison_(parsed);
        }
      }

      if (cellNorm !== null && cellNorm === targetNorm) {
        return c;
      }
    }
    return -1;
  }

  /**
   * 日付比較用に M/D 正規化する（内部）
   * GASのDate型自動変換に対応するため、年を無視して月日で比較。
   *
   * @param {Date} date
   * @returns {string} "M/D" 形式
   */
  function normalizeDateForComparison_(date) {
    return (date.getMonth() + 1) + '/' + date.getDate();
  }

  /**
   * スタッフエントリをパースする（内部）
   * 3行目以降: カテゴリ(col+0) / スタッフ名(col+1) / シフト種別(col+2)
   *
   * @param {Array<Array<*>>} data - シートデータ
   * @param {number} colOffset - 日付ブロックの列オフセット
   * @param {Object<string, ShiftTimeDef>} [shiftTimes] - コンフィグのシフト時間
   * @returns {Staff[]}
   */
  function parseStaffEntries_(data, colOffset, shiftTimes) {
    var staff = [];

    for (var r = 2; r < data.length; r++) {
      var name = data[r][colOffset + 1];
      if (name === '' || name === null || name === undefined) continue;
      name = String(name).trim();
      if (name === '') continue;

      var shiftRaw = String(data[r][colOffset + 2] || '').trim();
      if (shiftRaw === '') continue;

      var resolved = resolveShift_(shiftRaw, shiftTimes);

      staff.push({
        name: name,
        employment: '', // SkillServiceとの結合で後から設定
        shiftType: resolved.shiftType,
        shiftStartMin: resolved.startMin,
        shiftEndMin: resolved.endMin
      });
    }

    return staff;
  }

  /**
   * シフト種別と勤務時間を解決する（内部）
   * @param {string} shiftRaw - 生のシフト値
   * @param {Object<string, ShiftTimeDef>} [shiftTimes] - コンフィグのシフト時間
   * @returns {{shiftType: string, startMin: number, endMin: number}}
   */
  function resolveShift_(shiftRaw, shiftTimes) {
    // 固定シフト種別チェック
    if (shiftRaw === '早朝' || shiftRaw === '午前' || shiftRaw === '午後') {
      var times = getShiftTimes_(shiftRaw, shiftTimes);
      return {
        shiftType: shiftRaw,
        startMin: times.startMin,
        endMin: times.endMin
      };
    }

    // 全角文字を正規化してから時差シフトを判定
    var normalized = TimeUtils.normalizeToHalfWidth(shiftRaw);

    // 時差シフト: "H:MM-HH:MM" パターン (V5)
    if (normalized.indexOf('-') !== -1 && normalized.indexOf(':') !== -1) {
      var range = TimeUtils.parseShiftRange(normalized);
      return {
        shiftType: '時差',
        startMin: range.startMin,
        endMin: range.endMin
      };
    }

    throw new Error(
      'AttendanceService: 不明なシフト種別です: ' + shiftRaw
    );
  }

  /**
   * 固定シフトの勤務時間を取得する（内部）
   * コンフィグのshiftTimesが渡されていればそちらを優先。
   *
   * @param {string} shiftName - "早朝"|"午前"|"午後"
   * @param {Object<string, ShiftTimeDef>} [shiftTimes]
   * @returns {{startMin: number, endMin: number}}
   */
  function getShiftTimes_(shiftName, shiftTimes) {
    if (shiftTimes && shiftTimes[shiftName]) {
      var def = shiftTimes[shiftName];
      return { startMin: def.start, endMin: def.end };
    }
    var defaults = DEFAULT_SHIFTS[shiftName];
    if (!defaults) {
      throw new Error('AttendanceService: 不明なシフト名: ' + shiftName);
    }
    return defaults;
  }

  return {
    getAttendees: getAttendees,
    // テスト用に内部関数も公開
    findDateBlock_: findDateBlock_,
    normalizeDateForComparison_: normalizeDateForComparison_
  };
})();
