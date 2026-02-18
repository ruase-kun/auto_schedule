/**
 * 15_UiWizardController.js — ウィザードバックエンド（Phase 7A-1）
 *
 * メニュー「配置を生成する」から起動するウィザードのサーバーサイド処理。
 * 部署選択→日付選択→配置生成→個人シート生成→JSON履歴保存を一気通貫で実行する。
 *
 * 依存: DepartmentService, SheetGateway, Orchestrator, TimelineService,
 *       HistoryService, ConfigService, AttendanceService, SkillService
 */

// eslint-disable-next-line no-unused-vars
var UiWizardController = (function () {
  'use strict';

  /**
   * 数値を2桁ゼロ埋め
   * @param {number} n
   * @returns {string}
   */
  function pad2_(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  /**
   * Date → "MM/DD(曜)" + suffix 変換（純粋関数）
   * @param {Date} date
   * @param {string} suffix - 例: '_通販'（空文字なら付加しない）
   * @returns {string}
   */
  function formatDateSheetName_(date, suffix) {
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var dow = days[date.getDay()];
    var name = pad2_(m) + '/' + pad2_(d) + '(' + dow + ')';
    if (suffix) name += suffix;
    return name;
  }

  /**
   * シートデータ2次元配列 → DateOption[] 変換（純粋関数）
   *
   * 抽出シートのヘッダー行を3列ごとに走査し、日付を抽出する。
   * 各日付の出勤者数（col+1列の行3以降の非空行）もカウントする。
   *
   * @param {Array<Array<*>>} data - シートの2次元配列
   * @returns {Array<{dateValue: string, dateStr: string, dayOfWeek: string, staffCount: number}>}
   */
  function extractDatesFromSheet_(data) {
    if (data.length < 1) return [];
    var headerRow = data[0];
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    var dates = [];

    for (var c = 0; c < headerRow.length; c += 3) {
      var cell = headerRow[c];
      if (cell === '' || cell === null || cell === undefined) continue;

      var dateObj = null;
      if (cell instanceof Date) {
        dateObj = cell;
      } else {
        var parsed = new Date(cell);
        if (!isNaN(parsed.getTime())) dateObj = parsed;
      }

      if (dateObj) {
        // 出勤者数カウント: col+1 列の行3以降の非空行
        var staffCount = 0;
        for (var r = 2; r < data.length; r++) {
          var name = data[r][c + 1];
          if (name && String(name).trim() !== '') staffCount++;
        }
        dates.push({
          dateValue: dateObj.getFullYear() + '-' +
            pad2_(dateObj.getMonth() + 1) + '-' + pad2_(dateObj.getDate()),
          dateStr: (dateObj.getMonth() + 1) + '/' + dateObj.getDate(),
          dayOfWeek: days[dateObj.getDay()],
          staffCount: staffCount
        });
      }
    }
    return dates;
  }

  return {
    formatDateSheetName_: formatDateSheetName_,
    extractDatesFromSheet_: extractDatesFromSheet_,
    pad2_: pad2_
  };
})();

/* ---------- グローバル関数（GASメニュー / google.script.run 用） ---------- */

/**
 * ウィザードダイアログを表示する
 */
function showWizard() {
  var html = HtmlService.createHtmlOutputFromFile('WizardDialog')
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, '配置を生成する');
}

/**
 * 部署プロファイルシートが存在しない場合、デフォルトの販売部署で自動作成する
 */
function uiWizard_ensureProfileSheet_() {
  var SHEET_NAME = '98_部署プロファイル';
  if (SheetGateway.sheetExists(SHEET_NAME)) return;

  SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  var header = ['name', 'extractSheet', 'templateSheet', 'skillSheet',
                'presetSheet', 'configSheet', 'enableWaves', 'dateSheetSuffix'];
  var row1 = ['販売', '02_販売のみ抽出', '03_配置テンプレート', '04_スキルレベル表',
              '05_配置プリセット', '06_コンフィグ', false, ''];
  SheetGateway.setValues(SHEET_NAME, 1, 1, [header, row1]);
}

