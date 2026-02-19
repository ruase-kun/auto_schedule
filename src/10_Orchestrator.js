/**
 * 10_Orchestrator.js — サービス統合＋シート書込み
 *
 * 全サービスを統合し、配置結果を日付シートに出力する。
 */

var Orchestrator = (function () {

  /**
   * 全サービス統合→シート出力
   *
   * @param {Object} params - OrchestratorParams
   * @param {Date}   params.targetDate      - 対象日付
   * @param {string} params.extractSheet    - 抽出シート名
   * @param {string} params.templateSheet   - テンプレートシート名
   * @param {string} params.skillSheet      - スキルレベル表シート名
   * @param {string} params.presetSheet     - プリセットシート名
   * @param {string} params.configSheet     - コンフィグシート名
   * @param {Exclusions} params.exclusions  - 除外情報
   * @param {string} params.dateSheetName   - 出力シート名（例: '03/15(土)'）
   * @returns {{placements: Placement[], breakAssignments: BreakAssignment[]}}
   */
  function run(params) {
    // 1. コンフィグ読込
    var config = ConfigService.loadConfig(params.configSheet);

    // 2. プリセット読込
    var presets = PresetService.loadPresets(params.presetSheet);

    // 3. 出勤者抽出
    var staffList = AttendanceService.getAttendees(
      params.extractSheet, params.targetDate, config.shiftTimes
    );

    // 4. スキル読込
    var skillData = SkillService.loadSkills(params.skillSheet);

    // 5. 雇用形態結合
    SkillService.mergeEmployment(staffList, skillData.employmentMap);

    // 6. 休憩割当
    var breakAssignments = BreakService.assignBreaks(staffList, config, params.exclusions);

    // 7. テンプレ時間行取得
    var timeRows = SheetGateway.getTimeRows(params.templateSheet);

    // 7.5. スロットの rowNumber 解決（新形式コマ定義対応）
    resolveSlotRows_(config.slots, timeRows);

    // 8. 持ち場検出
    var posts = SheetGateway.detectPosts(params.templateSheet);

    // 9. 休憩前後除外行の事前計算
    var breakExcludedRows = PlacementEngine.buildBreakExcludedRows(
      breakAssignments, timeRows, config.breakExclusionMap
    );

    // 10. 配置生成
    var placements = PlacementEngine.generate({
      slots: config.slots,
      presets: presets,
      staffList: staffList,
      skills: skillData.skills,
      breakAssignments: breakAssignments,
      breakDuration: config.breakDuration,
      breakExcludedRows: breakExcludedRows,
      exclusions: params.exclusions
    });

    // 10.5. 配置展開（1スロット→複数テンプレ行に展開）
    placements = expandPlacements_(placements, config.slots, timeRows);

    // 11. 既存日付シート削除
    SheetGateway.deleteSheetIfExists(params.dateSheetName);

    // 12. テンプレートコピー
    SheetGateway.copyTemplate(params.templateSheet, params.dateSheetName);

    // 12.5. 無効な持ち場の列を削除（左詰め）
    var disabledPostNames = PresetService.getDisabledPostNames(params.presetSheet);
    removeDisabledPostColumns_(params.dateSheetName, posts, disabledPostNames);

    // 12.6. 持ち場再検出（列削除後の正しいインデックスを取得）
    posts = SheetGateway.detectPosts(params.dateSheetName);

    // 13. 休憩列書込み
    writeBreakColumn_(params.dateSheetName, breakAssignments, timeRows);

    // 14. 配置結果書込み
    writePlacements_(params.dateSheetName, placements, posts);

    return {
      placements: placements,
      breakAssignments: breakAssignments
    };
  }

  /**
   * B列に休憩者をカンマ区切りで書込み
   *
   * @param {string} sheetName
   * @param {BreakAssignment[]} breakAssignments
   * @param {TimeRow[]} timeRows
   */
  function writeBreakColumn_(sheetName, breakAssignments, timeRows) {
    // timeMin → rowNumber マッピング
    var timeMinToRow = {};
    for (var t = 0; t < timeRows.length; t++) {
      timeMinToRow[timeRows[t].timeMin] = timeRows[t].rowNumber;
    }

    for (var i = 0; i < breakAssignments.length; i++) {
      var ba = breakAssignments[i];
      if (ba.names.length === 0) continue;

      var rowNumber = timeMinToRow[ba.breakAtMin];
      if (rowNumber === undefined) continue;

      var text = ba.names.join(',');
      // B列 = 列番号2
      SheetGateway.setValues(sheetName, rowNumber, 2, [[text]]);
    }
  }

  /**
   * 配置結果を持ち場セルに書込み（行単位バッチ）
   *
   * @param {string} sheetName
   * @param {Placement[]} placements
   * @param {Array<{name: string, colIndex: number}>} posts
   */
  function writePlacements_(sheetName, placements, posts) {
    if (placements.length === 0) return;

    // postName → colIndex マッピング
    var postColMap = {};
    var firstPostCol = Infinity;
    var lastPostCol = -1;
    for (var p = 0; p < posts.length; p++) {
      postColMap[posts[p].name] = posts[p].colIndex;
      if (posts[p].colIndex < firstPostCol) firstPostCol = posts[p].colIndex;
      if (posts[p].colIndex > lastPostCol) lastPostCol = posts[p].colIndex;
    }

    if (firstPostCol === Infinity) return;

    var numCols = lastPostCol - firstPostCol + 1;

    // placements を rowNumber でグループ化
    var rowGroups = {};
    for (var i = 0; i < placements.length; i++) {
      var pl = placements[i];
      var row = pl.rowNumber;
      if (!rowGroups[row]) rowGroups[row] = {};
      rowGroups[row][pl.postName] = pl.staffName;
    }

    // 各行について書込み
    var rowNumbers = Object.keys(rowGroups);
    for (var r = 0; r < rowNumbers.length; r++) {
      var rowNum = parseInt(rowNumbers[r], 10);
      var group = rowGroups[rowNum];

      // posts配列順で staffName の1D配列を構築
      var rowData = [];
      for (var c = firstPostCol; c <= lastPostCol; c++) {
        var staffName = '';
        // このcolIndexに対応するpostを探す
        for (var pp = 0; pp < posts.length; pp++) {
          if (posts[pp].colIndex === c && group[posts[pp].name]) {
            staffName = group[posts[pp].name];
            break;
          }
        }
        rowData.push(staffName);
      }

      // setValues: 1始まり列番号 = colIndex + 1
      SheetGateway.setValues(sheetName, rowNum, firstPostCol + 1, [rowData]);
    }
  }

  /**
   * スロットの rowNumber を解決する（新形式コマ定義対応）
   * rowNumber が null のスロットについて、テンプレ時間行から対応する行番号を設定する。
   *
   * @param {TimeSlot[]} slots
   * @param {TimeRow[]} timeRows
   */
  function resolveSlotRows_(slots, timeRows) {
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].rowNumber !== null && slots[i].rowNumber !== undefined) continue;
      // slot.startMin 以上の最初のテンプレ行を探す
      for (var t = 0; t < timeRows.length; t++) {
        if (timeRows[t].timeMin >= slots[i].startMin) {
          slots[i].rowNumber = timeRows[t].rowNumber;
          break;
        }
      }
      // 見つからなければ最終行
      if (slots[i].rowNumber === null || slots[i].rowNumber === undefined) {
        slots[i].rowNumber = timeRows[timeRows.length - 1].rowNumber;
      }
    }
  }

  /**
   * 無効な持ち場の列を生成シートから削除する（右から左の順で削除）
   *
   * @param {string} sheetName - 生成シート名
   * @param {Array<{name: string, colIndex: number}>} posts - テンプレートの持ち場一覧
   * @param {PostPreset[]} presets - プリセット一覧（enabled=false を含む）
   */
  function removeDisabledPostColumns_(sheetName, posts, disabledPostNames) {
    if (disabledPostNames.length === 0) return;

    var disabledSet = {};
    for (var i = 0; i < disabledPostNames.length; i++) {
      disabledSet[disabledPostNames[i]] = true;
    }

    // 削除対象の列番号（1始まり）を収集
    var colsToDelete = [];
    for (var p = 0; p < posts.length; p++) {
      if (disabledSet[posts[p].name]) {
        colsToDelete.push(posts[p].colIndex + 1);
      }
    }
    if (colsToDelete.length === 0) return;

    // 右から左へ削除（インデックスずれ防止）
    colsToDelete.sort(function (a, b) { return b - a; });
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    for (var d = 0; d < colsToDelete.length; d++) {
      sheet.deleteColumn(colsToDelete[d]);
    }
  }

  /**
   * 配置を時間帯内の全テンプレ行に展開する
   *
   * PlacementEngine は各スロットにつき1行分の配置を生成するが、
   * スロットが複数のテンプレ行にまたがる場合（例: 10:00-11:30）、
   * 該当する全行（10:00, 10:30, 11:00）に同じ人を配置する。
   *
   * スロットの startMin == endMin - 30（1行分）の場合は展開不要。
   *
   * @param {Placement[]} placements
   * @param {TimeSlot[]} slots
   * @param {TimeRow[]} timeRows
   * @returns {Placement[]}
   */
  function expandPlacements_(placements, slots, timeRows) {
    // スロットが全て1行分なら展開不要（高速パス）
    var needsExpansion = false;
    for (var s = 0; s < slots.length; s++) {
      if (slots[s].endMin - slots[s].startMin > 30) {
        needsExpansion = true;
        break;
      }
    }
    if (!needsExpansion) return placements;

    // slotIndex → テンプレ行リスト のマッピング構築
    var slotRowsMap = {};
    for (var si = 0; si < slots.length; si++) {
      var slot = slots[si];
      var rows = [];
      for (var t = 0; t < timeRows.length; t++) {
        var tr = timeRows[t];
        if (tr.timeMin >= slot.startMin && tr.timeMin < slot.endMin) {
          rows.push({ timeMin: tr.timeMin, rowNumber: tr.rowNumber });
        }
      }
      slotRowsMap[si] = rows;
    }

    // 展開
    var expanded = [];
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      var targetRows = slotRowsMap[p.slotIndex];
      if (!targetRows || targetRows.length <= 1) {
        // 展開不要（1行以下）
        expanded.push(p);
      } else {
        for (var r = 0; r < targetRows.length; r++) {
          expanded.push({
            slotIndex: p.slotIndex,
            timeMin: targetRows[r].timeMin,
            rowNumber: targetRows[r].rowNumber,
            postName: p.postName,
            staffName: p.staffName,
            source: p.source
          });
        }
      }
    }
    return expanded;
  }

  return {
    run: run
  };

})();
