/**
 * 08_BreakService.js — 休憩割当モジュール
 *
 * 休憩の前半/後半グループ分割と割当を行う。
 * シートI/Oなし、純粋ロジックのみ。ステートレス設計。
 *
 * 対象シフト: 午前・午後のみ（早朝・時差は休憩割当なし）
 * 社員系判定: employment !== 'アルバイト' かつ空でない
 * 時間区間: 半開区間 [breakAtMin, breakAtMin + breakDuration)
 */

var BreakService = (function () {

  /**
   * 全休憩を割り当てる — Phase 3完了条件の関数
   * @param {Staff[]} staffList - 出勤スタッフ一覧
   * @param {Config} config - コンフィグ（breakTimes, breakDuration）
   * @param {Exclusions} exclusions - 除外情報
   * @returns {BreakAssignment[]} 4件の休憩割当（AM前半, AM後半, PM前半, PM後半）
   */
  function assignBreaks(staffList, config, exclusions) {
    var bt = config.breakTimes;

    // 午前・午後対象をフィルタ
    var amStaff = filterEligible_(staffList, '午前', exclusions);
    var pmStaff = filterEligible_(staffList, '午後', exclusions);

    // 前半/後半に分割
    var amSplit = splitGroup_(amStaff, exclusions, bt.amFirst, bt.amSecond);
    var pmSplit = splitGroup_(pmStaff, exclusions, bt.pmFirst, bt.pmSecond);

    return [
      { breakAtMin: bt.amFirst,  names: amSplit.first },
      { breakAtMin: bt.amSecond, names: amSplit.second },
      { breakAtMin: bt.pmFirst,  names: pmSplit.first },
      { breakAtMin: bt.pmSecond, names: pmSplit.second }
    ];
  }

  /**
   * 指定時刻に休憩中か判定する（Phase 4 PlacementEngine H6用）
   * 半開区間 [breakAtMin, breakAtMin + breakDuration) で判定。
   * @param {BreakAssignment[]} breakAssignments - 休憩割当配列
   * @param {string} name - スタッフ名
   * @param {number} timeMin - 判定時刻（分）
   * @param {number} breakDuration - 休憩時間（分）
   * @returns {boolean}
   */
  function isOnBreak(breakAssignments, name, timeMin, breakDuration) {
    for (var i = 0; i < breakAssignments.length; i++) {
      var ba = breakAssignments[i];
      if (ba.names.indexOf(name) !== -1 &&
          ba.breakAtMin <= timeMin && timeMin < ba.breakAtMin + breakDuration) {
        return true;
      }
    }
    return false;
  }

  /**
   * 社員系判定（内部）
   * employment !== 'アルバイト' かつ空でない → 社員系
   * @param {string} employment - 雇用形態
   * @returns {boolean}
   */
  function isSocial_(employment) {
    return employment !== 'アルバイト' && employment !== '';
  }

  /**
   * 前半/後半グループ分割（内部）
   *
   * 1. 各休憩時刻で大会中でないかチェック
   * 2. 両方可能 / first限定 / second限定 に分類
   * 3. 両方可能グループを社員系/アルバイト系に分離
   * 4. 各系を名前順ソートし、floor(count/2)を前半、残りを後半
   * 5. first限定 + 社員前半 + アルバイト前半 → first
   * 6. second限定 + 社員後半 + アルバイト後半 → second
   *
   * @param {Staff[]} staff - フィルタ済みスタッフ
   * @param {Exclusions} exclusions - 除外情報
   * @param {number} firstMin - 前半休憩時刻（分）
   * @param {number} secondMin - 後半休憩時刻（分）
   * @returns {{first: string[], second: string[]}}
   */
  function splitGroup_(staff, exclusions, firstMin, secondMin) {
    var firstOnly = [];   // first時間帯のみ可能
    var secondOnly = [];  // second時間帯のみ可能
    var both = [];        // 両方可能

    for (var i = 0; i < staff.length; i++) {
      var s = staff[i];
      var canFirst = !ExclusionService.isTournament(exclusions, s.name, firstMin);
      var canSecond = !ExclusionService.isTournament(exclusions, s.name, secondMin);

      if (canFirst && canSecond) {
        both.push(s);
      } else if (canFirst) {
        firstOnly.push(s.name);
      } else if (canSecond) {
        secondOnly.push(s.name);
      }
      // どちらも不可の場合は割当なし
    }

    // 両方可能グループを社員系/アルバイト系に分離
    var socialBoth = [];
    var partBoth = [];
    for (var j = 0; j < both.length; j++) {
      if (isSocial_(both[j].employment)) {
        socialBoth.push(both[j].name);
      } else {
        partBoth.push(both[j].name);
      }
    }

    // 名前順ソート（安定分配）
    socialBoth.sort();
    partBoth.sort();

    // 社員系: floor(count/2) → 前半, 残り → 後半
    var socialHalf = Math.floor(socialBoth.length / 2);
    var socialFirst = socialBoth.slice(0, socialHalf);
    var socialSecond = socialBoth.slice(socialHalf);

    // アルバイト系: floor(count/2) → 前半, 残り → 後半
    var partHalf = Math.floor(partBoth.length / 2);
    var partFirst = partBoth.slice(0, partHalf);
    var partSecond = partBoth.slice(partHalf);

    // first限定も名前順ソート
    firstOnly.sort();
    secondOnly.sort();

    // 合成
    var first = firstOnly.concat(socialFirst).concat(partFirst);
    var second = secondOnly.concat(socialSecond).concat(partSecond);

    return { first: first, second: second };
  }

  /**
   * シフト種別＋終日除外でフィルタ（内部）
   * 午前・午後シフトのみ対象。早朝・時差は除外。
   * 終日除外(allDay)のスタッフも除外。
   * @param {Staff[]} staffList - 全スタッフ
   * @param {string} shiftType - 対象シフト種別（"午前"|"午後"）
   * @param {Exclusions} exclusions - 除外情報
   * @returns {Staff[]}
   */
  function filterEligible_(staffList, shiftType, exclusions) {
    var result = [];
    for (var i = 0; i < staffList.length; i++) {
      var s = staffList[i];
      if (s.shiftType === shiftType && !ExclusionService.isAllDay(exclusions, s.name)) {
        result.push(s);
      }
    }
    return result;
  }

  return {
    assignBreaks: assignBreaks,
    isOnBreak: isOnBreak,
    isSocial_: isSocial_,
    splitGroup_: splitGroup_,
    filterEligible_: filterEligible_
  };

})();
