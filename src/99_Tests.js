/**
 * 99_Tests.js — Phase 1+2+3+4+5 テストスイート
 *
 * GAS実行環境でのユニットテスト＋統合テスト。
 * カスタムメニュー「配置システム > Phase 1+2+3+4+5 テスト実行」から実行可能。
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
    .addItem('Phase 1+2+3+4+5 テスト実行', 'runAllPhase1Tests')
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

  // Phase 3 純粋テスト
  testBreakServicePure_();

  // Phase 4 純粋テスト
  testPlacementEnginePure_();

  // Phase 5 純粋テスト
  testTimelineServicePure_();

  // 統合テスト
  testSheetGatewayIntegration_();
  testConfigServiceIntegration_();
  testPresetServiceIntegration_();
  testAttendanceServiceIntegration_();
  testSkillServiceIntegration_();

  // 結果出力
  var summary =
    '=== Phase 1+2+3+4+5 テスト結果 ===\n' +
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
      ui.alert('Phase 1+2+3+4+5 テスト結果',
        'ALL PASSED (' + testResults_.passed + ' tests, ' +
        testResults_.skipped + ' skipped)', ui.ButtonSet.OK);
    } else {
      ui.alert('Phase 1+2+3+4+5 テスト結果',
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

/* ---------- BreakService 純粋テスト ---------- */

