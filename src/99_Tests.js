/**
 * 99_Tests.js — Phase 1+2 テストスイート
 *
 * GAS実行環境でのユニットテスト＋統合テスト。
 * カスタムメニュー「配置システム > Phase 1+2 テスト実行」から実行可能。
 *
 * テスト基盤: assertEqual_, assertDeepEqual_, assertThrows_, testGroup_
 * 統合テストはシート不存在時SKIPに。
 */

/* ---------- カスタムメニュー ---------- */

/**
 * スプレッドシート起動時にカスタムメニューを追加
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('配置システム')
    .addItem('Phase 1+2 テスト実行', 'runAllPhase1Tests')
    .addToUi();
}

/* ---------- テスト基盤 ---------- */

/**
 * テスト結果カウンタ（グローバル）
 * @type {{passed: number, failed: number, skipped: number, errors: string[]}}
 */
var testResults_ = { passed: 0, failed: 0, skipped: 0, errors: [] };

/**
 * 等値アサーション
 * @param {string} label - テスト名
 * @param {*} actual - 実際値
 * @param {*} expected - 期待値
 */
function assertEqual_(label, actual, expected) {
  if (actual === expected) {
    testResults_.passed++;
  } else {
    testResults_.failed++;
    testResults_.errors.push(
      'FAIL: ' + label + '\n  期待: ' + JSON.stringify(expected) +
      '\n  実際: ' + JSON.stringify(actual)
    );
  }
}

/**
 * 深い等値アサーション（JSON比較）
 * @param {string} label
 * @param {*} actual
 * @param {*} expected
 */
function assertDeepEqual_(label, actual, expected) {
  var aStr = JSON.stringify(actual);
  var eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    testResults_.passed++;
  } else {
    testResults_.failed++;
    testResults_.errors.push(
      'FAIL: ' + label + '\n  期待: ' + eStr + '\n  実際: ' + aStr
    );
  }
}

/**
 * 例外スローアサーション
 * @param {string} label
 * @param {Function} fn - 例外を投げるべき関数
 */
function assertThrows_(label, fn) {
  try {
    fn();
    testResults_.failed++;
    testResults_.errors.push('FAIL: ' + label + ' — 例外が発生しませんでした');
  } catch (e) {
    testResults_.passed++;
  }
}

/**
 * 真偽アサーション
 * @param {string} label
 * @param {boolean} condition
 */
function assertTrue_(label, condition) {
  if (condition) {
    testResults_.passed++;
  } else {
    testResults_.failed++;
    testResults_.errors.push('FAIL: ' + label + ' — 条件がfalseでした');
  }
}

/**
 * テストグループを実行する
 * @param {string} groupName - グループ名
 * @param {Function} fn - テスト関数
 */
function testGroup_(groupName, fn) {
  Logger.log('--- ' + groupName + ' ---');
  try {
    fn();
  } catch (e) {
    testResults_.failed++;
    testResults_.errors.push(
      'ERROR in ' + groupName + ': ' + e.message + '\n' + e.stack
    );
  }
}

/**
 * 統合テストをスキップ付きで実行する
 * シート不存在時はSKIPにする。
 * @param {string} groupName
 * @param {string} sheetName - 必要なシート名
 * @param {Function} fn
 */
function integrationTestGroup_(groupName, sheetName, fn) {
  Logger.log('--- ' + groupName + ' (統合) ---');
  if (!SheetGateway.sheetExists(sheetName)) {
    testResults_.skipped++;
    Logger.log('  SKIP: シート "' + sheetName + '" が存在しません');
    return;
  }
  try {
    fn();
  } catch (e) {
    testResults_.failed++;
    testResults_.errors.push(
      'ERROR in ' + groupName + ': ' + e.message + '\n' + e.stack
    );
  }
}

/* ---------- テスト実行 ---------- */

/**
 * 全Phase 1テストを実行する（メニューから呼び出し）
 */
