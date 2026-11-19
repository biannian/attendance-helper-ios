// ==================================================
// AttendanceHelper
// Scriptable 今日打卡小组件 + 快捷指令提醒
// ==================================================
//
// 支持模式：
// widget     桌面小组件 / 手动预览
// leave      离开公司时检查工时是否满 9 小时
// schedule9  工作日根据上班时间预约“快满 9 小时”提醒
// near9      工作日下午定时检查是否快满 / 已满 9 小时
// debug      查看接口解析结果
//
// 快捷指令 / 小组件参数：
// widget / leave / schedule9 / near9 / debug
//
// Scriptable 脚本建议命名：
// AttendanceHelper
//
// ==================================================


// ==================== 配置区 ====================

const CONFIG = {
  // 正式打卡接口
  API_BASE: "https://api.hikiot.com/api-attendance/v1/statistics/v2/individual/single/daily",

  // 这里填你的 Bearer Token，不要带 Bearer 前缀
  TOKEN: "1c1ae3b0-a900-45ba-b0da-234d5cb8f1c1",

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
  ID: "myStatic"
}

const now = new Date()

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

  // 注意：
  // 这里的 clockOffTime / clockOutTime 不直接当作“最终下班”
  // 因为你之前说过，上厕所 / 临时离场也可能产生这个字段。
  // 所以这里只叫“最近离场”。
  const latestOutRaw = deepPick(root, [
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

  const inTime = parseAnyDateTime(clockInRaw, dateStr)
  const latestOutTime = parseAnyDateTime(latestOutRaw, dateStr)

  const hasClockIn = !!inTime
  const hasOutRecord = !!latestOutTime

  const targetMs = CONFIG.TARGET_HOURS * 60 * 60 * 1000

  let currentWorkMs = 0
  let latestOutWorkMs = 0
  let targetTime = null

  if (hasClockIn) {
    currentWorkMs = Math.max(0, now.getTime() - inTime.getTime())
    targetTime = new Date(inTime.getTime() + targetMs)

    if (hasOutRecord) {
      latestOutWorkMs = Math.max(
          0,
          latestOutTime.getTime() - inTime.getTime()
      )
    }
  }

  const targetReached = hasClockIn && currentWorkMs >= targetMs

  let remainingMinutes = 0
  if (hasClockIn && !targetReached) {
    remainingMinutes = Math.max(
        0,
        Math.ceil((targetTime.getTime() - now.getTime()) / 1000 / 60)
    )
  }

  const countdownText = !hasClockIn
      ? "--"
      : targetReached
          ? "已达标"
          : formatCountdown(targetTime.getTime() - now.getTime())

  return {
    ok: true,

    raw,

    personName,
    orgName,
    shiftName,
    date: dateStr,

    hasClockIn,
    hasOutRecord,

    inTime,
    latestOutTime,

    inStatusDesc,
    outStatusDesc,

    currentWorkMs,
    latestOutWorkMs,

    targetTime,
    targetReached,
    remainingMinutes,
    countdownText
  }
}


// ==================== 功能 1：离开公司检查 ====================

async function handleLeaveCompany() {
  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("打卡检查失败", data.error)
    return
  }

  if (!data.hasClockIn) {
    await notify(
        "打卡提醒",
        "今天还没有查询到上班打卡记录，请确认是否已经打卡。"
    )
    return
  }

  if (!data.targetReached) {
    let extra = ""

    if (data.hasOutRecord && data.latestOutTime) {
      extra =
          `\n最近离场：${formatTime(data.latestOutTime)}` +
          `\n离场时工时：${formatDuration(data.latestOutWorkMs)}`
    }

    await notify(
        "工时未满 9 小时",
        `当前工时：${formatDuration(data.currentWorkMs)}` +
        `\n还差约 ${data.remainingMinutes} 分钟。` +
        `\n\n上班：${formatTime(data.inTime)}` +
        `\n预计满 ${CONFIG.TARGET_HOURS} 小时：${formatTime(data.targetTime)}` +
        extra
    )

    return
  }

  await notify(
      "工时已满 9 小时",
      `当前工时：${formatDuration(data.currentWorkMs)}。` +
      `\n\n上班：${formatTime(data.inTime)}` +
      `\n满 ${CONFIG.TARGET_HOURS} 小时：${formatTime(data.targetTime)}` +
      `\n\n如果这是下班离开，请确认下班打卡状态。`
  )
}


