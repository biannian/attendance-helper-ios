// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: user-tie;
/*
 * Copyright (c) iGroup China.
 * All rights reserved.
 */
// ==================================================
// AttendanceHelper
// Scriptable 今日打卡小组件 + 快捷指令提醒
// ==================================================
//
// 支持模式：
// widget     桌面小组件 / 手动预览
// leave      离开公司时检查工时是否满 9 小时、是否漏打下班卡
// schedule9  工作日根据上班时间预约“快满 9 小时”提醒
// near9      工作日下午定时检查是否快满 / 已满 9 小时
// debug      查看接口解析结果与考勤判定
//
// 快捷指令 / 小组件参数：
// widget / leave / schedule9 / near9 / debug
//
// Scriptable 脚本建议命名：
// AttendanceHelper
//
// ==================================================


// ==================== 配置区 ====================

/**
 * 打卡助手全局配置
 *
 * @author Kai
 * @date 2026/07/23 10:26
 * @description 接口、工时达标阈值、漏打下班卡判定与节假日相关配置
 */
const CONFIG = {
  // 正式打卡接口
  API_BASE: "https://api.hikiot.com/api-attendance/v1/statistics/v2/individual/single/daily",

  // 这里填你的 Bearer Token，不要带 Bearer 前缀
  TOKEN: "1be595b6-67b4-4270-934b-7760218e5232",

  // 这里填你的 deviceid
  DEVICE_ID: "050309CD-F3D6-4F9E-AE03-729615B05E8A-73263-00002858645B11BC",

  // 公司名称，用于通知文案
  COMPANY_NAME: "iGroup",

  // 点击小组件后运行的快捷指令名称
  SHORTCUT_NAME: "更新打卡小组件",

  // 满多少小时算达标
  TARGET_HOURS: 9,

  // 提前多少分钟提醒快满 9 小时
  NEAR_MINUTES: 5,

  // 小组件建议刷新间隔，iOS 不保证一定按时刷新
  WIDGET_REFRESH_MINUTES: 5,

  // 接口固定参数
  ID: "myStatic",

  // 中国节假日接口
  HOLIDAY_API_BASE: "https://timor.tech/api/holiday/info",

  // 节假日结果缓存小时数，避免每次都请求
  HOLIDAY_CACHE_HOURS: 12,

  // 节假日接口失败时是否退回到普通周一至周五判断
  HOLIDAY_FALLBACK_TO_WEEKDAY: true
}

/** 当前脚本执行时刻 */
const now = new Date()

/** 运行模式：widget / leave / schedule9 / near9 / debug */
const mode = String(
    args.widgetParameter ||
    args.shortcutParameter ||
    "widget"
).trim().toLowerCase()


// ==================== 主入口 ====================

if (config.runsInWidget) {
  const data = await getAttendanceSummary()
  const widget = await createWidget(data)
  Script.setWidget(widget)
  Script.complete()
} else {
  if (mode === "widget") {
    const data = await getAttendanceSummary()
    const widget = await createWidget(data)
    await widget.presentMedium()
  } else if (mode === "leave") {
    await handleLeaveCompany()
  } else if (mode === "schedule9") {
    await handleScheduleNineHours()
  } else if (mode === "near9") {
    await handleNearNineHours()
  } else if (mode === "debug") {
    await handleDebug()
  } else {
    await showMainMenu()
  }

  Script.complete()
}


// ==================== 手动运行菜单 ====================

/**
 * 展示手动运行菜单
 *
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function showMainMenu() {
  const alert = new Alert()
  alert.title = "打卡助手"
  alert.message = "请选择要执行的操作"
  alert.addAction("查看小组件预览")
  alert.addAction("查看 Debug 信息")
  alert.addAction("离开公司检查")
  alert.addAction("预约 9 小时提醒")
  alert.addAction("检查是否快满 9 小时")
  alert.addCancelAction("取消")

  const index = await alert.presentSheet()

  if (index === 0) {
    const data = await getAttendanceSummary()
    const widget = await createWidget(data)
    await widget.presentMedium()
  } else if (index === 1) {
    await handleDebug()
  } else if (index === 2) {
    await handleLeaveCompany()
  } else if (index === 3) {
    await handleScheduleNineHours()
  } else if (index === 4) {
    await handleNearNineHours()
  }
}


// ==================== 请求打卡接口 ====================

/**
 * 请求当日个人考勤统计接口
 *
 * @return {Promise<object>} 接口原始 JSON
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function fetchAttendance() {
  const date = formatDateKey(new Date())
  const url =
      `${CONFIG.API_BASE}?date=${encodeURIComponent(date)}&ID=${encodeURIComponent(CONFIG.ID)}`

  const req = new Request(url)
  req.method = "GET"
  req.timeoutInterval = 15

  req.headers = {
    "Authorization": `Bearer ${CONFIG.TOKEN}`,
    "UNI-Request-Source": "1",
    "terminal": "1",
    "appNo": "__UNI__89A1A02",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept": "*/*",
    "deviceid": CONFIG.DEVICE_ID,
    "versionCode": "1986",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app"
  }

  const json = await req.loadJSON()

  if (!json) {
    throw new Error("接口无返回")
  }

  if (
      json.code !== undefined &&
      json.code !== null &&
      Number(json.code) !== 0 &&
      Number(json.code) !== 200
  ) {
    throw new Error(json.message || json.msg || `接口异常：${json.code}`)
  }

  return json
}


// ==================== 获取打卡摘要 ====================

/**
 * 获取并标准化当日打卡摘要（含考勤判定）
 *
 * @return {Promise<object>} 打卡摘要数据
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function getAttendanceSummary() {
  try {
    const raw = await fetchAttendance()
    return normalizeAttendanceData(raw)
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.message ? e.message : e)
    }
  }
}


// ==================== 解析接口数据 ====================

/**
 * 将接口原始数据解析为统一打卡摘要，并附带考勤判定结果
 *
 * @param {object} raw 接口原始返回
 * @return {object} 标准化后的打卡摘要
 * @author Kai
 * @date 2026/07/23 10:26
 */
