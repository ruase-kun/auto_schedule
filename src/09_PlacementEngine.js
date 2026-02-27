/**
 * 09_PlacementEngine.js — 配置エンジン（純粋ロジック）
 *
 * 全コマ×全持ち場の自動配置を生成する。
 * シートI/Oなし。ステートレス設計。
 *
 * 制約チェック:
 *   H1: 出勤時間内  H2: Lv≠0  H3: Lv>=requiredLv
 *   H4: 前コマ同一持ち場除外  H5: 同一コマ多重配置なし
 *   H6a: 休憩中でない  H6b: 休憩前後除外行でない  H6c: 休憩前後バッファ（最近Nコマ）
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
   * @param {Object<string, number[]>} params.breakExcludedRows - 休憩前後除外行（H6b）
   * @param {number} [params.breakBufferBefore] - 休憩前バッファ（コマ数, 1コマ=30分）
   * @param {number} [params.breakBufferAfter]  - 休憩後バッファ（コマ数, 1コマ=30分）
   * @param {Exclusions} params.exclusions - 除外情報
   * @param {string[]} [params.log] - ログ配列（渡された場合のみ詳細をpush）
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
    var bufferBefore = params.breakBufferBefore || 0;
    var bufferAfter = params.breakBufferAfter || 0;
    var log = params.log || null;

    // H6c: 休憩前後バッファスロットの事前計算（バッファ指定ありの場合のみ）
    var breakBufferSlots = (bufferBefore > 0 || bufferAfter > 0)
      ? buildBreakBufferSlots(breakAssignments, slots, bufferBefore, bufferAfter)
      : {};

    // ログ: H6cバッファマップサマリ
    if (log && (bufferBefore > 0 || bufferAfter > 0)) {
      var bsNames = Object.keys(breakBufferSlots);
      if (bsNames.length > 0) {
        log.push('--- バッファ除外 ---');
        for (var bsi = 0; bsi < bsNames.length; bsi++) {
          var bsn = bsNames[bsi];
          var bsSlots = breakBufferSlots[bsn];
          var bsParts = [];
          for (var bss = 0; bss < bsSlots.length; bss++) {
            bsParts.push('slot' + bsSlots[bss] + '(' + TimeUtils.minToTimeStr(slots[bsSlots[bss]].startMin) + ')');
          }
          log.push(bsn + ': ' + bsParts.join(', '));
        }
        log.push('');
      }
    }

    // ログ: H6b除外行マップ
    if (log && !((bufferBefore > 0 || bufferAfter > 0))) {
      var berNames = Object.keys(breakExcludedRows);
      if (berNames.length > 0) {
        log.push('--- H6b除外行 ---');
        for (var beri = 0; beri < berNames.length; beri++) {
          log.push(berNames[beri] + ': row ' + breakExcludedRows[berNames[beri]].join(','));
        }
        log.push('');
      }
    }

    if (log) {
      log.push('--- 配置詳細 ---');
    }

    var placements = [];
    var prevSlotMap = {};  // postName -> staffName（前コマ、H4用）
    var biasMap = {};      // staffName -> { postName -> count }（偏り抑制用）

    for (var si = 0; si < slots.length; si++) {
      var slot = slots[si];
      var currentSlotMap = {};   // postName -> staffName（現コマ）
      var placedThisSlot = {};   // staffName -> true（H5多重配置チェック用）
      var carryMap = {};         // targetPost -> staffName（carry予約）

      if (log) {
        var slotEndStr = TimeUtils.minToTimeStr(slot.endMin);
        log.push('[slot' + si + ': ' + TimeUtils.minToTimeStr(slot.startMin) + '-' + slotEndStr + ']');
      }

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

        // 候補取得 (H1, H2, H3, H5, H6a, H6b, H6c, H7)
        var candidates = getCandidates_(
          staffList, slot, preset, skills, exclusions,
          breakAssignments, breakDuration, breakExcludedRows,
          placedThisSlot, si, breakBufferSlots
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

        // ログ: 各持ち場の配置判断詳細
        if (log) {
          var candDesc = [];
          for (var ci2 = 0; ci2 < candidates.length; ci2++) {
            candDesc.push(candidates[ci2].name + '(' + candidates[ci2].lv + ')');
          }
          var biasDesc = [];
          for (var bi2 = 0; bi2 < candidates.length; bi2++) {
            var bv = (biasMap[candidates[bi2].name] && biasMap[candidates[bi2].name][post]) || 0;
            biasDesc.push(bv);
          }
          var h4Str = prevStaff ? prevStaff : '-';
          var selStr = selected ? selected.name : '(空)';
          log.push('  ' + post + '(' + preset.sortDir + ',Lv' + preset.requiredLv + '): ' +
            '候補' + candidates.length + '[' + candDesc.join(',') + '] ' +
            'bias[' + biasDesc.join(',') + '] ' +
            'H4除外:' + h4Str + ' → ' + selStr);
        }

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
   * 休憩前後バッファスロットの事前計算（H6c用）
   *
   * スロット近接性ベース: breakAtMin に最も近い前後Nコマをバッファとして除外する。
   *
   * 前バッファ: startMin < breakAtMin のスロットのうち、breakAtMinに近い順にN個
   * 後バッファ: startMin > breakAtMin のスロットのうち、breakAtMinに近い順にN個
   *
   * 例: breakAtMin=14:00, before=1, after=1
   *   slots=[10:00, 11:30, 13:00, 14:30, 16:00, 17:30]
   *   → 前バッファ: 13:00（最も近い1コマ）
   *   → 後バッファ: 14:30（最も近い1コマ）
   *
   * @param {BreakAssignment[]} breakAssignments - 休憩割当
   * @param {TimeSlot[]} slots - コマ定義（startMin昇順）
   * @param {number} bufferBefore - 前バッファ（コマ数）
   * @param {number} bufferAfter  - 後バッファ（コマ数）
   * @returns {Object<string, number[]>} name → バッファスロットインデックス[]
   */
  function buildBreakBufferSlots(breakAssignments, slots, bufferBefore, bufferAfter) {
    var result = {};

    for (var b = 0; b < breakAssignments.length; b++) {
      var ba = breakAssignments[b];
      if (ba.names.length === 0) continue;

      var breakAtMin = ba.breakAtMin;
      var bufferSlotIndices = [];

      // 前バッファ: startMin < breakAtMin のスロットを近い順にN個
      if (bufferBefore > 0) {
        var beforeCandidates = [];
        for (var si = 0; si < slots.length; si++) {
          if (slots[si].startMin < breakAtMin) {
            beforeCandidates.push(si);
          }
        }
        // startMin降順（breakAtMinに近い順）
        beforeCandidates.sort(function (a, b2) { return slots[b2].startMin - slots[a].startMin; });
        for (var bi = 0; bi < Math.min(bufferBefore, beforeCandidates.length); bi++) {
          bufferSlotIndices.push(beforeCandidates[bi]);
        }
      }

      // 後バッファ: startMin > breakAtMin のスロットを近い順にN個
      if (bufferAfter > 0) {
        var afterCandidates = [];
        for (var si2 = 0; si2 < slots.length; si2++) {
          if (slots[si2].startMin > breakAtMin) {
            afterCandidates.push(si2);
          }
        }
        // startMin昇順（breakAtMinに近い順）
        afterCandidates.sort(function (a, b3) { return slots[a].startMin - slots[b3].startMin; });
        for (var ai = 0; ai < Math.min(bufferAfter, afterCandidates.length); ai++) {
          bufferSlotIndices.push(afterCandidates[ai]);
        }
      }

      // 各休憩者にバッファスロットをマッピング
      for (var n = 0; n < ba.names.length; n++) {
        var name = ba.names[n];
        if (!result[name]) result[name] = [];
        for (var bs = 0; bs < bufferSlotIndices.length; bs++) {
          if (result[name].indexOf(bufferSlotIndices[bs]) === -1) {
            result[name].push(bufferSlotIndices[bs]);
          }
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
   * 候補フィルタ（H1, H2, H3, H5, H6a, H6b, H6c, H7）
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
   * @param {number} slotIndex - 現在のスロットインデックス
   * @param {Object<string, number[]>} breakBufferSlots - 休憩前後バッファ
   * @returns {Array<{name: string, lv: number}>}
   */
  function getCandidates_(staffList, slot, preset, skills, exclusions,
                          breakAssignments, breakDuration, breakExcludedRows,
                          placedThisSlot, slotIndex, breakBufferSlots) {
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

      // H6c: 休憩前後バッファ（自動: 休憩の前後1スロット）
      if (breakBufferSlots[name] &&
          breakBufferSlots[name].indexOf(slotIndex) !== -1) continue;

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

  /**
   * 持ち場別ローテーション境界を事前計算する
   *
   * @param {PostPreset[]} presets - 有効なプリセット一覧
   * @param {Object<string, number>} postIntervals - 持ち場名→コマ数
   * @param {number} startTimeMin - テンプレ最初の時間行timeMin
   * @param {number} endTimeMin - テンプレ最後の時間行timeMin
   * @returns {{map: Object<string, Object<number, boolean>>, sorted: Object<string, number[]>}}
   */
  function buildPostBoundaries_(presets, postIntervals, startTimeMin, endTimeMin) {
    var map = {};
    var sorted = {};
    for (var i = 0; i < presets.length; i++) {
      var preset = presets[i];
      if (!preset.enabled) continue;
      var post = preset.postName;
      var intervalKoma = postIntervals[post] || 3;
      var intervalMin = intervalKoma * 30;
      map[post] = {};
      sorted[post] = [];
      for (var t = startTimeMin; t <= endTimeMin; t += intervalMin) {
        map[post][t] = true;
        sorted[post].push(t);
      }
    }
    return { map: map, sorted: sorted };
  }

  /**
   * ソート済み境界配列から、currentTimeMin の次の境界を返す
   * @param {number[]} sortedBounds - 昇順の境界時刻配列
   * @param {number} currentTimeMin - 現在の境界時刻
   * @returns {number|null} 次の境界時刻、なければ null
   */
  function getNextBoundary_(sortedBounds, currentTimeMin) {
    for (var i = 0; i < sortedBounds.length; i++) {
      if (sortedBounds[i] > currentTimeMin) return sortedBounds[i];
    }
    return null;
  }

  /**
   * 休憩前後バッファ期間の事前計算（perPostモード用、30分行ベース）
   *
   * @param {BreakAssignment[]} breakAssignments - 休憩割当
   * @param {TimeRow[]} timeRows - テンプレ時間行
   * @param {number} bufferBefore - 前バッファ（コマ数, 1コマ=30分）
   * @param {number} bufferAfter - 後バッファ（コマ数, 1コマ=30分）
   * @returns {Object<string, Object<number, boolean>>} name → { timeMin: true } バッファ除外セット
   */
  function buildBreakBufferPeriods_(breakAssignments, timeRows, bufferBefore, bufferAfter) {
    var result = {};
    // timeMin → timeRowsインデックス マッピング
    var timeMinToIdx = {};
    for (var t = 0; t < timeRows.length; t++) {
      timeMinToIdx[timeRows[t].timeMin] = t;
    }

    for (var b = 0; b < breakAssignments.length; b++) {
      var ba = breakAssignments[b];
      if (ba.names.length === 0) continue;
      var breakAtMin = ba.breakAtMin;

      // breakAtMinに最も近い時間行インデックスを見つける
      var breakIdx = -1;
      for (var ti = 0; ti < timeRows.length; ti++) {
        if (timeRows[ti].timeMin >= breakAtMin) {
          breakIdx = ti;
          break;
        }
      }
      if (breakIdx === -1) continue;

      var bufferTimeMins = {};

      // 前バッファ: breakIdx より前のN行
      for (var bi = 1; bi <= bufferBefore; bi++) {
        var idx = breakIdx - bi;
        if (idx >= 0) {
          bufferTimeMins[timeRows[idx].timeMin] = true;
        }
      }

      // 後バッファ: breakAtMin + breakDuration 以降最初のtimeRowから（後のN行は breakAtMin以降の行）
      // breakAtMinを含む行は休憩中（H6aで除外されるため）、ここではbreak直後の行からカウント
      for (var ai = 0; ai < timeRows.length; ai++) {
        if (timeRows[ai].timeMin > breakAtMin) {
          // breakAtMin直後の行からN個をバッファ
          for (var aj = 0; aj < bufferAfter; aj++) {
            var aIdx = ai + aj;
            if (aIdx < timeRows.length) {
              bufferTimeMins[timeRows[aIdx].timeMin] = true;
            }
          }
          break;
        }
      }

      // 各休憩者にバッファ期間をマッピング
      var bufKeys = Object.keys(bufferTimeMins);
      for (var n = 0; n < ba.names.length; n++) {
        var name = ba.names[n];
        if (!result[name]) result[name] = {};
        for (var bk = 0; bk < bufKeys.length; bk++) {
          result[name][parseInt(bufKeys[bk], 10)] = true;
        }
      }
    }
    return result;
  }

  /**
   * 個別配置モード: 持ち場ごとに異なるコマ間隔で配置を生成する
   *
   * 30分行ベースの反復処理。各持ち場のローテーション境界を事前計算し、
   * 時間行（30分刻み）を順に走査して、境界の持ち場のみ新しい候補選出を行う。
   *
   * @param {Object} params - GeneratePerPostParams
   * @param {TimeRow[]} params.timeRows - テンプレ時間行（timeMin昇順）
   * @param {PostPreset[]} params.presets - order ASC, postName ASC でソート済み
   * @param {Staff[]} params.staffList - 出勤スタッフ一覧
   * @param {Object<string, Object<string, number>>} params.skills - スキルマップ
   * @param {BreakAssignment[]} params.breakAssignments - 休憩割当
   * @param {number} params.breakDuration - 休憩時間（分）
   * @param {Object<string, number[]>} params.breakExcludedRows - 休憩前後除外行（H6b）
   * @param {number} [params.breakBufferBefore] - 休憩前バッファ（コマ数）
   * @param {number} [params.breakBufferAfter] - 休憩後バッファ（コマ数）
   * @param {Exclusions} params.exclusions - 除外情報
   * @param {Object<string, number>} params.postIntervals - 持ち場別コマ数
   * @param {string[]} [params.log] - ログ配列
   * @param {Function} [randomFn] - テスト用ランダム関数
   * @returns {Placement[]} 30分行単位の配置結果（展開不要）
   */
  function generatePerPost(params, randomFn) {
    var rng = randomFn || Math.random;
    var timeRows = params.timeRows;
    var presets = params.presets;
    var staffList = params.staffList;
    var skills = params.skills;
    var breakAssignments = params.breakAssignments;
    var breakDuration = params.breakDuration;
    var breakExcludedRows = params.breakExcludedRows;
    var exclusions = params.exclusions;
    var postIntervals = params.postIntervals;
    var log = params.log || null;

    // 個別配置モードでは休憩バッファ固定1コマ（前後30分）
    var bufferBefore = 1;
    var bufferAfter = 1;

    if (timeRows.length === 0) return [];

    var startTimeMin = timeRows[0].timeMin;
    var endTimeMin = timeRows[timeRows.length - 1].timeMin;

    // スタッフ名→Staff ルックアップ（carry時のシフト確認用）
    var staffByName = {};
    for (var si = 0; si < staffList.length; si++) {
      staffByName[staffList[si].name] = staffList[si];
    }

    // Pre-compute: 持ち場別ローテーション境界
    var postBoundaries = buildPostBoundaries_(presets, postIntervals, startTimeMin, endTimeMin);
    var boundaryMap = postBoundaries.map;
    var boundarySorted = postBoundaries.sorted;

    // H6c: 休憩前後バッファ期間の事前計算（30分行ベース）
    var breakBufferPeriods = buildBreakBufferPeriods_(
      breakAssignments, timeRows, bufferBefore, bufferAfter
    );

    // ログ: バッファマップサマリ
    if (log) {
      var bpNames = Object.keys(breakBufferPeriods);
      if (bpNames.length > 0) {
        log.push('--- バッファ除外(perPost: 固定1コマ) ---');
        for (var bpi = 0; bpi < bpNames.length; bpi++) {
          var bpn = bpNames[bpi];
          var bpTimes = Object.keys(breakBufferPeriods[bpn]);
          var bpParts = [];
          for (var bpt = 0; bpt < bpTimes.length; bpt++) {
            bpParts.push(TimeUtils.minToTimeStr(parseInt(bpTimes[bpt], 10)));
          }
          log.push(bpn + ': ' + bpParts.join(', '));
        }
        log.push('');
      }
    }

    if (log) {
      log.push('--- 配置詳細(perPost) ---');
    }

    var placements = [];
    var currentAssignment = {};  // postName → staffName（現在の配置者）
    var prevAssignment = {};     // postName → staffName（前回のローテ、H4用）
    var biasMap = {};            // staffName → { postName → count }

    // timeMin → rowNumber マッピング
    var timeMinToRow = {};
    for (var tm = 0; tm < timeRows.length; tm++) {
      timeMinToRow[timeRows[tm].timeMin] = timeRows[tm].rowNumber;
    }

    for (var ri = 0; ri < timeRows.length; ri++) {
      var timeRow = timeRows[ri];
      var timeMin = timeRow.timeMin;
      var rowNumber = timeRow.rowNumber;

      // Phase 1: 継続中の持ち場のスタッフをロック（H5用）
      var lockedStaff = {};  // staffName → true（この行で既に配置済み）

      for (var pi = 0; pi < presets.length; pi++) {
        var preset = presets[pi];
        if (!preset.enabled) continue;
        var post = preset.postName;

        // 境界でなく、currentAssignmentに人がいる → 継続ロック
        if (currentAssignment[post] && !boundaryMap[post][timeMin]) {
          lockedStaff[currentAssignment[post]] = true;
        }
      }

      // Phase 2: 各持ち場を順序処理
      var newlyPlacedStaff = {};  // この行のPhase2で新規配置された人

      for (var pi2 = 0; pi2 < presets.length; pi2++) {
        var preset2 = presets[pi2];
        if (!preset2.enabled) continue;
        var post2 = preset2.postName;

        var isBoundary = !!boundaryMap[post2][timeMin];

        if (!isBoundary) {
          // 継続: 前の配置を引き継ぐ（シフト時間内のみ出力）
          if (currentAssignment[post2]) {
            var carryStaff = staffByName[currentAssignment[post2]];
            if (carryStaff && carryStaff.shiftStartMin <= timeMin && timeMin < carryStaff.shiftEndMin) {
              placements.push({
                slotIndex: 0,
                timeMin: timeMin,
                rowNumber: rowNumber,
                postName: post2,
                staffName: currentAssignment[post2],
                source: 'carry'
              });
              lockedStaff[currentAssignment[post2]] = true;
            }
          }
          continue;
        }

        // ローテーション境界: 新しい候補を選出
        // H9: activeWindows外ならスキップ
        if (!isWithinActiveWindow_(preset2, timeMin)) {
          currentAssignment[post2] = null;
          continue;
        }

        // 次の境界を取得 → 勤務カバー必要範囲を算出
        var nextBound = getNextBoundary_(boundarySorted[post2], timeMin);
        // 最後の行までカバーが必要（次の境界がなければテンプレ最終行）
        var lastCoveredRow = nextBound !== null ? nextBound - 30 : endTimeMin;

        // prevAssignment更新（H4用: 前回の配置者）
        var prevStaff = currentAssignment[post2] || null;

        // H5チェック用の配置済みセット = lockedStaff + newlyPlacedStaff
        var placedThisRow = {};
        var lkNames = Object.keys(lockedStaff);
        for (var lk = 0; lk < lkNames.length; lk++) {
          placedThisRow[lkNames[lk]] = true;
        }
        var npNames = Object.keys(newlyPlacedStaff);
        for (var np = 0; np < npNames.length; np++) {
          placedThisRow[npNames[np]] = true;
        }

        // 候補取得（H1, H2, H3, H5, H6a, H6b, H6c, H7 + シフトカバー）
        var candidates = getCandidatesPerPost_(
          staffList, timeMin, rowNumber, preset2, skills, exclusions,
          breakAssignments, breakDuration, breakExcludedRows,
          placedThisRow, breakBufferPeriods, lastCoveredRow
        );

        // H4: 前回同一持ち場除外
        if (prevStaff) {
          candidates = candidates.filter(function (c) {
            return c.name !== prevStaff;
          });
        }

        // スキルソート
        candidates.sort(function (a, b) {
          if (preset2.sortDir === 'DESC') return b.lv - a.lv;
          return a.lv - b.lv;
        });

        // 偏り抑制＋ランダム選出
        var selected = applyBiasAndSelect_(candidates, post2, biasMap, rng);

        // ログ
        if (log) {
          var candDesc = [];
          for (var ci2 = 0; ci2 < candidates.length; ci2++) {
            candDesc.push(candidates[ci2].name + '(' + candidates[ci2].lv + ')');
          }
          var h4Str = prevStaff ? prevStaff : '-';
          var selStr = selected ? selected.name : '(空)';
          var coverStr = TimeUtils.minToTimeStr(lastCoveredRow);
          log.push('[' + TimeUtils.minToTimeStr(timeMin) + '] ' + post2 +
            '(' + preset2.sortDir + ',Lv' + preset2.requiredLv + ',~' + coverStr + '): ' +
            '候補' + candidates.length + '[' + candDesc.join(',') + '] ' +
            'H4除外:' + h4Str + ' → ' + selStr);
        }

        if (selected) {
          placements.push({
            slotIndex: 0,
            timeMin: timeMin,
            rowNumber: rowNumber,
            postName: post2,
            staffName: selected.name,
            source: 'auto'
          });
          prevAssignment[post2] = prevStaff;
          currentAssignment[post2] = selected.name;
          newlyPlacedStaff[selected.name] = true;
          lockedStaff[selected.name] = true;
          if (!biasMap[selected.name]) biasMap[selected.name] = {};
          biasMap[selected.name][post2] = (biasMap[selected.name][post2] || 0) + 1;
        } else {
          currentAssignment[post2] = null;
        }
      }
    }

    return placements;
  }

  /**
   * perPostモード用の候補フィルタ（30分行ベース）
   *
   * getCandidates_ と同等の制約チェックだが、30分行ベースで動作する。
   * H6c はスロットインデックスではなくtimeMinベースで判定。
   * H10: 次のローテーション境界まで勤務カバーできるか（シフト超過防止）
   *
   * @param {Staff[]} staffList
   * @param {number} timeMin - 現在の時刻（分）
   * @param {number} rowNumber - 現在の行番号
   * @param {PostPreset} preset
   * @param {Object<string, Object<string, number>>} skills
   * @param {Exclusions} exclusions
   * @param {BreakAssignment[]} breakAssignments
   * @param {number} breakDuration
   * @param {Object<string, number[]>} breakExcludedRows
   * @param {Object<string, boolean>} placedThisRow - この行で既に配置済みのスタッフ
   * @param {Object<string, Object<number, boolean>>} breakBufferPeriods - H6cバッファ
   * @param {number} lastCoveredRow - このローテーションで最後にカバーする行のtimeMin
   * @returns {Array<{name: string, lv: number}>}
   */
  function getCandidatesPerPost_(staffList, timeMin, rowNumber, preset, skills, exclusions,
                                  breakAssignments, breakDuration, breakExcludedRows,
                                  placedThisRow, breakBufferPeriods, lastCoveredRow) {
    var candidates = [];
    var post = preset.postName;

    for (var i = 0; i < staffList.length; i++) {
      var staff = staffList[i];
      var name = staff.name;

      // H1: 出勤時間内
      if (staff.shiftStartMin > timeMin || timeMin >= staff.shiftEndMin) continue;

      // H10: 次の境界まで勤務カバーできるか（シフト超過防止）
      // lastCoveredRow の行で H1 が通る必要がある: lastCoveredRow < shiftEndMin
      if (staff.shiftEndMin <= lastCoveredRow) continue;

      // H5: 同一行多重配置なし
      if (placedThisRow[name]) continue;

      // H7: 除外でない
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
    generate: generate,
    generatePerPost: generatePerPost,
    buildBreakExcludedRows: buildBreakExcludedRows,
    buildBreakBufferSlots: buildBreakBufferSlots,
    // テスト用に内部関数も公開
    isWithinActiveWindow_: isWithinActiveWindow_,
    getCandidates_: getCandidates_,
    getCandidatesPerPost_: getCandidatesPerPost_,
    applyBiasAndSelect_: applyBiasAndSelect_,
    buildPostBoundaries_: buildPostBoundaries_,
    buildBreakBufferPeriods_: buildBreakBufferPeriods_,
    getNextBoundary_: getNextBoundary_
  };

})();