// ==================== 功能 2：预约快满 9 小时提醒 ====================

async function handleScheduleNineHours() {
  if (!isWeekday(now)) {
    return
  }

  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("工时提醒失败", data.error)
    return
  }

  if (!data.hasClockIn) {
    await notify(
        "工时提醒",
        "还没有查询到今天的上班打卡记录，暂时无法预约 9 小时提醒。"
    )
    return
  }

  if (data.targetReached) {
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

  if (remindTime <= now) {
    await notify(
        "快满 9 小时了",
        `今天上班时间：${formatTime(data.inTime)}` +
        `\n当前工时：${formatDuration(data.currentWorkMs)}` +
        `\n预计 ${formatTime(data.targetTime)} 满 ${CONFIG.TARGET_HOURS} 小时。`
    )
  } else {
    const n = new Notification()
    n.title = "快满 9 小时了"
    n.body =
        `今天上班时间：${formatTime(data.inTime)}` +
        `\n预计 ${formatTime(data.targetTime)} 满 ${CONFIG.TARGET_HOURS} 小时。`
    n.sound = "default"
    n.setTriggerDate(remindTime)
    await n.schedule()
  }

  Keychain.set(key, "1")
}


// ==================== 功能 3：定时检查是否快满 9 小时 ====================

async function handleNearNineHours() {
  if (!isWeekday(now)) {
    return
  }

  const data = await getAttendanceSummary()

  if (!data.ok) {
    return
  }

  if (!data.hasClockIn) {
    return
  }

  if (data.targetReached) {
    const key = "targetReached-" + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notify(
          "今日工时已满 9 小时",
          `当前工时：${formatDuration(data.currentWorkMs)}` +
          `\n上班时间：${formatTime(data.inTime)}` +
          `\n可以下班前记得确认打卡。`
      )

      Keychain.set(key, "1")
    }

    return
  }

  if (
      data.remainingMinutes <= CONFIG.NEAR_MINUTES &&
      data.remainingMinutes > 0
  ) {
    const key = "near9-" + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notify(
          "快满 9 小时了",
          `还差约 ${data.remainingMinutes} 分钟满 ${CONFIG.TARGET_HOURS} 小时。` +
          `\n\n上班：${formatTime(data.inTime)}` +
          `\n预计：${formatTime(data.targetTime)} 满 ${CONFIG.TARGET_HOURS} 小时。`
      )

      Keychain.set(key, "1")
    }
  }
}


// ==================== 功能 4：桌面小组件 ====================

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

  card.addSpacer(4)

  addProgressBar(card, data, 240)

  widget.addSpacer(6)

  const grid = widget.addStack()
  grid.layoutVertically()

  const row1 = grid.addStack()
  row1.layoutHorizontally()

  addInfoCell(
      row1,
      "上班",
      data.hasClockIn ? formatTime(data.inTime) : "--",
      "#60A5FA",
      136,
      32
  )

  row1.addSpacer(8)

  addInfoCell(
      row1,
      "可下班",
      data.hasClockIn ? formatTime(data.targetTime) : "--",
      "#34D399",
      136,
      32
  )

  grid.addSpacer(4)

  const row2 = grid.addStack()
  row2.layoutHorizontally()

  addInfoCell(
      row2,
      "最近离场",
      data.hasOutRecord ? formatTime(data.latestOutTime) : "暂无",
      data.hasOutRecord ? "#F87171" : "#9CA3AF",
      136,
      32
  )

  row2.addSpacer(8)

  addInfoCell(
      row2,
      "更新",
      formatTime(now),
      "#9CA3AF",
      136,
      32
  )
}


// ==================== 大号组件 ====================

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

  statusCard.addSpacer(8)

  addProgressBar(statusCard, data, 300)

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
      "最近离场",
      data.hasOutRecord
          ? `${formatTime(data.latestOutTime)} ${data.outStatusDesc || ""}`.trim()
          : "暂无"
  )

  addDetailRow(
      widget,
      "当前工时",
      data.hasClockIn ? formatDuration(data.currentWorkMs) : "--"
  )

  addDetailRow(
      widget,
      "可下班",
      data.hasClockIn ? formatTime(data.targetTime) : "--"
  )

  widget.addSpacer()

  const footer = widget.addText("更新：" + formatTime(now))
  footer.font = Font.systemFont(10)
  footer.textColor = new Color("#6B7280")
}