function normalizeAttendanceData(raw) {
  const payload = unwrapPayload(raw)
  const root = payload || raw || {}

  const personName = deepPick(root, [
    "personName",
    "userName",
    "employeeName",
    "name",
    "realName"
  ])

  const orgName = deepPick(root, [
    "orgName",
    "deptName",
    "departmentName",
    "organizationName"
  ])

  const shiftName = deepPick(root, [
    "shiftName",
    "className",
    "workShiftName"
  ])

  const dateStr = deepPick(root, [
    "date",
    "workDate",
    "attendanceDate",
    "recordDate",
    "day",
    "statisticsDate"
  ]) || formatDateKey(now)

  const clockInRaw = deepPick(root, [
    "clockInTime",
    "inTime",
    "onClockTime",
    "onTime",
    "startTime",
    "checkInTime",
    "signInTime"
  ])

  // 下班卡时间（接口返回的 clockOff / clockOut 等字段）
  const clockOutRaw = deepPick(root, [
    "clockOffTime",
    "clockOutTime",
    "outTime",
    "offTime",
    "latestOutTime",
    "lastOutTime",
    "checkOutTime",
    "signOutTime"
  ])

  const inStatusDesc = deepPick(root, [
    "inStatusDesc",
    "clockInStatusDesc",
    "onClockStatusDesc",
    "inStatus",
    "clockInStatusName",
    "signInStatusDesc"
  ]) || ""

  const outStatusDesc = deepPick(root, [
    "outStatusDesc",
    "clockOffStatusDesc",
    "clockOutStatusDesc",
    "offStatusDesc",
    "outStatus",
    "clockOutStatusName",
    "signOutStatusDesc"
  ]) || ""

  // 接口若直接返回工时字段，优先采用（毫秒 / 秒 / 分钟 / 小时）
  const apiWorkRaw = deepPick(root, [
    "workDuration",
    "workTime",
    "actualWorkTime",
    "actualWorkDuration",
    "workMinutes",
    "workHours",
    "attendanceDuration",
    "totalWorkTime"
  ])

  const inTime = parseAnyDateTime(clockInRaw, dateStr)
  const clockOutTime = parseAnyDateTime(clockOutRaw, dateStr)

  const hasClockIn = !!inTime
  const hasOutRecord = !!clockOutTime

  const targetMs = CONFIG.TARGET_HOURS * 60 * 60 * 1000

  /** 基于上下班卡的正式工时（毫秒）；无下班卡则为 null */
  let punchWorkMs = null
  /** 无下班卡时的实时估算工时，仅用于倒计时展示 */
  let liveWorkMs = 0
  let targetTime = null

  if (hasClockIn) {
    targetTime = new Date(inTime.getTime() + targetMs)
    liveWorkMs = Math.max(0, now.getTime() - inTime.getTime())

    if (hasOutRecord) {
      // 正式工时：下班卡 - 上班卡
      punchWorkMs = Math.max(0, clockOutTime.getTime() - inTime.getTime())

      // 若接口另有工时字段且能解析，优先用接口值
      const apiMs = parseDurationToMs(apiWorkRaw)
      if (apiMs != null && apiMs >= 0) {
        punchWorkMs = apiMs
      }
    }
  }

  // 展示用工时：有下班卡用打卡工时，否则用实时估算
  const currentWorkMs = punchWorkMs != null ? punchWorkMs : liveWorkMs
  // 兼容旧字段名
  const latestOutWorkMs = punchWorkMs != null ? punchWorkMs : 0
  const latestOutTime = clockOutTime

  // 实时是否已满（近满提醒 / 倒计时用）
  const liveTargetReached = hasClockIn && liveWorkMs >= targetMs
  // 考勤是否达标：必须以打卡工时为准
  const punchTargetReached = punchWorkMs != null && punchWorkMs >= targetMs
  const targetReached = punchTargetReached

  /**
   * 是否已下班且已打下班卡：
   * 此时「还差多少分钟」改按打卡工时算，不再跟当前时间走。
   * 条件：有下班卡，且（当前已过可下班时间，或下班卡时间已到/超过可下班时间）
   */
  const offWorkWithPunch = !!(
      hasOutRecord &&
      targetTime &&
      punchWorkMs != null &&
      (
          now.getTime() >= targetTime.getTime() ||
          clockOutTime.getTime() >= targetTime.getTime()
      )
  )

  // 还差多少分钟
  let remainingMinutes = 0
  /** 剩余分钟是否来自下班卡工时（否则来自当前时间） */
  let remainingFromPunch = false

  if (hasClockIn && targetTime) {
    if (offWorkWithPunch) {
      // 已下班且已打下班卡：按打卡工时差额
      remainingFromPunch = true
      if (punchWorkMs < targetMs) {
        remainingMinutes = Math.max(
            0,
            Math.ceil((targetMs - punchWorkMs) / 1000 / 60)
        )
      }
    } else if (now.getTime() < targetTime.getTime()) {
      // 尚未下班（或未打下班卡）：按当前时间倒计时
      remainingMinutes = Math.max(
          0,
          Math.ceil((targetTime.getTime() - now.getTime()) / 1000 / 60)
      )
    }
  }

  const countdownText = !hasClockIn
      ? "--"
      : remainingMinutes <= 0
          ? "已达标"
          : remainingFromPunch
              ? formatCountdown(targetMs - punchWorkMs)
              : formatCountdown(targetTime.getTime() - now.getTime())

  const summary = {
    ok: true,

    raw,

    personName,
    orgName,
    shiftName,
    date: dateStr,

    hasClockIn,
    hasOutRecord,
    offWorkWithPunch,

    inTime,
    clockOutTime,
    latestOutTime,

    inStatusDesc,
    outStatusDesc,

    punchWorkMs,
    liveWorkMs,
    currentWorkMs,
    latestOutWorkMs,

    targetTime,
    targetReached,
    punchTargetReached,
    liveTargetReached,
    remainingMinutes,
    remainingFromPunch,
    countdownText
  }

  // 基于打卡工时与下班卡给出考勤判定
  summary.judgment = judgeAttendance(summary)

  return summary
}


// ==================== 考勤判定（工时 + 下班卡） ====================

/**
 * 根据打卡工时与是否有下班卡判定考勤
 *
 * 判定规则（工时以接口上下班卡为准）：
 * 1. 未打上班卡 → 未打卡
 * 2. 无下班卡 → 漏打下班卡
 * 3. 有下班卡且打卡工时未满 TARGET_HOURS → 工时不足
 * 4. 有下班卡且打卡工时已满 → 考勤正常
 *
 * @param {object} data 标准化打卡摘要
 * @return {object} 考勤判定结果
 * @author Kai
 * @date 2026/07/23 10:42
 */