/**
 * コンフィグシートが存在しない場合（または旧形式の場合）、テンプレートから自動生成する。
 *
 * 生成内容:
 *   [コマ定義]   — 時間境界形式（90分間隔のデフォルト）
 *   [休憩設定]   — 標準デフォルト（60分, AM前半14:00〜PM後半17:30）
 *   [休憩除外行] — 空（除外なし）
 *   [シフト時間] — 早朝/午前/午後の3パターン
 *
 * @param {string} configSheetName - 生成するコンフィグシート名
 * @param {string} templateSheetName - 参照するテンプレートシート名
 */
function uiWizard_ensureConfigSheet_(configSheetName, templateSheetName) {
  if (SheetGateway.sheetExists(configSheetName)) {
    try {
      var existing = SheetGateway.getValues(configSheetName);
      // [シフト時間] セクションが存在すれば有効なコンフィグとみなす
      for (var chk = 0; chk < existing.length; chk++) {
        if (String(existing[chk][0]).trim() === '[シフト時間]') return;
      }
    } catch (e) { /* 読取失敗 → 再生成 */ }
    SheetGateway.deleteSheetIfExists(configSheetName);
  }

  // テンプレートから時間行を読み取る
  var timeRows = SheetGateway.getTimeRows(templateSheetName);
  if (timeRows.length === 0) {
    throw new Error('テンプレートシートに時間行が見つかりません: ' + templateSheetName);
  }

  // 時間境界のデフォルト: テンプレ開始時刻から90分間隔
  var firstMin = timeRows[0].timeMin;
  var lastMin = timeRows[timeRows.length - 1].timeMin;
  var boundaries = [];
  for (var t = firstMin; t <= lastMin; t += 90) {
    boundaries.push(TimeUtils.minToTimeStr(t));
  }

  // 全行を5列に統一（setValuesは列数統一が必須）
  var rows = [];

  // --- [コマ定義] --- 時間境界形式
  rows.push(['[コマ定義]', '', '', '', '']);
  for (var b = 0; b < boundaries.length; b++) {
    rows.push([boundaries[b], '', '', '', '']);
  }
  rows.push(['', '', '', '', '']); // 空行区切り

  // --- [休憩設定] ---
  rows.push(['[休憩設定]', '', '', '', '']);
  rows.push(['休憩時間(分)', 60, '', '', '']);
  rows.push(['AM前半', '14:00', '', '', '']);
  rows.push(['AM後半', '15:00', '', '', '']);
  rows.push(['PM前半', '16:30', '', '', '']);
  rows.push(['PM後半', '17:30', '', '', '']);
  rows.push(['', '', '', '', '']); // 空行区切り

  // --- [休憩除外行] ---
  rows.push(['[休憩除外行]', '', '', '', '']);
  rows.push(['', '', '', '', '']); // 空行区切り（除外なし）

  // --- [シフト時間] ---
  rows.push(['[シフト時間]', '', '', '', '']);
  rows.push(['早朝', '8:00',  '17:00', '10:00', '16:30']);
  rows.push(['午前', '9:30',  '18:00', '10:00', '17:30']);
  rows.push(['午後', '13:00', '22:00', '13:30', '21:30']);

  // シート作成＆書込み
  SpreadsheetApp.getActiveSpreadsheet().insertSheet(configSheetName);
  SheetGateway.setValues(configSheetName, 1, 1, rows);
}

/**
 * 部署一覧を返す（Step 0 用）
 * プロファイルシートが無ければデフォルトで自動作成する。
 * @returns {DepartmentProfile[]}
 */
function uiWizard_loadDepartments() {
  uiWizard_ensureProfileSheet_();
  return DepartmentService.loadProfiles();
}

/**
 * 抽出シートヘッダーから利用可能日付を列挙する（Step 1 用）
 * @param {string} departmentName - 部署名
 * @returns {Array<{dateValue: string, dateStr: string, dayOfWeek: string, staffCount: number}>}
 */
function uiWizard_loadDates(departmentName) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, departmentName);
  if (!profile) throw new Error('Unknown department: ' + departmentName);
  var data = SheetGateway.getValues(profile.extractSheet);
  return UiWizardController.extractDatesFromSheet_(data);
}