function runAllPhase1Tests() {
  // カウンタリセット
  testResults_ = { passed: 0, failed: 0, skipped: 0, errors: [] };

  // Phase 1 純粋テスト
  testTimeUtils_();
  testConfigServicePure_();
  testPresetServicePure_();
  testAttendanceServicePure_();

  // Phase 2 純粋テスト
  testExclusionServicePure_();

  // 統合テスト
  testSheetGatewayIntegration_();
  testConfigServiceIntegration_();
  testPresetServiceIntegration_();
  testAttendanceServiceIntegration_();
  testSkillServiceIntegration_();

  // 結果出力
  var summary =
    '=== Phase 1+2 テスト結果 ===\n' +
    'PASSED: ' + testResults_.passed + '\n' +
    'FAILED: ' + testResults_.failed + '\n' +
    'SKIPPED: ' + testResults_.skipped + '\n';

  if (testResults_.errors.length > 0) {
    summary += '\n--- 失敗詳細 ---\n' + testResults_.errors.join('\n\n');
  }

  Logger.log(summary);

  // UIアラート
  try {
    var ui = SpreadsheetApp.getUi();
    if (testResults_.failed === 0) {
      ui.alert('Phase 1+2 テスト結果',
        'ALL PASSED (' + testResults_.passed + ' tests, ' +
        testResults_.skipped + ' skipped)', ui.ButtonSet.OK);
    } else {
      ui.alert('Phase 1+2 テスト結果',
        testResults_.failed + ' FAILED / ' + testResults_.passed +
        ' passed / ' + testResults_.skipped + ' skipped\n\n' +
        testResults_.errors.slice(0, 5).join('\n'),
        ui.ButtonSet.OK);
    }
  } catch (e) {
    // UIが使えない環境（トリガー等）ではスキップ
  }
}

/* ---------- TimeUtils テスト ---------- */

function testTimeUtils_() {
  testGroup_('TimeUtils', function () {
    // parseTimeToMin 正常系
    assertEqual_('parseTimeToMin("10:00")', TimeUtils.parseTimeToMin('10:00'), 600);
    assertEqual_('parseTimeToMin("9:30")', TimeUtils.parseTimeToMin('9:30'), 570);
    assertEqual_('parseTimeToMin("0:00")', TimeUtils.parseTimeToMin('0:00'), 0);
    assertEqual_('parseTimeToMin("23:59")', TimeUtils.parseTimeToMin('23:59'), 1439);
    assertEqual_('parseTimeToMin("08:00")', TimeUtils.parseTimeToMin('08:00'), 480);

    // parseTimeToMin エラー系
    assertThrows_('parseTimeToMin("")', function () { TimeUtils.parseTimeToMin(''); });
    assertThrows_('parseTimeToMin("abc")', function () { TimeUtils.parseTimeToMin('abc'); });
    assertThrows_('parseTimeToMin("25:00")', function () { TimeUtils.parseTimeToMin('25:00'); });
    assertThrows_('parseTimeToMin("10:60")', function () { TimeUtils.parseTimeToMin('10:60'); });

    // minToTimeStr 正常系
    assertEqual_('minToTimeStr(600)', TimeUtils.minToTimeStr(600), '10:00');
    assertEqual_('minToTimeStr(570)', TimeUtils.minToTimeStr(570), '9:30');
    assertEqual_('minToTimeStr(0)', TimeUtils.minToTimeStr(0), '0:00');
    assertEqual_('minToTimeStr(1439)', TimeUtils.minToTimeStr(1439), '23:59');

    // minToTimeStr エラー系
    assertThrows_('minToTimeStr(-1)', function () { TimeUtils.minToTimeStr(-1); });
    assertThrows_('minToTimeStr(NaN)', function () { TimeUtils.minToTimeStr(NaN); });

    // parseShiftRange 正常系
    assertDeepEqual_(
      'parseShiftRange("9:30-16:00")',
      TimeUtils.parseShiftRange('9:30-16:00'),
      { startMin: 570, endMin: 960 }
    );
    assertDeepEqual_(
      'parseShiftRange("8:00-17:00")',
      TimeUtils.parseShiftRange('8:00-17:00'),
      { startMin: 480, endMin: 1020 }
    );

    // parseShiftRange 全角文字対応
    assertDeepEqual_(
      'parseShiftRange with fullwidth dash "15:00\uff7022:00"',
      TimeUtils.parseShiftRange('15:00\uff7022:00'),
      { startMin: 900, endMin: 1320 }
    );
    assertDeepEqual_(
      'parseShiftRange with fullwidth colon "15\uff1a00-22\uff1a00"',
      TimeUtils.parseShiftRange('15\uff1a00-22\uff1a00'),
      { startMin: 900, endMin: 1320 }
    );

    // normalizeToHalfWidth
    assertEqual_(
      'normalizeToHalfWidth fullwidth dash',
      TimeUtils.normalizeToHalfWidth('15:00\uff7022:00'),
      '15:00-22:00'
    );

    // parseShiftRange エラー系
    assertThrows_('parseShiftRange("")', function () { TimeUtils.parseShiftRange(''); });
    assertThrows_('parseShiftRange("16:00-9:00")', function () {
      TimeUtils.parseShiftRange('16:00-9:00');
    });
    assertThrows_('parseShiftRange("10:00-10:00")', function () {
      TimeUtils.parseShiftRange('10:00-10:00');
    });
  });
}

