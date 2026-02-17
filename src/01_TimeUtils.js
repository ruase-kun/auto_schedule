/**
 * 01_TimeUtils.js — 時刻ユーティリティ
 *
 * 内部時刻表現: 分(int)  例: 10:00→600, 9:30→570 (§12.1)
 */

// eslint-disable-next-line no-unused-vars
var TimeUtils = (function () {
  'use strict';

  /**
   * 全角記号・数字を半角に正規化する
   * ｰ(U+FF70長音)・−(U+2212)・ー(U+30FC)→ -, ：→ :, ０-９→ 0-9
   * @param {string} str
   * @returns {string}
   */
  function normalizeToHalfWidth(str) {
    return str
      .replace(/[\uff70\u2212\u30fc\uff0d\u2013\u2014]/g, '-')  // 各種ダッシュ・長音→半角ハイフン
      .replace(/\uff1a/g, ':')                                     // ：→:
      .replace(/[\uff10-\uff19]/g, function (ch) {                 // ０-９→0-9
        return String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30);
      });
  }

  /**
   * 時刻文字列を分に変換する
   * @param {string} str - "H:MM" or "HH:MM"
   * @returns {number} 分（例: "9:30" → 570）
   * @throws {Error} パース失敗時
   */
  function parseTimeToMin(str) {
    if (typeof str !== 'string' || str.trim() === '') {
      throw new Error('parseTimeToMin: 空または非文字列が渡されました: ' + str);
    }
    var parts = normalizeToHalfWidth(str.trim()).split(':');
    if (parts.length !== 2) {
      throw new Error('parseTimeToMin: 不正な時刻形式です: ' + str);
    }
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      throw new Error('parseTimeToMin: 不正な時刻値です: ' + str);
    }
    return h * 60 + m;
  }

  /**
   * 分を時刻文字列に変換する
   * @param {number} min - 分（例: 570）
   * @returns {string} "H:MM"（時間はゼロパディングなし、分は2桁）
   */
  function minToTimeStr(min) {
    if (typeof min !== 'number' || isNaN(min) || min < 0) {
      throw new Error('minToTimeStr: 不正な分値です: ' + min);
    }
    var h = Math.floor(min / 60);
    var m = min % 60;
    return h + ':' + (m < 10 ? '0' + m : '' + m);
  }

  /**
   * シフト範囲文字列をパースする（時差シフト用）
   * @param {string} str - "H:MM-HH:MM"（例: "9:30-16:00"）
   * @returns {{startMin: number, endMin: number}}
   * @throws {Error} パース失敗時 (V5)
   */
  function parseShiftRange(str) {
    if (typeof str !== 'string' || str.trim() === '') {
      throw new Error('parseShiftRange: 空または非文字列が渡されました: ' + str);
    }
    var normalized = normalizeToHalfWidth(str.trim());
    var parts = normalized.split('-');
    if (parts.length !== 2) {
      throw new Error('parseShiftRange: 不正な範囲形式です: ' + str);
    }
    var startMin = parseTimeToMin(parts[0]);
    var endMin = parseTimeToMin(parts[1]);
    if (startMin >= endMin) {
      throw new Error('parseShiftRange: 開始が終了以降です: ' + str);
    }
    return { startMin: startMin, endMin: endMin };
  }

  return {
    parseTimeToMin: parseTimeToMin,
    minToTimeStr: minToTimeStr,
    parseShiftRange: parseShiftRange,
    normalizeToHalfWidth: normalizeToHalfWidth
  };
})();
