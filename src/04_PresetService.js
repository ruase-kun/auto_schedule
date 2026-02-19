/**
 * 04_PresetService.js — プリセット読込
 *
 * 05_配置プリセット シートから持ち場ごとの配置条件を読込む。
 *
 * シートレイアウト（1行目ヘッダー、2行目以降データ）:
 *   A: 持ち場名 | B: 有効 | C: 必要Lv | D: 決定順序 | E: 配置順位 | F: 掛け持ち先 | G: 有効時間帯
 */

// eslint-disable-next-line no-unused-vars
var PresetService = (function () {
  'use strict';

  /**
   * プリセットを読込む（order昇順→postName昇順でソート済み）
   * @param {string} presetSheetName - プリセットシート名
   * @returns {PostPreset[]}
   */
  function loadPresets(presetSheetName) {
    var data = SheetGateway.getValues(presetSheetName);
    if (data.length < 2) {
      return [];
    }

    var presets = [];
    // 2行目以降がデータ（index 1〜）
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var postName = String(row[0]).trim();
      if (postName === '') continue;

      var enabled = parseEnabled_(row[1]);
      var requiredLv = parseLevelValue_(row[2]);
      var order = parseInt(row[3], 10);
      var sortDir = parseSortDir_(row[4]);
      var concurrentPost = parseConcurrentPost_(row[5]);
      var activeWindows = parseActiveWindows_(row[6]);

      // 決定順序または必要Lvが未設定 → 自動配置対象外としてスキップ
      if (isNaN(order) || order < 1) continue;
      if (isNaN(requiredLv) || requiredLv < 1) continue;

      // バリデーション: 必要Lv 1〜4 (V2)
      if (requiredLv > 4) {
        throw new Error(
          'PresetService: 必要Lvが1〜4の範囲外です (V2): ' +
            postName + ' → ' + row[2]
        );
      }

      presets.push({
        postName: postName,
        enabled: enabled,
        requiredLv: requiredLv,
        order: order,
        sortDir: sortDir,
        concurrentPost: concurrentPost,
        activeWindows: activeWindows
      });
    }

    // order昇順 → 同一orderならpostName昇順
    presets.sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return a.postName.localeCompare(b.postName);
    });

    return presets;
  }

  /**
   * 有効フラグをパースする（内部）
   * @param {*} value
   * @returns {boolean}
   */
  function parseEnabled_(value) {
    if (typeof value === 'boolean') return value;
    var s = String(value).trim().toLowerCase();
    return s === 'true' || s === '○' || s === '有効' || s === 'yes' || s === '1';
  }

  /**
   * レベル値をパースする（内部）
   * "Lv.1", "Lv1", "1", 1 → 1
   * @param {*} value
   * @returns {number} NaN if unparseable
   */
  function parseLevelValue_(value) {
    if (typeof value === 'number') return value;
    var s = String(value).trim();
    // "Lv.1", "Lv1", "lv.2" 等からnumber部分を抽出
    var m = s.match(/(\d+)/);
    if (m) return parseInt(m[1], 10);
    return NaN;
  }

  /**
   * 配置順位（ソート方向）をパースする（内部）
   * @param {*} value - "DESC"/"降順" → "DESC", その他 → "ASC"
   * @returns {string} "ASC" | "DESC"
   */
  function parseSortDir_(value) {
    var s = String(value).trim().toUpperCase();
    if (s === 'DESC' || s === '降順') return 'DESC';
    return 'ASC';
  }

  /**
   * 掛け持ち先をパースする（内部）
   * @param {*} value
   * @returns {string|null}
   */
  function parseConcurrentPost_(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    if (s === '' || s === 'なし' || s === '-') return null;
    return s;
  }

  /**
   * 有効時間帯をパースする（内部）
   * カンマ区切り文字列: "12:00-14:00,16:00-18:00" → TimeWindow[]
   * 空/未設定 → [] (終日有効)
   *
   * @param {*} value
   * @returns {TimeWindow[]}
   */
  function parseActiveWindows_(value) {
    if (value === null || value === undefined) return [];
    var s = String(value).trim();
    if (s === '') return [];

    // 時刻パターンを含まない値は非時間帯としてスキップ（ヘッダー行混入対策）
    var normalized = TimeUtils.normalizeToHalfWidth(s);
    if (normalized.indexOf(':') === -1) return [];

    var parts = normalized.split(',');
    var windows = [];
    for (var i = 0; i < parts.length; i++) {
      var range = parts[i].trim();
      if (range === '') continue;
      var parsed = TimeUtils.parseShiftRange(range);
      windows.push({ startMin: parsed.startMin, endMin: parsed.endMin });
    }
    return windows;
  }

  /**
   * プリセットシートから無効な持ち場名の一覧を取得する。
   * loadPresets() とは異なり、order/requiredLv の有無に関わらず
   * 「有効」列が false の持ち場名をすべて返す。
   *
   * @param {string} presetSheetName - プリセットシート名
   * @returns {string[]} 無効な持ち場名の配列
   */
  function getDisabledPostNames(presetSheetName) {
    var data = SheetGateway.getValues(presetSheetName);
    var disabled = [];
    for (var i = 1; i < data.length; i++) {
      var postName = String(data[i][0]).trim();
      if (postName === '') continue;
      if (!parseEnabled_(data[i][1])) {
        disabled.push(postName);
      }
    }
    return disabled;
  }

  return {
    loadPresets: loadPresets,
    getDisabledPostNames: getDisabledPostNames,
    // テスト用に内部関数も公開
    parseActiveWindows_: parseActiveWindows_,
    parseSortDir_: parseSortDir_
  };
})();
