/**
 * 03_ConfigService.js — コンフィグ読込
 *
 * 06_コンフィグ シートからセクションベースで設定を読込む。
 *
 * シートレイアウト:
 *   A列にセクションヘッダ（[コマ定義] 等）→ データ行 → 空行で区切り
 *
 *   [コマ定義]
 *   slotId | 行番号 | 開始時刻 | 終了時刻
 *   slot_1 | 3      | 10:00    | 11:30
 *   ...
 *
 *   [休憩設定]
 *   休憩時間(分) | 60
 *   AM前半       | 14:00
 *   AM後半       | 15:00
 *   PM前半       | 16:30
 *   PM後半       | 17:30
 *
 *   [休憩除外行]
 *   休憩行 | 除外行1 | 除外行2 | ...
 *   11     | 9       | 12
 *   ...
 *
 *   [シフト時間]
 *   シフト名 | 勤務開始 | 勤務終了 | PD開始 | PD終了
 *   早朝     | 8:00     | 17:00    | 10:00  | 16:30
 *   ...
 */

// eslint-disable-next-line no-unused-vars
var ConfigService = (function () {
  'use strict';

  /**
   * コンフィグシートから全設定を読込む
   * @param {string} configSheetName - コンフィグシート名
   * @returns {Config}
   */
  function loadConfig(configSheetName) {
    var data = SheetGateway.getValues(configSheetName);

    // [コマ定義]
    var slotRange = findSectionRange_(data, 'コマ定義');
    var slots = parseSlots_(data, slotRange.start, slotRange.end);

    // [休憩設定]
    var breakRange = findSectionRange_(data, '休憩設定');
    var breakResult = parseBreakSettings_(data, breakRange.start, breakRange.end);

    // [休憩除外行]
    var exclRange = findSectionRange_(data, '休憩除外行');
    var breakExclusionMap = parseBreakExclusionMap_(data, exclRange.start, exclRange.end);

    // [シフト時間]
    var shiftRange = findSectionRange_(data, 'シフト時間');
    var shiftTimes = parseShiftTimes_(data, shiftRange.start, shiftRange.end);

    return {
      slots: slots,
      breakTimes: breakResult.breakTimes,
      breakDuration: breakResult.breakDuration,
      breakExclusionMap: breakExclusionMap,
      shiftTimes: shiftTimes
    };
  }

  /**
   * セクションの開始行と終了行を検出する（内部）
   * @param {Array<Array<*>>} data - シートデータ
   * @param {string} sectionName - セクション名（[] なし）
   * @returns {{start: number, end: number}} start=データ開始行index, end=データ終了行index(exclusive)
   * @throws {Error} セクション未発見時
   */
  function findSectionRange_(data, sectionName) {
    var headerIdx = -1;
    var pattern1 = '[' + sectionName + ']';
    var pattern2 = '【' + sectionName + '】';

    for (var i = 0; i < data.length; i++) {
      var cell = String(data[i][0]).trim();
      if (cell === pattern1 || cell === pattern2) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new Error('ConfigService: セクションが見つかりません: ' + sectionName);
    }

    // データ開始 = ヘッダーの次行
    var start = headerIdx + 1;

    // 空行またはEODまで
    var end = data.length;
    for (var j = start; j < data.length; j++) {
      if (isEmptyRow_(data[j])) {
        end = j;
        break;
      }
      // 次のセクションヘッダーに当たった場合も終了
      var v = String(data[j][0]).trim();
      if (/^\[.+\]$/.test(v) || /^【.+】$/.test(v)) {
        end = j;
        break;
      }
    }
    return { start: start, end: end };
  }

  /**
   * 行が空行かチェック（内部）
   * @param {Array<*>} row
   * @returns {boolean}
   */
  function isEmptyRow_(row) {
    for (var i = 0; i < row.length; i++) {
      if (row[i] !== '' && row[i] !== null && row[i] !== undefined) {
        return false;
      }
    }
    return true;
  }

  /**
   * コマ定義をパースする（内部）
   *
   * 2つのフォーマットを自動検出:
   *   新形式（時間境界）: A列に開始時刻のみ（10:00 / 11:30 / ...）
   *   旧形式（4列）:      slotId | rowNumber | startTime | endTime
   *
   * 新形式では rowNumber は null（Orchestrator で解決）。
   *
   * @param {Array<Array<*>>} data
   * @param {number} start - データ開始index
   * @param {number} end   - データ終了index (exclusive)
   * @returns {TimeSlot[]} 開始時刻昇順
   * @throws {Error} 昇順違反時 (V8)
   */
  function parseSlots_(data, start, end) {
    if (start >= end) return [];

    // フォーマット検出: B列が空または非数値 → 新形式
    var firstRow = data[start];
    var colB = firstRow[1];
    var isLegacy = colB !== '' && colB !== null && colB !== undefined &&
                   !isNaN(parseInt(colB, 10)) && parseInt(colB, 10) > 0;

    var slots = isLegacy
      ? parseSlotsLegacy_(data, start, end)
      : parseSlotsTimeBoundary_(data, start, end);

    // 開始時刻昇順バリデーション (V8)
    for (var k = 1; k < slots.length; k++) {
      if (slots[k].startMin <= slots[k - 1].startMin) {
        throw new Error(
          'ConfigService: コマ定義の開始時刻が昇順ではありません (V8): ' +
            slots[k - 1].slotId + '(' + slots[k - 1].startMin + ') >= ' +
            slots[k].slotId + '(' + slots[k].startMin + ')'
        );
      }
    }

    return slots;
  }

  /**
   * 旧形式コマ定義パース: slotId | rowNumber | startTime | endTime
   */
  function parseSlotsLegacy_(data, start, end) {
    var slots = [];
    for (var i = start; i < end; i++) {
      var row = data[i];
      var slotId = String(row[0]).trim();
      if (slotId === '') continue;

      var rowNumber = parseInt(row[1], 10);
      var startMin = parseTimeCell_(row[2]);
      var endMin = parseTimeCell_(row[3]);

      if (isNaN(rowNumber)) {
        throw new Error('ConfigService.parseSlots_: 不正な行番号: row ' + (i + 1));
      }

      slots.push({
        slotId: slotId,
        rowNumber: rowNumber,
        startMin: startMin,
        endMin: endMin
      });
    }
    return slots;
  }

  /**
   * 新形式コマ定義パース: A列に開始時刻のみ
   * endMin は次の境界の startMin。最後のスロットは他と同じ間隔（デフォルト90分）。
   * rowNumber は null（Orchestrator で解決）。
   */
  function parseSlotsTimeBoundary_(data, start, end) {
    var times = [];
    for (var i = start; i < end; i++) {
      var cell = data[i][0];
      if (cell === '' || cell === null || cell === undefined) continue;
      times.push(parseTimeCell_(cell));
    }

    // 境界間隔を算出（最後のスロットにも同じ間隔を適用）
    var interval = (times.length >= 2) ? (times[1] - times[0]) : 90;

    var slots = [];
    for (var j = 0; j < times.length; j++) {
      var endMin = (j + 1 < times.length) ? times[j + 1] : times[j] + interval;
      slots.push({
        slotId: 'slot_' + (j + 1),
        startMin: times[j],
        endMin: endMin,
        rowNumber: null
      });
    }
    return slots;
  }

  /**
   * 休憩設定をパースする（内部）
   * @param {Array<Array<*>>} data
   * @param {number} start
   * @param {number} end
   * @returns {{breakTimes: BreakTimes, breakDuration: number}}
   */
  function parseBreakSettings_(data, start, end) {
    var breakDuration = 60; // デフォルト
    var breakTimes = {
      amFirst: 840,   // 14:00
      amSecond: 900,  // 15:00
      pmFirst: 990,   // 16:30
      pmSecond: 1050  // 17:30
    };

    var keyMap = {
      '休憩時間(分)': 'duration',
      '休憩時間（分）': 'duration',
      'AM前半': 'amFirst',
      'AM後半': 'amSecond',
      'PM前半': 'pmFirst',
      'PM後半': 'pmSecond'
    };

    for (var i = start; i < end; i++) {
      var label = String(data[i][0]).trim();
      var value = data[i][1];
      var mapped = keyMap[label];

      if (mapped === 'duration') {
        breakDuration = parseInt(value, 10);
        if (isNaN(breakDuration) || breakDuration <= 0) {
          throw new Error('ConfigService: 不正な休憩時間: ' + value);
        }
      } else if (mapped) {
        breakTimes[mapped] = parseTimeCell_(value);
      }
    }

    return { breakTimes: breakTimes, breakDuration: breakDuration };
  }

  /**
   * 休憩除外行マッピングをパースする（内部）
   * @param {Array<Array<*>>} data
   * @param {number} start
   * @param {number} end
   * @returns {Object<number, number[]>} 休憩行番号→除外行番号[]
   */
  function parseBreakExclusionMap_(data, start, end) {
    var map = {};
    for (var i = start; i < end; i++) {
      var breakRow = parseInt(data[i][0], 10);
      if (isNaN(breakRow)) continue;

      var exclusions = [];
      for (var c = 1; c < data[i].length; c++) {
        var v = parseInt(data[i][c], 10);
        if (!isNaN(v)) {
          exclusions.push(v);
        }
      }
      map[breakRow] = exclusions;
    }
    return map;
  }

  /**
   * シフト時間をパースする（内部）
   * @param {Array<Array<*>>} data
   * @param {number} start
   * @param {number} end
   * @returns {Object<string, ShiftTimeDef>}
   */
  function parseShiftTimes_(data, start, end) {
    var result = {};
    for (var i = start; i < end; i++) {
      var name = String(data[i][0]).trim();
      if (name === '') continue;

      result[name] = {
        start: parseTimeCell_(data[i][1]),
        end: parseTimeCell_(data[i][2]),
        pulldownStart: parseTimeCell_(data[i][3]),
        pulldownEnd: parseTimeCell_(data[i][4])
      };
    }
    return result;
  }

  /**
   * 時刻セルをパースする（Date型自動変換対応）（内部）
   * @param {*} cell - セル値
   * @returns {number} 分
   */
  function parseTimeCell_(cell) {
    if (cell instanceof Date) {
      return cell.getHours() * 60 + cell.getMinutes();
    }
    return TimeUtils.parseTimeToMin(String(cell));
  }

  return {
    loadConfig: loadConfig,
    // テスト用に内部関数も公開
    findSectionRange_: findSectionRange_,
    parseTimeCell_: parseTimeCell_
  };
})();
