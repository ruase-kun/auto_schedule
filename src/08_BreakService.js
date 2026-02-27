/**
 * 08_BreakService.js — 休憩割当モジュール
 *
 * 休憩の前半/後半グループ分割と割当を行う。
 * シートI/Oなし、純粋ロジックのみ。ステートレス設計。
 *
 * 対象シフト: 早朝・午前・午後（時差は休憩割当なし）
 * 割当方式: 全持ち場最大Lv降順→名前昇順でソートし、ラウンドロビン
 * 時間区間: 半開区間 [breakAtMin, breakAtMin + breakDuration)
 */

var BreakService = (function () {

  /**
   * 全休憩を割り当てる — Phase 3完了条件の関数
   * @param {Staff[]} staffList - 出勤スタッフ一覧
   * @param {Config} config - コンフィグ（breakTimes, breakDuration）
   * @param {Exclusions} exclusions - 除外情報
   * @param {Object<string, Object<string, number>>} [skills] - スキルマップ（Lv順ソート用）
   * @returns {BreakAssignment[]} 6件の休憩割当（早朝前半, 早朝後半, AM前半, AM後半, PM前半, PM後半）
   */
  function assignBreaks(staffList, config, exclusions, skills) {
    var bt = config.breakTimes;
    var sk = skills || {};

    // 早朝・午前・午後対象をフィルタ
    var earlyStaff = filterEligible_(staffList, '早朝', exclusions);
    var amStaff = filterEligible_(staffList, '午前', exclusions);
    var pmStaff = filterEligible_(staffList, '午後', exclusions);

    // 前半/後半に分割（Lv順ラウンドロビン）
    var earlySplit = splitGroup_(earlyStaff, exclusions, bt.earlyFirst, bt.earlySecond, sk);
    var amSplit = splitGroup_(amStaff, exclusions, bt.amFirst, bt.amSecond, sk);
    var pmSplit = splitGroup_(pmStaff, exclusions, bt.pmFirst, bt.pmSecond, sk);

    return [
      { breakAtMin: bt.earlyFirst,  names: earlySplit.first },
      { breakAtMin: bt.earlySecond, names: earlySplit.second },
      { breakAtMin: bt.amFirst,     names: amSplit.first },
      { breakAtMin: bt.amSecond,    names: amSplit.second },
      { breakAtMin: bt.pmFirst,     names: pmSplit.first },
      { breakAtMin: bt.pmSecond,    names: pmSplit.second }
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
   * スタッフの全持ち場中の最大スキルレベルを取得（内部）
   * @param {string} name - スタッフ名
   * @param {Object<string, Object<string, number>>} skills - スキルマップ
   * @returns {number}
   */
  function getMaxLv_(name, skills) {
    var staffSkills = skills[name] || {};
    var maxLv = 0;
    var posts = Object.keys(staffSkills);
    for (var i = 0; i < posts.length; i++) {
      if (staffSkills[posts[i]] > maxLv) maxLv = staffSkills[posts[i]];
    }
    return maxLv;
  }

  /**
   * 前半/後半グループ分割（内部）
   *
   * 1. 各休憩時刻で大会中でないかチェック
   * 2. 両方可能 / first限定 / second限定 に分類
   * 3. 両方可能グループを全持ち場最大Lv降順→名前昇順でソート
   * 4. ラウンドロビン: 偶数index→前半, 奇数index→後半
   * 5. first限定 + ラウンドロビン前半 → first
   * 6. second限定 + ラウンドロビン後半 → second
   *
   * @param {Staff[]} staff - フィルタ済みスタッフ
   * @param {Exclusions} exclusions - 除外情報
   * @param {number} firstMin - 前半休憩時刻（分）
   * @param {number} secondMin - 後半休憩時刻（分）
   * @param {Object<string, Object<string, number>>} skills - スキルマップ
   * @returns {{first: string[], second: string[]}}
   */
  function splitGroup_(staff, exclusions, firstMin, secondMin, skills) {
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

    // 両方可能グループ: 最大Lv降順→名前昇順でソート
    both.sort(function (a, b) {
      var lvA = getMaxLv_(a.name, skills);
      var lvB = getMaxLv_(b.name, skills);
      if (lvB !== lvA) return lvB - lvA; // Lv降順
      return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); // 名前昇順
    });

    // ラウンドロビン: 偶数index→前半, 奇数index→後半
    var bothFirst = [];
    var bothSecond = [];
    for (var j = 0; j < both.length; j++) {
      if (j % 2 === 0) {
        bothFirst.push(both[j].name);
      } else {
        bothSecond.push(both[j].name);
      }
    }

    // first限定/second限定も名前順ソート
    firstOnly.sort();
    secondOnly.sort();

    // 合成
    var first = firstOnly.concat(bothFirst);
    var second = secondOnly.concat(bothSecond);

    return { first: first, second: second };
  }

  /**
   * シフト種別＋終日除外でフィルタ（内部）
   * 早朝・午前・午後シフトが対象。時差は除外。
   * 終日除外(allDay)のスタッフも除外。
   * @param {Staff[]} staffList - 全スタッフ
   * @param {string} shiftType - 対象シフト種別（"早朝"|"午前"|"午後"）
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
    getMaxLv_: getMaxLv_,
    isSocial_: isSocial_,
    splitGroup_: splitGroup_,
    filterEligible_: filterEligible_
  };

})();
