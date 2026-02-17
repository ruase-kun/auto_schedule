/**
 * 11_TimelineService.js — 個人シート生成（Phase 5）
 *
 * 配置結果を「人ヘッダー形式」のマトリクスに変換し、個人シートとして書き出す。
 * Orchestrator.run() には統合せず、別途呼び出しで使用する。
 *
 * 依存: ExclusionService, BreakService, SheetGateway
 */

// eslint-disable-next-line no-unused-vars
var TimelineService = (function () {
  'use strict';

  /**
   * 勤務中判定
   * shiftStartMin <= timeMin <= shiftEndMin - 30
   *
   * @param {Staff} staff - スタッフ情報
   * @param {number} timeMin - 判定時刻（分）
   * @returns {boolean}
   */
  function isWorking_(staff, timeMin) {
    return staff.shiftStartMin <= timeMin && timeMin <= staff.shiftEndMin - 30;
  }

  /**
   * 配置の逆引きマップを構築する
   * timeMin → { staffName → [postName, ...] }
   *
   * @param {Placement[]} placements - 配置結果
   * @param {TimeRow[]} timeRows - テンプレ時間行（未使用だが将来拡張用に保持）
   * @returns {Object<number, Object<string, string[]>>}
   */
  function buildPlacementLookup_(placements, timeRows) {
    var lookup = {};
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      if (!lookup[p.timeMin]) {
        lookup[p.timeMin] = {};
      }
      if (!lookup[p.timeMin][p.staffName]) {
        lookup[p.timeMin][p.staffName] = [];
      }
      lookup[p.timeMin][p.staffName].push(p.postName);
    }
    return lookup;
  }

  /**
   * 人ヘッダー形式のマトリクスを構築する（純粋ロジック）
   *
   * @param {Object} params
   * @param {Staff[]} params.staffList - 出勤スタッフ一覧
   * @param {Placement[]} params.placements - 配置結果
   * @param {BreakAssignment[]} params.breakAssignments - 休憩割当
   * @param {number} params.breakDuration - 休憩時間（分）
   * @param {Exclusions} params.exclusions - 除外情報
   * @param {TimeRow[]} params.timeRows - テンプレ時間行
   * @returns {string[][]} マトリクス（ヘッダー行 + データ行）
   */
  function buildMatrix(params) {
    var staffList = params.staffList;
    var placements = params.placements;
    var breakAssignments = params.breakAssignments;
    var breakDuration = params.breakDuration;
    var exclusions = params.exclusions;
    var timeRows = params.timeRows;

    // 1. 人リスト（列ヘッダー）
    var people = [];
    for (var i = 0; i < staffList.length; i++) {
      people.push(staffList[i].name);
    }

    // 2. staffNameマップ（高速検索用）
    var staffMap = {};
    for (var s = 0; s < staffList.length; s++) {
      staffMap[staffList[s].name] = staffList[s];
    }

    // 3. 配置の逆引きマップ構築
    var placementLookup = buildPlacementLookup_(placements, timeRows);

    // 4. マトリクス構築
    var matrix = [];

    // ヘッダー行: ["時間", 人1, 人2, ...]
    var header = ['時間'];
    for (var h = 0; h < people.length; h++) {
      header.push(people[h]);
    }
    matrix.push(header);

    // データ行
    for (var t = 0; t < timeRows.length; t++) {
      var tr = timeRows[t];
      var row = [tr.timeStr];

      for (var p = 0; p < people.length; p++) {
        var person = people[p];
        var staff = staffMap[person];
        var cell = '';

        // 優先順位で判定
        // 1. 大会中 → "大会"
        if (ExclusionService.isTournament(exclusions, person, tr.timeMin)) {
          cell = '大会';
        }
        // 2. 休憩中 → "休憩"
        else if (BreakService.isOnBreak(breakAssignments, person, tr.timeMin, breakDuration)) {
          cell = '休憩';
        }
        // 3. 配置あり → 持ち場名（複数なら "/" 区切り）
        else if (placementLookup[tr.timeMin] && placementLookup[tr.timeMin][person]) {
          cell = placementLookup[tr.timeMin][person].join('/');
        }
        // 4. 勤務中 & 上記なし → "浮き"
        else if (isWorking_(staff, tr.timeMin)) {
          cell = '浮き';
        }
        // 5. 勤務外 → 空欄（cellは既に""）

        row.push(cell);
      }

      matrix.push(row);
    }

    return matrix;
  }

  /**
   * 個人シートを生成する（マトリクス構築 + シート書込み）
   *
   * @param {Object} params
   * @param {string} params.dateSheetName - 日別配置表シート名（例: '03/15(土)'）
   * @param {Staff[]} params.staffList - 出勤スタッフ一覧
   * @param {Placement[]} params.placements - 配置結果
   * @param {BreakAssignment[]} params.breakAssignments - 休憩割当
   * @param {number} params.breakDuration - 休憩時間（分）
   * @param {Exclusions} params.exclusions - 除外情報
   * @param {TimeRow[]} params.timeRows - テンプレ時間行
   * @returns {string[][]} 書き込んだマトリクス
   */
  function generate(params) {
    // 1. マトリクス構築
    var matrix = buildMatrix(params);

    // 2. 個人シート名
    var personalSheetName = params.dateSheetName + '_個人';

    // 3. 既存シート削除
    SheetGateway.deleteSheetIfExists(personalSheetName);

    // 4. 新規シート作成（空シート）
    SpreadsheetApp.getActiveSpreadsheet().insertSheet(personalSheetName);

    // 5. 一括書込み
    SheetGateway.setValues(personalSheetName, 1, 1, matrix);

    // 6. マトリクスを返す
    return matrix;
  }

  return {
    generate: generate,
    buildMatrix: buildMatrix,
    isWorking_: isWorking_,
    buildPlacementLookup_: buildPlacementLookup_
  };
})();