/* ---------- ConfigService 純粋テスト ---------- */

function testConfigServicePure_() {
  testGroup_('ConfigService (pure)', function () {
    // parseTimeCell_ with Date
    var fakeDate = new Date(2026, 0, 1, 14, 30); // 14:30
    assertEqual_(
      'parseTimeCell_ Date(14:30)',
      ConfigService.parseTimeCell_(fakeDate),
      870
    );

    // parseTimeCell_ with string
    assertEqual_(
      'parseTimeCell_ "9:30"',
      ConfigService.parseTimeCell_('9:30'),
      570
    );
  });
}

/* ---------- PresetService 純粋テスト ---------- */

function testPresetServicePure_() {
  testGroup_('PresetService (pure)', function () {
    // parseSortDir_
    assertEqual_('parseSortDir_("DESC")', PresetService.parseSortDir_('DESC'), 'DESC');
    assertEqual_('parseSortDir_("降順")', PresetService.parseSortDir_('降順'), 'DESC');
    assertEqual_('parseSortDir_("ASC")', PresetService.parseSortDir_('ASC'), 'ASC');
    assertEqual_('parseSortDir_("昇順")', PresetService.parseSortDir_('昇順'), 'ASC');
    assertEqual_('parseSortDir_("")', PresetService.parseSortDir_(''), 'ASC');

    // parseActiveWindows_
    assertDeepEqual_(
      'parseActiveWindows_ single',
      PresetService.parseActiveWindows_('12:00-14:00'),
      [{ startMin: 720, endMin: 840 }]
    );
    assertDeepEqual_(
      'parseActiveWindows_ multiple',
      PresetService.parseActiveWindows_('12:00-14:00,16:00-18:00'),
      [{ startMin: 720, endMin: 840 }, { startMin: 960, endMin: 1080 }]
    );
    assertDeepEqual_(
      'parseActiveWindows_ empty',
      PresetService.parseActiveWindows_(''),
      []
    );
    assertDeepEqual_(
      'parseActiveWindows_ null',
      PresetService.parseActiveWindows_(null),
      []
    );
    assertDeepEqual_(
      'parseActiveWindows_ non-time value "項目"',
      PresetService.parseActiveWindows_('項目'),
      []
    );
  });
}

/* ---------- AttendanceService 純粋テスト ---------- */

function testAttendanceServicePure_() {
  testGroup_('AttendanceService (pure)', function () {
    // normalizeDateForComparison_
    var d1 = new Date(2026, 2, 15); // 3/15
    assertEqual_(
      'normalizeDateForComparison_ 3/15',
      AttendanceService.normalizeDateForComparison_(d1),
      '3/15'
    );

    var d2 = new Date(2026, 0, 1); // 1/1
    assertEqual_(
      'normalizeDateForComparison_ 1/1',
      AttendanceService.normalizeDateForComparison_(d2),
      '1/1'
    );
  });
}

/* ---------- SheetGateway 統合テスト ---------- */

