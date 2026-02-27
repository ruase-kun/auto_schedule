/**
 * 16_ReplacementEngine.js — 欠勤者再配置エンジン（純粋ロジック）
 *
 * 生成済み日付シートから配置を読み取り、欠勤者のセルを空にして
 * 浮きスタッフで穴埋めする。シートI/Oなし、ステートレス設計。
 *
 * 依存: ExclusionService, BreakService, PlacementEngine (applyBiasAndSelect_)
 */

var ReplacementEngine = (function () {
  'use strict';

  /**
   * 日付シートの2D配列から既存配置を読み取る（writePlacements_ の逆操作）
   *
   * @param {Array<Array<*>>} sheetData - シートの2D配列（getValues()結果）
   * @param {Array<{name: string, colIndex: number}>} posts - 持ち場一覧
   * @param {TimeRow[]} timeRows - テンプレ時間行
   * @returns {Placement[]} 既存配置一覧
   */
  function readPlacementsFromSheet(sheetData, posts, timeRows) {
    var placements = [];

    for (var t = 0; t < timeRows.length; t++) {
      var row = timeRows[t];
      var rowIdx = row.rowNumber - 1; // 0始まりインデックス
      if (rowIdx < 0 || rowIdx >= sheetData.length) continue;

      var rowData = sheetData[rowIdx];

      for (var p = 0; p < posts.length; p++) {
        var post = posts[p];
        var cellValue = rowData[post.colIndex];
        var staffName = (cellValue !== null && cellValue !== undefined)
          ? String(cellValue).trim() : '';

        if (staffName !== '') {
          placements.push({
            slotIndex: 0,
            timeMin: row.timeMin,
            rowNumber: row.rowNumber,
            postName: post.name,
            staffName: staffName,
            source: 'auto'
          });
        }
      }
    }

    return placements;
  }

  /**
   * 日付シートのB列から休憩割当をパースする
   *
   * @param {Array<Array<*>>} sheetData - シートの2D配列
   * @param {TimeRow[]} timeRows - テンプレ時間行
   * @returns {BreakAssignment[]} 休憩割当一覧
   */
  function readBreakAssignmentsFromSheet(sheetData, timeRows) {
    var assignments = [];

    for (var t = 0; t < timeRows.length; t++) {
      var row = timeRows[t];
      var rowIdx = row.rowNumber - 1;
      if (rowIdx < 0 || rowIdx >= sheetData.length) continue;

      var cellValue = sheetData[rowIdx][1]; // B列 = index 1
      var text = (cellValue !== null && cellValue !== undefined)
        ? String(cellValue).trim() : '';

      if (text !== '') {
        var names = text.split(',');
        var cleaned = [];
        for (var n = 0; n < names.length; n++) {
          var name = names[n].trim();
          if (name !== '') cleaned.push(name);
        }
        if (cleaned.length > 0) {
          assignments.push({
            breakAtMin: row.timeMin,
            names: cleaned
          });
        }
      }
    }

    return assignments;
  }

  /**
   * 配置一覧からユニークなスタッフ名を抽出する
   *
   * @param {Placement[]} placements - 配置一覧
   * @returns {string[]} ユニークスタッフ名一覧
   */
  function extractStaffFromPlacements(placements) {
    var seen = {};
    var result = [];
    for (var i = 0; i < placements.length; i++) {
      var name = placements[i].staffName;
      if (!seen[name]) {
        seen[name] = true;
        result.push(name);
      }
    }
    return result;
  }

  /**
   * 欠勤者を配置から除去し、残り配置とギャップに分離する
   *
   * @param {Placement[]} placements - 全配置
   * @param {string[]} absentNames - 欠勤者名リスト
   * @returns {{remaining: Placement[], gaps: ReplacementGap[]}}
   */
  function identifyGaps(placements, absentNames) {
    var absentSet = {};
    for (var a = 0; a < absentNames.length; a++) {
      absentSet[absentNames[a]] = true;
    }

    var remaining = [];
    var gaps = [];

    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      if (absentSet[p.staffName]) {
        gaps.push({
          timeMin: p.timeMin,
          rowNumber: p.rowNumber,
          postName: p.postName
        });
      } else {
        remaining.push(p);
      }
    }

    return { remaining: remaining, gaps: gaps };
  }

  /**
   * ギャップをスロット（コマ定義）単位でグループ化する
   *
   * 同一スロット×同一持ち場のギャップ行をまとめ、1人で全行を埋められるようにする。
   * config未指定時は各行を独立グループとして扱う（後方互換）。
   *
   * @param {ReplacementGap[]} gaps
   * @param {Config|null} config
   * @param {TimeRow[]|null} timeRows
   * @returns {Array<{postName: string, timeMin: number, rowNumber: number, slotEndMin: number, rows: Array<{timeMin: number, rowNumber: number}>}>}
   */
  function groupGapsBySlot_(gaps, config, timeRows) {
    // config 未指定 → 各行が独立グループ
    if (!config || !timeRows || timeRows.length === 0) {
      var fallback = [];
      for (var i = 0; i < gaps.length; i++) {
        fallback.push({
          postName: gaps[i].postName,
          timeMin: gaps[i].timeMin,
          rowNumber: gaps[i].rowNumber,
          slotEndMin: gaps[i].timeMin + 30,
          rows: [{ timeMin: gaps[i].timeMin, rowNumber: gaps[i].rowNumber }]
        });
      }
      return fallback;
    }

    var startTimeMin = timeRows[0].timeMin;

    // スロット境界ルックアップ関数を構築
    var getSlotInfo; // returns { startMin, endMin }

    if (config.placementMode === 'perPost') {
      // 個別配置モード: 持ち場別のコマ間隔で境界を決定
      var postIntervals = config.postIntervals || {};
      getSlotInfo = function (postName, timeMin) {
        var intervalKoma = postIntervals[postName] || 3;
        var intervalMin = intervalKoma * 30;
        var offset = timeMin - startTimeMin;
        var slotStart = startTimeMin + Math.floor(offset / intervalMin) * intervalMin;
        return { startMin: slotStart, endMin: slotStart + intervalMin };
      };
    } else {
      // 一括配置モード: config.slots の境界を使用
      var slots = config.slots || [];
      getSlotInfo = function (postName, timeMin) {
        for (var s = 0; s < slots.length; s++) {
          if (slots[s].startMin <= timeMin && timeMin < slots[s].endMin) {
            return { startMin: slots[s].startMin, endMin: slots[s].endMin };
          }
        }
        // スロットに該当しない場合は30分行として扱う
        return { startMin: timeMin, endMin: timeMin + 30 };
      };
    }

    // ギャップを (postName, slotStartMin) でグループ化
    var groupMap = {};
    for (var g = 0; g < gaps.length; g++) {
      var gap = gaps[g];
      var slotInfo = getSlotInfo(gap.postName, gap.timeMin);
      var key = gap.postName + '@' + slotInfo.startMin;
      if (!groupMap[key]) {
        groupMap[key] = {
          postName: gap.postName,
          timeMin: slotInfo.startMin,
          rowNumber: gap.rowNumber,
          slotEndMin: slotInfo.endMin,
          rows: []
        };
      }
      groupMap[key].rows.push({ timeMin: gap.timeMin, rowNumber: gap.rowNumber });
    }

    var groups = [];
    var keys = Object.keys(groupMap);
    for (var k = 0; k < keys.length; k++) {
      var grp = groupMap[keys[k]];
      // rows を timeMin 昇順ソート
      grp.rows.sort(function (a, b) { return a.timeMin - b.timeMin; });
      // 代表 rowNumber は最初の行
      grp.rowNumber = grp.rows[0].rowNumber;
      // 代表 timeMin はスロット開始（ただしギャップが無い場合は最初のギャップ行）
      grp.timeMin = grp.rows[0].timeMin;
      groups.push(grp);
    }
    return groups;
  }

  /**
   * ギャップを浮きスタッフで充填する（メインロジック）
   *
   * コマ定義に基づきギャップをスロット単位でグループ化し、
   * 同一スロット内は同じ人で埋める。
   *
   * @param {Object} params
   * @param {ReplacementGap[]} params.gaps - ギャップ一覧
   * @param {Placement[]} params.remaining - 残り配置
   * @param {PostPreset[]} params.presets - プリセット一覧（order情報用）
   * @param {Staff[]} params.staffList - 全スタッフ（欠勤者含む）
   * @param {string[]} params.absentNames - 欠勤者名リスト
   * @param {Object<string, Object<string, number>>} params.skills - スキルマップ
   * @param {BreakAssignment[]} params.breakAssignments - 休憩割当
   * @param {number} params.breakDuration - 休憩時間（分）
   * @param {Object<string, number[]>} params.breakExcludedRows - 休憩前後除外行
   * @param {Object<string, Object<number, boolean>>} params.breakBufferPeriods - 休憩前後バッファ
   * @param {Exclusions} params.exclusions - 除外情報（欠勤者allDay設定済み）
   * @param {string[]} [params.log] - ログ配列（渡された場合のみ詳細をpush）
   * @param {Config} [params.config] - コンフィグ（スロットグループ化用）
   * @param {TimeRow[]} [params.timeRows] - テンプレ時間行（スロットグループ化用）
   * @returns {ReplacementResult} { filled, unfilled }
   */
  function fillGaps(params) {
    var gaps = params.gaps;
    var remaining = params.remaining;
    var presets = params.presets;
    var staffList = params.staffList;
    var skills = params.skills;
    var breakAssignments = params.breakAssignments;
    var breakDuration = params.breakDuration;
    var breakExcludedRows = params.breakExcludedRows;
    var breakBufferPeriods = params.breakBufferPeriods;
    var exclusions = params.exclusions;
    var log = params.log || null;
    var config = params.config || null;
    var timeRows = params.timeRows || null;

    // プリセットのorder検索用マップ
    var presetMap = {};
    for (var pi = 0; pi < presets.length; pi++) {
      presetMap[presets[pi].postName] = presets[pi];
    }

    // 1. ギャップをスロット単位でグループ化
    var gapGroups = groupGapsBySlot_(gaps, config, timeRows);

    // 2. グループを timeMin昇順 → preset.order昇順 でソート
    gapGroups.sort(function (a, b) {
      if (a.timeMin !== b.timeMin) return a.timeMin - b.timeMin;
      var orderA = presetMap[a.postName] ? presetMap[a.postName].order : 999;
      var orderB = presetMap[b.postName] ? presetMap[b.postName].order : 999;
      return orderA - orderB;
    });

    // 3. remaining から placementMap（timeMin → { staffName: true }）を構築
    var placementMap = {};
    for (var r = 0; r < remaining.length; r++) {
      var tm = remaining[r].timeMin;
      if (!placementMap[tm]) placementMap[tm] = {};
      placementMap[tm][remaining[r].staffName] = true;
    }

    // 4. remaining から biasMap を初期化（公平性のため既存配置もカウント）
    var biasMap = {};
    for (var rb = 0; rb < remaining.length; rb++) {
      var sn = remaining[rb].staffName;
      var pn = remaining[rb].postName;
      if (!biasMap[sn]) biasMap[sn] = {};
      biasMap[sn][pn] = (biasMap[sn][pn] || 0) + 1;
    }

    // 5. 同一持ち場の配置マップ（H4用、remaining + 充填済みから構築）
    // postName → { timeMin → staffName }
    var postTimeStaffMap = {};
    for (var rm = 0; rm < remaining.length; rm++) {
      var rp = remaining[rm];
      if (!postTimeStaffMap[rp.postName]) postTimeStaffMap[rp.postName] = {};
      postTimeStaffMap[rp.postName][rp.timeMin] = rp.staffName;
    }

    var filled = [];
    var unfilled = [];

    if (log) {
      log.push('--- 穴埋め詳細 ---');
    }

    // 6. 各グループについて候補取得→選出
    for (var g = 0; g < gapGroups.length; g++) {
      var group = gapGroups[g];
      var preset = presetMap[group.postName];
      if (!preset) {
        for (var ur = 0; ur < group.rows.length; ur++) {
          unfilled.push({
            timeMin: group.rows[ur].timeMin,
            rowNumber: group.rows[ur].rowNumber,
            postName: group.postName
          });
        }
        if (log) {
          log.push('[' + TimeUtils.minToTimeStr(group.timeMin) + '] ' +
            group.postName + ': プリセットなし → (空)');
        }
        continue;
      }

      // 候補取得（H1, H2, H3, H5, H6a, H6b, H6c, H7）— 代表行で判定
      var candidates = getCandidatesForGap_(
        staffList, group.timeMin, group.rowNumber, preset, skills, exclusions,
        breakAssignments, breakDuration, breakExcludedRows,
        placementMap, breakBufferPeriods
      );

      // H5追加: グループ内の全行でH5チェック（他持ち場と多重配置防止）
      if (group.rows.length > 1) {
        candidates = candidates.filter(function (c) {
          for (var ri = 0; ri < group.rows.length; ri++) {
            var rtm = group.rows[ri].timeMin;
            if (placementMap[rtm] && placementMap[rtm][c.name]) return false;
          }
          return true;
        });
      }

      // H4: スロット境界の前後にいる人を除外
      var postTimes = postTimeStaffMap[group.postName] || {};
      var adjacentStaff = {};
      var h4Names = [];
      // 前: グループ先頭の直前行
      var prevName = postTimes[group.rows[0].timeMin - 30];
      if (prevName) { adjacentStaff[prevName] = true; h4Names.push(prevName); }
      // 後: グループ末尾の直後行
      var lastRowTimeMin = group.rows[group.rows.length - 1].timeMin;
      var nextName = postTimes[lastRowTimeMin + 30];
      if (nextName) { adjacentStaff[nextName] = true; h4Names.push(nextName); }

      candidates = candidates.filter(function (c) {
        return !adjacentStaff[c.name];
      });

      // スキルソート（preset.sortDir）
      candidates.sort(function (a, b) {
        if (preset.sortDir === 'DESC') return b.lv - a.lv;
        return a.lv - b.lv;
      });

      // 偏り抑制＋ランダム選出
      var selected = PlacementEngine.applyBiasAndSelect_(
        candidates, group.postName, biasMap, Math.random
      );

      // ログ: 各グループの配置判断詳細
      if (log) {
        var candDesc = [];
        for (var ci = 0; ci < candidates.length; ci++) {
          candDesc.push(candidates[ci].name + '(' + candidates[ci].lv + ')');
        }
        var biasDesc = [];
        for (var bi = 0; bi < candidates.length; bi++) {
          var bv = (biasMap[candidates[bi].name] && biasMap[candidates[bi].name][group.postName]) || 0;
          biasDesc.push(bv);
        }
        var h4Str = h4Names.length > 0 ? h4Names.join(',') : '-';
        var selStr = selected ? selected.name : '(空)';
        var timeLabel = TimeUtils.minToTimeStr(group.timeMin);
        if (group.rows.length > 1) {
          timeLabel += '~' + TimeUtils.minToTimeStr(lastRowTimeMin + 30);
        }
        log.push('[' + timeLabel + '] ' +
          group.postName + '(' + preset.sortDir + ',Lv' + preset.requiredLv + '): ' +
          '候補' + candidates.length + '[' + candDesc.join(',') + '] ' +
          'bias[' + biasDesc.join(',') + '] ' +
          'H4除外:' + h4Str + ' → ' + selStr +
          (group.rows.length > 1 ? ' (' + group.rows.length + '行)' : ''));
      }

      if (selected) {
        // グループ内の全行にPlacementを生成
        for (var fr = 0; fr < group.rows.length; fr++) {
          var row = group.rows[fr];
          filled.push({
            slotIndex: 0,
            timeMin: row.timeMin,
            rowNumber: row.rowNumber,
            postName: group.postName,
            staffName: selected.name,
            source: 'auto'
          });

          // placementMap 更新（後続グループのH5判定用）
          if (!placementMap[row.timeMin]) placementMap[row.timeMin] = {};
          placementMap[row.timeMin][selected.name] = true;

          // postTimeStaffMap 更新（後続グループのH4判定用）
          if (!postTimeStaffMap[group.postName]) postTimeStaffMap[group.postName] = {};
          postTimeStaffMap[group.postName][row.timeMin] = selected.name;
        }

        // biasMap 更新（行数分カウント — remainingと同じ粒度）
        if (!biasMap[selected.name]) biasMap[selected.name] = {};
        biasMap[selected.name][group.postName] =
          (biasMap[selected.name][group.postName] || 0) + group.rows.length;
      } else {
        // 全行未充填
        for (var ufr = 0; ufr < group.rows.length; ufr++) {
          unfilled.push({
            timeMin: group.rows[ufr].timeMin,
            rowNumber: group.rows[ufr].rowNumber,
            postName: group.postName
          });
        }
      }
    }

    return { filled: filled, unfilled: unfilled };
  }

  /**
   * ギャップ候補フィルタ（H1, H2, H3, H5, H6a, H6b, H6c, H7）
   * PlacementEngine.getCandidatesPerPost_ と同等だが H10（シフトカバー）不要。
   *
   * @param {Staff[]} staffList
   * @param {number} timeMin
   * @param {number} rowNumber
   * @param {PostPreset} preset
   * @param {Object<string, Object<string, number>>} skills
   * @param {Exclusions} exclusions
   * @param {BreakAssignment[]} breakAssignments
   * @param {number} breakDuration
   * @param {Object<string, number[]>} breakExcludedRows
   * @param {Object<number, Object<string, boolean>>} placementMap - timeMin → { name: true }
   * @param {Object<string, Object<number, boolean>>} breakBufferPeriods
   * @returns {Array<{name: string, lv: number}>}
   */
  function getCandidatesForGap_(staffList, timeMin, rowNumber, preset, skills,
                                 exclusions, breakAssignments, breakDuration,
                                 breakExcludedRows, placementMap, breakBufferPeriods) {
    var candidates = [];
    var post = preset.postName;
    var placedAtTime = placementMap[timeMin] || {};

    for (var i = 0; i < staffList.length; i++) {
      var staff = staffList[i];
      var name = staff.name;

      // H1: 出勤時間内
      if (staff.shiftStartMin > timeMin || timeMin >= staff.shiftEndMin) continue;

      // H5: 同一時刻多重配置なし
      if (placedAtTime[name]) continue;

      // H7: 除外でない（欠勤者はallDay除外済み）
      if (ExclusionService.isExcluded(exclusions, name, timeMin)) continue;

      // H6a: 休憩中でない
      if (BreakService.isOnBreak(breakAssignments, name, timeMin, breakDuration)) continue;

      // H6b: 休憩前後除外行でない
      if (breakExcludedRows[name] &&
          breakExcludedRows[name].indexOf(rowNumber) !== -1) continue;

      // H6c: 休憩前後バッファ（timeMinベース）
      if (breakBufferPeriods[name] && breakBufferPeriods[name][timeMin]) continue;

      // H2: Lv ≠ 0
      var staffSkills = skills[name] || {};
      var lv = staffSkills[post] !== undefined ? staffSkills[post] : 0;
      if (lv === 0) continue;

      // H3: Lv >= requiredLv
      if (lv < preset.requiredLv) continue;

      candidates.push({ name: name, lv: lv });
    }

    return candidates;
  }

  return {
    readPlacementsFromSheet: readPlacementsFromSheet,
    readBreakAssignmentsFromSheet: readBreakAssignmentsFromSheet,
    extractStaffFromPlacements: extractStaffFromPlacements,
    identifyGaps: identifyGaps,
    fillGaps: fillGaps,
    // テスト用
    getCandidatesForGap_: getCandidatesForGap_,
    groupGapsBySlot_: groupGapsBySlot_
  };

})();
