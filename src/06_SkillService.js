/**
 * 06_SkillService.js — スキルレベル読込
 *
 * 04_スキルレベル表 シートからスキルマトリクスと雇用形態マップを構築する。
 *
 * シートレイアウト (§5.3):
 *   行1: ヘッダー（A: スタッフ名, B: 雇用形態, C〜: 持ち場名）
 *   行2〜: スタッフごとのスキルレベル（0〜4）
 *
 * Lv定義:
 *   0: 配置不可, 1: アルバイト, 2: 社員, 3: 教えられる社員, 4: サブリーダー以上
 */

// eslint-disable-next-line no-unused-vars
var SkillService = (function () {
  'use strict';

  /**
   * スキルマトリクスと雇用形態マップを読込む
   * @param {string} skillSheetName - スキルレベル表シート名
   * @param {string[]} [postFilter] - 持ち場フィルタ（指定時はこれらの持ち場のみ取得）
   * @returns {{skills: Object<string, Object<string, number>>, employmentMap: Object<string, string>}}
   *   skills: { staffName: { postName: level } }
   *   employmentMap: { staffName: employment }
   */
  function loadSkills(skillSheetName, postFilter) {
    var data = SheetGateway.getValues(skillSheetName);
    if (data.length < 2) {
      return { skills: {}, employmentMap: {} };
    }

    // ヘッダーから持ち場名マッピングを構築
    var headerRow = data[0];
    var postColumns = []; // [{colIndex, postName}]
    for (var c = 2; c < headerRow.length; c++) {
      var postName = String(headerRow[c]).trim();
      if (postName === '') continue;

      // postFilterが指定されている場合、該当持ち場のみ
      if (postFilter && postFilter.indexOf(postName) === -1) continue;

      postColumns.push({ colIndex: c, postName: postName });
    }

    var skills = {};
    var employmentMap = {};

    // 2行目以降がデータ（index 1〜）
    for (var r = 1; r < data.length; r++) {
      var staffName = String(data[r][0]).trim();
      if (staffName === '') continue;

      // B列: 雇用形態
      var employment = String(data[r][1] || '').trim();
      employmentMap[staffName] = employment;

      // C列〜: スキルレベル
      var staffSkills = {};
      for (var p = 0; p < postColumns.length; p++) {
        var col = postColumns[p].colIndex;
        var pName = postColumns[p].postName;
        var rawLv = data[r][col];
        var lv = parseInt(rawLv, 10);

        // 非数値・未設定 → 0（配置不可）
        if (isNaN(lv)) {
          lv = 0;
        }
        // 範囲制限 0〜4
        if (lv < 0) lv = 0;
        if (lv > 4) lv = 4;

        staffSkills[pName] = lv;
      }

      skills[staffName] = staffSkills;
    }

    return { skills: skills, employmentMap: employmentMap };
  }

  /**
   * AttendanceServiceの出力にemployment情報を付与する
   * @param {Staff[]} staffList - 出勤者リスト
   * @param {Object<string, string>} employmentMap - 雇用形態マップ
   * @returns {Staff[]} employment設定済みリスト（元配列を変更）
   */
  function mergeEmployment(staffList, employmentMap) {
    for (var i = 0; i < staffList.length; i++) {
      var name = staffList[i].name;
      if (employmentMap[name] !== undefined) {
        staffList[i].employment = employmentMap[name];
      }
    }
    return staffList;
  }

  return {
    loadSkills: loadSkills,
    mergeEmployment: mergeEmployment
  };
})();
