/**
 * 13_DepartmentService.js — 部署プロファイル読込
 *
 * 98_部署プロファイル シートから部署ごとのシート参照先を読込む純粋データ層。
 * 部署切替でシート参照先が正しく変わる（§19）。
 *
 * シートレイアウト:
 *   A(name) | B(extractSheet) | C(templateSheet) | D(skillSheet) |
 *   E(presetSheet) | F(configSheet) | G(enableWaves) | H(dateSheetSuffix)
 */

// eslint-disable-next-line no-unused-vars
var DepartmentService = (function () {
  'use strict';

  var DEFAULT_SHEET_NAME = '98_部署プロファイル';

  /**
   * boolean/文字列 → boolean 変換
   * @param {*} value - セル値
   * @returns {boolean}
   */
  function parseEnableWaves_(value) {
    if (typeof value === 'boolean') return value;
    return String(value).trim().toUpperCase() === 'TRUE';
  }

  /**
   * 1行 → DepartmentProfile 変換
   * @param {Array<*>} row - シート1行分の配列
   * @param {number} rowIndex - データ行インデックス（0始まり、ヘッダー除く）
   * @returns {DepartmentProfile}
   */
  function parseProfileRow_(row, rowIndex) {
    return {
      name:            String(row[0] || '').trim(),
      extractSheet:    String(row[1] || '').trim(),
      templateSheet:   String(row[2] || '').trim(),
      skillSheet:      String(row[3] || '').trim(),
      presetSheet:     String(row[4] || '').trim(),
      configSheet:     String(row[5] || '').trim(),
      enableWaves:     parseEnableWaves_(row[6]),
      dateSheetSuffix: String(row[7] || '').trim()
    };
  }

  /**
   * 必須フィールド空チェック
   * @param {DepartmentProfile} profile
   * @param {number} rowIndex - データ行インデックス（0始まり、ヘッダー除く）
   * @throws {Error} 必須フィールドが空の場合
   */
  function validateProfile_(profile, rowIndex) {
    var sheetRow = rowIndex + 2; // 1始まり行番号（ヘッダー=1行目）
    if (profile.name === '') {
      throw new Error('DepartmentService: name空: row ' + sheetRow);
    }
    if (profile.extractSheet === '') {
      throw new Error('DepartmentService: extractSheet空: ' + profile.name);
    }
    if (profile.templateSheet === '') {
      throw new Error('DepartmentService: templateSheet空: ' + profile.name);
    }
    if (profile.skillSheet === '') {
      throw new Error('DepartmentService: skillSheet空: ' + profile.name);
    }
    if (profile.presetSheet === '') {
      throw new Error('DepartmentService: presetSheet空: ' + profile.name);
    }
    if (profile.configSheet === '') {
      throw new Error('DepartmentService: configSheet空: ' + profile.name);
    }
  }

  /**
   * シートから全プロファイル読込
   * @param {string} [sheetName] - シート名（省略時 '98_部署プロファイル'）
   * @returns {DepartmentProfile[]}
   */
  function loadProfiles(sheetName) {
    var data = SheetGateway.getValues(sheetName || DEFAULT_SHEET_NAME);
    if (data.length < 2) return []; // ヘッダーのみ or 空

    var profiles = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var name = String(row[0] || '').trim();
      if (name === '') continue; // 空行スキップ

      var profile = parseProfileRow_(row, i);
      validateProfile_(profile, i);
      profiles.push(profile);
    }

    // 重複チェック
    var seenNames = {};
    for (var j = 0; j < profiles.length; j++) {
      if (seenNames[profiles[j].name]) {
        throw new Error('DepartmentService: 部署名が重複: ' + profiles[j].name);
      }
      seenNames[profiles[j].name] = true;
    }

    return profiles;
  }

  /**
   * 名前で検索（純粋関数）
   * @param {DepartmentProfile[]} profiles - プロファイル配列
   * @param {string} name - 部署名
   * @returns {DepartmentProfile|null}
   */
  function getProfileByName(profiles, name) {
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].name === name) return profiles[i];
    }
    return null;
  }

  return {
    loadProfiles: loadProfiles,
    getProfileByName: getProfileByName,
    parseProfileRow_: parseProfileRow_,
    parseEnableWaves_: parseEnableWaves_,
    validateProfile_: validateProfile_
  };
})();
