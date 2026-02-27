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
      // JSON形式: A1が{で始まれば有効とみなす
      var a1 = String(existing[0][0]).trim();
      if (a1.charAt(0) === '{') return;
      // 旧形式: [シフト時間] セクションが存在すれば有効なコンフィグとみなす
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

  // JSON形式で生成
  var defaultConfig = {
    version: 1,
    slotBoundaries: boundaries,
    breakDuration: 60,
    breakBufferBefore: 0,
    breakBufferAfter: 0,
    breakTimes: {
      earlyFirst: '12:00', earlySecond: '13:00',
      amFirst: '14:00', amSecond: '15:00',
      pmFirst: '16:30', pmSecond: '17:30'
    },
    breakExclusionRows: {},
    shiftTimes: {
      '早朝': { start: '8:00', end: '17:00', pulldownStart: '10:00', pulldownEnd: '16:30' },
      '午前': { start: '9:30', end: '18:00', pulldownStart: '10:00', pulldownEnd: '17:30' },
      '午後': { start: '13:00', end: '22:00', pulldownStart: '13:30', pulldownEnd: '21:30' }
    },
    tournamentPresets: [
      { label: '0部', startStr: '10:00', endStr: '12:00', weekendOnly: true },
      { label: '1部', startStr: '12:30', endStr: '15:00', weekendOnly: false },
      { label: '2部', startStr: '15:30', endStr: '18:00', weekendOnly: false },
      { label: '3部', startStr: '18:30', endStr: '21:00', weekendOnly: false }
    ]
  };

  // シート作成＆JSON書込み
  SpreadsheetApp.getActiveSpreadsheet().insertSheet(configSheetName);
  SheetGateway.setValues(configSheetName, 1, 1, [[JSON.stringify(defaultConfig)]]);
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

  // 大会プリセット（コンフィグから動的取得）
  var tournamentPresets = config.tournamentPresets || [];

  return { staffList: result, timeOptions: timeOptions, tournamentPresets: tournamentPresets };
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
    var presets = (config.postPresets && config.postPresets.length > 0)
      ? PresetService.loadPresetsFromConfig(config.postPresets)
      : PresetService.loadPresets(profile.presetSheet);

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

/**
 * プリセットシートから有効な持ち場名一覧を返す
 * ConfigDialog で個別配置モードのUI構築に使用
 * @param {string} deptName - 部署名
 * @returns {string[]} 有効な持ち場名の配列
 */
function uiConfig_loadPostNames(deptName) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, deptName);
  if (!profile) throw new Error('部署が見つかりません: ' + deptName);

  // config JSONにpostPresetsがあればそちらから取得
  uiWizard_ensureConfigSheet_(profile.configSheet, profile.templateSheet);
  try {
    var data = SheetGateway.getValues(profile.configSheet);
    var a1 = String(data[0][0]).trim();
    if (a1.charAt(0) === '{') {
      var json = JSON.parse(a1);
      if (json.postPresets && json.postPresets.length > 0) {
        var names = [];
        for (var i = 0; i < json.postPresets.length; i++) {
          if (json.postPresets[i].enabled) {
            names.push(json.postPresets[i].postName);
          }
        }
        return names;
      }
    }
  } catch (e) { /* フォールバック */ }

  // フォールバック: 旧プリセットシートから取得
  var presets = PresetService.loadPresets(profile.presetSheet);
  var names2 = [];
  for (var j = 0; j < presets.length; j++) {
    if (presets[j].enabled) names2.push(presets[j].postName);
  }
  return names2;
}

/**
 * テンプレートシートから持ち場名一覧を返す（ConfigDialog プリセットタブ用）
 * @param {string} deptName - 部署名
 * @returns {string[]} 持ち場名の配列
 */
function uiConfig_loadTemplatePostNames(deptName) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, deptName);
  if (!profile) throw new Error('部署が見つかりません: ' + deptName);
  var posts = SheetGateway.detectPosts(profile.templateSheet);
  var names = [];
  for (var i = 0; i < posts.length; i++) {
    names.push(posts[i].name);
  }
  return names;
}

/* ---------- コンフィグ設定ダイアログ ---------- */

/**
 * コンフィグ設定ダイアログを表示する
 */
function showConfigDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ConfigDialog')
    .setWidth(620)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'コンフィグ設定');
}

/**
 * 指定部署のコンフィグ設定をUI用データとして返す
 * JSON形式ならそのままパースして返す。旧形式なら変換して返す。
 * @param {string} deptName - 部署名
 * @returns {Object} UI用コンフィグデータ
 */
