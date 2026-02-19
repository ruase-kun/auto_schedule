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
    .setHeight(600);
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
 * 除外設定用のスタッフ一覧と時刻オプションを返す（Step 2〜4 用）
 * 選択日付の全出勤者をユニオン集合で取得し、雇用形態情報も付与する。
 * @param {Object} params - { departmentName: string, dateValues: string[] }
 * @returns {{staffList: Array<{name: string, employment: string}>, timeOptions: Array<{timeMin: number, timeStr: string}>}}
 */
function uiWizard_loadStaffForExclusion(params) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, params.departmentName);
  if (!profile) throw new Error('部署が見つかりません: ' + params.departmentName);

  uiWizard_ensureConfigSheet_(profile.configSheet, profile.templateSheet);
  var config = ConfigService.loadConfig(profile.configSheet);
  var skillData = SkillService.loadSkills(profile.skillSheet);

  // 選択日付の全出勤者をユニオン集合で取得（シフト時間も保持）
  var staffMap = {};
  for (var i = 0; i < params.dateValues.length; i++) {
    var date = new Date(params.dateValues[i] + 'T00:00:00');
    var staffList = AttendanceService.getAttendees(
      profile.extractSheet, date, config.shiftTimes);
    SkillService.mergeEmployment(staffList, skillData.employmentMap);
    for (var j = 0; j < staffList.length; j++) {
      var s = staffList[j];
      if (!staffMap[s.name]) {
        staffMap[s.name] = {
          employment: s.employment || '',
          shiftStartMin: s.shiftStartMin,
          shiftEndMin: s.shiftEndMin
        };
      } else {
        // 複数日のシフト範囲を最大で取る（ユニオン）
        if (s.shiftStartMin < staffMap[s.name].shiftStartMin) {
          staffMap[s.name].shiftStartMin = s.shiftStartMin;
        }
        if (s.shiftEndMin > staffMap[s.name].shiftEndMin) {
          staffMap[s.name].shiftEndMin = s.shiftEndMin;
        }
      }
    }
  }

  var result = [];
  var names = Object.keys(staffMap);
  for (var k = 0; k < names.length; k++) {
    var info = staffMap[names[k]];
    result.push({
      name: names[k],
      employment: info.employment,
      shiftStartMin: info.shiftStartMin,
      shiftEndMin: info.shiftEndMin
    });
  }

  // 雇用形態順でソート（リーダー→サブリーダー→社員→アルバイト→その他）、同一形態内は名前順
  var employmentOrder = ['リーダー', 'サブリーダー', '社員', 'アルバイト'];
  result.sort(function(a, b) {
    var ai = employmentOrder.indexOf(a.employment);
    var bi = employmentOrder.indexOf(b.employment);
    if (ai === -1) ai = employmentOrder.length;
    if (bi === -1) bi = employmentOrder.length;
    if (ai !== bi) return ai - bi;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // テンプレート時間行（時刻プルダウン用）
  var timeRows = SheetGateway.getTimeRows(profile.templateSheet);
  var timeOptions = [];
  for (var t = 0; t < timeRows.length; t++) {
    timeOptions.push({ timeMin: timeRows[t].timeMin, timeStr: timeRows[t].timeStr });
  }
  // 最終行+30分を追加（終了時刻用）
  if (timeRows.length > 0) {
    var lastMin = timeRows[timeRows.length - 1].timeMin + 30;
    timeOptions.push({ timeMin: lastMin, timeStr: TimeUtils.minToTimeStr(lastMin) });
  }

  return { staffList: result, timeOptions: timeOptions };
}

/**
 * 配置シートの各持ち場セルにプルダウン（データ入力規則）を設定する。
 * 候補は「その時間帯に勤務中の全スタッフ」。勤務時間外のスタッフは含めない。
 * 一括 setDataValidations で高速に設定する。
 *
 * @param {Object} params
 * @param {string} params.dateSheetName - 日別配置表シート名
 * @param {Staff[]} params.staffList - 出勤スタッフ一覧
 * @param {TimeRow[]} params.timeRows - テンプレ時間行
 * @param {Array<{name: string, colIndex: number}>} params.posts - 持ち場一覧
 */
function uiWizard_setPlacementDropdowns_(params) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(params.dateSheetName);
  if (!sheet) return;
  if (params.timeRows.length === 0 || params.posts.length === 0) return;

  // 持ち場列の範囲（0始まり colIndex）
  var firstPostCol = params.posts[0].colIndex;
  var lastPostCol = params.posts[params.posts.length - 1].colIndex;
  for (var pc = 0; pc < params.posts.length; pc++) {
    if (params.posts[pc].colIndex < firstPostCol) firstPostCol = params.posts[pc].colIndex;
    if (params.posts[pc].colIndex > lastPostCol) lastPostCol = params.posts[pc].colIndex;
  }
  var numCols = lastPostCol - firstPostCol + 1;

  // colIndex → post マッピング
  var postByCol = {};
  for (var pi = 0; pi < params.posts.length; pi++) {
    postByCol[params.posts[pi].colIndex] = params.posts[pi];
  }

  // 時間行の rowNumber → timeMin マッピング
  var firstRow = params.timeRows[0].rowNumber;
  var lastRow = params.timeRows[params.timeRows.length - 1].rowNumber;
  var numRows = lastRow - firstRow + 1;
  var timeMinByRow = {};
  for (var ti = 0; ti < params.timeRows.length; ti++) {
    timeMinByRow[params.timeRows[ti].rowNumber] = params.timeRows[ti].timeMin;
  }

  // 2次元バリデーション配列を構築
  var rules = [];
  for (var r = firstRow; r <= lastRow; r++) {
    var rowRules = [];
    var timeMin = timeMinByRow[r];
    for (var c = firstPostCol; c <= lastPostCol; c++) {
      // 時間行でない or 持ち場列でない → バリデーションなし
      if (timeMin === undefined || !postByCol[c]) {
        rowRules.push(null);
        continue;
      }

      // 候補: その時間帯に勤務中の全スタッフ
      var candidates = [];
      for (var s = 0; s < params.staffList.length; s++) {
        var staff = params.staffList[s];
        if (staff.shiftStartMin <= timeMin && timeMin <= staff.shiftEndMin - 30) {
          candidates.push(staff.name);
        }
      }

      if (candidates.length > 0) {
        rowRules.push(
          SpreadsheetApp.newDataValidation()
            .requireValueInList(candidates, true)
            .setAllowInvalid(true)
            .build()
        );
      } else {
        rowRules.push(null);
      }
    }
    rules.push(rowRules);
  }

  // 一括設定（1始まり列番号 = colIndex + 1）
  sheet.getRange(firstRow, firstPostCol + 1, numRows, numCols).setDataValidations(rules);
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

  // 除外情報をUIパラメータから構築
  var exclusions = ExclusionService.createEmpty();
  if (params.exclusions) {
    if (params.exclusions.allDay && params.exclusions.allDay.length > 0) {
      exclusions.allDay = ExclusionService.buildAllDaySet(params.exclusions.allDay);
    }
    if (params.exclusions.timeRanges) {
      for (var e = 0; e < params.exclusions.timeRanges.length; e++) {
        var tr = params.exclusions.timeRanges[e];
        ExclusionService.addTimeRange(exclusions, tr.name, tr.startMin, tr.endMin);
      }
    }
    if (params.exclusions.tournaments) {
      for (var e2 = 0; e2 < params.exclusions.tournaments.length; e2++) {
        var tt = params.exclusions.tournaments[e2];
        ExclusionService.addTournament(exclusions, tt.name, tt.startMin, tt.endMin);
      }
    }
  }

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

    // 2. 各種データ読込（TimelineService + プルダウン + 診断で共用）
    var config = ConfigService.loadConfig(profile.configSheet);
    var staffList = AttendanceService.getAttendees(
      profile.extractSheet, date, config.shiftTimes);
    var skillData = SkillService.loadSkills(profile.skillSheet);
    SkillService.mergeEmployment(staffList, skillData.employmentMap);
    var timeRows = SheetGateway.getTimeRows(profile.templateSheet);
    var posts = SheetGateway.detectPosts(dateSheetName); // 生成シートから検出（無効列削除済み）
    var presets = PresetService.loadPresets(profile.presetSheet);

    // 3. TimelineService.generate() — 個人シート生成
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

    // 4. 配置シートにプルダウン設定（手動調整用）
    uiWizard_setPlacementDropdowns_({
      dateSheetName: dateSheetName,
      staffList: staffList,
      timeRows: timeRows,
      posts: posts
    });

    // 5. HistoryService.save() — JSON履歴保存
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

  // 生成シートを先頭に移動（日付シート→個人シートの順）
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var m = results.length - 1; m >= 0; m--) {
    var pSheet = ss.getSheetByName(results[m].personalSheet);
    if (pSheet) { ss.setActiveSheet(pSheet); ss.moveActiveSheet(1); }
    var dSheet = ss.getSheetByName(results[m].dateSheet);
    if (dSheet) { ss.setActiveSheet(dSheet); ss.moveActiveSheet(1); }
  }

  return { success: true, results: results };
}
