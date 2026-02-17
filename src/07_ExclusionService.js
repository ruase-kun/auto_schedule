/**
 * 07_ExclusionService.js — 除外判定モジュール
 *
 * 3種の除外（終日・時間帯・大会）を統合判定する。
 * シートI/Oなし、純粋ロジックのみ。ステートレス設計。
 *
 * 判定優先度（§8.1）:
 *   1. allDay（終日除外）
 *   2. tournament（大会除外）
 *   3. timeRange（時間帯除外）
 *
 * 時間区間は半開区間 [startMin, endMin)
 */

var ExclusionService = (function () {

  /**
   * 空のExclusionsオブジェクトを生成する
   * @returns {Exclusions}
   */
  function createEmpty() {
    return {
      allDay: {},
      timeRanges: [],
      tournaments: []
    };
  }

  /**
   * 名前配列から終日除外セットを構築する
   * 空文字・空白のみの名前はスキップする。
   * @param {string[]} names - 名前配列
   * @returns {Object<string, boolean>}
   */
  function buildAllDaySet(names) {
    var set = {};
    for (var i = 0; i < names.length; i++) {
      var name = String(names[i]).trim();
      if (name !== '') {
        set[name] = true;
      }
    }
    return set;
  }

  /**
   * 時間帯除外エントリを追加する
   * @param {Exclusions} excl
   * @param {string} name
   * @param {number} startMin
   * @param {number} endMin
   * @returns {Exclusions} 同じオブジェクト（ミュータブル）
   */
  function addTimeRange(excl, name, startMin, endMin) {
    validateRange_(name, startMin, endMin);
    excl.timeRanges.push({ name: name, startMin: startMin, endMin: endMin });
    return excl;
  }

  /**
   * 大会除外エントリを追加する
   * @param {Exclusions} excl
   * @param {string} name
   * @param {number} startMin
   * @param {number} endMin
   * @returns {Exclusions} 同じオブジェクト（ミュータブル）
   */
  function addTournament(excl, name, startMin, endMin) {
    validateRange_(name, startMin, endMin);
    excl.tournaments.push({ name: name, startMin: startMin, endMin: endMin });
    return excl;
  }

  /**
   * 除外判定（boolean）— Phase 2完了条件の関数
   * @param {Exclusions} excl
   * @param {string} name
   * @param {number} timeMin
   * @returns {boolean}
   */
  function isExcluded(excl, name, timeMin) {
    return isExcludedDetail(excl, name, timeMin).excluded;
  }

  /**
   * 除外判定（理由付き）
   * 優先度: allDay > tournament > timeRange
   * @param {Exclusions} excl
   * @param {string} name
   * @param {number} timeMin
   * @returns {ExclusionResult}
   */
  function isExcludedDetail(excl, name, timeMin) {
    // 1. 終日除外
    if (excl.allDay[name] === true) {
      return { excluded: true, reason: 'allDay' };
    }

    // 2. 大会除外
    for (var i = 0; i < excl.tournaments.length; i++) {
      var t = excl.tournaments[i];
      if (t.name === name && t.startMin <= timeMin && timeMin < t.endMin) {
        return { excluded: true, reason: 'tournament' };
      }
    }

    // 3. 時間帯除外
    for (var j = 0; j < excl.timeRanges.length; j++) {
      var r = excl.timeRanges[j];
      if (r.name === name && r.startMin <= timeMin && timeMin < r.endMin) {
        return { excluded: true, reason: 'timeRange' };
      }
    }

    // 4. 該当なし
    return { excluded: false, reason: '' };
  }

  /**
   * 大会中か判定する（個人シート「大会」表示用）
   * @param {Exclusions} excl
   * @param {string} name
   * @param {number} timeMin
   * @returns {boolean}
   */
  function isTournament(excl, name, timeMin) {
    for (var i = 0; i < excl.tournaments.length; i++) {
      var t = excl.tournaments[i];
      if (t.name === name && t.startMin <= timeMin && timeMin < t.endMin) {
        return true;
      }
    }
    return false;
  }

  /**
   * 終日除外か判定する（BreakService用）
   * @param {Exclusions} excl
   * @param {string} name
   * @returns {boolean}
   */
  function isAllDay(excl, name) {
    return excl.allDay[name] === true;
  }

  /**
   * Exclusionsオブジェクトの構造を検証する
   * 不正な場合はエラーをスローする。
   * @param {Exclusions} excl
   */
  function validate_(excl) {
    if (!excl || typeof excl !== 'object') {
      throw new Error('ExclusionService.validate_: exclがオブジェクトではありません');
    }
    if (!excl.allDay || typeof excl.allDay !== 'object') {
      throw new Error('ExclusionService.validate_: allDayがオブジェクトではありません');
    }
    if (!Array.isArray(excl.timeRanges)) {
      throw new Error('ExclusionService.validate_: timeRangesが配列ではありません');
    }
    if (!Array.isArray(excl.tournaments)) {
      throw new Error('ExclusionService.validate_: tournamentsが配列ではありません');
    }

    validateEntries_('timeRanges', excl.timeRanges);
    validateEntries_('tournaments', excl.tournaments);
  }

  /* ---------- 内部ヘルパー ---------- */

  /**
   * 時間範囲のバリデーション
   * @param {string} name
   * @param {number} startMin
   * @param {number} endMin
   * @private
   */
  function validateRange_(name, startMin, endMin) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error('ExclusionService: nameが空です');
    }
    if (typeof startMin !== 'number' || typeof endMin !== 'number') {
      throw new Error('ExclusionService: startMin/endMinが数値ではありません');
    }
    if (startMin >= endMin) {
      throw new Error('ExclusionService: startMin(' + startMin + ') >= endMin(' + endMin + ')');
    }
  }

  /**
   * エントリ配列の構造検証
   * @param {string} fieldName
   * @param {Array} entries
   * @private
   */
  function validateEntries_(fieldName, entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || typeof e.name !== 'string' || e.name.trim() === '') {
        throw new Error('ExclusionService.validate_: ' + fieldName + '[' + i + '].nameが不正です');
      }
      if (typeof e.startMin !== 'number' || typeof e.endMin !== 'number') {
        throw new Error('ExclusionService.validate_: ' + fieldName + '[' + i + ']の時刻が数値ではありません');
      }
      if (e.startMin >= e.endMin) {
        throw new Error('ExclusionService.validate_: ' + fieldName + '[' + i + ']のstartMin >= endMin');
      }
    }
  }

  return {
    createEmpty: createEmpty,
    buildAllDaySet: buildAllDaySet,
    addTimeRange: addTimeRange,
    addTournament: addTournament,
    isExcluded: isExcluded,
    isExcludedDetail: isExcludedDetail,
    isTournament: isTournament,
    isAllDay: isAllDay,
    validate_: validate_
  };

})();