function uiConfig_loadConfig(deptName) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, deptName);
  if (!profile) throw new Error('部署が見つかりません: ' + deptName);

  uiWizard_ensureConfigSheet_(profile.configSheet, profile.templateSheet);
  var data = SheetGateway.getValues(profile.configSheet);
  var a1 = String(data[0][0]).trim();

  // JSON形式ならそのままUI用データとして返す（変換不要）
  if (a1.charAt(0) === '{') {
    var json = JSON.parse(a1);
    return {
      slotBoundaries: json.slotBoundaries || [],
      breakDuration: json.breakDuration || 60,
      breakBufferBefore: json.breakBufferBefore || 0,
      breakBufferAfter: json.breakBufferAfter || 0,
      breakTimes: json.breakTimes || {},
      breakExclusionRows: json.breakExclusionRows || {},
      shiftTimes: json.shiftTimes || {},
      tournamentPresets: json.tournamentPresets || [],
      placementMode: json.placementMode || 'global',
      postIntervals: json.postIntervals || {},
      postPresets: json.postPresets || [],
      postPresetGroups: json.postPresetGroups || []
    };
  }

  // 旧形式 → 従来通り loadConfig → 分→H:MM変換 → UI用データ返却
  var config = ConfigService.loadConfig(profile.configSheet);

  var slotBoundaries = [];
  for (var i = 0; i < config.slots.length; i++) {
    slotBoundaries.push(TimeUtils.minToTimeStr(config.slots[i].startMin));
  }

  var bt = config.breakTimes;
  var breakTimesStr = {
    earlyFirst: TimeUtils.minToTimeStr(bt.earlyFirst),
    earlySecond: TimeUtils.minToTimeStr(bt.earlySecond),
    amFirst: TimeUtils.minToTimeStr(bt.amFirst),
    amSecond: TimeUtils.minToTimeStr(bt.amSecond),
    pmFirst: TimeUtils.minToTimeStr(bt.pmFirst),
    pmSecond: TimeUtils.minToTimeStr(bt.pmSecond)
  };

  var shiftTimesStr = {};
  var shiftNames = Object.keys(config.shiftTimes);
  for (var s = 0; s < shiftNames.length; s++) {
    var st = config.shiftTimes[shiftNames[s]];
    shiftTimesStr[shiftNames[s]] = {
      start: TimeUtils.minToTimeStr(st.start),
      end: TimeUtils.minToTimeStr(st.end),
      pulldownStart: TimeUtils.minToTimeStr(st.pulldownStart),
      pulldownEnd: TimeUtils.minToTimeStr(st.pulldownEnd)
    };
  }

  var presetsStr = [];
  for (var p = 0; p < config.tournamentPresets.length; p++) {
    var tp = config.tournamentPresets[p];
    presetsStr.push({
      label: tp.label,
      startStr: TimeUtils.minToTimeStr(tp.startMin),
      endStr: TimeUtils.minToTimeStr(tp.endMin),
      weekendOnly: tp.weekendOnly
    });
  }

  // breakExclusionRows を旧形式からも構築
  var breakExclusionRows = {};
  var exclKeys = Object.keys(config.breakExclusionMap || {});
  for (var e = 0; e < exclKeys.length; e++) {
    breakExclusionRows[exclKeys[e]] = config.breakExclusionMap[exclKeys[e]];
  }

  return {
    slotBoundaries: slotBoundaries,
    breakDuration: config.breakDuration,
    breakBufferBefore: config.breakBufferBefore || 0,
    breakBufferAfter: config.breakBufferAfter || 0,
    breakTimes: breakTimesStr,
    breakExclusionRows: breakExclusionRows,
    shiftTimes: shiftTimesStr,
    tournamentPresets: presetsStr,
    placementMode: config.placementMode || 'global',
    postIntervals: config.postIntervals || {},
    postPresets: [],
    postPresetGroups: []
  };
}

/**
 * UIからのコンフィグデータをJSON形式で保存する
 * UIから受け取ったstate.configをそのままJSON.stringifyしてシートに保存。
 * @param {Object} params - { deptName: string, config: Object }
 */
function uiConfig_saveConfig(params) {
  var profiles = DepartmentService.loadProfiles();
  var profile = DepartmentService.getProfileByName(profiles, params.deptName);
  if (!profile) throw new Error('部署が見つかりません: ' + params.deptName);

  ConfigService.saveConfig(profile.configSheet, params.config);
}