function testBreakServicePure_() {

  // ヘルパー: テスト用Config生成
  function makeConfig_() {
    return {
      breakTimes: {
        amFirst: 840,   // 14:00
        amSecond: 900,  // 15:00
        pmFirst: 990,   // 16:30
        pmSecond: 1050  // 17:30
      },
      breakDuration: 60
    };
  }

  // ヘルパー: テスト用Staff生成
  function makeStaff_(name, employment, shiftType) {
    var shifts = {
      '午前': { start: 570, end: 1080 },
      '午後': { start: 780, end: 1320 },
      '早朝': { start: 480, end: 1020 },
      '時差': { start: 720, end: 1200 }
    };
    var s = shifts[shiftType] || { start: 570, end: 1080 };
    return {
      name: name,
      employment: employment,
      shiftType: shiftType,
      shiftStartMin: s.start,
      shiftEndMin: s.end
    };
  }

  // --- isSocial_ ---
  testGroup_('BreakService.isSocial_', function () {
    assertEqual_('isSocial_ 社員', BreakService.isSocial_('社員'), true);
    assertEqual_('isSocial_ 契約社員', BreakService.isSocial_('契約社員'), true);
    assertEqual_('isSocial_ パート', BreakService.isSocial_('パート'), true);
    assertEqual_('isSocial_ アルバイト', BreakService.isSocial_('アルバイト'), false);
    assertEqual_('isSocial_ empty', BreakService.isSocial_(''), false);
  });

  // --- assignBreaks: 基本 ---
  testGroup_('BreakService.assignBreaks 基本', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', 'アルバイト', '午前'),
      makeStaff_('鈴木', '社員', '午後'),
      makeStaff_('佐藤', 'アルバイト', '午後')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    assertEqual_('基本: 4件', breaks.length, 4);
    assertEqual_('基本: AM前半 breakAtMin', breaks[0].breakAtMin, 840);
    assertEqual_('基本: AM後半 breakAtMin', breaks[1].breakAtMin, 900);
    assertEqual_('基本: PM前半 breakAtMin', breaks[2].breakAtMin, 990);
    assertEqual_('基本: PM後半 breakAtMin', breaks[3].breakAtMin, 1050);

    // 社員1名+アルバイト1名 → 各系floor(1/2)=0名前半, 1名後半
    // 田中(社員)→後半, 山田(アルバイト)→後半
    assertEqual_('基本: AM前半 names length', breaks[0].names.length, 0);
    assertEqual_('基本: AM後半 names length', breaks[1].names.length, 2);

    // PM同様
    assertEqual_('基本: PM前半 names length', breaks[2].names.length, 0);
    assertEqual_('基本: PM後半 names length', breaks[3].names.length, 2);
  });

  // --- assignBreaks: 社員均等 ---
  testGroup_('BreakService.assignBreaks 社員均等', function () {
    var staff = [
      makeStaff_('A田中', '社員', '午前'),
      makeStaff_('B鈴木', '社員', '午前'),
      makeStaff_('C佐藤', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 社員3名 → floor(3/2)=1名前半, 2名後半
    assertEqual_('社員均等: AM前半 count', breaks[0].names.length, 1);
    assertEqual_('社員均等: AM後半 count', breaks[1].names.length, 2);
  });

  // --- assignBreaks: アルバイト均等 ---
  testGroup_('BreakService.assignBreaks アルバイト均等', function () {
    var staff = [
      makeStaff_('Aアルバ', 'アルバイト', '午前'),
      makeStaff_('Bアルバ', 'アルバイト', '午前'),
      makeStaff_('Cアルバ', 'アルバイト', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // アルバイト3名 → floor(3/2)=1名前半, 2名後半
    assertEqual_('アルバイト均等: AM前半 count', breaks[0].names.length, 1);
    assertEqual_('アルバイト均等: AM後半 count', breaks[1].names.length, 2);
  });

  // --- assignBreaks: 混合 ---
  testGroup_('BreakService.assignBreaks 混合', function () {
    var staff = [
      makeStaff_('A社員1', '社員', '午前'),
      makeStaff_('B社員2', '社員', '午前'),
      makeStaff_('Cバイト1', 'アルバイト', '午前'),
      makeStaff_('Dバイト2', 'アルバイト', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 社員2名 → floor(2/2)=1前半, 1後半
    // アルバイト2名 → floor(2/2)=1前半, 1後半
    // 合計: 前半2名, 後半2名
    assertEqual_('混合: AM前半 count', breaks[0].names.length, 2);
    assertEqual_('混合: AM後半 count', breaks[1].names.length, 2);
  });

  // --- assignBreaks: 早朝除外 ---
  testGroup_('BreakService.assignBreaks 早朝除外', function () {
    var staff = [
      makeStaff_('田中', '社員', '早朝'),
      makeStaff_('山田', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 田中(早朝)は対象外 → AM午前に山田のみ
    var allNames = breaks[0].names.concat(breaks[1].names);
    assertTrue_('早朝除外: 田中が含まれない', allNames.indexOf('田中') === -1);
    assertTrue_('早朝除外: 山田が含まれる', allNames.indexOf('山田') !== -1);
  });

  // --- assignBreaks: 時差除外 ---
  testGroup_('BreakService.assignBreaks 時差除外', function () {
    var staff = [
      makeStaff_('田中', '社員', '時差'),
      makeStaff_('山田', '社員', '午後')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 田中(時差)は対象外
    var allNames = [];
    for (var i = 0; i < breaks.length; i++) {
      allNames = allNames.concat(breaks[i].names);
    }
    assertTrue_('時差除外: 田中が含まれない', allNames.indexOf('田中') === -1);
    assertTrue_('時差除外: 山田が含まれる', allNames.indexOf('山田') !== -1);
  });

  // --- assignBreaks: 終日除外 ---
  testGroup_('BreakService.assignBreaks 終日除外', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);

    var breaks = BreakService.assignBreaks(staff, config, excl);

    var allNames = breaks[0].names.concat(breaks[1].names);
    assertTrue_('終日除外: 田中が含まれない', allNames.indexOf('田中') === -1);
    assertTrue_('終日除外: 山田が含まれる', allNames.indexOf('山田') !== -1);
  });

  // --- assignBreaks: 大会除外 ---
  testGroup_('BreakService.assignBreaks 大会除外', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();
    // 田中がAM前半(840)もAM後半(900)も大会中
    ExclusionService.addTournament(excl, '田中', 800, 960);

    var breaks = BreakService.assignBreaks(staff, config, excl);

    var allNames = breaks[0].names.concat(breaks[1].names);
    assertTrue_('大会除外: 田中が含まれない', allNames.indexOf('田中') === -1);
    assertTrue_('大会除外: 山田が含まれる', allNames.indexOf('山田') !== -1);
  });

  // --- assignBreaks: 大会片方のみ ---
  testGroup_('BreakService.assignBreaks 大会片方のみ', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();
    // 田中がAM前半(840)のみ大会中（AM後半(900)は可能）
    ExclusionService.addTournament(excl, '田中', 800, 870);

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 田中はfirstOnly不可 → secondOnlyに分類
    assertTrue_('大会片方: 田中がAM前半に含まれない', breaks[0].names.indexOf('田中') === -1);
    assertTrue_('大会片方: 田中がAM後半に含まれる', breaks[1].names.indexOf('田中') !== -1);
  });

  // --- assignBreaks: 空リスト ---
  testGroup_('BreakService.assignBreaks 空リスト', function () {
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks([], config, excl);

    assertEqual_('空リスト: 4件', breaks.length, 4);
    assertEqual_('空リスト: AM前半 empty', breaks[0].names.length, 0);
    assertEqual_('空リスト: AM後半 empty', breaks[1].names.length, 0);
    assertEqual_('空リスト: PM前半 empty', breaks[2].names.length, 0);
    assertEqual_('空リスト: PM後半 empty', breaks[3].names.length, 0);
  });

  // --- assignBreaks: 名前順ソート ---
  testGroup_('BreakService.assignBreaks 名前順ソート', function () {
    var staff = [
      makeStaff_('D田中', '社員', '午前'),
      makeStaff_('A鈴木', '社員', '午前'),
      makeStaff_('C佐藤', '社員', '午前'),
      makeStaff_('B山田', '社員', '午前')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 社員4名 → floor(4/2)=2名前半, 2名後半（名前順ソート）
    assertDeepEqual_('ソート: AM前半', breaks[0].names, ['A鈴木', 'B山田']);
    assertDeepEqual_('ソート: AM後半', breaks[1].names, ['C佐藤', 'D田中']);
  });

  // --- isOnBreak ---
  testGroup_('BreakService.isOnBreak', function () {
    var breaks = [
      { breakAtMin: 840, names: ['田中'] },
      { breakAtMin: 900, names: ['山田'] }
    ];
    var duration = 60;

    // 休憩中（開始ちょうど）
    assertEqual_('isOnBreak: 田中 at 840', BreakService.isOnBreak(breaks, '田中', 840, duration), true);

    // 休憩中（中間）
    assertEqual_('isOnBreak: 田中 at 860', BreakService.isOnBreak(breaks, '田中', 860, duration), true);

    // 休憩中（終了-1）
    assertEqual_('isOnBreak: 田中 at 899', BreakService.isOnBreak(breaks, '田中', 899, duration), true);

    // 休憩外（終了ちょうど、半開区間）
    assertEqual_('isOnBreak: 田中 at 900', BreakService.isOnBreak(breaks, '田中', 900, duration), false);

    // 休憩外（開始前）
    assertEqual_('isOnBreak: 田中 at 839', BreakService.isOnBreak(breaks, '田中', 839, duration), false);

    // 該当なし（名前不一致）
    assertEqual_('isOnBreak: 佐藤 not found', BreakService.isOnBreak(breaks, '佐藤', 840, duration), false);

    // 山田は900開始
    assertEqual_('isOnBreak: 山田 at 900', BreakService.isOnBreak(breaks, '山田', 900, duration), true);
    assertEqual_('isOnBreak: 山田 at 959', BreakService.isOnBreak(breaks, '山田', 959, duration), true);
    assertEqual_('isOnBreak: 山田 at 960', BreakService.isOnBreak(breaks, '山田', 960, duration), false);
  });

  // --- filterEligible_ ---
  testGroup_('BreakService.filterEligible_', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', '社員', '午後'),
      makeStaff_('鈴木', '社員', '早朝'),
      makeStaff_('佐藤', '社員', '時差'),
      makeStaff_('高橋', '社員', '午前')
    ];
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['高橋']);

    var amResult = BreakService.filterEligible_(staff, '午前', excl);
    assertEqual_('filterEligible_ 午前 count', amResult.length, 1);
    assertEqual_('filterEligible_ 午前 name', amResult[0].name, '田中');

    var pmResult = BreakService.filterEligible_(staff, '午後', excl);
    assertEqual_('filterEligible_ 午後 count', pmResult.length, 1);
    assertEqual_('filterEligible_ 午後 name', pmResult[0].name, '山田');
  });

  // --- splitGroup_ 直接テスト ---
  testGroup_('BreakService.splitGroup_', function () {
    var staff = [
      makeStaff_('A社員', '社員', '午前'),
      makeStaff_('Bバイト', 'アルバイト', '午前'),
      makeStaff_('C社員', '社員', '午前'),
      makeStaff_('Dバイト', 'アルバイト', '午前')
    ];
    var excl = ExclusionService.createEmpty();

    var result = BreakService.splitGroup_(staff, excl, 840, 900);

    // 社員2名: floor(2/2)=1前半, 1後半
    // アルバイト2名: floor(2/2)=1前半, 1後半
    assertEqual_('splitGroup_ first count', result.first.length, 2);
    assertEqual_('splitGroup_ second count', result.second.length, 2);
  });

  // --- 検証例 (plan文書の検証方法) ---
  testGroup_('BreakService 検証例', function () {
    var staff = [
      makeStaff_('田中', '社員', '午前'),
      makeStaff_('山田', 'アルバイト', '午前'),
      makeStaff_('鈴木', '社員', '午後'),
      makeStaff_('佐藤', 'アルバイト', '午後'),
      makeStaff_('高橋', '社員', '早朝')
    ];
    var config = makeConfig_();
    var excl = ExclusionService.createEmpty();

    var breaks = BreakService.assignBreaks(staff, config, excl);

    // 高橋(早朝)は割当なし
    var allNames = [];
    for (var i = 0; i < breaks.length; i++) {
      allNames = allNames.concat(breaks[i].names);
    }
    assertTrue_('検証例: 高橋が含まれない', allNames.indexOf('高橋') === -1);

    // AM: 社員1名(田中)+アルバイト1名(山田) → 各floor(1/2)=0前半, 1後半
    assertEqual_('検証例: AM前半 empty', breaks[0].names.length, 0);
    assertTrue_('検証例: AM後半に田中', breaks[1].names.indexOf('田中') !== -1);
    assertTrue_('検証例: AM後半に山田', breaks[1].names.indexOf('山田') !== -1);

    // PM: 社員1名(鈴木)+アルバイト1名(佐藤) → 各floor(1/2)=0前半, 1後半
    assertEqual_('検証例: PM前半 empty', breaks[2].names.length, 0);
    assertTrue_('検証例: PM後半に鈴木', breaks[3].names.indexOf('鈴木') !== -1);
    assertTrue_('検証例: PM後半に佐藤', breaks[3].names.indexOf('佐藤') !== -1);

    // isOnBreak テスト
    assertEqual_('検証例: 田中 at 840', BreakService.isOnBreak(breaks, '田中', 840, 60), false);
    // 田中はAM後半(900)に入っている
    assertEqual_('検証例: 田中 at 900', BreakService.isOnBreak(breaks, '田中', 900, 60), true);
    assertEqual_('検証例: 田中 at 959', BreakService.isOnBreak(breaks, '田中', 959, 60), true);
    assertEqual_('検証例: 田中 at 960', BreakService.isOnBreak(breaks, '田中', 960, 60), false);
  });
}

/* ---------- PlacementEngine 純粋テスト ---------- */

function testPlacementEnginePure_() {

  // ヘルパー: テスト用スタッフ生成
  function mkStaff_(name, startMin, endMin) {
    return {
      name: name,
      employment: '社員',
      shiftType: '午前',
      shiftStartMin: startMin || 570,
      shiftEndMin: endMin || 1080
    };
  }

  // ヘルパー: テスト用プリセット生成
  function mkPreset_(postName, opts) {
    opts = opts || {};
    return {
      postName: postName,
      enabled: opts.enabled !== undefined ? opts.enabled : true,
      requiredLv: opts.requiredLv || 1,
      order: opts.order || 1,
      sortDir: opts.sortDir || 'ASC',
      concurrentPost: opts.concurrentPost || null,
      activeWindows: opts.activeWindows || []
    };
  }

  // ヘルパー: テスト用スロット生成
  function mkSlot_(slotId, rowNumber, startMin, endMin) {
    return {
      slotId: slotId,
      rowNumber: rowNumber,
      startMin: startMin,
      endMin: endMin
    };
  }

  // ヘルパー: 空除外情報
  function emptyExcl_() {
    return ExclusionService.createEmpty();
  }

  // ヘルパー: deterministic random (常に0を返す→先頭選択)
  function rng0_() { return 0; }

  // --- isWithinActiveWindow_ テスト ---

  // #1: 空配列 → true（終日有効）
  testGroup_('PE: isWithinActiveWindow_ 空配列', function () {
    var preset = mkPreset_('P1', { activeWindows: [] });
    assertEqual_('空配列→true', PlacementEngine.isWithinActiveWindow_(preset, 600), true);
  });

  // #2: 範囲内 → true
  testGroup_('PE: isWithinActiveWindow_ 範囲内', function () {
    var preset = mkPreset_('P1', { activeWindows: [{ startMin: 600, endMin: 720 }] });
    assertEqual_('660→true', PlacementEngine.isWithinActiveWindow_(preset, 660), true);
  });

  // #3: 範囲外 → false
  testGroup_('PE: isWithinActiveWindow_ 範囲外', function () {
    var preset = mkPreset_('P1', { activeWindows: [{ startMin: 600, endMin: 720 }] });
    assertEqual_('800→false', PlacementEngine.isWithinActiveWindow_(preset, 800), false);
  });

  // #4: 開始ちょうど → true（半開区間）
  testGroup_('PE: isWithinActiveWindow_ 開始ちょうど', function () {
    var preset = mkPreset_('P1', { activeWindows: [{ startMin: 600, endMin: 720 }] });
    assertEqual_('600→true', PlacementEngine.isWithinActiveWindow_(preset, 600), true);
  });

  // #5: 終了ちょうど → false（半開区間）
  testGroup_('PE: isWithinActiveWindow_ 終了ちょうど', function () {
    var preset = mkPreset_('P1', { activeWindows: [{ startMin: 600, endMin: 720 }] });
    assertEqual_('720→false', PlacementEngine.isWithinActiveWindow_(preset, 720), false);
  });

  // #6: 複数窓 → 2番目の窓内→true
  testGroup_('PE: isWithinActiveWindow_ 複数窓', function () {
    var preset = mkPreset_('P1', {
      activeWindows: [
        { startMin: 600, endMin: 720 },
        { startMin: 840, endMin: 960 }
      ]
    });
    assertEqual_('900→true(2nd window)', PlacementEngine.isWithinActiveWindow_(preset, 900), true);
    assertEqual_('780→false(gap)', PlacementEngine.isWithinActiveWindow_(preset, 780), false);
  });

  // --- buildBreakExcludedRows テスト ---

  // #7: 基本
  testGroup_('PE: buildBreakExcludedRows 基本', function () {
    var ba = [{ breakAtMin: 840, names: ['田中'] }];
    var timeRows = [
      { rowNumber: 10, timeMin: 780 },
      { rowNumber: 11, timeMin: 840 },
      { rowNumber: 12, timeMin: 900 }
    ];
    var exclMap = { 11: [9, 12] };

    var result = PlacementEngine.buildBreakExcludedRows(ba, timeRows, exclMap);
    assertDeepEqual_('田中 excluded rows', result['田中'], [9, 12]);
  });

  // #8: breakAtMinが未マッチ → 空結果
  testGroup_('PE: buildBreakExcludedRows 未マッチ', function () {
    var ba = [{ breakAtMin: 999, names: ['田中'] }];
    var timeRows = [{ rowNumber: 11, timeMin: 840 }];
    var exclMap = { 11: [9, 12] };

    var result = PlacementEngine.buildBreakExcludedRows(ba, timeRows, exclMap);
    assertEqual_('田中 undefined', result['田中'], undefined);
  });

  // #9: 複数休憩
  testGroup_('PE: buildBreakExcludedRows 複数休憩', function () {
    var ba = [
      { breakAtMin: 840, names: ['田中'] },
      { breakAtMin: 900, names: ['山田'] }
    ];
    var timeRows = [
      { rowNumber: 11, timeMin: 840 },
      { rowNumber: 12, timeMin: 900 }
    ];
    var exclMap = { 11: [9, 12], 12: [10, 13] };

    var result = PlacementEngine.buildBreakExcludedRows(ba, timeRows, exclMap);
    assertDeepEqual_('田中 rows', result['田中'], [9, 12]);
    assertDeepEqual_('山田 rows', result['山田'], [10, 13]);
  });

  // --- generate テスト ---

  // #10: H1 出勤時間外 → 配置されない
  testGroup_('PE: generate H1 出勤時間外', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中', 700, 1080)]; // シフト700開始 > slot 600
    var skills = { '田中': { 'P1': 3 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H1: 0件', result.length, 0);
  });

  // #11: H2 Lv0 → 配置されない
  testGroup_('PE: generate H2 Lv0', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 0 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H2: 0件', result.length, 0);
  });

  // #12: H3 requiredLv未満 → 配置されない
  testGroup_('PE: generate H3 requiredLv未満', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', { requiredLv: 3 })];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } }; // Lv2 < required 3

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H3: 0件', result.length, 0);
  });

  // #13: H4 前行同一禁止
  testGroup_('PE: generate H4 前行同一禁止', function () {
    var slots = [
      mkSlot_('s1', 3, 600, 690),
      mkSlot_('s2', 6, 690, 780)
    ];
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 2 }, '山田': { 'P1': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H4: 2件', result.length, 2);
    // slot1と slot2で同じ人が入らない
    assertTrue_('H4: 前後異なる', result[0].staffName !== result[1].staffName);
  });

  // #14: H5 多重配置禁止
  testGroup_('PE: generate H5 多重配置禁止', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [
      mkPreset_('P1', { order: 1 }),
      mkPreset_('P2', { order: 2 })
    ];
    var staff = [mkStaff_('田中')]; // 1名のみ
    var skills = { '田中': { 'P1': 2, 'P2': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    // P1に配置後、P2は候補0人
    assertEqual_('H5: 1件のみ', result.length, 1);
    assertEqual_('H5: P1に配置', result[0].postName, 'P1');
  });

  // #15: H6a 休憩中 → 配置されない
  testGroup_('PE: generate H6a 休憩中', function () {
    var slots = [mkSlot_('s1', 3, 840, 900)]; // 14:00のコマ
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };
    var breakAssignments = [{ breakAtMin: 840, names: ['田中'] }];

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: breakAssignments, breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H6a: 0件', result.length, 0);
  });

  // #16: H6b 休憩前後除外 → 配置されない
  testGroup_('PE: generate H6b 休憩前後除外', function () {
    var slots = [mkSlot_('s1', 9, 780, 840)]; // 行番号9のコマ
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };
    var breakExcludedRows = { '田中': [9] }; // 行9が除外

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: breakExcludedRows,
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H6b: 0件', result.length, 0);
  });

  // #17: H7 除外 → 配置されない
  testGroup_('PE: generate H7 除外', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };
    var excl = ExclusionService.createEmpty();
    excl.allDay = ExclusionService.buildAllDaySet(['田中']);

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: excl
    }, rng0_);

    assertEqual_('H7 allDay: 0件', result.length, 0);

    // tournament除外
    var excl2 = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl2, '田中', 550, 700);

    var result2 = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: excl2
    }, rng0_);

    assertEqual_('H7 tournament: 0件', result2.length, 0);
  });

  // #18: H8 候補なし → Placement出力なし
  testGroup_('PE: generate H8 候補なし', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', { requiredLv: 4 })];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } }; // Lv2 < required 4

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H8: 0件', result.length, 0);
  });

  // #19: H9 activeWindows外 → 持ち場スキップ
  testGroup_('PE: generate H9 activeWindows外', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', {
      activeWindows: [{ startMin: 720, endMin: 840 }] // 12:00-14:00 のみ
    })];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('H9: 0件', result.length, 0);
  });

  // #20: スキルソートASC → Lv低い人が優先
  testGroup_('PE: generate スキルソートASC', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', { sortDir: 'ASC', requiredLv: 1 })];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 3 }, '山田': { 'P1': 1 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('ASC: 山田(Lv1)が優先', result[0].staffName, '山田');
  });

  // #21: スキルソートDESC → Lv高い人が優先
  testGroup_('PE: generate スキルソートDESC', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', { sortDir: 'DESC', requiredLv: 1 })];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 3 }, '山田': { 'P1': 1 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('DESC: 田中(Lv3)が優先', result[0].staffName, '田中');
  });

  // #22: 偏り抑制 → 配置回数少ない人が優先
  testGroup_('PE: generate 偏り抑制', function () {
    // 3スロット×1持ち場×2人（同Lv）で検証
    var slots = [
      mkSlot_('s1', 3, 600, 690),
      mkSlot_('s2', 6, 690, 780),
      mkSlot_('s3', 9, 780, 870)
    ];
    var presets = [mkPreset_('P1')];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 2 }, '山田': { 'P1': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('偏り: 3件', result.length, 3);
    // H4で前コマ同一持ち場除外があるため、交互に配置される
    // slot1: 田中, slot2: 山田(H4で田中除外), slot3: 田中(H4で山田除外)
    assertEqual_('偏り: slot1', result[0].staffName, '田中');
    assertEqual_('偏り: slot2', result[1].staffName, '山田');
    assertEqual_('偏り: slot3', result[2].staffName, '田中');
  });

  // #23: carry基本 → concurrentPost→carry配置が生成される
  testGroup_('PE: generate carry基本', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [
      mkPreset_('P1', { order: 1, concurrentPost: 'P2' }),
      mkPreset_('P2', { order: 2 })
    ];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 2, 'P2': 2 }, '山田': { 'P1': 2, 'P2': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('carry基本: 2件', result.length, 2);

    var p1Result = null;
    var p2Result = null;
    for (var i = 0; i < result.length; i++) {
      if (result[i].postName === 'P1') p1Result = result[i];
      if (result[i].postName === 'P2') p2Result = result[i];
    }
    assertTrue_('carry基本: P1あり', p1Result !== null);
    assertTrue_('carry基本: P2あり', p2Result !== null);
    assertEqual_('carry基本: P1 source', p1Result.source, 'auto');
    assertEqual_('carry基本: P2 source', p2Result.source, 'carry');
    assertEqual_('carry基本: 同じ人', p1Result.staffName, p2Result.staffName);
  });

  // #24: carry上書き → carry先に既存配置→上書き
  testGroup_('PE: generate carry上書き', function () {
    // P2(order=1)が先、P1(order=2,concurrentPost=P2)が後
    // → P2に山田が先に入るが、P1に田中が入ってcarryでP2を上書き
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [
      mkPreset_('P2', { order: 1 }),
      mkPreset_('P1', { order: 2, concurrentPost: 'P2' })
    ];
    var staff = [mkStaff_('田中'), mkStaff_('山田')];
    var skills = { '田中': { 'P1': 2, 'P2': 2 }, '山田': { 'P1': 2, 'P2': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('carry上書き: 2件', result.length, 2);

    var p1Result = null;
    var p2Result = null;
    for (var i = 0; i < result.length; i++) {
      if (result[i].postName === 'P1') p1Result = result[i];
      if (result[i].postName === 'P2') p2Result = result[i];
    }
    assertTrue_('carry上書き: P2あり', p2Result !== null);
    assertEqual_('carry上書き: P2 source carry', p2Result.source, 'carry');
    assertEqual_('carry上書き: P1とP2同じ人', p1Result.staffName, p2Result.staffName);
  });

  // #25: 基本統合 — 2スロット×2持ち場×3スタッフの正常配置
  testGroup_('PE: generate 基本統合', function () {
    var slots = [
      mkSlot_('s1', 3, 600, 690),
      mkSlot_('s2', 6, 690, 780)
    ];
    var presets = [
      mkPreset_('P1', { order: 1 }),
      mkPreset_('P2', { order: 2 })
    ];
    var staff = [mkStaff_('田中'), mkStaff_('山田'), mkStaff_('鈴木')];
    var skills = {
      '田中': { 'P1': 2, 'P2': 2 },
      '山田': { 'P1': 2, 'P2': 2 },
      '鈴木': { 'P1': 2, 'P2': 2 }
    };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    // 2スロット×2持ち場 = 4件
    assertEqual_('統合: 4件', result.length, 4);

    // 全てsource=auto
    for (var i = 0; i < result.length; i++) {
      assertEqual_('統合: source auto #' + i, result[i].source, 'auto');
    }

    // 同じスロット内で同じ人が2回出ないことを確認（H5）
    var slot1Staff = result.filter(function (p) { return p.slotIndex === 0; })
                          .map(function (p) { return p.staffName; });
    assertTrue_('統合: slot1 H5', slot1Staff[0] !== slot1Staff[1]);

    var slot2Staff = result.filter(function (p) { return p.slotIndex === 1; })
                          .map(function (p) { return p.staffName; });
    assertTrue_('統合: slot2 H5', slot2Staff[0] !== slot2Staff[1]);
  });

  // #26: 空スタッフ → 全コマ空
  testGroup_('PE: generate 空スタッフ', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1')];

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: [], skills: {},
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('空スタッフ: 0件', result.length, 0);
  });

  // #27: 空プリセット → Placement出力なし
  testGroup_('PE: generate 空プリセット', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: [], staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('空プリセット: 0件', result.length, 0);
  });

  // #28: disabled持ち場 → スキップ
  testGroup_('PE: generate disabled持ち場', function () {
    var slots = [mkSlot_('s1', 3, 600, 690)];
    var presets = [mkPreset_('P1', { enabled: false })];
    var staff = [mkStaff_('田中')];
    var skills = { '田中': { 'P1': 2 } };

    var result = PlacementEngine.generate({
      slots: slots, presets: presets, staffList: staff, skills: skills,
      breakAssignments: [], breakDuration: 60, breakExcludedRows: {},
      exclusions: emptyExcl_()
    }, rng0_);

    assertEqual_('disabled: 0件', result.length, 0);
  });
}

