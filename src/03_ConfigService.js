/**
 * 03_ConfigService.js — コンフィグ読込（JSON/旧形式自動検出）
 *
 * 06_コンフィグ シートのセルA1にJSON文字列を格納。
 * JSONの形式はUI用フォーマット（時刻は"H:MM"文字列）。
 *
 * 旧形式（セクションベース）も自動検出し後方互換を維持。
 * 旧形式シートは次回保存時にJSONへ自動マイグレーションされる。
 */

// eslint-disable-next-line no-unused-vars
var ConfigService = (function () {
  'use strict';

  /**
   * コンフィグシートから全設定を読込む（JSON/旧形式自動検出）
   * @param {string} configSheetName - コンフィグシート名
   * @returns {Config}
   */
  function loadConfig(configSheetName) {
    var data = SheetGateway.getValues(configSheetName);

    // JSON形式検出: A1が{で始まるか
    var a1 = String(data[0][0]).trim();
    if (a1.charAt(0) === '{') {
      return loadConfigFromJson_(a1);
    }

    // 旧形式（セクションベース）パース
    return loadConfigLegacy_(data);
  }

  /**
   * JSON文字列から内部Configを構築する
   * @param {string} jsonStr - JSON文字列（UI用H:MM形式）
   * @returns {Config}
   */
  function loadConfigFromJson_(jsonStr) {
    var json = JSON.parse(jsonStr);

    // slotBoundaries → TimeSlot[]
    var boundaries = json.slotBoundaries || [];
    var times = [];
    for (var i = 0; i < boundaries.length; i++) {
      times.push(TimeUtils.parseTimeToMin(boundaries[i]));
    }
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

    // breakTimes → 分変換
    var bt = json.breakTimes || {};
    var breakTimes = {
      earlyFirst: TimeUtils.parseTimeToMin(bt.earlyFirst || '12:00'),
      earlySecond: TimeUtils.parseTimeToMin(bt.earlySecond || '13:00'),
      amFirst: TimeUtils.parseTimeToMin(bt.amFirst || '14:00'),
      amSecond: TimeUtils.parseTimeToMin(bt.amSecond || '15:00'),
      pmFirst: TimeUtils.parseTimeToMin(bt.pmFirst || '16:30'),
      pmSecond: TimeUtils.parseTimeToMin(bt.pmSecond || '17:30')
    };

    // shiftTimes → 分変換
    var shiftTimes = {};
    var stJson = json.shiftTimes || {};
    var shiftNames = Object.keys(stJson);
    for (var s = 0; s < shiftNames.length; s++) {
      var st = stJson[shiftNames[s]];
      shiftTimes[shiftNames[s]] = {
        start: TimeUtils.parseTimeToMin(st.start),
        end: TimeUtils.parseTimeToMin(st.end),
        pulldownStart: TimeUtils.parseTimeToMin(st.pulldownStart),
        pulldownEnd: TimeUtils.parseTimeToMin(st.pulldownEnd)
      };
    }

    // breakExclusionRows → breakExclusionMap（キー: 文字列→数値）
    var breakExclusionMap = {};
    var exclJson = json.breakExclusionRows || {};
    var exclKeys = Object.keys(exclJson);
    for (var e = 0; e < exclKeys.length; e++) {
      breakExclusionMap[parseInt(exclKeys[e], 10)] = exclJson[exclKeys[e]];
    }

    // tournamentPresets → 分変換
    var tournamentPresets = [];
    var tpJson = json.tournamentPresets || [];
    for (var p = 0; p < tpJson.length; p++) {
      var tp = tpJson[p];
      tournamentPresets.push({
        label: tp.label,
        startMin: TimeUtils.parseTimeToMin(tp.startStr),
        endMin: TimeUtils.parseTimeToMin(tp.endStr),
        weekendOnly: !!tp.weekendOnly
      });
    }

    // postPresets → activeWindowsのstartStr/endStr→startMin/endMin変換
    var postPresets = [];
    var ppJson = json.postPresets || [];
    for (var pp = 0; pp < ppJson.length; pp++) {
      var preset = ppJson[pp];
      var windows = [];
      var rawWin = preset.activeWindows || [];
      for (var w = 0; w < rawWin.length; w++) {
        var win = rawWin[w];
        if (win.startStr && win.endStr) {
          windows.push({
            startMin: TimeUtils.parseTimeToMin(win.startStr),
            endMin: TimeUtils.parseTimeToMin(win.endStr)
          });
        } else if (win.startMin !== undefined) {
          windows.push({ startMin: win.startMin, endMin: win.endMin });
        }
      }
      postPresets.push({
        postName: preset.postName,
        enabled: !!preset.enabled,
        requiredLv: parseInt(preset.requiredLv, 10) || 1,
        order: parseInt(preset.order, 10) || 1,
        sortDir: preset.sortDir || 'DESC',
        concurrentPost: preset.concurrentPost || null,
        activeWindows: windows
      });
    }

    return {
      slots: slots,
      breakTimes: breakTimes,
      breakDuration: parseInt(json.breakDuration, 10) || 60,
      breakBufferBefore: parseInt(json.breakBufferBefore, 10) || 0,
      breakBufferAfter: parseInt(json.breakBufferAfter, 10) || 0,
      breakExclusionMap: breakExclusionMap,
      shiftTimes: shiftTimes,
      tournamentPresets: tournamentPresets,
      placementMode: json.placementMode || 'global',
      postIntervals: json.postIntervals || {},
      postPresets: postPresets
    };
  }

  /**
   * 旧形式（セクションベース）からConfigを読込む（マイグレーション用に残す）
   * @param {Array<Array<*>>} data - シートデータ
   * @returns {Config}
   */
  function loadConfigLegacy_(data) {
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

    // [大会プリセット] — 省略可能（後方互換）
    var tournamentPresets = [];
    try {
      var tpRange = findSectionRange_(data, '大会プリセット');
      tournamentPresets = parseTournamentPresets_(data, tpRange.start, tpRange.end);
    } catch (e) {
      // セクション未発見は無視（旧形式互換）
    }

    return {
      slots: slots,
      breakTimes: breakResult.breakTimes,
      breakDuration: breakResult.breakDuration,
      breakBufferBefore: breakResult.breakBufferBefore,
      breakBufferAfter: breakResult.breakBufferAfter,
      breakExclusionMap: breakExclusionMap,
      shiftTimes: shiftTimes,
      tournamentPresets: tournamentPresets,
      placementMode: 'global',
      postIntervals: {},
      postPresets: []
    };
  }

  /**
   * 内部ConfigからJSON文字列を生成する（旧形式→JSONマイグレーション用）
   * @param {Config} config - 内部Config
   * @returns {string} JSON文字列
   */
  function configToJson_(config) {
    var bt = config.breakTimes;
    var slotBoundaries = [];
    for (var i = 0; i < config.slots.length; i++) {
      slotBoundaries.push(TimeUtils.minToTimeStr(config.slots[i].startMin));
    }

    var breakTimesStr = {
      earlyFirst: TimeUtils.minToTimeStr(bt.earlyFirst),
      earlySecond: TimeUtils.minToTimeStr(bt.earlySecond),
      amFirst: TimeUtils.minToTimeStr(bt.amFirst),
      amSecond: TimeUtils.minToTimeStr(bt.amSecond),
      pmFirst: TimeUtils.minToTimeStr(bt.pmFirst),
      pmSecond: TimeUtils.minToTimeStr(bt.pmSecond)
    };

    var shiftTimesStr = {};
    var shiftNames = Object.keys(config.shiftTimes);
    for (var s = 0; s < shiftNames.length; s++) {
      var st = config.shiftTimes[shiftNames[s]];
      shiftTimesStr[shiftNames[s]] = {
        start: TimeUtils.minToTimeStr(st.start),
        end: TimeUtils.minToTimeStr(st.end),
        pulldownStart: TimeUtils.minToTimeStr(st.pulldownStart),
        pulldownEnd: TimeUtils.minToTimeStr(st.pulldownEnd)
      };
    }

    var breakExclusionRows = {};
    var exclKeys = Object.keys(config.breakExclusionMap || {});
    for (var e = 0; e < exclKeys.length; e++) {
      breakExclusionRows[exclKeys[e]] = config.breakExclusionMap[exclKeys[e]];
    }

    var tournamentPresets = [];
    var tps = config.tournamentPresets || [];
    for (var p = 0; p < tps.length; p++) {
      tournamentPresets.push({
        label: tps[p].label,
        startStr: TimeUtils.minToTimeStr(tps[p].startMin),
        endStr: TimeUtils.minToTimeStr(tps[p].endMin),
        weekendOnly: tps[p].weekendOnly
      });
    }

    // postPresets → activeWindowsのstartMin/endMin→startStr/endStr変換
    var ppOut = [];
    var pps = config.postPresets || [];
    for (var pi = 0; pi < pps.length; pi++) {
      var ppWindows = [];
      var ppWin = pps[pi].activeWindows || [];
      for (var pw = 0; pw < ppWin.length; pw++) {
        ppWindows.push({
          startStr: TimeUtils.minToTimeStr(ppWin[pw].startMin),
          endStr: TimeUtils.minToTimeStr(ppWin[pw].endMin)
        });
      }
      ppOut.push({
        postName: pps[pi].postName,
        enabled: pps[pi].enabled,
        requiredLv: pps[pi].requiredLv,
        order: pps[pi].order,
        sortDir: pps[pi].sortDir,
        concurrentPost: pps[pi].concurrentPost || null,
        activeWindows: ppWindows
      });
    }

    var result = {
      version: 1,
      slotBoundaries: slotBoundaries,
      breakDuration: config.breakDuration,
      breakBufferBefore: config.breakBufferBefore || 0,
      breakBufferAfter: config.breakBufferAfter || 0,
      breakTimes: breakTimesStr,
      breakExclusionRows: breakExclusionRows,
      shiftTimes: shiftTimesStr,
      tournamentPresets: tournamentPresets
    };
    if (config.placementMode && config.placementMode !== 'global') {
      result.placementMode = config.placementMode;
    }
    if (config.postIntervals && Object.keys(config.postIntervals).length > 0) {
      result.postIntervals = config.postIntervals;
    }
    if (ppOut.length > 0) {
      result.postPresets = ppOut;
    }
    return JSON.stringify(result);
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
    var breakBufferBefore = 0; // デフォルト: 0=H6b使用
    var breakBufferAfter = 0;
    var breakTimes = {
      earlyFirst: 720,  // 12:00
      earlySecond: 780, // 13:00
      amFirst: 840,     // 14:00
      amSecond: 900,    // 15:00
      pmFirst: 990,     // 16:30
      pmSecond: 1050    // 17:30
    };

    var keyMap = {
      '休憩時間(分)': 'duration',
      '休憩時間（分）': 'duration',
      '休憩バッファ前(コマ)': 'bufferBefore',
      '休憩バッファ前（コマ）': 'bufferBefore',
      '休憩バッファ後(コマ)': 'bufferAfter',
      '休憩バッファ後（コマ）': 'bufferAfter',
      '早朝前半': 'earlyFirst',
      '早朝後半': 'earlySecond',
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
      } else if (mapped === 'bufferBefore') {
        breakBufferBefore = parseInt(value, 10) || 0;
      } else if (mapped === 'bufferAfter') {
        breakBufferAfter = parseInt(value, 10) || 0;
      } else if (mapped) {
        breakTimes[mapped] = parseTimeCell_(value);
      }
    }

    return {
      breakTimes: breakTimes,
      breakDuration: breakDuration,
      breakBufferBefore: breakBufferBefore,
      breakBufferAfter: breakBufferAfter
    };
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
   * 大会プリセットをパースする（内部）
   * 各行: ラベル | 開始時刻 | 終了時刻 | 週末のみフラグ（○=true）
   * @param {Array<Array<*>>} data
   * @param {number} start
   * @param {number} end
   * @returns {Array<{label: string, startMin: number, endMin: number, weekendOnly: boolean}>}
   */
  function parseTournamentPresets_(data, start, end) {
    var presets = [];
    for (var i = start; i < end; i++) {
      var label = String(data[i][0]).trim();
      if (label === '') continue;

      var startMin = parseTimeCell_(data[i][1]);
      var endMin = parseTimeCell_(data[i][2]);
      var flag = String(data[i][3] || '').trim();
      var weekendOnly = flag === '○' || flag === 'true' || flag === 'TRUE';

      presets.push({
        label: label,
        startMin: startMin,
        endMin: endMin,
        weekendOnly: weekendOnly
      });
    }
    return presets;
  }

  /**
   * コンフィグデータをJSON形式でシートに保存する
   * UIからのデータ（既にH:MM形式）をそのままJSON.stringifyして保存。
   * @param {string} configSheetName - コンフィグシート名
   * @param {Object} configData - 保存するコンフィグデータ（JSON形式、H:MM文字列）
   */
  function saveConfig(configSheetName, configData) {
    var json = {
      version: 1,
      slotBoundaries: configData.slotBoundaries,
      breakDuration: configData.breakDuration,
      breakBufferBefore: configData.breakBufferBefore || 0,
      breakBufferAfter: configData.breakBufferAfter || 0,
      breakTimes: configData.breakTimes,
      breakExclusionRows: configData.breakExclusionRows || {},
      shiftTimes: configData.shiftTimes,
      tournamentPresets: configData.tournamentPresets || []
    };
    if (configData.placementMode) {
      json.placementMode = configData.placementMode;
    }
    if (configData.postIntervals && Object.keys(configData.postIntervals).length > 0) {
      json.postIntervals = configData.postIntervals;
    }
    if (configData.postPresets && configData.postPresets.length > 0) {
      json.postPresets = configData.postPresets;
    }
    if (configData.postPresetGroups && configData.postPresetGroups.length > 0) {
      json.postPresetGroups = configData.postPresetGroups;
    }
    var jsonStr = JSON.stringify(json);
    SheetGateway.clearSheet(configSheetName);
    SheetGateway.setValues(configSheetName, 1, 1, [[jsonStr]]);
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
    saveConfig: saveConfig,
    // テスト用・マイグレーション用に内部関数も公開
    loadConfigFromJson_: loadConfigFromJson_,
    configToJson_: configToJson_,
    loadConfigLegacy_: loadConfigLegacy_,
    findSectionRange_: findSectionRange_,
    parseTimeCell_: parseTimeCell_,
    parseTournamentPresets_: parseTournamentPresets_
  };
})();