/* ---------- 欠勤者再配置 ---------- */

/**
 * 欠勤者再配置ダイアログを表示する
 */
function showReplacementDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ReplacementDialog')
    .setWidth(500)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(html, '欠勤者再配置');
}

/**
 * アクティブシート名からサフィックス部分を比較して部署を自動検出する
 * 例: "02/20(木)_通販" → dateSheetSuffix="_通販" の部署にマッチ
 *
 * @param {string} sheetName - 日付シート名
 * @param {DepartmentProfile[]} profiles - 部署プロファイル一覧
 * @returns {DepartmentProfile|null}
 */
function detectDepartmentFromSheetName_(sheetName, profiles) {
  // シート名から日付部分を除去してサフィックスを取得
  // 日付部分は "MM/DD(曜)" 形式（9文字）
  var datePartMatch = sheetName.match(/^\d{2}\/\d{2}\([日月火水木金土]\)/);
  if (!datePartMatch) return null;
  var suffix = sheetName.substring(datePartMatch[0].length);

  // サフィックス付き部署を先に探す（完全一致）
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].dateSheetSuffix && profiles[i].dateSheetSuffix === suffix) {
      return profiles[i];
    }
  }
  // サフィックスなし（空文字）の部署を返す
  if (suffix === '') {
    for (var j = 0; j < profiles.length; j++) {
      if (!profiles[j].dateSheetSuffix) return profiles[j];
    }
  }
  return profiles.length > 0 ? profiles[0] : null;
}

/**
 * シート名からDateオブジェクトを生成する
 * "02/20(木)" → 今年のその日付
 *
 * @param {string} sheetName - 日付シート名
 * @returns {Date}
 */