function judgeAttendance(data) {
  if (!data || !data.ok) {
    return {
      code: "ERROR",
      isNormal: false,
      missingClockOut: false,
      hoursOk: false,
      label: "判定失败",
      title: "检查失败",
      body: "无法获取考勤数据"
    }
  }

  if (!data.hasClockIn) {
    return {
      code: "NO_CLOCK_IN",
      isNormal: false,
      missingClockOut: false,
      hoursOk: false,
      label: "未打卡",
      title: "未打上班卡",
      body: "今天还没有上班记录"
    }
  }

  // 无下班卡：无法用打卡记录核算正式工时 → 漏打下班卡
  if (!data.hasOutRecord) {
    return {
      code: "MISSING_CLOCK_OUT",
      isNormal: false,
      missingClockOut: true,
      hoursOk: false,
      label: "漏打下班卡",
      title: "漏打下班卡",
      body: `上班 ${formatTime(data.inTime)}｜实时 ${formatShortDuration(data.liveWorkMs || 0)}`
    }
  }

  const punchMs = data.punchWorkMs != null ? data.punchWorkMs : data.currentWorkMs
  const brief =
      `上班 ${formatTime(data.inTime)}｜下班 ${formatTime(data.clockOutTime || data.latestOutTime)}｜工时 ${formatShortDuration(punchMs)}`

  // 有下班卡但工时不足（离开检查 / 下班后核算）
  if (!data.punchTargetReached) {
    return {
      code: "INSUFFICIENT_HOURS",
      isNormal: false,
      missingClockOut: false,
      hoursOk: false,
      label: "工时不足",
      title: `还差 ${data.remainingMinutes} 分钟`,
      body: brief
    }
  }

  // 有下班卡且工时已满
  return {
    code: "NORMAL",
    isNormal: true,
    missingClockOut: false,
    hoursOk: true,
    label: "考勤正常",
    title: "考勤正常",
    body: brief
  }
}


// ==================== 功能 1：离开公司检查 ====================

