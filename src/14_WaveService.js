/**
 * 14_WaveService.js — 陣スケジュールサービス
 *
 * 通販部署用の陣（ウェーブ）テンプレート管理。
 * 98_陣テンプレート シートからテンプレートを読込・パース・検証し、
 * HistoryService 互換の JSON 構造を構築する（§19）。
 *
 * Phase 4.5: 純粋データ層のみ。applyToSheet は Phase 7A で実装。
 */

// eslint-disable-next-line no-unused-vars
var WaveService = (function () {
  'use strict';

  var DEFAULT_SHEET = '98_陣テンプレート';

  /* ---------- 内部関数 ---------- */

  /**
   * 時刻値を分に変換する（Date型・文字列両対応）
   * @param {Date|string|number} value - 時刻値
   * @returns {number} 分
   */
  function parseTimeValue_(value) {
    if (value instanceof Date) {
      return value.getHours() * 60 + value.getMinutes();
    }
    var s = String(value).trim();
    return TimeUtils.parseTimeToMin(s);
  }

  /**
   * シートの1行を解析してタスクオブジェクトに変換する
   * @param {Array<*>} row - シートの1行（5列: templateName, waveNumber, process, startTime, endTime）
   * @param {number} rowIndex - データ配列内インデックス（0始まり、ヘッダー除外後）
   * @returns {{templateName: string, waveNumber: number, process: string, startMin: number, endMin: number}}
   */
  function parseTaskRow_(row, rowIndex) {
    return {
      templateName: String(row[0] || '').trim(),
      waveNumber: Number(row[1]),
      process: String(row[2] || '').trim(),
      startMin: parseTimeValue_(row[3]),
      endMin: parseTimeValue_(row[4])
    };
  }

  /**
   * パース済みタスクを検証する
   * @param {{templateName: string, waveNumber: number, process: string, startMin: number, endMin: number}} task
   * @param {number} rowIndex - データ配列内インデックス（0始まり）
   * @throws {string} 検証エラー時
   */
  function validateTask_(task, rowIndex) {
    var sheetRow = rowIndex + 2;
    if (task.templateName === '') {
      throw 'templateName空: row ' + sheetRow;
    }
    if (!Number.isInteger(task.waveNumber) || task.waveNumber < 1) {
      throw 'waveNumber不正: row ' + sheetRow;
    }
    if (task.process === '') {
      throw 'process空: row ' + sheetRow;
    }
    if (task.startMin >= task.endMin) {
      throw '開始>=終了: row ' + sheetRow + ' (' + task.process + ')';
    }
  }

  /**
   * フラットなタスク配列を WaveTemplate[] にグルーピングする
   * @param {Array<{templateName: string, waveNumber: number, process: string, startMin: number, endMin: number}>} tasks
   * @returns {WaveTemplate[]}
   */
  function groupByTemplate_(tasks) {
    // templateName でグルーピング（出現順序を保持）
    var templateOrder = [];
    var templateMap = {};  // name → { waveMap: { num → WaveTask[] } }

    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (!templateMap[task.templateName]) {
        templateMap[task.templateName] = {};
        templateOrder.push(task.templateName);
      }
      var waveMap = templateMap[task.templateName];
      if (!waveMap[task.waveNumber]) {
        waveMap[task.waveNumber] = [];
      }
      waveMap[task.waveNumber].push({
        process: task.process,
        startMin: task.startMin,
        endMin: task.endMin,
        assignedStaff: []
      });
    }

    var templates = [];
    for (var t = 0; t < templateOrder.length; t++) {
      var name = templateOrder[t];
      var waveMap = templateMap[name];
      // waveNumber でソート（昇順）
      var waveNums = [];
      for (var key in waveMap) {
        if (waveMap.hasOwnProperty(key)) {
          waveNums.push(Number(key));
        }
      }
      waveNums.sort(function (a, b) { return a - b; });

      var waves = [];
      for (var w = 0; w < waveNums.length; w++) {
        waves.push({
          waveNumber: waveNums[w],
          tasks: waveMap[waveNums[w]]
        });
      }
      templates.push({
        templateName: name,
        waves: waves
      });
    }
    return templates;
  }

  /* ---------- 公開関数 ---------- */

  /**
   * シートから全テンプレートを読込む
   * @param {string} [sheetName] - シート名（省略時 '98_陣テンプレート'）
   * @returns {WaveTemplate[]}
   */
  function loadTemplates(sheetName) {
    var data = SheetGateway.getValues(sheetName || DEFAULT_SHEET);
    if (data.length < 2) {
      return [];  // ヘッダーのみ or 空
    }
    var tasks = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var templateName = String(row[0] || '').trim();
      if (templateName === '') {
        continue;  // 空行スキップ
      }
      var task = parseTaskRow_(row, i);
      validateTask_(task, i);
      tasks.push(task);
    }
    return groupByTemplate_(tasks);
  }

  /**
   * テンプレート名で検索する（純粋関数）
   * @param {WaveTemplate[]} templates - テンプレート配列
   * @param {string} name - テンプレート名
   * @returns {WaveTemplate|null}
   */
  function getTemplateByName(templates, name) {
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].templateName === name) {
        return templates[i];
      }
    }
    return null;
  }

  /**
   * Wave[] → HistoryService 互換の JSON 配列を構築する（純粋関数）
   * startMin/endMin → "H:MM" 文字列に変換
   * @param {Wave[]} waves
   * @returns {Array<Object>}
   */
  function buildWavesJson(waves) {
    var result = [];
    for (var i = 0; i < waves.length; i++) {
      var wave = waves[i];
      var tasks = [];
      for (var j = 0; j < wave.tasks.length; j++) {
        var task = wave.tasks[j];
        tasks.push({
          process: task.process,
          start: TimeUtils.minToTimeStr(task.startMin),
          end: TimeUtils.minToTimeStr(task.endMin),
          staff: task.assignedStaff
        });
      }
      result.push({
        waveNumber: wave.waveNumber,
        tasks: tasks
      });
    }
    return result;
  }

  return {
    loadTemplates: loadTemplates,
    getTemplateByName: getTemplateByName,
    buildWavesJson: buildWavesJson,
    // テスト用に内部関数を公開
    parseTimeValue_: parseTimeValue_,
    parseTaskRow_: parseTaskRow_,
    validateTask_: validateTask_,
    groupByTemplate_: groupByTemplate_
  };
})();