/**
 * 選択日付ごとに配置生成＋個人シート＋履歴保存を実行する（Step 5 用）
 * @param {Object} params - { departmentName: string, dateValues: string[] }
 * @returns {{success: boolean, results: Array<{dateSheet: string, personalSheet: string, placementCount: number, staffCount: number}>}}
 */
function uiWizard_generate(params) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, params.departmentName);
  if (!profile) throw new Error('部署が見つかりません: ' + params.departmentName);

  // コンフィグシートが無ければテンプレートから自動生成
  uiWizard_ensureConfigSheet_(profile.configSheet, profile.templateSheet);

  // 7A-1: 除外なし（空）
  var exclusions = { allDay: {}, timeRanges: [], tournaments: [] };

  // テンプレートヘッダーの持ち場色マップ（個人シート色塗り用）
  var postColorMap = SheetGateway.getPostColors(profile.templateSheet);

  var results = [];
  for (var i = 0; i < params.dateValues.length; i++) {
    var dateStr = params.dateValues[i];
    var date = new Date(dateStr + 'T00:00:00');
    var dateSheetName = UiWizardController.formatDateSheetName_(date, profile.dateSheetSuffix);

    // 1. Orchestrator.run() — 配置生成＋シート書込み
    var orchResult = Orchestrator.run({
      targetDate: date,
      extractSheet: profile.extractSheet,
      templateSheet: profile.templateSheet,
      skillSheet: profile.skillSheet,
      presetSheet: profile.presetSheet,
      configSheet: profile.configSheet,
      exclusions: exclusions,
      dateSheetName: dateSheetName
    });

    // 2. TimelineService.generate() — 個人シート生成
    var config = ConfigService.loadConfig(profile.configSheet);
    var staffList = AttendanceService.getAttendees(
      profile.extractSheet, date, config.shiftTimes);
    SkillService.mergeEmployment(
      staffList, SkillService.loadSkills(profile.skillSheet).employmentMap);
    var timeRows = SheetGateway.getTimeRows(profile.templateSheet);

    TimelineService.generate({
      dateSheetName: dateSheetName,
      staffList: staffList,
      placements: orchResult.placements,
      breakAssignments: orchResult.breakAssignments,
      breakDuration: config.breakDuration,
      exclusions: exclusions,
      timeRows: timeRows,
      postColorMap: postColorMap
    });

    // 3. HistoryService.save() — JSON履歴保存
    HistoryService.save({
      targetDate: date,
      department: params.departmentName,
      type: '仮',
      breakAssignments: orchResult.breakAssignments,
      placements: orchResult.placements,
      waves: null
    });

    // 診断情報（0配置のときのみ収集）
    var diag = null;
    if (orchResult.placements.length === 0) {
      var presets = PresetService.loadPresets(profile.presetSheet);
      var skillData = SkillService.loadSkills(profile.skillSheet);
      var slotsLoaded = config.slots;

      // プリセットの持ち場名とスキルシートの持ち場名を比較
      var sampleStaff = staffList.length > 0 ? staffList[0].name : null;
      var sampleSkills = sampleStaff ? (skillData.skills[sampleStaff] || {}) : {};
      var skillPostNames = sampleStaff ? Object.keys(sampleSkills) : [];

      diag = {
        presetCount: presets.length,
        presetPosts: presets.map(function(p) { return p.postName; }),
        slotCount: slotsLoaded.length,
        slotSample: slotsLoaded.length > 0
          ? { startMin: slotsLoaded[0].startMin, endMin: slotsLoaded[0].endMin, row: slotsLoaded[0].rowNumber }
          : null,
        staffSample: sampleStaff
          ? { name: sampleStaff, shiftStart: staffList[0].shiftStartMin, shiftEnd: staffList[0].shiftEndMin }
          : null,
        skillPostNames: skillPostNames.slice(0, 10),
        sampleSkillLevels: sampleStaff ? sampleSkills : {}
      };
    }

    results.push({
      dateSheet: dateSheetName,
      personalSheet: dateSheetName + '_個人',
      placementCount: orchResult.placements.length,
      staffCount: staffList.length,
      diag: diag
    });
  }

  return { success: true, results: results };
}