/**
 * 离开公司时检查：按工时判断考勤是否正常，并识别是否漏打下班卡
 *
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function handleLeaveCompany() {
  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("打卡检查失败", compactError(data.error))
    return
  }

  const judgment = data.judgment || judgeAttendance(data)
  await notify(judgment.title, judgment.body)
}


// ==================== 功能 2：预约快满 9 小时提醒 ====================

/**
 * 工作日预约“快满 9 小时”本地通知
 *
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function handleScheduleNineHours() {
  if (!(await isChinaWorkday(now))) {
    return
  }

  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("预约提醒失败", compactError(data.error))
    return
  }

  if (!data.hasClockIn) {
    await notify("未打上班卡", "无法预约提醒")
    return
  }

  // 实时已满或打卡工时已满：按考勤判定提醒（漏卡 / 正常等）
  if (data.liveTargetReached || data.punchTargetReached) {
    const judgment = data.judgment || judgeAttendance(data)
    if (judgment.missingClockOut || !judgment.isNormal) {
      await notify(judgment.title, judgment.body)
    }
    return
  }

  const remindTime = new Date(
      data.inTime.getTime() +
      (CONFIG.TARGET_HOURS * 60 - CONFIG.NEAR_MINUTES) * 60 * 1000
  )

  const key = "schedule9-" + formatDateKey(now)

  if (Keychain.contains(key)) {
    return
  }

  // 仅在尚未打下班卡时预约“快满”提醒
  if (data.hasOutRecord) {
    return
  }

  const liveRemain = Math.max(
      0,
      Math.ceil((data.targetTime.getTime() - now.getTime()) / 1000 / 60)
  )

  if (remindTime <= now) {
    await notify(
        `还差 ${liveRemain} 分钟`,
        `上班 ${formatTime(data.inTime)}｜可走 ${formatTime(data.targetTime)}`
    )
  } else {
    const n = new Notification()
    n.title = `还差 ${CONFIG.NEAR_MINUTES} 分钟满 ${CONFIG.TARGET_HOURS} 小时`
    n.body = twoLineBody(
        `上班 ${formatTime(data.inTime)}｜可走 ${formatTime(data.targetTime)}`
    )
    n.sound = "default"
    n.setTriggerDate(remindTime)
    await n.schedule()
  }

  Keychain.set(key, "1")
}


// ==================== 功能 3：定时检查是否快满 9 小时 ====================

/**
 * 定时检查是否快满 / 已满 9 小时，并在已满时判定是否漏打下班卡
 *
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function handleNearNineHours() {
  if (!(await isChinaWorkday(now))) {
    return
  }

  const data = await getAttendanceSummary()

  if (!data.ok) {
    return
  }

  if (!data.hasClockIn) {
    return
  }

  // 实时已满或打卡工时已核算：推送考勤判定
  if (data.liveTargetReached || data.punchTargetReached) {
    const judgment = data.judgment || judgeAttendance(data)
    const keyPrefix = judgment.missingClockOut
        ? "missingOut-"
        : judgment.isNormal
            ? "normal-"
            : "hoursShort-"
    const key = keyPrefix + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notify(judgment.title, judgment.body)
      Keychain.set(key, "1")
    }

    return
  }

  // 尚无下班卡且快满 9 小时：实时倒计时提醒
  if (data.hasOutRecord) {
    return
  }

  const liveRemain = Math.max(
      0,
      Math.ceil((data.targetTime.getTime() - now.getTime()) / 1000 / 60)
  )

  if (
      liveRemain <= CONFIG.NEAR_MINUTES &&
      liveRemain > 0
  ) {
    const key = "near9-" + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notify(
          `还差 ${liveRemain} 分钟`,
          `上班 ${formatTime(data.inTime)}｜可走 ${formatTime(data.targetTime)}`
      )

      Keychain.set(key, "1")
    }
  }
}


// ==================== 功能 4：桌面小组件 ====================

/**
 * 创建桌面小组件
 *
 * @param {object} data 打卡摘要
 * @return {Promise<ListWidget>} 小组件实例
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function createWidget(data) {
  const family = config.widgetFamily || "medium"

  const widget = new ListWidget()
  widget.backgroundColor = new Color("#111827")

  if (family === "small") {
    widget.setPadding(10, 10, 10, 10)
    await renderSmallWidget(widget, data)
  } else if (family === "large") {
    widget.setPadding(14, 14, 14, 14)
    await renderLargeWidget(widget, data)
  } else {
    widget.setPadding(10, 10, 10, 10)
    await renderMediumWidget(widget, data)
  }

  widget.url = getWidgetUrl()
  widget.refreshAfterDate = getNextWidgetRefreshDate()

  return widget
}


// ==================== 小号组件 ====================

/**
 * 渲染小号小组件
 *
 * @param {ListWidget} widget 小组件
 * @param {object} data 打卡摘要
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function renderSmallWidget(widget, data) {
  addCompactHeader(widget, "打卡")

  widget.addSpacer(7)

  if (!data.ok) {
    const t = widget.addText("加载失败")
    t.font = Font.boldSystemFont(15)
    t.textColor = new Color("#FCA5A5")
    t.lineLimit = 1

    widget.addSpacer(4)

    const e = widget.addText(data.error || "接口异常")
    e.font = Font.systemFont(10)
    e.textColor = new Color("#9CA3AF")
    e.lineLimit = 3
    e.minimumScaleFactor = 0.7

    return
  }

  const meta = getStatusMeta(data)

  const status = widget.addText(meta.shortText)
  status.font = Font.boldSystemFont(18)
  status.textColor = new Color(meta.color)
  status.lineLimit = 1
  status.minimumScaleFactor = 0.65

  widget.addSpacer(4)

  const sub = widget.addText(meta.subText)
  sub.font = Font.systemFont(11)
  sub.textColor = new Color("#D1D5DB")
  sub.lineLimit = 1
  sub.minimumScaleFactor = 0.65

  widget.addSpacer(7)

  addMiniLine(
      widget,
      "上",
      data.hasClockIn ? formatTime(data.inTime) : "--"
  )

  addMiniLine(
      widget,
      "满",
      data.hasClockIn ? formatTime(data.targetTime) : "--"
  )

  widget.addSpacer()

  const footer = widget.addText(formatTime(now))
  footer.font = Font.systemFont(9)
  footer.textColor = new Color("#6B7280")
  footer.lineLimit = 1
}


// ==================== 中号组件，推荐使用 ====================

/**
 * 渲染中号小组件
 *
 * @param {ListWidget} widget 小组件
 * @param {object} data 打卡摘要
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function renderMediumWidget(widget, data) {
  addCompactHeader(widget, "今日打卡")

  widget.addSpacer(6)

  if (!data.ok) {
    renderErrorBlock(widget, data)
    return
  }

  const meta = getStatusMeta(data)

  const card = widget.addStack()
  card.layoutVertically()
  card.backgroundColor = new Color("#1F2937")
  card.cornerRadius = 10
  card.setPadding(6, 8, 6, 8)

  const statusRow = card.addStack()
  statusRow.layoutHorizontally()
  statusRow.centerAlignContent()

  const status = statusRow.addText(meta.mainText)
  status.font = Font.boldSystemFont(16)
  status.textColor = new Color(meta.color)
  status.lineLimit = 1
  status.minimumScaleFactor = 0.65

  statusRow.addSpacer()

  const workText = statusRow.addText(
      data.hasClockIn ? formatShortDuration(data.currentWorkMs) : "--"
  )
  workText.font = Font.boldSystemFont(12)
  workText.textColor = Color.white()
  workText.lineLimit = 1
  workText.minimumScaleFactor = 0.7

  // 已过可下班时间且已打下班卡时不展示进度条
  if (shouldShowProgressBar(data)) {
    card.addSpacer(4)
    addProgressBar(card, data, getCardInnerWidth())
  }

  widget.addSpacer(6)

  const cellW = getPairCellWidth()
  const cellH = 34

  const grid = widget.addStack()
  grid.layoutVertically()

  const row1 = grid.addStack()
  row1.layoutHorizontally()

  addInfoCell(
      row1,
      "上班",
      data.hasClockIn ? formatTime(data.inTime) : "--",
      "#60A5FA",
      cellW,
      cellH
  )

  row1.addSpacer(8)

  addInfoCell(
      row1,
      "可下班",
      data.hasClockIn ? formatTime(data.targetTime) : "--",
      "#34D399",
      cellW,
      cellH
  )

  grid.addSpacer(4)

  const row2 = grid.addStack()
  row2.layoutHorizontally()

  addInfoCell(
      row2,
      "下班",
      data.hasOutRecord
          ? formatTime(data.clockOutTime || data.latestOutTime)
          : "暂无",
      data.hasOutRecord ? "#F87171" : "#9CA3AF",
      cellW,
      cellH
  )

  row2.addSpacer(8)

  addInfoCell(
      row2,
      "考勤",
      (data.judgment && data.judgment.label) || "--",
      meta.color,
      cellW,
      cellH
  )
}


// ==================== 大号组件 ====================

/**
 * 渲染大号小组件
 *
 * @param {ListWidget} widget 小组件
 * @param {object} data 打卡摘要
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function renderLargeWidget(widget, data) {
  addCompactHeader(widget, "今日打卡")

  widget.addSpacer(10)

  if (!data.ok) {
    renderErrorBlock(widget, data)
    return
  }

  const meta = getStatusMeta(data)

  const statusCard = widget.addStack()
  statusCard.layoutVertically()
  statusCard.backgroundColor = new Color("#1F2937")
  statusCard.cornerRadius = 14
  statusCard.setPadding(12, 12, 12, 12)

  const title = statusCard.addText(meta.mainText)
  title.font = Font.boldSystemFont(22)
  title.textColor = new Color(meta.color)
  title.lineLimit = 1
  title.minimumScaleFactor = 0.7

  statusCard.addSpacer(4)

  const sub = statusCard.addText(meta.subText)
  sub.font = Font.systemFont(12)
  sub.textColor = new Color("#D1D5DB")
  sub.lineLimit = 2
  sub.minimumScaleFactor = 0.75

  // 已过可下班时间且已打下班卡时不展示进度条
  if (shouldShowProgressBar(data)) {
    statusCard.addSpacer(8)
    addProgressBar(statusCard, data, getCardInnerWidth())
  }

  widget.addSpacer(12)

  addDetailRow(
      widget,
      "上班",
      data.hasClockIn
          ? `${formatTime(data.inTime)} ${data.inStatusDesc || ""}`.trim()
          : "未打卡"
  )

  addDetailRow(
      widget,
      "下班",
      data.hasOutRecord
          ? `${formatTime(data.clockOutTime || data.latestOutTime)} ${data.outStatusDesc || ""}`.trim()
          : "未打卡"
  )

  addDetailRow(
      widget,
      "打卡工时",
      data.punchWorkMs != null
          ? formatDuration(data.punchWorkMs)
          : data.hasClockIn
              ? `实时 ${formatDuration(data.liveWorkMs)}`
              : "--"
  )

  addDetailRow(
      widget,
      "可下班",
      data.hasClockIn ? formatTime(data.targetTime) : "--"
  )

  addDetailRow(
      widget,
      "考勤判定",
      (data.judgment && data.judgment.label) || "--"
  )

  widget.addSpacer()

  const footer = widget.addText("更新：" + formatTime(now))
  footer.font = Font.systemFont(10)
  footer.textColor = new Color("#6B7280")
}


// ==================== 小组件公共 UI ====================

/**
 * 添加紧凑标题栏
 *
 * @param {ListWidget} widget 小组件
 * @param {string} titleText 标题文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function addCompactHeader(widget, titleText) {
  const row = widget.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const title = row.addText(titleText)
  title.font = Font.boldSystemFont(13)
  title.textColor = Color.white()
  title.lineLimit = 1

  row.addSpacer()

  const time = row.addText(formatTime(now))
  time.font = Font.systemFont(10)
  time.textColor = new Color("#6B7280")
  time.lineLimit = 1
}

/**
 * 渲染接口错误区块
 *
 * @param {ListWidget} widget 小组件
 * @param {object} data 打卡摘要（含 error）
 * @author Kai
 * @date 2026/07/23 10:26
 */