function testSheetGatewayIntegration_() {
  integrationTestGroup_('SheetGateway', '03_配置テンプレート', function () {
    // detectPosts
    var posts = SheetGateway.detectPosts('03_配置テンプレート');
    assertTrue_(
      'detectPosts returns array with items',
      Array.isArray(posts) && posts.length > 0
    );
    assertTrue_(
      'detectPosts[0] has name',
      typeof posts[0].name === 'string' && posts[0].name !== ''
    );
    assertTrue_(
      'detectPosts[0] has colIndex',
      typeof posts[0].colIndex === 'number' && posts[0].colIndex >= 2
    );

    // getTimeRows
    var timeRows = SheetGateway.getTimeRows('03_配置テンプレート');
    assertTrue_(
      'getTimeRows returns array with items',
      Array.isArray(timeRows) && timeRows.length > 0
    );
    assertTrue_(
      'getTimeRows[0] has required fields',
      typeof timeRows[0].rowNumber === 'number' &&
      typeof timeRows[0].timeMin === 'number' &&
      typeof timeRows[0].timeStr === 'string'
    );

    // sheetExists
    assertTrue_(
      'sheetExists("03_配置テンプレート")',
      SheetGateway.sheetExists('03_配置テンプレート')
    );
    assertTrue_(
      '!sheetExists("__nonexistent__")',
      !SheetGateway.sheetExists('__nonexistent__')
    );
  });
}

/* ---------- ConfigService 統合テスト ---------- */

function testConfigServiceIntegration_() {
  integrationTestGroup_('ConfigService', '06_コンフィグ', function () {
    var config = ConfigService.loadConfig('06_コンフィグ');

    // slots
    assertTrue_(
      'config.slots is non-empty array',
      Array.isArray(config.slots) && config.slots.length > 0
    );
    assertTrue_(
      'config.slots[0] has slotId',
      typeof config.slots[0].slotId === 'string'
    );
    assertTrue_(
      'config.slots[0] has rowNumber',
      typeof config.slots[0].rowNumber === 'number'
    );
    assertTrue_(
      'config.slots[0] has startMin',
      typeof config.slots[0].startMin === 'number'
    );

    // スロット昇順検証
    var ascending = true;
    for (var i = 1; i < config.slots.length; i++) {
      if (config.slots[i].startMin <= config.slots[i - 1].startMin) {
        ascending = false;
        break;
      }
    }
    assertTrue_('config.slots in ascending startMin order', ascending);

    // breakTimes
    assertTrue_(
      'config.breakTimes has amFirst',
      typeof config.breakTimes.amFirst === 'number'
    );
    assertTrue_(
      'config.breakDuration > 0',
      config.breakDuration > 0
    );

    // shiftTimes
    assertTrue_(
      'config.shiftTimes is object',
      typeof config.shiftTimes === 'object' &&
      Object.keys(config.shiftTimes).length > 0
    );
  });
}

/* ---------- PresetService 統合テスト ---------- */

function testPresetServiceIntegration_() {
  integrationTestGroup_('PresetService', '05_配置プリセット', function () {
    var presets = PresetService.loadPresets('05_配置プリセット');

    assertTrue_(
      'presets is non-empty array',
      Array.isArray(presets) && presets.length > 0
    );

    // 構造検証
    var p = presets[0];
    assertTrue_('preset has postName', typeof p.postName === 'string');
    assertTrue_('preset has enabled', typeof p.enabled === 'boolean');
    assertTrue_('preset has requiredLv 1-4', p.requiredLv >= 1 && p.requiredLv <= 4);
    assertTrue_('preset has order >= 1', p.order >= 1);
    assertTrue_('preset has sortDir', p.sortDir === 'ASC' || p.sortDir === 'DESC');
    assertTrue_('preset has activeWindows array', Array.isArray(p.activeWindows));

    // order順検証
    var orderOk = true;
    for (var i = 1; i < presets.length; i++) {
      if (presets[i].order < presets[i - 1].order) {
        orderOk = false;
        break;
      }
    }
    assertTrue_('presets sorted by order', orderOk);
  });
}

/* ---------- AttendanceService 統合テスト ---------- */

