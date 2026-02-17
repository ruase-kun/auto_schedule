/**
 * 09_PlacementEngine.js — 配置エンジン（純粋ロジック）
 *
 * 全コマ×全持ち場の自動配置を生成する。
 * シートI/Oなし。ステートレス設計。
 *
 * 制約チェック:
 *   H1: 出勤時間内  H2: Lv≠0  H3: Lv>=requiredLv
 *   H4: 前コマ同一持ち場除外  H5: 同一コマ多重配置なし
 *   H6a: 休憩中でない  H6b: 休憩前後除外行でない
 *   H7: 除外でない  H8: 候補0人→空欄  H9: activeWindows外→スキップ
 */

var PlacementEngine = (function () {

  /**
   * 全コマ×全持ち場の配置を生成する — Phase 4完了条件の関数
   *
   * @param {Object} params - GenerateParams
   * @param {TimeSlot[]} params.slots - コマ定義（startMin昇順）
   * @param {PostPreset[]} params.presets - order ASC, postName ASC でソート済み
   * @param {Staff[]} params.staffList - 出勤スタッフ一覧
   * @param {Object<string, Object<string, number>>} params.skills - スキルマップ
   * @param {BreakAssignment[]} params.breakAssignments - 休憩割当
   * @param {number} params.breakDuration - 休憩時間（分）
   * @param {Object<string, number[]>} params.breakExcludedRows - 休憩前後除外行
   * @param {Exclusions} params.exclusions - 除外情報
   * @param {Function} [randomFn] - テスト用ランダム関数（省略時 Math.random）
   * @returns {Placement[]}
   */
  function generate(params, randomFn) {
    var rng = randomFn || Math.random;
    var slots = params.slots;
    var presets = params.presets;
    var staffList = params.staffList;
    var skills = params.skills;
    var breakAssignments = params.breakAssignments;
    var breakDuration = params.breakDuration;
    var breakExcludedRows = params.breakExcludedRows;
    var exclusions = params.exclusions;

    var placements = [];
    var prevSlotMap = {};  // postName -> staffName（前コマ、H4用）
    var biasMap = {};      // staffName -> { postName -> count }（偏り抑制用）

    for (var si = 0; si < slots.length; si++) {
      var slot = slots[si];
      var currentSlotMap = {};   // postName -> staffName（現コマ）
      var placedThisSlot = {};   // staffName -> true（H5多重配置チェック用）
      var carryMap = {};         // targetPost -> staffName（carry予約）

      for (var pi = 0; pi < presets.length; pi++) {
        var preset = presets[pi];

        if (!preset.enabled) continue;
        if (!isWithinActiveWindow_(preset, slot.startMin)) continue;  // H9

        var post = preset.postName;

        // carry予約チェック: carry元が先に処理された場合
        if (carryMap[post]) {
          var carryStaff = carryMap[post];
          placements.push({
            slotIndex: si,
            timeMin: slot.startMin,
            rowNumber: slot.rowNumber,
            postName: post,
            staffName: carryStaff,
            source: 'carry'
          });
          currentSlotMap[post] = carryStaff;
          placedThisSlot[carryStaff] = true;
          // biasMap更新
          if (!biasMap[carryStaff]) biasMap[carryStaff] = {};
          biasMap[carryStaff][post] = (biasMap[carryStaff][post] || 0) + 1;
          delete carryMap[post];
          continue;
        }

        // 候補取得 (H1, H2, H3, H5, H6a, H6b, H7)
        var candidates = getCandidates_(
          staffList, slot, preset, skills, exclusions,
          breakAssignments, breakDuration, breakExcludedRows, placedThisSlot
        );

        // H4: 前コマ同一持ち場除外
        var prevStaff = prevSlotMap[post];
        if (prevStaff) {
          candidates = candidates.filter(function (c) {
            return c.name !== prevStaff;
          });
        }

        // スキルソート（preset.sortDir: ASC=低→高, DESC=高→低）
        candidates.sort(function (a, b) {
          if (preset.sortDir === 'DESC') return b.lv - a.lv;
          return a.lv - b.lv;
        });

        // 偏り抑制＋ランダム選出
        var selected = applyBiasAndSelect_(candidates, post, biasMap, rng);

        if (selected) {
          // H8: 候補ありの場合のみPlacement出力
          placements.push({
            slotIndex: si,
            timeMin: slot.startMin,
            rowNumber: slot.rowNumber,
            postName: post,
            staffName: selected.name,
            source: 'auto'
          });
          currentSlotMap[post] = selected.name;
          placedThisSlot[selected.name] = true;
          if (!biasMap[selected.name]) biasMap[selected.name] = {};
          biasMap[selected.name][post] = (biasMap[selected.name][post] || 0) + 1;

          // carry処理
          if (preset.concurrentPost) {
            carryMap[preset.concurrentPost] = selected.name;
          }
        }
      }

      // carry遡及適用（carry先がcarry元より先に処理された場合）
      var carryTargets = Object.keys(carryMap);
      for (var ci = 0; ci < carryTargets.length; ci++) {
        var targetPost = carryTargets[ci];
        var carryName = carryMap[targetPost];

        if (currentSlotMap[targetPost] !== undefined) {
          // 既存Placementエントリを書換え
          for (var ri = placements.length - 1; ri >= 0; ri--) {
            if (placements[ri].slotIndex === si &&
                placements[ri].postName === targetPost) {
              placements[ri].staffName = carryName;
              placements[ri].source = 'carry';
              break;
            }
          }
        } else {
          // carry先がまだ処理されていない（activeWindowsでスキップ等）→ carry配置追加
          placements.push({
            slotIndex: si,
            timeMin: slot.startMin,
            rowNumber: slot.rowNumber,
            postName: targetPost,
            staffName: carryName,
            source: 'carry'
          });
        }
        currentSlotMap[targetPost] = carryName;
        placedThisSlot[carryName] = true;
        if (!biasMap[carryName]) biasMap[carryName] = {};
        biasMap[carryName][targetPost] = (biasMap[carryName][targetPost] || 0) + 1;
      }

      prevSlotMap = currentSlotMap;
    }

    return placements;
  }

  /**
   * 休憩前後除外行の事前計算
   *
   * @param {BreakAssignment[]} breakAssignments - 休憩割当
   * @param {TimeRow[]} timeRows - テンプレ時間行
   * @param {Object<number, number[]>} breakExclusionMap - 休憩行→除外行マッピング
   * @returns {Object<string, number[]>} name → 除外行番号[]
   */
  function buildBreakExcludedRows(breakAssignments, timeRows, breakExclusionMap) {
    // timeMin → rowNumber マッピング
    var timeMinToRow = {};
    for (var t = 0; t < timeRows.length; t++) {
      timeMinToRow[timeRows[t].timeMin] = timeRows[t].rowNumber;
    }

    var result = {};
    for (var b = 0; b < breakAssignments.length; b++) {
      var ba = breakAssignments[b];
      var breakRow = timeMinToRow[ba.breakAtMin];
      if (breakRow === undefined) continue; // データ不一致時は安全にスキップ

      var excludedRows = breakExclusionMap[breakRow] || [];
      for (var n = 0; n < ba.names.length; n++) {
        var name = ba.names[n];
        if (!result[name]) result[name] = [];
        for (var e = 0; e < excludedRows.length; e++) {
          result[name].push(excludedRows[e]);
        }
      }
    }

    return result;
  }

  /**
   * activeWindows判定（H9）
   *
   * @param {PostPreset} preset
   * @param {number} timeMin
   * @returns {boolean}
   */
  function isWithinActiveWindow_(preset, timeMin) {
    if (preset.activeWindows.length === 0) return true; // 空 = 終日有効
    for (var i = 0; i < preset.activeWindows.length; i++) {
      var w = preset.activeWindows[i];
      if (w.startMin <= timeMin && timeMin < w.endMin) return true; // 半開区間
    }
    return false;
  }

  /**
   * 候補フィルタ（H1, H2, H3, H5, H6a, H6b, H7）
   *
   * @param {Staff[]} staffList
   * @param {TimeSlot} slot
   * @param {PostPreset} preset
   * @param {Object<string, Object<string, number>>} skills
   * @param {Exclusions} exclusions
   * @param {BreakAssignment[]} breakAssignments
   * @param {number} breakDuration
   * @param {Object<string, number[]>} breakExcludedRows
   * @param {Object<string, boolean>} placedThisSlot
   * @returns {Array<{name: string, lv: number}>}
   */
  function getCandidates_(staffList, slot, preset, skills, exclusions,
                          breakAssignments, breakDuration, breakExcludedRows,
                          placedThisSlot) {
    var candidates = [];
    var post = preset.postName;
    var timeMin = slot.startMin;
    var rowNumber = slot.rowNumber;

    for (var i = 0; i < staffList.length; i++) {
      var staff = staffList[i];
      var name = staff.name;

      // H1: 出勤時間内
      if (staff.shiftStartMin > timeMin || timeMin >= staff.shiftEndMin) continue;

      // H5: 同一コマ多重配置なし
      if (placedThisSlot[name]) continue;

      // H7: 除外でない
      if (ExclusionService.isExcluded(exclusions, name, timeMin)) continue;

      // H6a: 休憩中でない
      if (BreakService.isOnBreak(breakAssignments, name, timeMin, breakDuration)) continue;

      // H6b: 休憩前後除外行でない
      if (breakExcludedRows[name] &&
          breakExcludedRows[name].indexOf(rowNumber) !== -1) continue;

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

  /**
   * 偏り抑制＋ランダム選出
   *
   * 1. candidates はスキルLvでソート済み（ASC or DESC）
   * 2. 最優先Lvグループ（先頭と同じLvの候補群）を抽出
   * 3. グループ内で biasMap[name][postName] 昇順ソート（少ない人優先）
   * 4. 最小bias値の候補群からランダム選出
   * 5. 候補0人なら null
   *
   * @param {Array<{name: string, lv: number}>} candidates - ソート済み候補
   * @param {string} postName
   * @param {Object<string, Object<string, number>>} biasMap
   * @param {Function} randomFn
   * @returns {{name: string, lv: number}|null}
   */
  function applyBiasAndSelect_(candidates, postName, biasMap, randomFn) {
    if (candidates.length === 0) return null;

    // 最優先Lvグループを抽出
    var topLv = candidates[0].lv;
    var topGroup = [];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].lv === topLv) {
        topGroup.push(candidates[i]);
      } else {
        break;
      }
    }

    // グループ内でbias昇順ソート
    topGroup.sort(function (a, b) {
      var biasA = (biasMap[a.name] && biasMap[a.name][postName]) || 0;
      var biasB = (biasMap[b.name] && biasMap[b.name][postName]) || 0;
      return biasA - biasB;
    });

    // 最小bias値の候補群を抽出
    var minBias = (biasMap[topGroup[0].name] && biasMap[topGroup[0].name][postName]) || 0;
    var minBiasGroup = [];
    for (var j = 0; j < topGroup.length; j++) {
      var bVal = (biasMap[topGroup[j].name] && biasMap[topGroup[j].name][postName]) || 0;
      if (bVal === minBias) {
        minBiasGroup.push(topGroup[j]);
      } else {
        break;
      }
    }

    // ランダム選出
    var idx = Math.floor(randomFn() * minBiasGroup.length);
    return minBiasGroup[idx];
  }

  return {
    generate: generate,
    buildBreakExcludedRows: buildBreakExcludedRows,
    // テスト用に内部関数も公開
    isWithinActiveWindow_: isWithinActiveWindow_,
    getCandidates_: getCandidates_,
    applyBiasAndSelect_: applyBiasAndSelect_
  };

})();