function parseDateFromSheetName_(sheetName) {
  var match = sheetName.match(/^(\d{2})\/(\d{2})\(/);
  if (!match) throw new Error('日付シート形式ではありません: ' + sheetName);
  var month = parseInt(match[1], 10);
  var day = parseInt(match[2], 10);
  var year = new Date().getFullYear();
  return new Date(year, month - 1, day);
}

/**
 * ポスト列の一括クリア（時間行のみ）
 *
 * @param {string} dateSheetName - 日付シート名
 * @param {Array<{name: string, colIndex: number}>} posts - 持ち場一覧
 * @param {TimeRow[]} timeRows - 時間行一覧
 */
function clearPostColumns_(dateSheetName, posts, timeRows) {
  if (posts.length === 0 || timeRows.length === 0) return;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(dateSheetName);
  if (!sheet) return;

  var firstPostCol = posts[0].colIndex;
  var lastPostCol = posts[posts.length - 1].colIndex;
  for (var p = 0; p < posts.length; p++) {
    if (posts[p].colIndex < firstPostCol) firstPostCol = posts[p].colIndex;
    if (posts[p].colIndex > lastPostCol) lastPostCol = posts[p].colIndex;
  }
  var numCols = lastPostCol - firstPostCol + 1;

  // 各時間行のポスト列をクリア
  for (var t = 0; t < timeRows.length; t++) {
    var row = timeRows[t].rowNumber;
    var emptyRow = [];
    for (var c = 0; c < numCols; c++) emptyRow.push('');
    sheet.getRange(row, firstPostCol + 1, 1, numCols).setValues([emptyRow]);
  }
}

/**
 * 欠勤者再配置: 初期データ読込（ダイアログ起動時）
 * アクティブシートの配置済みスタッフ一覧を返す。
 *
 * @returns {Array<{name: string, employment: string}>}
 */
function uiReplace_loadStaff() {
  var sheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();

  // 日付シート形式チェック
  if (!/^\d{2}\/\d{2}\(/.test(sheetName)) {
    throw new Error('日付シートを開いた状態で実行してください（例: 02/20(木)）');
  }

  // 部署自動検出
  var profiles = DepartmentService.loadProfiles();
  var profile = detectDepartmentFromSheetName_(sheetName, profiles);
  if (!profile) throw new Error('部署を検出できません: ' + sheetName);

  // テンプレ時間行と持ち場を取得
  var timeRows = SheetGateway.getTimeRows(sheetName);
  var posts = SheetGateway.detectPosts(sheetName);

  // シートデータ取得 → 配置読み取り → スタッフ抽出
  var sheetData = SheetGateway.getValues(sheetName);
  var placements = ReplacementEngine.readPlacementsFromSheet(sheetData, posts, timeRows);
  var staffNames = ReplacementEngine.extractStaffFromPlacements(placements);

  // 雇用形態情報を付与
  var skillData = SkillService.loadSkills(profile.skillSheet);
  var employmentOrder = ['リーダー', 'サブリーダー', '社員', 'アルバイト'];
  var result = [];
  for (var i = 0; i < staffNames.length; i++) {
    var emp = skillData.employmentMap[staffNames[i]] || '';
    result.push({ name: staffNames[i], employment: emp });
  }

  // 雇用形態順ソート
  result.sort(function (a, b) {
    var ai = employmentOrder.indexOf(a.employment);
    var bi = employmentOrder.indexOf(b.employment);
    if (ai === -1) ai = employmentOrder.length;
    if (bi === -1) bi = employmentOrder.length;
    if (ai !== bi) return ai - bi;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return result;
}

/**
 * 欠勤者再配置: 実行
 *
 * @param {Object} params - { absentNames: string[] }
 * @returns {Object} 結果サマリ
 */
function uiReplace_execute(params) {
  var absentNames = params.absentNames;
  if (!absentNames || absentNames.length === 0) {
    throw new Error('欠勤者が選択されていません');
  }

  var sheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
  if (!/^\d{2}\/\d{2}\(/.test(sheetName)) {
    throw new Error('日付シートを開いた状態で実行してください');
  }

  // 1. 部署検出＋日付パース
  var profiles = DepartmentService.loadProfiles();
  var profile = detectDepartmentFromSheetName_(sheetName, profiles);
  if (!profile) throw new Error('部署を検出できません: ' + sheetName);
  var targetDate = parseDateFromSheetName_(sheetName);

  // 2. config/presets/skills/staffList 読込
  uiWizard_ensureConfigSheet_(profile.configSheet, profile.templateSheet);
  var config = ConfigService.loadConfig(profile.configSheet);
  var presets = (config.postPresets && config.postPresets.length > 0)
    ? PresetService.loadPresetsFromConfig(config.postPresets)
    : PresetService.loadPresets(profile.presetSheet);
  var skillData = SkillService.loadSkills(profile.skillSheet);
  var staffList = AttendanceService.getAttendees(
    profile.extractSheet, targetDate, config.shiftTimes);
  SkillService.mergeEmployment(staffList, skillData.employmentMap);

  // 3. 日付シートから現在配置＋休憩割当を読取
  var timeRows = SheetGateway.getTimeRows(sheetName);
  var posts = SheetGateway.detectPosts(sheetName);
  var sheetData = SheetGateway.getValues(sheetName);
  var currentPlacements = ReplacementEngine.readPlacementsFromSheet(sheetData, posts, timeRows);
  var breakAssignments = ReplacementEngine.readBreakAssignmentsFromSheet(sheetData, timeRows);

  // 4. 欠勤者をallDay除外に設定
  var exclusions = ExclusionService.createEmpty();
  exclusions.allDay = ExclusionService.buildAllDaySet(absentNames);

  // 5. 休憩前後除外の事前計算
  var useAutoBuffer = (config.breakBufferBefore > 0 || config.breakBufferAfter > 0);
  var breakExcludedRows = useAutoBuffer
    ? {}
    : PlacementEngine.buildBreakExcludedRows(
        breakAssignments, timeRows, config.breakExclusionMap
      );
  var breakBufferPeriods = useAutoBuffer
    ? PlacementEngine.buildBreakBufferPeriods_(
        breakAssignments, timeRows,
        config.breakBufferBefore, config.breakBufferAfter
      )
    : {};

  // 6. プロセスログ構築開始
  var log = [];
  log.push('=== 再配置プロセスログ ===');
  log.push('実行日時: ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'));
  log.push('');

  // ログ: 欠勤者
  log.push('--- 欠勤者(' + absentNames.length + '名) ---');
  log.push(absentNames.join(', '));
  log.push('');

  // ログ: 既存配置サマリ
  log.push('--- 既存配置 ---');
  log.push('配置数: ' + currentPlacements.length + '件');
  var placedStaff = ReplacementEngine.extractStaffFromPlacements(currentPlacements);
  log.push('配置済みスタッフ(' + placedStaff.length + '名): ' + placedStaff.join(', '));
  log.push('');

  // ログ: 休憩割当（シートから読取）
  if (breakAssignments.length > 0) {
    log.push('--- 休憩割当(シート読取) ---');
    for (var bl = 0; bl < breakAssignments.length; bl++) {
      var ba = breakAssignments[bl];
      log.push(TimeUtils.minToTimeStr(ba.breakAtMin) + ': ' + ba.names.join(', '));
    }
    log.push('');
  }

  // ログ: スタッフ一覧（出勤者）
  log.push('--- 出勤スタッフ(' + staffList.length + '名) ---');
  var staffDescs = [];
  for (var lsd = 0; lsd < staffList.length; lsd++) {
    var sd = staffList[lsd];
    var empStr = sd.employment || '?';
    var absentMark = exclusions.allDay[sd.name] ? '[欠勤]' : '';
    staffDescs.push(sd.name + '[' + empStr + '] ' + sd.shiftType + ' ' +
      TimeUtils.minToTimeStr(sd.shiftStartMin) + '-' + TimeUtils.minToTimeStr(sd.shiftEndMin) +
      absentMark);
  }
  log.push(staffDescs.join(' | '));
  log.push('');

  // identifyGaps → fillGaps（logを渡す）
  var gapResult = ReplacementEngine.identifyGaps(currentPlacements, absentNames);

  // ログ: ギャップ一覧
  log.push('--- ギャップ(' + gapResult.gaps.length + '件) ---');
  for (var gl = 0; gl < gapResult.gaps.length; gl++) {
    var gp = gapResult.gaps[gl];
    log.push(TimeUtils.minToTimeStr(gp.timeMin) + ' ' + gp.postName);
  }
  log.push('');

  var fillResult = ReplacementEngine.fillGaps({
    gaps: gapResult.gaps,
    remaining: gapResult.remaining,
    presets: presets,
    staffList: staffList,
    absentNames: absentNames,
    skills: skillData.skills,
    breakAssignments: breakAssignments,
    breakDuration: config.breakDuration,
    breakExcludedRows: breakExcludedRows,
    breakBufferPeriods: breakBufferPeriods,
    exclusions: exclusions,
    log: log,
    config: config,
    timeRows: timeRows
  });

  // ログ: サマリ
  log.push('');
  log.push('--- サマリ ---');
  log.push('ギャップ数: ' + gapResult.gaps.length);
  log.push('充填数: ' + fillResult.filled.length);
  log.push('未充填数: ' + fillResult.unfilled.length);
  if (fillResult.unfilled.length > 0) {
    log.push('--- 未充填 ---');
    for (var u = 0; u < fillResult.unfilled.length; u++) {
      var uf = fillResult.unfilled[u];
      log.push(TimeUtils.minToTimeStr(uf.timeMin) + ' ' + uf.postName);
    }
  }

  // 7. ポスト列クリア → 書込み
  clearPostColumns_(sheetName, posts, timeRows);

  // remaining + filled を結合して書込み
  var allPlacements = gapResult.remaining.concat(fillResult.filled);
  Orchestrator.writePlacements_(sheetName, allPlacements, posts);

  // 8. A1ノートにプロセスログ追記
  var existingNote = '';
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    existingNote = sheet.getRange(1, 1).getNote() || '';
  } catch (e) { /* ignore */ }
  var newNote = existingNote
    ? existingNote + '\n\n' + log.join('\n')
    : log.join('\n');
  SheetGateway.setNote(sheetName, 1, 1, newNote);

  // 9. 個人シート再生成（欠勤者除外）
  var postColorMap = SheetGateway.getPostColors(sheetName);
  var activeStaffList = [];
  var absentSet = {};
  for (var as = 0; as < absentNames.length; as++) {
    absentSet[absentNames[as]] = true;
  }
  for (var sl = 0; sl < staffList.length; sl++) {
    if (!absentSet[staffList[sl].name]) {
      activeStaffList.push(staffList[sl]);
    }
  }

  TimelineService.generate({
    dateSheetName: sheetName,
    staffList: activeStaffList,
    placements: allPlacements,
    breakAssignments: breakAssignments,
    breakDuration: config.breakDuration,
    exclusions: exclusions,
    timeRows: timeRows,
    postColorMap: postColorMap
  });

  // 10. 結果サマリを返却
  var unfilledSummary = [];
  for (var uf2 = 0; uf2 < fillResult.unfilled.length; uf2++) {
    var item = fillResult.unfilled[uf2];
    unfilledSummary.push({
      timeStr: TimeUtils.minToTimeStr(item.timeMin),
      postName: item.postName
    });
  }

  return {
    absentNames: absentNames,
    gapCount: gapResult.gaps.length,
    filledCount: fillResult.filled.length,
    unfilledCount: fillResult.unfilled.length,
    unfilled: unfilledSummary
  };
}