function testAttendanceServiceIntegration_() {
  integrationTestGroup_('AttendanceService', '02_販売のみ抽出', function () {
    // 抽出シートの1行目から最初の日付を取得してテスト
    var data = SheetGateway.getValues('02_販売のみ抽出');
    if (data.length < 3) {
      testResults_.skipped++;
      Logger.log('  SKIP: 抽出シートのデータが不足しています');
      return;
    }

    var firstDate = data[0][0];
    if (!(firstDate instanceof Date)) {
      firstDate = new Date(firstDate);
    }
    if (isNaN(firstDate.getTime())) {
      testResults_.skipped++;
      Logger.log('  SKIP: 最初のセルが有効な日付ではありません');
      return;
    }

    var staff = AttendanceService.getAttendees('02_販売のみ抽出', firstDate);
    assertTrue_(
      'getAttendees returns array',
      Array.isArray(staff)
    );

    if (staff.length > 0) {
      var s = staff[0];
      assertTrue_('staff has name', typeof s.name === 'string' && s.name !== '');
      assertTrue_(
        'staff has valid shiftType',
        ['早朝', '午前', '午後', '時差'].indexOf(s.shiftType) !== -1
      );
      assertTrue_('staff has shiftStartMin', typeof s.shiftStartMin === 'number');
      assertTrue_('staff has shiftEndMin', typeof s.shiftEndMin === 'number');
      assertTrue_(
        'shiftStartMin < shiftEndMin',
        s.shiftStartMin < s.shiftEndMin
      );
    }
  });
}

/* ---------- SkillService 統合テスト ---------- */

function testSkillServiceIntegration_() {
  integrationTestGroup_('SkillService', '04_スキルレベル表', function () {
    var result = SkillService.loadSkills('04_スキルレベル表');

    assertTrue_(
      'skills is object',
      typeof result.skills === 'object'
    );
    assertTrue_(
      'employmentMap is object',
      typeof result.employmentMap === 'object'
    );

    var staffNames = Object.keys(result.skills);
    assertTrue_(
      'skills has entries',
      staffNames.length > 0
    );

    // レベル範囲0-4検証
    var levelOk = true;
    for (var i = 0; i < staffNames.length; i++) {
      var posts = result.skills[staffNames[i]];
      var postNames = Object.keys(posts);
      for (var j = 0; j < postNames.length; j++) {
        var lv = posts[postNames[j]];
        if (lv < 0 || lv > 4) {
          levelOk = false;
          break;
        }
      }
      if (!levelOk) break;
    }
    assertTrue_('all skill levels in range 0-4', levelOk);

    // mergeEmployment テスト
    var mockStaff = [{ name: staffNames[0], employment: '', shiftType: '午前', shiftStartMin: 570, shiftEndMin: 1080 }];
    SkillService.mergeEmployment(mockStaff, result.employmentMap);
    assertTrue_(
      'mergeEmployment sets employment',
      mockStaff[0].employment !== '' || result.employmentMap[staffNames[0]] === ''
    );
  });
}

/* ---------- ExclusionService 純粋テスト ---------- */