function renderErrorBlock(widget, data) {
  const error = widget.addText("接口请求失败")
  error.font = Font.boldSystemFont(15)
  error.textColor = new Color("#FCA5A5")
  error.lineLimit = 1

  widget.addSpacer(5)

  const msg = widget.addText(data.error || "请检查 Token / 网络 / deviceid")
  msg.font = Font.systemFont(11)
  msg.textColor = new Color("#9CA3AF")
  msg.lineLimit = 4
  msg.minimumScaleFactor = 0.75
}

/**
 * 小号组件键值行
 *
 * @param {ListWidget} widget 小组件
 * @param {string} label 左侧标签
 * @param {string} value 右侧数值
 * @author Kai
 * @date 2026/07/23 10:26
 */
function addMiniLine(widget, label, value) {
  const row = widget.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const l = row.addText(label)
  l.font = Font.systemFont(10)
  l.textColor = new Color("#9CA3AF")
  l.lineLimit = 1

  row.addSpacer(5)

  const v = row.addText(value)
  v.font = Font.boldSystemFont(12)
  v.textColor = Color.white()
  v.lineLimit = 1
  v.minimumScaleFactor = 0.7

  widget.addSpacer(3)
}

/**
 * 估算小组件内容区可用宽度（扣除脚本内边距）
 *
 * @return {number} 内容区宽度
 * @author Kai
 * @date 2026/07/23 10:46
 */
function getWidgetContentWidth() {
  const screenW = Device.screenSize().width
  const family = config.widgetFamily || "medium"

  // 主屏左右外边距约 16；中号/大号接近屏幕可用宽度
  const widgetW = family === "small"
      ? Math.min(170, screenW / 2 - 20)
      : Math.min(screenW - 32, 380)

  // createWidget 内 setPadding 左右各 10
  return Math.max(240, widgetW - 20)
}

/**
 * 两列信息格均分宽度（中间间距 8）
 *
 * @return {number} 单格宽度
 * @author Kai
 * @date 2026/07/23 10:46
 */
function getPairCellWidth() {
  return Math.floor((getWidgetContentWidth() - 8) / 2)
}

/**
 * 状态卡片内进度条宽度（扣除卡片内边距）
 *
 * @return {number} 进度条宽度
 * @author Kai
 * @date 2026/07/23 10:46
 */
function getCardInnerWidth() {
  return Math.max(200, getWidgetContentWidth() - 16)
}

/**
 * 中号组件信息格子
 *
 * @param {WidgetStack} parent 父级 Stack
 * @param {string} label 标签
 * @param {string} value 数值
 * @param {string} color 数值颜色
 * @param {number} width 宽度
 * @param {number} height 高度
 * @author Kai
 * @date 2026/07/23 10:46
 */
function addInfoCell(parent, label, value, color, width, height) {
  const cell = parent.addStack()
  cell.layoutVertically()
  cell.backgroundColor = new Color("#1F2937")
  cell.cornerRadius = 8
  cell.setPadding(4, 8, 4, 8)
  cell.size = new Size(width || getPairCellWidth(), height || 34)

  const l = cell.addText(label)
  l.font = Font.systemFont(9)
  l.textColor = new Color("#9CA3AF")
  l.lineLimit = 1

  cell.addSpacer(1)

  const v = cell.addText(value)
  v.font = Font.boldSystemFont(12)
  v.textColor = new Color(color || "#FFFFFF")
  v.lineLimit = 1
  v.minimumScaleFactor = 0.65
}

/**
 * 大号组件详情行
 *
 * @param {ListWidget} widget 小组件
 * @param {string} label 标签
 * @param {string} value 数值
 * @author Kai
 * @date 2026/07/23 10:26
 */
function addDetailRow(widget, label, value) {
  const row = widget.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const l = row.addText(label)
  l.font = Font.systemFont(12)
  l.textColor = new Color("#9CA3AF")
  l.lineLimit = 1

  row.addSpacer()

  const v = row.addText(value)
  v.font = Font.boldSystemFont(13)
  v.textColor = Color.white()
  v.lineLimit = 1
  v.minimumScaleFactor = 0.75

  widget.addSpacer(7)
}

/**
 * 是否展示工时进度条
 *
 * 已打下班卡，且下班卡时间已达到/超过可下班时间时不再展示。
 *
 * @param {object} data 打卡摘要
 * @return {boolean} 是否展示
 * @author Kai
 * @date 2026/07/23 10:44
 */
function shouldShowProgressBar(data) {
  if (!data || !data.hasClockIn) {
    return true
  }

  if (!data.hasOutRecord || !data.targetTime) {
    return true
  }

  const outTime = data.clockOutTime || data.latestOutTime
  if (!outTime) {
    return true
  }

  // 下班卡时间已过可下班时间 → 隐藏进度条
  return outTime.getTime() < data.targetTime.getTime()
}

