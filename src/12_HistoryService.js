/**
 * 12_HistoryService.js — JSON履歴保存サービス
 *
 * 配置結果をJSON形式で「97_保存JSON履歴」シートに追記する（§10.3, §19）。
 * department / waves フィールドを含む完全版。シート未存在時は自動作成。
 */

// eslint-disable-next-line no-unused-vars
var HistoryService = (function () {
  'use strict';

  var HISTORY_SHEET = '97_保存JSON履歴';

  /**
   * Date → "YYYY-MM-DD" 文字列変換
   * @param {Date} date
   * @returns {string}
   */
  function formatDate_(date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d);
  }

  /**
   * BreakAssignment[] → [{time, names}] 変換
   * names が空のエントリはスキップする。
   * @param {Array<{breakAtMin: number, names: string[]}>} breakAssignments
   * @returns {Array<{time: string, names: string[]}>}
   */
  function formatBreaks_(breakAssignments) {
    var result = [];
    for (var i = 0; i < breakAssignments.length; i++) {
      var ba = breakAssignments[i];
      if (ba.names.length > 0) {
        result.push({
          time: TimeUtils.minToTimeStr(ba.breakAtMin),
          names: ba.names
        });
      }
    }
    return result;
  }

  /**
   * Placement[] → [{time, post, name, source}] 変換
   * @param {Array<{timeMin: number, postName: string, staffName: string, source: string}>} placements
   * @returns {Array<{time: string, post: string, name: string, source: string}>}
   */
  function formatPlacements_(placements) {
    var result = [];
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      result.push({
        time: TimeUtils.minToTimeStr(p.timeMin),
        post: p.postName,
        name: p.staffName,
        source: p.source
      });
    }
    return result;
  }

  /**
   * Wave[] → [{waveNumber, tasks: [{process, start, end, staff}]}] 変換
   * @param {Array<{waveNumber: number, tasks: Array<{process: string, startMin: number, endMin: number, assignedStaff: string}>}>} waves
   * @returns {Array<Object>}
   */
  function formatWaves_(waves) {
    var result = [];
    for (var i = 0; i < waves.length; i++) {
      var w = waves[i];
      var tasks = [];
      for (var j = 0; j < w.tasks.length; j++) {
        var t = w.tasks[j];
        tasks.push({
          process: t.process,
          start: TimeUtils.minToTimeStr(t.startMin),
          end: TimeUtils.minToTimeStr(t.endMin),
          staff: t.assignedStaff
        });
      }
      result.push({
        waveNumber: w.waveNumber,
        tasks: tasks
      });
    }
    return result;
  }

  /**
   * JSONオブジェクトを構築する（純粋関数）
   * @param {Object} params - BuildJsonParams
   * @returns {Object} JSON構造
   */
  function buildJson(params) {
    var breaks = formatBreaks_(params.breakAssignments);
    var placements = formatPlacements_(params.placements);

    var json = {
      date: formatDate_(params.targetDate),
      department: params.department,
      breaks: breaks,
      placements: placements
    };

    if (params.waves != null) {
      json.waves = formatWaves_(params.waves);
    }

    return json;
  }

  /**
   * 履歴シートが未存在の場合、ヘッダー付きで自動作成する
   * @param {string} sheetName
   */
  function ensureHistorySheet_(sheetName) {
    if (!SheetGateway.sheetExists(sheetName)) {
      SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
      SheetGateway.setValues(sheetName, 1, 1, [['timestamp', 'date', 'department', 'type', 'json']]);
    }
  }

  /**
   * 配置結果をJSON形式で履歴シートに追記する（Phase 6完了条件）
   * @param {Object} params - SaveParams
   */
  function save(params) {
    ensureHistorySheet_(HISTORY_SHEET);
    var json = buildJson(params);
    var jsonStr = JSON.stringify(json);
    var timestamp = new Date().toISOString();
    var dateStr = formatDate_(params.targetDate);
    var row = [timestamp, dateStr, params.department, params.type, jsonStr];
    SheetGateway.appendRow(HISTORY_SHEET, row);
  }

  return {
    save: save,
    buildJson: buildJson,
    formatDate_: formatDate_,
    formatBreaks_: formatBreaks_,
    formatPlacements_: formatPlacements_,
    formatWaves_: formatWaves_,
    ensureHistorySheet_: ensureHistorySheet_
  };
})();
