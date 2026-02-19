/**
 * 00_DataModels.js — JSDoc型定義（全モジュール共通）
 *
 * 実行コードなし。エディタ補完・ドキュメント用の型定義のみ。
 */

/**
 * 時間帯（分表現）
 * @typedef {Object} TimeWindow
 * @property {number} startMin - 開始（分）
 * @property {number} endMin   - 終了（分）
 */

/**
 * コマ定義
 * @typedef {Object} TimeSlot
 * @property {string} slotId    - コマID（例: "slot_1"）
 * @property {number} rowNumber - テンプレート上の行番号
 * @property {number} startMin  - 開始時刻（分）
 * @property {number} endMin    - 終了時刻（分）
 */

/**
 * 休憩時刻
 * @typedef {Object} BreakTimes
 * @property {number} amFirst  - AM前半（分）
 * @property {number} amSecond - AM後半（分）
 * @property {number} pmFirst  - PM前半（分）
 * @property {number} pmSecond - PM後半（分）
 */

/**
 * シフト時間定義
 * @typedef {Object} ShiftTimeDef
 * @property {number} start         - 勤務開始（分）
 * @property {number} end           - 勤務終了（分）
 * @property {number} pulldownStart - プルダウン開始（分）
 * @property {number} pulldownEnd   - プルダウン終了（分）
 */

/**
 * コンフィグ全体
 * @typedef {Object} Config
 * @property {TimeSlot[]}                     slots             - コマ定義（開始時刻昇順）
 * @property {BreakTimes}                     breakTimes        - 休憩時刻
 * @property {number}                         breakDuration     - 休憩時間（分）
 * @property {Object<number, number[]>}       breakExclusionMap - 休憩行→除外行マッピング
 * @property {Object<string, ShiftTimeDef>}   shiftTimes        - シフト名→時間定義
 */

/**
 * 持ち場プリセット
 * @typedef {Object} PostPreset
 * @property {string}       postName       - 持ち場名
 * @property {boolean}      enabled        - 有効フラグ
 * @property {number}       requiredLv     - 必要スキルレベル（1〜4）
 * @property {number}       order          - 決定順序（小さいほど優先）
 * @property {string}       sortDir        - ソート方向 "ASC" | "DESC"
 * @property {string|null}  concurrentPost - 掛け持ち先（null=なし）
 * @property {TimeWindow[]} activeWindows  - 有効時間帯（空配列=終日有効）
 */

/**
 * 出勤スタッフ
 * @typedef {Object} Staff
 * @property {string} name          - スタッフ名
 * @property {string} employment    - 雇用形態（SkillService結合後に設定）
 * @property {string} shiftType     - シフト種別（"早朝"|"午前"|"午後"|"時差"）
 * @property {number} shiftStartMin - シフト開始（分）
 * @property {number} shiftEndMin   - シフト終了（分）
 */

/**
 * テンプレ時間行
 * @typedef {Object} TimeRow
 * @property {number} rowNumber - 行番号（1始まり）
 * @property {number} timeMin   - 時刻（分）
 * @property {string} timeStr   - 時刻文字列 "H:MM"
 */

/**
 * 部署プロファイル
 * @typedef {Object} DepartmentProfile
 * @property {string}  name            - 部署名
 * @property {string}  extractSheet    - 抽出シート名
 * @property {string}  templateSheet   - テンプレートシート名
 * @property {string}  skillSheet      - スキルレベル表シート名
 * @property {string}  presetSheet     - プリセットシート名
 * @property {string}  configSheet     - コンフィグシート名
 * @property {boolean} enableWaves     - 陣スケジュール有効
 * @property {string}  dateSheetSuffix - 日付シートサフィックス
 */

/**
 * 除外情報（終日・時間帯・大会）
 * @typedef {Object} Exclusions
 * @property {Object<string, boolean>} allDay       - 終日除外セット（名前→true）
 * @property {Array<{name: string, startMin: number, endMin: number}>} timeRanges  - 時間帯除外
 * @property {Array<{name: string, startMin: number, endMin: number}>} tournaments - 大会除外
 */

/**
 * 除外判定結果
 * @typedef {Object} ExclusionResult
 * @property {boolean} excluded - 除外されているか
 * @property {string}  reason   - 除外理由（"allDay"|"timeRange"|"tournament"|""）
 */

/**
 * 休憩割当エントリ
 * @typedef {Object} BreakAssignment
 * @property {number}   breakAtMin - 休憩開始時刻（分）
 * @property {string[]} names      - 休憩者名リスト
 */

/**
 * 配置結果エントリ
 * @typedef {Object} Placement
 * @property {number}          slotIndex - コマインデックス（0始まり）
 * @property {number}          timeMin   - 配置時刻（分）
 * @property {number}          rowNumber - テンプレート行番号
 * @property {string}          postName  - 持ち場名
 * @property {string}          staffName - スタッフ名
 * @property {"auto"|"carry"}  source    - 配置ソース
 */

/**
 * 陣テンプレート
 * @typedef {Object} WaveTemplate
 * @property {string}  templateName - テンプレート名
 * @property {Wave[]}  waves        - 陣一覧
 */

/**
 * 陣（ウェーブ）
 * @typedef {Object} Wave
 * @property {number}     waveNumber - 陣番号（1始まり）
 * @property {WaveTask[]} tasks      - 工程タスク一覧
 */

/**
 * 陣の工程タスク
 * @typedef {Object} WaveTask
 * @property {string}   process       - 工程名（ピック, 梱包, 振り分け等）
 * @property {number}   startMin      - 開始時刻（分）
 * @property {number}   endMin        - 終了時刻（分）
 * @property {string[]} assignedStaff - 担当者リスト（Level 1 では空配列）
 */