/**
 * 绘制工时进度条
 *
 * @param {WidgetStack} parent 父级 Stack
 * @param {object} data 打卡摘要
 * @param {number} width 进度条宽度
 * @author Kai
 * @date 2026/07/23 10:44
 */
function addProgressBar(parent, data, width) {
  const barWidth = width || 240
  const barHeight = 6

  const barBg = parent.addStack()
  barBg.layoutHorizontally()
  barBg.backgroundColor = new Color("#374151")
  barBg.cornerRadius = 3
  barBg.size = new Size(barWidth, barHeight)

  if (!data.hasClockIn) {
    const empty = barBg.addStack()
    empty.backgroundColor = new Color("#4B5563")
    empty.cornerRadius = 3
    empty.size = new Size(barWidth, barHeight)
    return
  }

  const targetMs = CONFIG.TARGET_HOURS * 60 * 60 * 1000
  // 进度优先用打卡工时，无下班卡时用实时工时
  const current = Math.max(
      0,
      data.punchWorkMs != null ? data.punchWorkMs : (data.liveWorkMs || data.currentWorkMs || 0)
  )
  const ratio = Math.min(1, current / targetMs)

  const filledWidth = Math.max(3, Math.round(barWidth * ratio))
  const emptyWidth = Math.max(0, barWidth - filledWidth)

  const fill = barBg.addStack()
  fill.backgroundColor = new Color(
      (data.punchTargetReached || data.liveTargetReached) ? "#34D399" : "#60A5FA"
  )
  fill.cornerRadius = 3
  fill.size = new Size(filledWidth, barHeight)

  if (emptyWidth > 0) {
    barBg.addSpacer(emptyWidth)
  }
}


// ==================== 状态文案 ====================

/**
 * 根据考勤判定生成小组件状态文案与颜色
 *
 * 「还差多少分钟」：
 * - 默认按当前时间倒计时
 * - 已下班且已打下班卡时，改按打卡工时差额
 *
 * @param {object} data 打卡摘要
 * @return {object} 主文案 / 短文案 / 副文案 / 颜色
 * @author Kai
 * @date 2026/07/24 09:02
 */
function getStatusMeta(data) {
  if (!data || !data.ok) {
    return {
      mainText: "加载失败",
      shortText: "加载失败",
      subText: "请检查接口",
      color: "#FCA5A5"
    }
  }

  if (!data.hasClockIn) {
    return {
      mainText: "今日未打卡",
      shortText: "未打卡",
      subText: "暂无上班记录",
      color: "#FBBF24"
    }
  }

  // 已下班且已打下班卡：按打卡工时展示结果
  if (data.offWorkWithPunch) {
    if (data.punchTargetReached) {
      return {
        mainText: "考勤正常",
        shortText: "正常",
        subText: `下班 ${formatTime(data.clockOutTime || data.latestOutTime)}`,
        color: "#34D399"
      }
    }

    const remain = data.remainingMinutes || 0
    return {
      mainText: `还差 ${remain} 分钟`,
      shortText: `${remain} 分钟`,
      subText: `下班 ${formatTime(data.clockOutTime || data.latestOutTime)}｜按打卡工时`,
      color: "#F87171"
    }
  }

  // 实时已满但仍无下班卡 → 漏打下班卡
  if (!data.hasOutRecord && data.liveTargetReached) {
    return {
      mainText: "漏打下班卡",
      shortText: "漏打卡",
      subText: `实时 ${formatShortDuration(data.liveWorkMs)}`,
      color: "#FBBF24"
    }
  }

  // 尚未正式下班：还差多少靠当前时间
  const remain = data.remainingMinutes || 0
  if (remain <= 0) {
    return {
      mainText: "已满 9 小时",
      shortText: "可下班",
      subText: data.hasOutRecord
          ? `下班 ${formatTime(data.clockOutTime || data.latestOutTime)}`
          : `上班 ${formatTime(data.inTime)}`,
      color: "#34D399"
    }
  }

  return {
    mainText: `还差 ${remain} 分钟`,
    shortText: `${remain} 分钟`,
    subText: `预计 ${formatTime(data.targetTime)} 可下班`,
    color: "#60A5FA"
  }
}


// ==================== Debug 模式 ====================

/**
 * 展示打卡解析与考勤判定 Debug 信息
 *
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function handleDebug() {
  const data = await getAttendanceSummary()

  let msg = ""

  if (!data.ok) {
    msg = data.error
  } else {
    const judgment = data.judgment || judgeAttendance(data)
    msg =
        `姓名：${data.personName || "--"}\n` +
        `组织：${data.orgName || "--"}\n` +
        `班次：${data.shiftName || "--"}\n` +
        `日期：${data.date || "--"}\n\n` +
        `上班：${data.hasClockIn ? formatTime(data.inTime) : "未打卡"} ${data.inStatusDesc || ""}\n` +
        `下班：${data.hasOutRecord ? formatTime(data.clockOutTime || data.latestOutTime) : "未打卡"} ${data.outStatusDesc || ""}\n\n` +
        `打卡工时：${data.punchWorkMs != null ? formatDuration(data.punchWorkMs) : "--"}\n` +
        `实时工时：${data.hasClockIn ? formatDuration(data.liveWorkMs) : "--"}\n` +
        `可下班：${data.hasClockIn ? formatTime(data.targetTime) : "--"}\n` +
        `打卡已满：${data.punchTargetReached ? "是" : "否"}\n` +
        `实时已满：${data.liveTargetReached ? "是" : "否"}\n` +
        `已下班有卡：${data.offWorkWithPunch ? "是" : "否"}\n` +
        `剩余分钟：${data.remainingMinutes}` +
        `（${data.remainingFromPunch ? "按打卡工时" : "按当前时间"}）\n` +
        `进度条：${shouldShowProgressBar(data) ? "显示" : "隐藏"}\n\n` +
        `判定：${judgment.label}\n` +
        `正常：${judgment.isNormal ? "是" : "否"}\n` +
        `漏打下班卡：${judgment.missingClockOut ? "是" : "否"}`
  }

  const alert = new Alert()
  alert.title = "打卡 Debug"
  alert.message = msg
  alert.addAction("确定")
  await alert.present()
}


// ==================== 工具函数：接口数据读取 ====================

/**
 * 解开接口多层 payload，定位到单日考勤对象
 *
 * @param {object} raw 原始返回
 * @return {object|null} 业务数据对象
 * @author Kai
 * @date 2026/07/23 10:26
 */