function testExclusionServicePure_() {

  // createEmpty
  testGroup_('ExclusionService.createEmpty', function () {
    var excl = ExclusionService.createEmpty();
    assertDeepEqual_('createEmpty().allDay', excl.allDay, {});
    assertDeepEqual_('createEmpty().timeRanges', excl.timeRanges, []);
    assertDeepEqual_('createEmpty().tournaments', excl.tournaments, []);
  });

  // buildAllDaySet
  testGroup_('ExclusionService.buildAllDaySet', function () {
    var set = ExclusionService.buildAllDaySet(['田中', '山田']);
    assertEqual_('buildAllDaySet 田中', set['田中'], true);
    assertEqual_('buildAllDaySet 山田', set['山田'], true);
    assertEqual_('buildAllDaySet 佐藤 undefined', set['佐藤'], undefined);

    // 空文字・空白スキップ
    var set2 = ExclusionService.buildAllDaySet(['田中', '', '  ', '鈴木']);
    assertEqual_('buildAllDaySet skips empty', set2[''], undefined);
    assertEqual_('buildAllDaySet skips whitespace', set2['  '], undefined);
    assertEqual_('buildAllDaySet keeps 田中', set2['田中'], true);
    assertEqual_('buildAllDaySet keeps 鈴木', set2['鈴木'], true);

    // 空配列
    var set3 = ExclusionService.buildAllDaySet([]);
    assertDeepEqual_('buildAllDaySet empty array', set3, {});
  });

  // addTimeRange
  testGroup_('ExclusionService.addTimeRange', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTimeRange(excl, '山田', 600, 720);
    assertEqual_('addTimeRange entry count', excl.timeRanges.length, 1);
    assertEqual_('addTimeRange name', excl.timeRanges[0].name, '山田');
    assertEqual_('addTimeRange startMin', excl.timeRanges[0].startMin, 600);
    assertEqual_('addTimeRange endMin', excl.timeRanges[0].endMin, 720);

    // startMin >= endMin でthrow
    assertThrows_('addTimeRange startMin >= endMin', function () {
      ExclusionService.addTimeRange(excl, '山田', 720, 600);
    });
    assertThrows_('addTimeRange startMin == endMin', function () {
      ExclusionService.addTimeRange(excl, '山田', 600, 600);
    });
    // 空名前でthrow
    assertThrows_('addTimeRange empty name', function () {
      ExclusionService.addTimeRange(excl, '', 600, 720);
    });
  });

  // addTournament
  testGroup_('ExclusionService.addTournament', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl, '鈴木', 750, 900);
    assertEqual_('addTournament entry count', excl.tournaments.length, 1);
    assertEqual_('addTournament name', excl.tournaments[0].name, '鈴木');

    // バリデーション
    assertThrows_('addTournament startMin >= endMin', function () {
      ExclusionService.addTournament(excl, '鈴木', 900, 750);
    });
  });

  // isExcluded: allDay
  testGroup_('ExclusionService.isExcluded allDay', function () {
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);

    assertEqual_('allDay: 田中 at 600', ExclusionService.isExcluded(excl, '田中', 600), true);
    assertEqual_('allDay: 田中 at 0', ExclusionService.isExcluded(excl, '田中', 0), true);
    assertEqual_('allDay: 田中 at 1400', ExclusionService.isExcluded(excl, '田中', 1400), true);
    assertEqual_('allDay: 佐藤 not excluded', ExclusionService.isExcluded(excl, '佐藤', 600), false);
  });

  // isExcluded: timeRange
  testGroup_('ExclusionService.isExcluded timeRange', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTimeRange(excl, '山田', 600, 720);

    assertEqual_('timeRange: 山田 at 600 (start)', ExclusionService.isExcluded(excl, '山田', 600), true);
    assertEqual_('timeRange: 山田 at 660 (mid)', ExclusionService.isExcluded(excl, '山田', 660), true);
    assertEqual_('timeRange: 山田 at 719 (end-1)', ExclusionService.isExcluded(excl, '山田', 719), true);
    assertEqual_('timeRange: 山田 at 720 (end, half-open)', ExclusionService.isExcluded(excl, '山田', 720), false);
    assertEqual_('timeRange: 山田 at 599 (before)', ExclusionService.isExcluded(excl, '山田', 599), false);
    assertEqual_('timeRange: 佐藤 not excluded', ExclusionService.isExcluded(excl, '佐藤', 660), false);
  });

  // isExcluded: tournament
  testGroup_('ExclusionService.isExcluded tournament', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl, '鈴木', 750, 900);

    assertEqual_('tournament: 鈴木 at 750 (start)', ExclusionService.isExcluded(excl, '鈴木', 750), true);
    assertEqual_('tournament: 鈴木 at 800 (mid)', ExclusionService.isExcluded(excl, '鈴木', 800), true);
    assertEqual_('tournament: 鈴木 at 900 (end, half-open)', ExclusionService.isExcluded(excl, '鈴木', 900), false);
    assertEqual_('tournament: 鈴木 at 749 (before)', ExclusionService.isExcluded(excl, '鈴木', 749), false);
  });

  // isExcludedDetail
  testGroup_('ExclusionService.isExcludedDetail', function () {
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);
    ExclusionService.addTimeRange(excl, '山田', 600, 720);
    ExclusionService.addTournament(excl, '鈴木', 750, 900);

    var r1 = ExclusionService.isExcludedDetail(excl, '田中', 600);
    assertEqual_('detail allDay excluded', r1.excluded, true);
    assertEqual_('detail allDay reason', r1.reason, 'allDay');

    var r2 = ExclusionService.isExcludedDetail(excl, '山田', 660);
    assertEqual_('detail timeRange excluded', r2.excluded, true);
    assertEqual_('detail timeRange reason', r2.reason, 'timeRange');

    var r3 = ExclusionService.isExcludedDetail(excl, '鈴木', 800);
    assertEqual_('detail tournament excluded', r3.excluded, true);
    assertEqual_('detail tournament reason', r3.reason, 'tournament');

    var r4 = ExclusionService.isExcludedDetail(excl, '佐藤', 600);
    assertEqual_('detail not excluded', r4.excluded, false);
    assertEqual_('detail no reason', r4.reason, '');
  });

  // 優先度: allDayがtournament/timeRangeより優先
  testGroup_('ExclusionService priority', function () {
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);
    ExclusionService.addTournament(excl, '田中', 750, 900);
    ExclusionService.addTimeRange(excl, '田中', 600, 720);

    var r = ExclusionService.isExcludedDetail(excl, '田中', 800);
    assertEqual_('priority: allDay over tournament', r.reason, 'allDay');

    // tournament > timeRange
    var excl2 = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl2, '山田', 600, 720);
    ExclusionService.addTimeRange(excl2, '山田', 600, 720);

    var r2 = ExclusionService.isExcludedDetail(excl2, '山田', 660);
    assertEqual_('priority: tournament over timeRange', r2.reason, 'tournament');
  });

  // isTournament
  testGroup_('ExclusionService.isTournament', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl, '鈴木', 750, 900);

    assertEqual_('isTournament: 鈴木 at 800', ExclusionService.isTournament(excl, '鈴木', 800), true);
    assertEqual_('isTournament: 鈴木 at 900 (end)', ExclusionService.isTournament(excl, '鈴木', 900), false);
    assertEqual_('isTournament: 佐藤', ExclusionService.isTournament(excl, '佐藤', 800), false);
  });

  // isAllDay
  testGroup_('ExclusionService.isAllDay', function () {
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);

    assertEqual_('isAllDay: 田中', ExclusionService.isAllDay(excl, '田中'), true);
    assertEqual_('isAllDay: 佐藤', ExclusionService.isAllDay(excl, '佐藤'), false);
  });

  // 複数エントリ
  testGroup_('ExclusionService multiple entries', function () {
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTimeRange(excl, '山田', 600, 720);
    ExclusionService.addTimeRange(excl, '山田', 840, 960);
    ExclusionService.addTournament(excl, '鈴木', 600, 720);
    ExclusionService.addTournament(excl, '鈴木', 840, 960);

    // 山田: 1つ目の区間
    assertEqual_('multi timeRange: 山田 at 660', ExclusionService.isExcluded(excl, '山田', 660), true);
    // 山田: 隙間（区間外）
    assertEqual_('multi timeRange: 山田 at 780 (gap)', ExclusionService.isExcluded(excl, '山田', 780), false);
    // 山田: 2つ目の区間
    assertEqual_('multi timeRange: 山田 at 900', ExclusionService.isExcluded(excl, '山田', 900), true);

    // 鈴木: 複数大会
    assertEqual_('multi tournament: 鈴木 at 660', ExclusionService.isTournament(excl, '鈴木', 660), true);
    assertEqual_('multi tournament: 鈴木 at 780 (gap)', ExclusionService.isTournament(excl, '鈴木', 780), false);
    assertEqual_('multi tournament: 鈴木 at 900', ExclusionService.isTournament(excl, '鈴木', 900), true);
  });

  // validate_
  testGroup_('ExclusionService.validate_', function () {
    // 正常構造
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTimeRange(excl, '山田', 600, 720);
    ExclusionService.validate_(excl); // should not throw
    testResults_.passed++;

    // 不正構造
    assertThrows_('validate_ null', function () {
      ExclusionService.validate_(null);
    });
    assertThrows_('validate_ missing allDay', function () {
      ExclusionService.validate_({ timeRanges: [], tournaments: [] });
    });
    assertThrows_('validate_ allDay not object', function () {
      ExclusionService.validate_({ allDay: 'bad', timeRanges: [], tournaments: [] });
    });
    assertThrows_('validate_ timeRanges not array', function () {
      ExclusionService.validate_({ allDay: {}, timeRanges: 'bad', tournaments: [] });
    });
    assertThrows_('validate_ tournaments not array', function () {
      ExclusionService.validate_({ allDay: {}, timeRanges: [], tournaments: 'bad' });
    });
    assertThrows_('validate_ invalid entry in timeRanges', function () {
      ExclusionService.validate_({ allDay: {}, timeRanges: [{ name: '', startMin: 0, endMin: 100 }], tournaments: [] });
    });
    assertThrows_('validate_ startMin >= endMin in entry', function () {
      ExclusionService.validate_({ allDay: {}, timeRanges: [{ name: '田中', startMin: 100, endMin: 50 }], tournaments: [] });
    });
  });
}