/* ---------- TimelineService 純粋テスト ---------- */

function testTimelineServicePure_() {

  // ヘルパー: テスト用Staff生成
  function mkStaff_(name, startMin, endMin) {
    return {
      name: name,
      employment: '社員',
      shiftType: '午前',
      shiftStartMin: startMin,
      shiftEndMin: endMin
    };
  }

  // --- isWorking_ テスト ---

  // #1: 勤務開始ちょうど → true
  testGroup_('TL: isWorking_ 勤務開始ちょうど', function () {
    var staff = mkStaff_('田中', 570, 1080);
    assertEqual_('開始ちょうど→true', TimelineService.isWorking_(staff, 570), true);
  });

  // #2: 勤務終了-30 → true（境界）
  testGroup_('TL: isWorking_ 勤務終了-30', function () {
    var staff = mkStaff_('田中', 570, 1080);
    assertEqual_('終了-30→true', TimelineService.isWorking_(staff, 1050), true);
  });

  // #3: 勤務終了-29 → false
  testGroup_('TL: isWorking_ 勤務終了-29', function () {
    var staff = mkStaff_('田中', 570, 1080);
    assertEqual_('終了-29→false', TimelineService.isWorking_(staff, 1051), false);
  });

  // #4: 勤務時間前 → false
  testGroup_('TL: isWorking_ 勤務時間前', function () {
    var staff = mkStaff_('田中', 570, 1080);
    assertEqual_('開始前→false', TimelineService.isWorking_(staff, 569), false);
  });

  // --- buildPlacementLookup_ テスト ---

  // #5: 基本
  testGroup_('TL: buildPlacementLookup_ 基本', function () {
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' }
    ];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];

    var lookup = TimelineService.buildPlacementLookup_(placements, timeRows);
    assertDeepEqual_('基本逆引き', lookup[600]['田中'], ['レジ1']);
  });

  // #6: 同一時刻複数持ち場（carry）
  testGroup_('TL: buildPlacementLookup_ carry', function () {
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' },
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: '加工1', staffName: '田中', source: 'carry' }
    ];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];

    var lookup = TimelineService.buildPlacementLookup_(placements, timeRows);
    assertDeepEqual_('carry逆引き', lookup[600]['田中'], ['レジ1', '加工1']);
  });

  // --- buildMatrix テスト ---

  // ヘルパー: 空除外情報
  function emptyExcl_() {
    return ExclusionService.createEmpty();
  }

  // #7: 大会優先 → "大会"
  testGroup_('TL: buildMatrix 大会優先', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' }
    ];
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl, '田中', 550, 700);

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: placements,
      breakAssignments: [], breakDuration: 60,
      exclusions: excl, timeRows: timeRows
    });

    assertEqual_('大会優先', matrix[1][1], '大会');
  });

  // #8: 休憩優先 → "休憩"
  testGroup_('TL: buildMatrix 休憩優先', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 840, timeStr: '14:00' }];
    var placements = [
      { slotIndex: 0, timeMin: 840, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' }
    ];
    var breakAssignments = [{ breakAtMin: 840, names: ['田中'] }];

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: placements,
      breakAssignments: breakAssignments, breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertEqual_('休憩優先', matrix[1][1], '休憩');
  });

  // #9: 配置あり → 持ち場名
  testGroup_('TL: buildMatrix 配置あり', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' }
    ];

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: placements,
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertEqual_('配置あり', matrix[1][1], 'レジ1');
  });

  // #10: 配置複数（carry）→ "/" 区切り
  testGroup_('TL: buildMatrix 配置複数carry', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' },
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: '加工1', staffName: '田中', source: 'carry' }
    ];

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: placements,
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertEqual_('carry "/" 区切り', matrix[1][1], 'レジ1/加工1');
  });

  // #11: 浮き → 勤務中&配置なし
  testGroup_('TL: buildMatrix 浮き', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: [],
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertEqual_('浮き', matrix[1][1], '浮き');
  });

  // #12: 勤務外 → 空欄
  testGroup_('TL: buildMatrix 勤務外', function () {
    var staff = [mkStaff_('田中', 780, 1320)]; // 13:00開始
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }]; // 10:00

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: [],
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertEqual_('勤務外→空欄', matrix[1][1], '');
  });

  // #13: 優先順位（大会 > 休憩 > 配置 > 浮き）
  testGroup_('TL: buildMatrix 優先順位', function () {
    var staff = [mkStaff_('田中', 570, 1080)];
    var timeRows = [{ rowNumber: 3, timeMin: 840, timeStr: '14:00' }];
    var placements = [
      { slotIndex: 0, timeMin: 840, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' }
    ];
    var breakAssignments = [{ breakAtMin: 840, names: ['田中'] }];
    var excl = ExclusionService.createEmpty();
    ExclusionService.addTournament(excl, '田中', 800, 900);

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: placements,
      breakAssignments: breakAssignments, breakDuration: 60,
      exclusions: excl, timeRows: timeRows
    });

    // 大会 > 休憩 > 配置 → "大会" が勝つ
    assertEqual_('優先順位: 大会が勝つ', matrix[1][1], '大会');
  });

  // #14: ヘッダー行
  testGroup_('TL: buildMatrix ヘッダー行', function () {
    var staff = [mkStaff_('田中', 570, 1080), mkStaff_('山田', 780, 1320)];
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];

    var matrix = TimelineService.buildMatrix({
      staffList: staff, placements: [],
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertDeepEqual_('ヘッダー行', matrix[0], ['時間', '田中', '山田']);
  });

  // #15: 空スタッフ → ヘッダー1列のみ
  testGroup_('TL: buildMatrix 空スタッフ', function () {
    var timeRows = [{ rowNumber: 3, timeMin: 600, timeStr: '10:00' }];

    var matrix = TimelineService.buildMatrix({
      staffList: [], placements: [],
      breakAssignments: [], breakDuration: 60,
      exclusions: emptyExcl_(), timeRows: timeRows
    });

    assertDeepEqual_('空スタッフ ヘッダー', matrix[0], ['時間']);
    assertDeepEqual_('空スタッフ データ行', matrix[1], ['10:00']);
  });

  // #16: 基本統合 — 2人×3行の完全マトリクス（plan検証例）
  testGroup_('TL: buildMatrix 基本統合', function () {
    var staffList = [
      mkStaff_('田中', 570, 1080),
      mkStaff_('山田', 780, 1320)
    ];
    var timeRows = [
      { rowNumber: 3, timeMin: 600, timeStr: '10:00' },
      { rowNumber: 6, timeMin: 690, timeStr: '11:30' },
      { rowNumber: 9, timeMin: 780, timeStr: '13:00' }
    ];
    var placements = [
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: 'レジ1', staffName: '田中', source: 'auto' },
      { slotIndex: 0, timeMin: 600, rowNumber: 3, postName: '加工1', staffName: '田中', source: 'carry' }
    ];
    var breakAssignments = [{ breakAtMin: 780, names: ['田中'] }];
    var exclusions = ExclusionService.createEmpty();

    var matrix = TimelineService.buildMatrix({
      staffList: staffList, placements: placements,
      breakAssignments: breakAssignments, breakDuration: 60,
      exclusions: exclusions, timeRows: timeRows
    });

    // ヘッダー
    assertDeepEqual_('統合: ヘッダー', matrix[0], ['時間', '田中', '山田']);

    // 10:00 — 田中:配置2持ち場, 山田:勤務外(780開始)
    assertEqual_('統合: 10:00 田中', matrix[1][1], 'レジ1/加工1');
    assertEqual_('統合: 10:00 山田', matrix[1][2], '');

    // 11:30 — 田中:勤務中&配置なし, 山田:勤務外
    assertEqual_('統合: 11:30 田中', matrix[2][1], '浮き');
    assertEqual_('統合: 11:30 山田', matrix[2][2], '');

    // 13:00 — 田中:休憩, 山田:勤務中&配置なし
    assertEqual_('統合: 13:00 田中', matrix[3][1], '休憩');
    assertEqual_('統合: 13:00 山田', matrix[3][2], '浮き');
  });
}