function unwrapPayload(raw) {
  if (!raw) {
    return raw
  }

  let obj = raw

  const possible = [
    raw.data,
    raw.result,
    raw.content,
    raw.response,
    raw.body
  ]

  for (const item of possible) {
    if (item) {
      obj = item
      break
    }
  }

  if (Array.isArray(obj)) {
    return obj.length > 0 ? obj[0] : null
  }

  if (obj && Array.isArray(obj.records)) {
    return obj.records.length > 0 ? obj.records[0] : obj
  }

  if (obj && Array.isArray(obj.list)) {
    return obj.list.length > 0 ? obj.list[0] : obj
  }

  if (obj && Array.isArray(obj.rows)) {
    return obj.rows.length > 0 ? obj.rows[0] : obj
  }

  return obj
}

/**
 * 深度查找对象中首个匹配键的值
 *
 * @param {object} obj 待搜索对象
 * @param {string[]} keys 候选键名
 * @return {*} 找到的值或 undefined
 * @author Kai
 * @date 2026/07/23 10:26
 */
function deepPick(obj, keys) {
  if (!obj) {
    return undefined
  }

  const keySet = keys.map(k => String(k).toLowerCase())
  const visited = new Set()

  function search(value, depth) {
    if (!value || depth > 6) {
      return undefined
    }

    if (typeof value !== "object") {
      return undefined
    }

    if (visited.has(value)) {
      return undefined
    }

    visited.add(value)

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = search(item, depth + 1)
        if (found !== undefined && found !== null && found !== "") {
          return found
        }
      }

      return undefined
    }

    const names = Object.keys(value)

    for (const name of names) {
      if (keySet.includes(String(name).toLowerCase())) {
        const v = value[name]

        if (v !== undefined && v !== null && v !== "") {
          return v
        }
      }
    }

    for (const name of names) {
      const v = value[name]

      if (v && typeof v === "object") {
        const found = search(v, depth + 1)

        if (found !== undefined && found !== null && found !== "") {
          return found
        }
      }
    }

    return undefined
  }

  return search(obj, 0)
}


// ==================== 工具函数：时间 ====================

/**
 * 将接口返回的工时字段解析为毫秒
 *
 * 支持：纯数字（按秒/分钟/小时启发式）、"9h30m"、"9:30"、"9小时30分钟" 等。
 *
 * @param {*} value 原始工时值
 * @return {number|null} 毫秒；无法解析时返回 null
 * @author Kai
 * @date 2026/07/23 10:44
 */
function parseDurationToMs(value) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  if (typeof value === "number" && !isNaN(value)) {
    // 启发式：过大当作毫秒，较大当作秒，中等当作分钟，较小当作小时
    if (value >= 1000000) {
      return value
    }
    if (value >= 10000) {
      return value * 1000
    }
    if (value >= 100) {
      return value * 60 * 1000
    }
    return value * 60 * 60 * 1000
  }

  const s = String(value).trim()
  if (!s) {
    return null
  }

  // 9小时30分钟 / 9时30分
  let m = s.match(/(\d+)\s*小时\s*(\d+)\s*分/)
  if (m) {
    return (Number(m[1]) * 60 + Number(m[2])) * 60 * 1000
  }

  m = s.match(/(\d+)\s*小时/)
  if (m) {
    return Number(m[1]) * 60 * 60 * 1000
  }

  // 9h30m / 9h / 30m
  m = s.match(/^(\d+)\s*h\s*(\d+)\s*m$/i)
  if (m) {
    return (Number(m[1]) * 60 + Number(m[2])) * 60 * 1000
  }

  m = s.match(/^(\d+)\s*h$/i)
  if (m) {
    return Number(m[1]) * 60 * 60 * 1000
  }

  m = s.match(/^(\d+)\s*m$/i)
  if (m) {
    return Number(m[1]) * 60 * 1000
  }

  // 9:30
  m = s.match(/^(\d+):(\d{2})$/)
  if (m) {
    return (Number(m[1]) * 60 + Number(m[2])) * 60 * 1000
  }

  // 纯数字字符串
  if (/^\d+(\.\d+)?$/.test(s)) {
    return parseDurationToMs(Number(s))
  }

  return null
}

/**
 * 将任意时间表达解析为 Date
 *
 * @param {*} value 原始时间值
 * @param {string} dateStr 兜底日期 yyyy-MM-dd
 * @return {Date|null} 解析结果
 * @author Kai
 * @date 2026/07/23 10:26
 */
function parseAnyDateTime(value, dateStr) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }

  const s = String(value).trim()

  if (!s) {
    return null
  }

  // 时间戳：秒
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000)
    return isNaN(d.getTime()) ? null : d
  }

  // 时间戳：毫秒
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s))
    return isNaN(d.getTime()) ? null : d
  }

  // 只有时间，例如 08:29 或 08:29:00
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    return parseDateTime(dateStr || formatDateKey(now), s)
  }

  // 日期时间，例如 2026-07-23 08:29:00
  const normalized = s.replace(" ", "T")
  const d = new Date(normalized)

  if (!isNaN(d.getTime())) {
    return d
  }

  return null
}

/**
 * 按日期 + 时间字符串拼成 Date
 *
 * @param {string} dateStr 日期
 * @param {string} timeStr 时间
 * @return {Date|null} 解析结果
 * @author Kai
 * @date 2026/07/23 10:26
 */
function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    return null
  }

  let date = String(dateStr).trim()
  let time = String(timeStr).trim()

  if (date.includes("T")) {
    date = date.split("T")[0]
  }

  if (date.includes(" ")) {
    date = date.split(" ")[0]
  }

  date = date.replace(/\//g, "-")

  if (/^\d{1,2}:\d{2}$/.test(time)) {
    const parts = time.split(":")
    const h = parts[0].padStart(2, "0")
    const m = parts[1].padStart(2, "0")
    time = `${h}:${m}:00`
  }

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
    const parts = time.split(":")
    const h = parts[0].padStart(2, "0")
    const m = parts[1].padStart(2, "0")
    const s = parts[2].padStart(2, "0")
    time = `${h}:${m}:${s}`
  }

  const d = new Date(`${date}T${time}`)

  if (isNaN(d.getTime())) {
    return null
  }

  return d
}