// ==================== 小组件公共 UI ====================

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

function addInfoCell(parent, label, value, color, width, height) {
  const cell = parent.addStack()
  cell.layoutVertically()
  cell.backgroundColor = new Color("#1F2937")
  cell.cornerRadius = 8
  cell.setPadding(4, 7, 4, 7)
  cell.size = new Size(width || 130, height || 34)

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
  const current = Math.max(0, data.currentWorkMs || 0)
  const ratio = Math.min(1, current / targetMs)

  const filledWidth = Math.max(3, Math.round(barWidth * ratio))
  const emptyWidth = Math.max(0, barWidth - filledWidth)

  const fill = barBg.addStack()
  fill.backgroundColor = new Color(
      data.targetReached ? "#34D399" : "#60A5FA"
  )
  fill.cornerRadius = 3
  fill.size = new Size(filledWidth, barHeight)

  if (emptyWidth > 0) {
    barBg.addSpacer(emptyWidth)
  }
}


// ==================== 状态文案 ====================

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

  if (data.targetReached) {
    return {
      mainText: "已满 9 小时",
      shortText: "可下班",
      subText: `上班 ${formatTime(data.inTime)}，已达标`,
      color: "#34D399"
    }
  }

  const remain = data.remainingMinutes || 0

  if (data.hasOutRecord) {
    return {
      mainText: `还差 ${remain} 分钟`,
      shortText: `${remain} 分钟`,
      subText: `最近离场 ${formatTime(data.latestOutTime)}`,
      color: "#F87171"
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

async function handleDebug() {
  const data = await getAttendanceSummary()

  let msg = ""

  if (!data.ok) {
    msg = data.error
  } else {
    msg =
        `姓名：${data.personName || "--"}\n` +
        `组织：${data.orgName || "--"}\n` +
        `班次：${data.shiftName || "--"}\n` +
        `日期：${data.date || "--"}\n\n` +
        `上班：${data.hasClockIn ? formatTime(data.inTime) : "未打卡"} ${data.inStatusDesc || ""}\n` +
        `最近离场：${data.hasOutRecord ? formatTime(data.latestOutTime) : "暂无"} ${data.outStatusDesc || ""}\n\n` +
        `当前工时：${data.hasClockIn ? formatDuration(data.currentWorkMs) : "--"}\n` +
        `离场时工时：${data.hasOutRecord ? formatDuration(data.latestOutWorkMs) : "--"}\n` +
        `可下班：${data.hasClockIn ? formatTime(data.targetTime) : "--"}\n` +
        `是否已满：${data.targetReached ? "是" : "否"}\n` +
        `剩余分钟：${data.remainingMinutes}\n` +
        `倒计时：${data.countdownText}`
  }

  const alert = new Alert()
  alert.title = "打卡 Debug"
  alert.message = msg
  alert.addAction("确定")
  await alert.present()
}


// ==================== 工具函数：接口数据读取 ====================

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

function formatTime(date) {
  if (!date) {
    return "--"
  }

  const h = String(date.getHours()).padStart(2, "0")
  const m = String(date.getMinutes()).padStart(2, "0")

  return `${h}:${m}`
}

function formatDuration(ms) {
  if (!ms || ms < 0) {
    return "0小时0分钟"
  }

  const totalMinutes = Math.floor(ms / 1000 / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return `${h}小时${m}分钟`
}

function formatShortDuration(ms) {
  if (!ms || ms < 0) {
    return "0h0m"
  }

  const totalMinutes = Math.floor(ms / 1000 / 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60

  return `${h}h${m}m`
}

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

function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

function isWeekday(date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}


// ==================== 工具函数：小组件 / 通知 ====================

function getWidgetUrl() {
  return "shortcuts://run-shortcut?name=" + encodeURIComponent(CONFIG.SHORTCUT_NAME)
}

function getNextWidgetRefreshDate() {
  return new Date(Date.now() + CONFIG.WIDGET_REFRESH_MINUTES * 60 * 1000)
}

async function notify(title, body) {
  const n = new Notification()
  n.title = title
  n.body = body
  n.sound = "default"
  await n.schedule()
}