/**
 * 格式化为 HH:mm
 *
 * @param {Date} date 时间
 * @return {string} 时间文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function formatTime(date) {
  if (!date) {
    return "--"
  }

  const h = String(date.getHours()).padStart(2, "0")
  const m = String(date.getMinutes()).padStart(2, "0")

  return `${h}:${m}`
}

/**
 * 格式化为“X小时Y分钟”
 *
 * @param {number} ms 毫秒时长
 * @return {string} 时长文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function formatDuration(ms) {
  if (!ms || ms < 0) {
    return "0小时0分钟"
  }

  const totalMinutes = Math.floor(ms / 1000 / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return `${h}小时${m}分钟`
}

/**
 * 格式化为短工时 “XhYm”
 *
 * @param {number} ms 毫秒时长
 * @return {string} 短时长文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function formatShortDuration(ms) {
  if (!ms || ms < 0) {
    return "0h0m"
  }

  const totalMinutes = Math.floor(ms / 1000 / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return `${h}h${m}m`
}

/**
 * 格式化倒计时文案
 *
 * @param {number} ms 剩余毫秒
 * @return {string} 倒计时文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function formatCountdown(ms) {
  if (!ms || ms <= 0) {
    return "已达标"
  }

  const totalMinutes = Math.ceil(ms / 1000 / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  if (h <= 0) {
    return `${m}分钟`
  }

  if (m <= 0) {
    return `${h}小时`
  }

  return `${h}小时${m}分`
}

/**
 * 格式化为 yyyy-MM-dd
 *
 * @param {Date} date 日期
 * @return {string} 日期键
 * @author Kai
 * @date 2026/07/23 10:26
 */
function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

/**
 * 判断是否为中国工作日（含调休补班）
 *
 * @param {Date} date 待判断日期
 * @return {Promise<boolean>} 是否工作日
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function isChinaWorkday(date) {
  const dateKey = formatDateKey(date)
  const cacheKey = "china-workday-" + dateKey

  // 1. 优先读缓存
  try {
    if (Keychain.contains(cacheKey)) {
      const cached = JSON.parse(Keychain.get(cacheKey))
      const ageMs = Date.now() - cached.savedAt

      if (ageMs < CONFIG.HOLIDAY_CACHE_HOURS * 60 * 60 * 1000) {
        return cached.isWorkday
      }
    }
  } catch (e) {
    // 缓存坏了就忽略，重新请求接口
  }

  // 2. 请求中国节假日接口
  try {
    const url = `${CONFIG.HOLIDAY_API_BASE}/${encodeURIComponent(dateKey)}`
    const req = new Request(url)
    req.method = "GET"
    req.headers = {
      "Content-Type": "application/json"
    }

    const json = await req.loadJSON()

    if (!json || json.code !== 0 || !json.type) {
      throw new Error("节假日接口返回异常")
    }

    const type = Number(json.type.type)

    // timor.tech type 规则：
    // 0 = 工作日
    // 1 = 周末
    // 2 = 节假日
    // 3 = 调休补班
    const isWorkday = type === 0 || type === 3

    const cacheValue = {
      date: dateKey,
      isWorkday,
      type,
      name: json.type.name || "",
      savedAt: Date.now()
    }

    Keychain.set(cacheKey, JSON.stringify(cacheValue))

    return isWorkday
  } catch (e) {
    // 3. 接口失败时兜底
    if (CONFIG.HOLIDAY_FALLBACK_TO_WEEKDAY) {
      return isNormalWeekday(date)
    }

    return false
  }
}

/**
 * 普通周一至周五判断（节假日接口失败兜底）
 *
 * @param {Date} date 待判断日期
 * @return {boolean} 是否工作日
 * @author Kai
 * @date 2026/07/23 10:26
 */
function isNormalWeekday(date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}


// ==================== 工具函数：小组件 / 通知 ====================

/**
 * 小组件点击跳转的快捷指令 URL
 *
 * @return {string} shortcuts URL
 * @author Kai
 * @date 2026/07/23 10:26
 */
function getWidgetUrl() {
  return "shortcuts://run-shortcut?name=" + encodeURIComponent(CONFIG.SHORTCUT_NAME)
}

/**
 * 计算下次建议刷新时间
 *
 * @return {Date} 刷新时间
 * @author Kai
 * @date 2026/07/23 10:26
 */
function getNextWidgetRefreshDate() {
  return new Date(Date.now() + CONFIG.WIDGET_REFRESH_MINUTES * 60 * 1000)
}

/**
 * 将通知正文压缩为最多两行，避免系统截断难读
 *
 * @param {string} s 原始正文
 * @param {number} maxCharsPerLine 每行最大字符数
 * @return {string} 两行正文
 * @author Kai
 * @date 2026/07/23 10:26
 */
function twoLineBody(s, maxCharsPerLine = 60) {
  if (!s) return ""
  s = s.replace(/\r/g, "").replace(/\t/g, " ").replace(/\s+/g, " ").trim()
  const lines = s.split("\n").map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length >= 2) {
    let first = lines[0]
    let second = lines[1]
    if (first.length > maxCharsPerLine) first = first.slice(0, maxCharsPerLine - 1) + "…"
    if (second.length > maxCharsPerLine) second = second.slice(0, maxCharsPerLine - 1) + "…"
    return first + "\n" + second
  }
  let single = lines[0] || ""
  if (single.length <= maxCharsPerLine) return single
  let idx = single.lastIndexOf(" ", maxCharsPerLine)
  if (idx <= 0) idx = maxCharsPerLine
  let first = single.slice(0, idx).trim()
  let rest = single.slice(idx).trim()
  if (rest.length > maxCharsPerLine) rest = rest.slice(0, maxCharsPerLine - 1) + "…"
  return first + "\n" + rest
}

/**
 * 发送即时本地通知
 *
 * @param {string} title 标题
 * @param {string} body 正文
 * @author Kai
 * @date 2026/07/23 10:26
 */
async function notify(title, body) {
  const n = new Notification()
  n.title = title
  n.body = twoLineBody(body)
  n.sound = "default"
  await n.schedule()
}

/**
 * 压缩错误信息，便于通知展示
 *
 * @param {string} error 原始错误
 * @return {string} 压缩后的错误文案
 * @author Kai
 * @date 2026/07/23 10:26
 */
function compactError(error) {
  const text = String(error || "未知错误").trim()
  if (text.length <= 80) {
    return text
  }
  return text.slice(0, 79) + "…"
}
