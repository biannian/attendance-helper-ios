/*
 * Copyright (c) iGroup.
 * All rights reserved.
 */

/**
 * 考勤助手
 *
 * @author Kai
 * @date 2026/11/25 11:47
 * @description 展示今日打卡和月历核查，并执行考勤提醒
 */
// ==================================================
// AttendanceHelper
// Scriptable 今日打卡小组件 + 快捷指令提醒
//
// Token 过期或失效时，用账号密码重新登录并写入钥匙串。
// 另一台设备重新登录不会让这把 Token 失效。
// ==================================================
//
// 支持模式：
// manage     管理中心（Scriptable 手动运行默认入口）
// widget     桌面小组件 / 手动预览。组件刷新会拉新数据，失败时用今天的快照
// refresh    快捷指令点击刷新：拉最新数据、回写快照，不弹预览
// leave      离开公司时检查工时是否满 9 小时
// schedule9  工作日根据上班时间预约“快满 9 小时”提醒
// near9      工作日下午定时检查是否快满 / 已满 9 小时
// week       打开多日考勤历史，沿用已有小组件链接
// debug      查看接口解析结果
// update     从 GitHub 下载最新脚本并覆盖当前文件
//
// 快捷指令参数可以是四行文本，一条指令同时带上动作和账号：
// refresh
// 账号
// 密码
// 设备ID
// 第一行换成 leave、schedule9、near9、debug、update 就是对应动作。
// 脚本会把账号写入钥匙串，桌面自动刷新不用再传。点小组件走「更新打卡小组件」。
//
// Scriptable 脚本建议命名：
// AttendanceHelper
//
// ==================================================


// ==================== 配置区 ====================

const CONFIG = {
  // 正式打卡接口
  API_BASE: "https://api.hikiot.com/api-attendance/v1/statistics/v2/individual/single/daily",

  // 初始 Bearer Token，不要带 Bearer 前缀。钥匙串里已有新 Token 时优先用钥匙串
  TOKEN: "",

  // 登录账号。留空，由快捷指令写入钥匙串，避免更新脚本时被覆盖
  USERNAME: "",

  // 登录密码明文。留空，由快捷指令写入钥匙串。提交前按网页登录页同一套 AES 加密
  PASSWORD: "",

  // 密码登录接口。成功时 data.token 是新的 Bearer Token
  LOGIN_URL: "https://api.hikiot.com/api-saas/open/v1/pwdLogin",

  // 网页端固定的客户端标识，不是用户 Token
  LOGIN_BASIC: "Basic bGluay13ZWI6bGluaw==",

  // 钥匙串键名。登录成功后把新 Token 存在这里，小组件下次直接用
  TOKEN_KEYCHAIN: "attendance-helper-token",

  // 账号在钥匙串里的键名。更新脚本不会清掉
  USERNAME_KEYCHAIN: "attendance-helper-username",

  // 密码在钥匙串里的键名
  PASSWORD_KEYCHAIN: "attendance-helper-password",

  // 设备编号 在钥匙串里的键名
  DEVICE_KEYCHAIN: "attendance-helper-device-id",

  // 已登记的 deviceid。留空，由快捷指令写入钥匙串。未登记时走短信安全验证
  DEVICE_ID: "",

  // 密码登录返回这个业务码时，表示当前 deviceid 还没登记
  NEW_DEVICE_CODE: 104004,

  // 新设备发短信。请求体是手机号和滑块参数
  SEND_MESSAGE_URL: "https://api.hikiot.com/api-saas/open/v3/sendMessage",

  // 短信验证码登录。通过后 data.token 是新的 Bearer Token
  CODE_LOGIN_URL: "https://api.hikiot.com/api-saas/open/v1/codeLogin",

  // 公司名称，用于通知文案
  COMPANY_NAME: "iGroup",

  // 点击小组件后运行的快捷指令名称。
  // 快捷指令只放 Scriptable「刷新所有小组件」，并关闭「显示运行时」
  SHORTCUT_NAME: "更新打卡小组件",

  // 满多少小时算达标
  TARGET_HOURS: 9,

  // 提前多少分钟提醒快满 9 小时
  NEAR_MINUTES: 5,

  // 工作日早上开始拉上班卡。未到这个时间，下次刷新就定在这里
  MORNING_REFRESH_START: "08:00",

  // 过了这个时间还没有上班卡，当天不再轮询
  MORNING_REFRESH_END: "11:00",

  // 早上还没打到上班卡时的间隔。系统不一定按时执行
  MORNING_REFRESH_MINUTES: 10,

  // 最近一次成功获取的标准化考勤快照。锁屏和桌面组件只读这份快照
  ATTENDANCE_CACHE_KEY: "attendance-summary-snapshot-v1",

  // 中国节假日接口。休息日隐藏小组件内容，调休补班仍显示
  HOLIDAY_API_BASE: "https://timor.tech/api/holiday/info",

  // 节假日结果缓存小时数
  HOLIDAY_CACHE_HOURS: 12,

  // 节假日接口失败时退回周一至周五
  HOLIDAY_FALLBACK_TO_WEEKDAY: true,

  // 接口固定参数
  ID: "myStatic",

  // 公开仓库。更新脚本时直接下载，不需要 GitHub Token
  GITHUB_REPO: "biannian/attendance-helper-ios",

  // 仓库里的脚本路径
  GITHUB_SCRIPT_PATH: "scriptable/AttendanceHelper.js",

  // 更新时读取的分支。手机拉到的就是这个分支上的文件
  GITHUB_REF: "main",

  // 登录后要进入的团队。留空则用账号里的当前团队，没有当前团队时用第一个
  TEAM_NO: "",

  // 账号详情，用来确定团队编号
  ACCOUNT_DETAIL_URL: "https://api.hikiot.com/api-saas/v1/account/detail",

  // 选定团队。未选团队时，打卡接口会返回登录状态已失效
  TEAM_CHANGE_URL: "https://api.hikiot.com/api-link-saas/v3/team/change"
}

// 密钥必须在主入口的 await 之前赋值。
// 登录发生在第一次 await 期间，写在后面会触发暂时性死区，读不到 LOGIN_AES_KEY。

/** 网页登录页 AES-256 密钥，按 UTF-8 字节使用 */
const LOGIN_AES_KEY = "I0YmM5NTgtY2IyYi00OWIzLWFkZTktZj"

/** 网页登录页 AES 初始向量 */
const LOGIN_AES_IV = "BjNzhiZDctOGMxOS"

/** AES S 盒 */
const AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]

/** AES 轮常数 */
const AES_RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36]

let now = new Date()
// 独立的快捷指令入口由安装器/更新器从同一份源码生成，无额外账号配置。
const isCheckWorker = /(?:^|\/)AttendanceCheck\.js$/.test(String(module.filename || ""))
let quietForegroundCheck = false

// 小组件样式配置必须在主入口执行前初始化。
// 主入口会在文件继续向下解析前 await 渲染流程，不能把这些 const 放在渲染器后面。
const WIDGET_STYLE_IDS = ["cyber", "fitness", "minimal", "heatmap"]
const WIDGET_STYLE_DEFAULTS = { small: "minimal", medium: "fitness", large: "heatmap" }

/** 本次启动解析出的模式，以及快捷指令带来的账号 */
const launch = readLaunchRequest()

loadAccountFromKeychain()

/** 快捷指令写入账号失败时的说明。空字符串表示没有失败 */
let accountSaveError = ""

if (launch.account) {
  try {
    saveAccountToKeychain(launch.account)
  } catch (e) {
    accountSaveError = String(e && e.message ? e.message : e)
  }
}

const mode = isCheckWorker && !["refresh","widget","leave","check","recheck","confirm_missed","snooze","schedule9","near9","update","account"].includes(launch.mode) ? "check" : launch.mode


// ==================== 主入口 ====================

if (config.runsInWidget) {
  // 时间线刷新和「刷新所有小组件」都走这里，需要拉到最新打卡。
  // 锁屏或网络失败时改用今天的快照，倒计时仍按当前时刻重算。
    // 翻月只改变本地选月，优先用缓存立即重绘。
    const monthChanged = saveWidgetCalendarAction(args.widgetAction?.id)
    let data = monthChanged ? loadCachedAttendanceSummary() : await getAttendanceSummary()
  if (!data.ok) {
    const cached = loadCachedAttendanceSummary()
    if (cached.ok) {
      data = cached
    }
  }
  const widget = await createWidget(data)
  Script.setWidget(widget)
  Script.complete()
} else if (accountSaveError) {
  if (isLaunchedFromShortcut() || isCheckWorker) { Script.setShortcutOutput({ok:false,message:accountSaveError}); await notify("考勤账号配置失败",accountSaveError) }
  else await presentMessage("设置账号", accountSaveError)
  Script.complete()
} else if (mode === "account") {
  if (isLaunchedFromShortcut() || isCheckWorker) Script.setShortcutOutput({ok:true,message:"账号已保存"})
  else await presentMessage("设置账号", "已记在钥匙串。之后更新脚本不会覆盖账号、密码和设备编号。")
  Script.complete()
} else {
  const fromShortcut = isLaunchedFromShortcut() || isCheckWorker
  let checkResult = null
  if (mode === "widget" || mode === "refresh") {
    checkResult = await runWidgetUpdate({ presentPreview: !fromShortcut && mode !== "refresh" })
  } else if (mode === "leave" || mode === "check" || mode === "recheck") {
    checkResult = await handleLeaveCompany(undefined, mode === "leave")
  } else if (mode === "confirm_missed" || mode === "snooze") {
    checkResult = await handleCheckoutDecision(mode)
  } else if (mode === "schedule9") {
    checkResult = await handleScheduleNineHours()
  } else if (mode === "near9") {
    checkResult = await handleNearNineHours()
  } else if (mode === "debug") {
    await handleDebug()
  } else if (mode === "week") {
    // 点击中号组件后直接打开全屏考勤历史。
    try {
      await showMainMenu()
    } catch (e) {
      await presentMessage("考勤历史", "页面无法打开，请重试。\n" + managementErrorText(e))
    }
  } else if (mode === "update") {
    await handleUpdateScript()
  } else {
    await showMainMenu()
  }

  if (fromShortcut && checkResult) Script.setShortcutOutput(checkoutShortcutOutput(checkResult,mode))
  Script.complete()
}


/**
 * 是否由快捷指令或 Siri 拉起
 *
 * 点击桌面小组件会打开快捷指令。这时再弹预览会离开桌面，桌面快照往往不更新。
 *
 * @return 是快捷指令拉起时返回 true
 * @author Kai
 * @date 2026/11/19 20:50
 */
function isLaunchedFromShortcut() {
  if (config.runsWithSiri) {
    return true
  }

  const shortcutParam = args.shortcutParameter
  if (shortcutParam !== undefined && shortcutParam !== null && String(shortcutParam).length > 0) {
    return true
  }

  return false
}

/**
 * 解析小组件参数或快捷指令参数
 *
 * 快捷指令可以传词典，或传四行文本。带账号时记入钥匙串。
 *
 * @return 模式和账号。没有账号时 account 为 null
 * @author Kai
 * @date 2026/11/23 18:25
 */
function readLaunchRequest() {
    // 识别旧版中号组件链接携带的历史查询动作。
    if (!config.runsInWidget && !isLaunchedFromShortcut() && !isCheckWorker && args.queryParameters && ["week", "manage"].includes(args.queryParameters.mode)) {
        return { mode: args.queryParameters.mode, account: null }
    }

    // 布局参数只在桌面组件中使用，仍以普通小组件模式加载考勤。
    if (config.runsInWidget && readWidgetLayout(args.widgetParameter)) {
        return { mode: "widget", account: null }
    }

  const raw = config.runsInWidget
      ? (args.widgetParameter || "widget")
      : (args.shortcutParameter || args.widgetParameter || (isCheckWorker ? "check" : config.runsWithSiri ? "refresh" : "manage"))

  return parseLaunchParameter(raw)
}

/**
 * 把快捷指令参数拆成运行模式和账号
 *
 * 四行文本时，第一行是动作，后面三行是账号、密码、设备编号。
 * 这样一条快捷指令就能完成登录和对应动作。
 *
 * @param raw 小组件参数、快捷指令文本或词典
 * @return 模式和账号
 * @author Kai
 * @date 2026/11/23 18:34
 */
function parseLaunchParameter(raw) {
  let data = raw

  if (typeof raw === "string") {
    const text = raw.trim()

    if (text.startsWith("{")) {
      try {
        data = JSON.parse(text)
      } catch (e) {
        return { mode: text.toLowerCase(), account: null }
      }
    } else {
      const lines = text.split(/\r?\n/)
      const modeName = String(lines[0] || "").trim().toLowerCase()

      if (lines.length >= 4 && isLaunchMode(modeName)) {
        return {
          mode: modeName,
          account: {
            username: lines[1].trim(),
            password: lines[2],
            deviceId: lines.slice(3).join("\n").trim()
          }
        }
      }

      return { mode: modeName || "widget", account: null }
    }
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      mode: String(data || "widget").trim().toLowerCase() || "widget",
      account: null
    }
  }

  const username = String(data.username || data.userName || data.user || "").trim()
  const password = data.password == null ? "" : String(data.password)
  const deviceId = String(data.deviceId || data.deviceid || data.deviceID || "").trim()
  const modeText = String(data.mode || data.action || "").trim().toLowerCase()
  const hasAccount = !!(username || password || deviceId)
  const account = hasAccount
      ? { username: username, password: password, deviceId: deviceId }
      : null

  return {
    mode: modeText || (hasAccount ? "account" : "widget"),
    account: account
  }
}

/**
 * 判断快捷指令第一行是不是已知动作
 *
 * @param mode 参数第一行
 * @return 是 refresh、leave 这类动作时返回 true
 * @author Kai
 * @date 2026/11/23 18:34
 */
function isLaunchMode(mode) {
  return [
    "widget",
    "manage",
    "refresh",
    "leave",
    "check",
    "recheck",
    "confirm_missed",
    "snooze",
    "schedule9",
    "near9",
    "week",
    "debug",
    "update",
    "account"
  ].indexOf(mode) !== -1
}

/**
 * 从钥匙串恢复账号、密码和设备编号
 *
 * 脚本文件会被更新覆盖，这三项只认钥匙串。
 *
 * @author Kai
 * @date 2026/11/23 18:25
 */
function loadAccountFromKeychain() {
  const username = readKeychainValue(CONFIG.USERNAME_KEYCHAIN).trim()
  const password = readKeychainValue(CONFIG.PASSWORD_KEYCHAIN)
  const deviceId = readKeychainValue(CONFIG.DEVICE_KEYCHAIN).trim()

  if (username) {
    CONFIG.USERNAME = username
  }
  if (password) {
    CONFIG.PASSWORD = password
  }
  if (deviceId) {
    CONFIG.DEVICE_ID = deviceId
  }
}

/**
 * 把快捷指令传来的账号写入钥匙串
 *
 * 账号、密码或设备编号 有变化时，清掉旧登录 Token 和打卡快照。
 *
 * @param account 账号、密码、设备编号
 * @author Kai
 * @date 2026/11/23 18:25
 */
function saveAccountToKeychain(account) {
  const username = String(account && account.username || "").trim()
  const password = account && account.password != null ? String(account.password) : ""
  const deviceId = String(account && account.deviceId || "").trim()

  if (!username || !password || !deviceId) {
    throw new Error("账号、密码、设备编号 都要填")
  }

  const previousUser = readKeychainValue(CONFIG.USERNAME_KEYCHAIN)
  const previousPassword = readKeychainValue(CONFIG.PASSWORD_KEYCHAIN)
  const previousDevice = readKeychainValue(CONFIG.DEVICE_KEYCHAIN)
  const changed = previousUser !== username
      || previousPassword !== password
      || previousDevice !== deviceId

  Keychain.set(CONFIG.USERNAME_KEYCHAIN, username)
  Keychain.set(CONFIG.PASSWORD_KEYCHAIN, password)
  Keychain.set(CONFIG.DEVICE_KEYCHAIN, deviceId)
  CONFIG.USERNAME = username
  CONFIG.PASSWORD = password
  CONFIG.DEVICE_ID = deviceId

  if (changed) {
    clearStoredSession()
  }
}

/**
 * 清掉上一账号的登录 Token、打卡快照和考勤历史
 *
 * @author Kai
 * @date 2026/11/24 16:29
 */
function clearStoredSession() {
  try {
    Keychain.remove(CONFIG.TOKEN_KEYCHAIN)
  } catch (e) {
    // 没有旧 Token 时忽略
  }

  try {
    Keychain.remove(CONFIG.ATTENDANCE_CACHE_KEY)
  } catch (e) {
    // 没有旧快照时忽略
  }

  CONFIG.TOKEN = ""

    // 兼容旧版本按星期存放的数据，同时清除按日保存的历史。
    const { files, directory } = attendanceHistoryStorage()
    if (files.fileExists(directory)) {
        files.remove(directory)
    }

    for (let day = 0; day < 7; day++) {
        const key = weeklySnapshotKey(day)
        if (Keychain.contains(key)) {
            Keychain.remove(key)
        }
    }
}

/**
 * 读取钥匙串中的一项
 *
 * @param key 钥匙串键名
 * @return 已保存的文本；没有或读失败时返回空字符串
 * @author Kai
 * @date 2026/11/23 18:25
 */
function readKeychainValue(key) {
  try {
    if (Keychain.contains(key)) {
      return String(Keychain.get(key) || "")
    }
  } catch (e) {
    // 锁屏时钥匙串可能读不到
  }

  return ""
}

/**
 * 在 Scriptable 里填写账号并写入钥匙串
 *
 * @author Kai
 * @date 2026/11/23 18:25
 */
async function promptAndSaveAccount() {
  const alert = new Alert()
  alert.title = "设置账号"
  alert.message = "记在钥匙串里。更新脚本不会覆盖。"
  alert.addTextField("账号", CONFIG.USERNAME || "")
  alert.addSecureTextField("密码", "")
  alert.addTextField("设备编号", CONFIG.DEVICE_ID || "")
  alert.addAction("保存")
  alert.addCancelAction("取消")

  if (await alert.presentAlert() !== 0) {
    return
  }

  try {
    saveAccountToKeychain({
      username: alert.textFieldValue(0),
      password: alert.textFieldValue(1) || CONFIG.PASSWORD,
      deviceId: alert.textFieldValue(2)
    })
    await presentMessage("设置账号", "已记在钥匙串。换过账号后，下次刷新会重新登录。")
  } catch (e) {
    await presentMessage("设置账号", String(e && e.message ? e.message : e))
  }
}

/**
 * 弹出一句说明
 *
 * @param title 标题
 * @param message 说明
 * @author Kai
 * @date 2026/11/23 18:25
 */
async function presentMessage(title, message) {
  const alert = new Alert()
  alert.title = title
  alert.message = message
  alert.addAction("好")
  await alert.present()
}

/**
 * 拉取打卡数据、写入快照并生成小组件
 *
 * @param options 展示选项，family 指定预览尺寸，presentPreview 控制是否弹出预览
 * @author Kai
 * @date 2026/11/25 12:18
 */
async function runWidgetUpdate(options) {
  const presentPreview = !!(options && options.presentPreview)
  const data = await getAttendanceSummary()
  if (!presentPreview && !config.runsInWidget) return data
  const widget = await createWidget(data, options?.family, options?.style)
  if (config.runsInWidget) Script.setWidget(widget)

  if (presentPreview) {
    if (options?.family === "small") await widget.presentSmall()
    else if (options?.family === "large") await widget.presentLarge()
    else await widget.presentMedium()
  }
  return data
}


// ==================== 手动运行菜单 ====================

/**
 * 展示考勤工具和中号、大号预览入口。
 *
 * @author Kai
 * @date 2026/11/25 12:18
 */
async function showMainMenu() {
    try {
        if (args.queryParameters?.native === "1") await presentNativeAttendanceHistory(args.queryParameters?.month)
        else await presentAttendanceHistory(args.queryParameters?.month)
    } catch (e) {
        const alert = new Alert()
        alert.title = "管理页加载失败"
        alert.message = managementErrorText(e) + "\n可先使用下方原生入口。"
        alert.addAction("原生考勤管理（查看、设置、核查）")
        alert.addAction("设置账号")
        alert.addAction("预览中号组件")
        alert.addAction("预览大号组件")
        alert.addAction("Debug 信息")
        alert.addCancelAction("关闭")
        const index = await alert.presentSheet()
        if (index === 0) await presentNativeAttendanceHistory(args.queryParameters?.month)
        else if (index === 1) await promptAndSaveAccount()
        else if (index === 2) await runWidgetUpdate({presentPreview:true})
        else if (index === 3) await runWidgetUpdate({presentPreview:true,family:"large"})
        else if (index === 4) await handleDebug()
    }
}


// ==================== 从代码仓库更新脚本 ====================

/**
 * 下载最新脚本并覆盖当前文件
 *
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function handleUpdateScript() {
  let message = ""

  try {
    const changed = await updateScriptFromGit()
    message = changed
        ? "脚本已更新。退出后重新打开，小组件才会用新代码。"
        : "已经是最新版本。"
  } catch (e) {
    message = String(e && e.message ? e.message : e)
  }

  await notify(message.indexOf("已更新") !== -1 ? "打卡脚本" : "更新脚本", message)
  if (isCheckWorker || isLaunchedFromShortcut()) { Script.setShortcutOutput(message); return }

  const alert = new Alert()
  alert.title = "更新脚本"
  alert.message = message
  alert.addAction("好")
  await alert.present()
}

/**
 * 从公开仓库拉取脚本并写回当前文件
 *
 * @return 文件内容有变化时返回 true
 * @author Kai
 * @date 2026/11/24 15:37
 */
async function updateScriptFromGit() {
  const latest = await downloadScriptSource()
  const fm = scriptFileManager()
  const path = module.filename

  if (!path) {
    throw new Error("找不到当前脚本文件，无法写回")
  }

  if (fm.fileExists(path)) {
    await fm.downloadFileFromiCloud(path)
  }

  const current = fm.readString(path)

  let changed = current !== latest
  // 独立检查脚本共享 Keychain 和快照；每次更新同时同步它，避免规则分叉。
  const workerPath = fm.joinPath(fm.documentsDirectory(), "AttendanceCheck.js")
  if (workerPath !== path) {
    if (fm.fileExists(workerPath)) await fm.downloadFileFromiCloud(workerPath)
    if (!fm.fileExists(workerPath) || fm.readString(workerPath) !== latest) { fm.writeString(workerPath, latest); changed = true }
  } else {
    const mainPath = fm.joinPath(fm.documentsDirectory(), "AttendanceHelper.js")
    if (fm.fileExists(mainPath)) { await fm.downloadFileFromiCloud(mainPath); if (fm.readString(mainPath) !== latest) { fm.writeString(mainPath,latest); changed=true } }
  }
  if (current !== latest) fm.writeString(path, latest)
  return changed
}

/**
 * 从公开仓库下载打卡脚本，请求头不带 Token
 *
 * @return 脚本源码
 * @author Kai
 * @date 2026/11/24 17:02
 */
async function downloadScriptSource() {
  const url =
      "https://raw.githubusercontent.com/" +
      CONFIG.GITHUB_REPO +
      "/" +
      encodeURIComponent(CONFIG.GITHUB_REF) +
      "/" +
      CONFIG.GITHUB_SCRIPT_PATH +
      "?_update=" + Date.now()
  const req = new Request(url)
  req.method = "GET"
  req.timeoutInterval = 20
  req.headers = {
    "Accept": "text/plain",
    "Cache-Control": "no-cache",
    "User-Agent": "AttendanceHelper"
  }

  let text = ""
  let status = 0

  try {
    text = await req.loadString()
    status = req.response ? req.response.statusCode : 0
  } catch (e) {
    status = req.response ? req.response.statusCode : 0
    if (!status || status === 200) {
      throw new Error("下载连接失败：" + String(e.message || e))
    }
  }

  if (status === 404) {
    throw new Error("下载失败：仓库还不是公开的，或脚本路径不对")
  }

  if (status && status !== 200) {
    throw new Error("下载失败：" + status)
  }

  if (!isAttendanceScript(text)) {
    throw new Error("下载内容不是打卡脚本")
  }

  return text
}

/**
 * 用源码文件头和必要声明识别打卡脚本，正文可以包含页面模板
 *
 * @param code 下载到的文本
 * @return 可以写回时返回 true
 * @author Kai
 * @date 2026/11/24 17:02
 */
function isAttendanceScript(code) {
  if (!code || code.length < 500) {
    return false
  }

    return /^\s*\/\*\s*\* Copyright \(c\) iGroup(?: China)?\./.test(code) &&
        /^const CONFIG = \{/m.test(code) &&
        /^async function fetchAttendance\(/m.test(code) &&
        /^async function getAttendanceSummary\(/m.test(code)
}

/**
 * 按脚本实际所在位置选择 iCloud 或本机文件
 *
 * @return Scriptable 文件管理器
 * @author Kai
 * @date 2026/11/19 19:03
 */
function scriptFileManager() {
  const path = module.filename || ""

  if (path.indexOf("iCloud") !== -1) {
    return FileManager.iCloud()
  }

  return FileManager.local()
}


// ==================== 请求打卡接口 ====================

/**
 * 读取当前可用的登录 Token
 *
 * 空白 Token 视为没有登录。拼进请求头会变成 "Bearer "，
 * 网关会回 500「系统暂时不可访问」，而不是要求重新登录。
 *
 * @return 钥匙串中的 Token；没有时返回配置里的初始 Token
 * @author Kai
 * @date 2026/11/23 18:56
 */
function readStoredToken() {
  try {
    if (Keychain.contains(CONFIG.TOKEN_KEYCHAIN)) {
      const saved = String(Keychain.get(CONFIG.TOKEN_KEYCHAIN) || "").trim()
      if (saved) {
        return saved
      }
    }
  } catch (e) {
    // 锁屏时钥匙串可能读不到，继续用配置里的 Token
  }

  return String(CONFIG.TOKEN || "").trim()
}

/**
 * 保存新登录 Token
 *
 * @param token 登录接口返回的 Bearer Token
 * @author Kai
 * @date 2026/11/19 18:57
 */
function writeStoredToken(token) {
  CONFIG.TOKEN = token

  try {
    Keychain.set(CONFIG.TOKEN_KEYCHAIN, token)
  } catch (e) {
    // 写不进钥匙串时，本次运行仍使用内存中的新 Token
  }
}

/**
 * 判断这次失败是不是 Token 过期或失效
 *
 * @param statusCode HTTP 状态码
 * @param json 接口 JSON；没有响应体时传 null
 * @param message 异常文案
 * @return 需要重新登录时返回 true
 * @author Kai
 * @date 2026/11/19 18:57
 */
function isAuthFailure(statusCode, json, message) {
  const code = json && json.code !== undefined && json.code !== null
      ? Number(json.code)
      : null
  const text = String(
      (json && (json.msg || json.message)) || message || ""
  )

  if (statusCode === 401 || code === 401 || code === 999999 || code === 999998 || code === 999997 || code === 999996) {
    return true
  }

  return /access token|token expired|invalid access token|登录状态已?失效|请重新登录/i.test(text)
}

/**
 * 组装登录失效错误，带上业务码供后续决定是选团队还是重新登录
 *
 * @param json 接口 JSON
 * @param message 异常文案
 * @param statusCode HTTP 状态码
 * @return 带 authFailure 标记的错误
 * @author Kai
 * @date 2026/11/19 20:34
 */
function makeAuthError(json, message, statusCode) {
  const err = new Error((json && (json.msg || json.message)) || message || "登录已失效")
  err.authFailure = true
  err.authCode = json && json.code !== undefined && json.code !== null
      ? Number(json.code)
      : (statusCode === 401 ? 401 : 0)
  return err
}

/**
 * 拉取一天的打卡数据
 *
 * 没有 Token 时不发请求。空的 Authorization 会被网关说成系统不可用，
 * 调用方会因此跳过账号登录。
 *
 * @param token Bearer Token，不要带 Bearer 前缀
 * @param dateKey 要查询的考勤业务日期，格式为 yyyy-MM-dd
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/24 16:26
 */
async function requestAttendance(token, dateKey) {
  const accessToken = String(token || "").trim()
  if (!accessToken) {
    throw makeAuthError(null, "还没有登录", 401)
  }

  // 时间戳避免系统把 GET 打卡结果缓存成旧的下班卡
  const url =
      `${CONFIG.API_BASE}?date=${encodeURIComponent(dateKey)}` +
      `&ID=${encodeURIComponent(CONFIG.ID)}` +
      `&_cb=${Date.now()}`

  const req = new Request(url)
  req.method = "GET"
  req.timeoutInterval = 15

  req.headers = {
    "Authorization": "Bearer " + accessToken,
    "UNI-Request-Source": "1",
    "terminal": "1",
    "appNo": "__UNI__89A1A02",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept": "*/*",
    "deviceid": CONFIG.DEVICE_ID,
    "versionCode": "1986",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache"
  }

  let text = ""
  let statusCode = 0

  try {
    text = await req.loadString()
    statusCode = req.response ? req.response.statusCode : 0
  } catch (e) {
    statusCode = req.response ? req.response.statusCode : 0
    const message = String(e && e.message ? e.message : e)
    if (isAuthFailure(statusCode, null, message)) {
      throw makeAuthError(null, message, statusCode)
    }
    throw new Error(message || "网络请求失败")
  }

  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  if (!json) {
    throw new Error("接口无返回")
  }

  if (isAuthFailure(statusCode, json, "")) {
    throw makeAuthError(json, "", statusCode)
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

/**
 * 登录、发短信、验证码登录共用的请求头
 *
 * @param extra 额外请求头
 * @return 请求头
 * @author Kai
 * @date 2026/11/24 14:50
 */
function openLoginHeaders(extra) {
  return Object.assign({
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Authorization": CONFIG.LOGIN_BASIC,
    "deviceid": CONFIG.DEVICE_ID,
    "STN-PhoneType": "Iphone",
    "devicename": "unknow 0",
    "terminal": "2",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app"
  }, extra || {})
}

/**
 * 弹出与网页相同的滑块，取出发短信用的参数
 *
 * @return captchaVerifyParam
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function collectCaptchaParam() {
  if (config.runsInWidget || isCheckWorker || isLaunchedFromShortcut() || quietForegroundCheck) {
    throw new Error("新设备需要安全验证，请手动打开 AttendanceHelper 并同步考勤")
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
window.AliyunCaptchaConfig={region:"cn",prefix:"1jgloq"};
</script>
<script src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"></script>
</head>
<body style="font-family:-apple-system,sans-serif;padding:16px;">
<p>请完成下方验证。通过后关闭此页，脚本会发送短信验证码。</p>
<div id="captcha-element"></div>
<button id="captcha-button" style="display:none"></button>
<p id="done"></p>
<script>
window.__captchaParam="";
function boot(){
  if(!window.initAliyunCaptcha){setTimeout(boot,200);return;}
  initAliyunCaptcha({
    SceneId:"1w0ysb3s",
    mode:"embed",
    element:"#captcha-element",
    button:"#captcha-button",
    success:function(value){
      window.__captchaParam=String(value||"");
      var done=document.getElementById("done");
      if(done){done.textContent="验证通过，请关闭此页";}
    },
    fail:function(){},
    getInstance:function(){
      var timer=setInterval(function(){
        var body=document.getElementById("aliyunCaptcha-captcha-body");
        if(!body){return;}
        body.dispatchEvent(new Event("click"));
        clearInterval(timer);
      },200);
    }
  });
}
boot();
</script>
</body>
</html>`

  const view = new WebView()
  await view.loadHTML(html, "https://www.hikiot.com/")
  await view.present()
  const value = await view.evaluateJavaScript("window.__captchaParam")
  return String(value || "").trim()
}

/**
 * 向登录手机发送新设备验证码
 *
 * @param captchaParam 滑块返回的 captchaVerifyParam
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function sendLoginSms(captchaParam) {
  const req = new Request(CONFIG.SEND_MESSAGE_URL)
  req.method = "POST"
  req.timeoutInterval = 15
  req.body = JSON.stringify({
    phone: CONFIG.USERNAME,
    captchaVerifyParam: captchaParam
  })
  req.headers = openLoginHeaders()
  const json = await readLoginJson(req)
  if (!json || Number(json.code) !== 0) {
    throw new Error((json && (json.msg || json.message)) || "发送验证码失败")
  }
}

/**
 * 让用户填写短信验证码
 *
 * @return 6 位数字验证码
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function askSmsCode() {
  const alert = new Alert()
  alert.title = "新设备安全验证"
  alert.message = "验证码已发送到登录手机，请输入 6 位短信验证码"
  alert.addTextField("6 位验证码")
  alert.addAction("验证")
  alert.addCancelAction("取消")
  if (await alert.presentAlert() !== 0) {
    throw new Error("已取消新设备验证")
  }
  const code = String(alert.textFieldValue(0) || "").replace(/\D/g, "")
  if (code.length !== 6) {
    throw new Error("没有填写 6 位短信验证码")
  }
  return code
}

/**
 * 提交短信验证码，换取新设备的登录 Token
 *
 * @param smsCode 6 位短信验证码
 * @return Bearer Token
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function codeLogin(smsCode) {
  const req = new Request(CONFIG.CODE_LOGIN_URL)
  req.method = "POST"
  req.timeoutInterval = 15
  req.body = JSON.stringify({
    phone: CONFIG.USERNAME,
    code: smsCode,
    isAuto: false
  })
  req.headers = openLoginHeaders({"login-source": "link-web"})
  const json = await readLoginJson(req)
  const token = json && json.data ? json.data.token : ""
  if (!json || Number(json.code) !== 0 || !token) {
    throw new Error((json && (json.msg || json.message)) || "设备验证失败")
  }
  return token
}

/**
 * 读取登录相关接口的 JSON
 *
 * @param req 已填好地址和请求头的 Request
 * @return 接口 JSON；解析失败时返回 null
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function readLoginJson(req) {
  const text = await req.loadString()
  try {
    return JSON.parse(text)
  } catch (e) {
    return null
  }
}

/**
 * 未登记设备时完成滑块、发短信和验证码登录
 *
 * @return 新的 Bearer Token
 * @author Kai
 * @date 2026/11/24 14:50
 */
async function verifyNewDevice() {
  if (!CONFIG.USERNAME) {
    throw new Error("新设备需要短信验证，但没有登录手机号")
  }
  const captchaParam = await collectCaptchaParam()
  if (!captchaParam) {
    throw new Error("已取消新设备验证")
  }
  await sendLoginSms(captchaParam)
  const smsCode = await askSmsCode()
  return codeLogin(smsCode)
}

/**
 * 用账号密码登录并保存新 Token
 *
 * @return 新的 Bearer Token
 * @author Kai
 * @date 2026/11/19 18:57
 */
async function refreshAccessToken() {
  if (!CONFIG.USERNAME || !CONFIG.PASSWORD) {
    throw new Error("缺少账号或密码，无法更新 Token")
  }

  const req = new Request(CONFIG.LOGIN_URL)
  req.method = "POST"
  req.timeoutInterval = 15
  req.body = JSON.stringify({
    username: CONFIG.USERNAME,
    password: encryptLoginPassword(CONFIG.PASSWORD),
    isAuto: false
  })
  req.headers = openLoginHeaders({"login-source": "link-web"})

  const text = await req.loadString()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  if (json && Number(json.code) === CONFIG.NEW_DEVICE_CODE) {
    const verified = await verifyNewDevice()
    writeStoredToken(verified)
    await selectCurrentTeam(verified)
    return verified
  }

  const token = json && json.data ? json.data.token : ""
  if (!json || Number(json.code) !== 0 || !token) {
    throw new Error((json && (json.msg || json.message)) || "更新 Token 失败")
  }

  writeStoredToken(token)
  await selectCurrentTeam(token)
  return token
}

/**
 * 携带登录 Token 请求账号或团队接口
 *
 * @param url 接口地址
 * @param method GET 或 POST
 * @param token Bearer Token
 * @param body POST 请求体；GET 时不传
 * @return 接口 JSON
 * @author Kai
 * @date 2026/11/19 20:34
 */
async function authorizedJson(url, method, token, body) {
  const req = new Request(url)
  req.method = method
  req.timeoutInterval = 15
  if (body) {
    req.body = JSON.stringify(body)
  }
  req.headers = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token,
    "deviceid": CONFIG.DEVICE_ID,
    "terminal": "2",
    "STN-PhoneType": "Iphone",
    "devicename": "unknow 0"
  }

  let text = ""
  let statusCode = 0

  try {
    text = await req.loadString()
    statusCode = req.response ? req.response.statusCode : 0
  } catch (e) {
    statusCode = req.response ? req.response.statusCode : 0
    const message = String(e && e.message ? e.message : e)
    if (isAuthFailure(statusCode, null, message)) {
      throw makeAuthError(null, message, statusCode)
    }
    throw new Error(message || "网络请求失败")
  }

  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  if (isAuthFailure(statusCode, json, "")) {
    throw makeAuthError(json, "", statusCode)
  }

  if (!json || (json.code !== undefined && json.code !== null && Number(json.code) !== 0 && Number(json.code) !== 200)) {
    throw new Error((json && (json.msg || json.message)) || "请求失败")
  }

  return json
}

/**
 * 登录后进入团队。未选团队时打卡接口会提示登录状态已失效
 *
 * @param token 刚登录得到的 Bearer Token
 * @return 进入的团队编号
 * @author Kai
 * @date 2026/11/19 20:34
 */
async function selectCurrentTeam(token) {
  const detail = await authorizedJson(CONFIG.ACCOUNT_DETAIL_URL, "GET", token)
  const data = detail.data || {}
  const teams = Array.isArray(data.teamInfoList) ? data.teamInfoList : []
  let teamNo = CONFIG.TEAM_NO || data.onLineTeamNo || ""

  if (!teamNo && teams.length > 0) {
    teamNo = teams[0].teamNo || ""
  }

  if (!teamNo) {
    throw new Error("登录成功，但没有可进入的团队")
  }

  await authorizedJson(CONFIG.TEAM_CHANGE_URL, "POST", token, {
    teamNo: teamNo,
    terminal: 2
  })

  return teamNo
}

/**
 * 获取打卡数据。没有 Token 或 Token 失效时，用账号登录一次再拉
 *
 * 快捷指令写入新账号会清掉旧 Token。这时要先登录，不能先打卡。
 *
 * @param dateKey 要查询的考勤业务日期，格式为 yyyy-MM-dd
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/24 16:26
 */
async function fetchAttendance(dateKey) {
  let token = readStoredToken()

  try {
    return await requestAttendance(token, dateKey)
  } catch (e) {
    if (!e || !e.authFailure) {
      throw e
    }

    // 999999 表示 Token 还在，但这次登录还没进入团队
    if (Number(e.authCode) === 999999 && token) {
      try {
        await selectCurrentTeam(token)
        return await requestAttendance(token, dateKey)
      } catch (teamError) {
        if (!teamError || !teamError.authFailure) {
          throw teamError
        }
      }
    }
  }

  token = await refreshAccessToken()
  return await requestAttendance(token, dateKey)
}


// ==================== 登录密码加密 ====================
// 与网页登录页一致：AES-256-CBC、PKCS7，只对密文做 Base64。
// LOGIN_AES_KEY、LOGIN_AES_IV、AES_SBOX、AES_RCON 已在主入口前赋值。

/**
 * 把登录密码加密成网页登录接口要的密文
 *
 * @param plainText 登录密码明文
 * @return Base64 密文
 * @author Kai
 * @date 2026/11/19 18:57
 */
function encryptLoginPassword(plainText) {
  const key = utf8Bytes(LOGIN_AES_KEY)
  const iv = utf8Bytes(LOGIN_AES_IV)
  const encrypted = aesCbcEncrypt(pkcs7Pad(utf8Bytes(plainText)), key, iv)
  return base64Encode(encrypted)
}

/**
 * 字符串转 UTF-8 字节
 *
 * @param str 原文
 * @return 字节数组
 * @author Kai
 * @date 2026/11/19 18:57
 */
function utf8Bytes(str) {
  const out = []

  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)

    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else {
      out.push(
          0xe0 | (c >> 12),
          0x80 | ((c >> 6) & 0x3f),
          0x80 | (c & 0x3f)
      )
    }
  }

  return out
}

/**
 * PKCS7 填充到 16 字节整数倍
 *
 * @param bytes 原字节
 * @return 填充后的字节
 * @author Kai
 * @date 2026/11/19 18:57
 */
function pkcs7Pad(bytes) {
  const pad = 16 - (bytes.length % 16)
  const out = bytes.slice()

  for (let i = 0; i < pad; i++) {
    out.push(pad)
  }

  return out
}

/**
 * 字节数组转 Base64
 *
 * @param bytes 字节数组
 * @return Base64 字符串
 * @author Kai
 * @date 2026/11/19 18:57
 */
function base64Encode(bytes) {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  let out = ""

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (b0 << 16) | (b1 << 8) | b2

    out += table[(n >> 18) & 63]
    out += table[(n >> 12) & 63]
    out += i + 1 < bytes.length ? table[(n >> 6) & 63] : "="
    out += i + 2 < bytes.length ? table[n & 63] : "="
  }

  return out
}

/**
 * GF(2^8) 乘法
 *
 * @param a 乘数
 * @param b 乘数
 * @return 乘积
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesMul(a, b) {
  let product = 0

  for (let i = 0; i < 8; i++) {
    if (b & 1) {
      product ^= a
    }

    const hi = a & 0x80
    a = (a << 1) & 0xff

    if (hi) {
      a ^= 0x1b
    }

    b >>= 1
  }

  return product & 0xff
}

/**
 * AES 字节代换
 *
 * @param word 4 字节
 * @return 代换后的 4 字节
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesSubWord(word) {
  return [AES_SBOX[word[0]], AES_SBOX[word[1]], AES_SBOX[word[2]], AES_SBOX[word[3]]]
}

/**
 * AES 字循环
 *
 * @param word 4 字节
 * @return 循环后的 4 字节
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesRotWord(word) {
  return [word[1], word[2], word[3], word[0]]
}

/**
 * 扩展 AES-256 轮密钥
 *
 * @param key 32 字节密钥
 * @return 60 个 4 字节轮密钥字
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesExpandKey(key) {
  const keyWords = 8
  const words = new Array(60)

  for (let i = 0; i < keyWords; i++) {
    words[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]]
  }

  for (let i = keyWords; i < words.length; i++) {
    let temp = words[i - 1].slice()

    if (i % keyWords === 0) {
      temp = aesSubWord(aesRotWord(temp))
      temp[0] ^= AES_RCON[i / keyWords]
    } else if (i % keyWords === 4) {
      temp = aesSubWord(temp)
    }

    const prev = words[i - keyWords]
    words[i] = [
      prev[0] ^ temp[0],
      prev[1] ^ temp[1],
      prev[2] ^ temp[2],
      prev[3] ^ temp[3]
    ]
  }

  return words
}

/**
 * 轮密钥加
 *
 * @param state 16 字节状态
 * @param words 轮密钥
 * @param round 轮次
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesAddRoundKey(state, words, round) {
  for (let col = 0; col < 4; col++) {
    const word = words[round * 4 + col]

    for (let row = 0; row < 4; row++) {
      state[row + 4 * col] ^= word[row]
    }
  }
}

/**
 * 状态字节代换
 *
 * @param state 16 字节状态
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesSubBytes(state) {
  for (let i = 0; i < 16; i++) {
    state[i] = AES_SBOX[state[i]]
  }
}

/**
 * 行移位
 *
 * @param state 16 字节状态
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesShiftRows(state) {
  const snapshot = state.slice()

  for (let row = 1; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      state[row + 4 * col] = snapshot[row + 4 * ((col + row) % 4)]
    }
  }
}

/**
 * 列混合
 *
 * @param state 16 字节状态
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesMixColumns(state) {
  for (let col = 0; col < 4; col++) {
    const index = 4 * col
    const a0 = state[index]
    const a1 = state[index + 1]
    const a2 = state[index + 2]
    const a3 = state[index + 3]

    state[index] = aesMul(a0, 2) ^ aesMul(a1, 3) ^ a2 ^ a3
    state[index + 1] = a0 ^ aesMul(a1, 2) ^ aesMul(a2, 3) ^ a3
    state[index + 2] = a0 ^ a1 ^ aesMul(a2, 2) ^ aesMul(a3, 3)
    state[index + 3] = aesMul(a0, 3) ^ a1 ^ a2 ^ aesMul(a3, 2)
  }
}

/**
 * 加密一个 16 字节分组
 *
 * @param block 16 字节明文分组
 * @param words 轮密钥
 * @return 16 字节密文分组
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesEncryptBlock(block, words) {
  const state = block.slice()
  const rounds = 14

  aesAddRoundKey(state, words, 0)

  for (let round = 1; round < rounds; round++) {
    aesSubBytes(state)
    aesShiftRows(state)
    aesMixColumns(state)
    aesAddRoundKey(state, words, round)
  }

  aesSubBytes(state)
  aesShiftRows(state)
  aesAddRoundKey(state, words, rounds)

  return state
}

/**
 * AES-256-CBC 加密
 *
 * @param data 已填充的明文字节
 * @param key 32 字节密钥
 * @param iv 16 字节初始向量
 * @return 密文字节
 * @author Kai
 * @date 2026/11/19 18:57
 */
function aesCbcEncrypt(data, key, iv) {
  const words = aesExpandKey(key)
  const out = []
  let prev = iv.slice()

  for (let offset = 0; offset < data.length; offset += 16) {
    const block = []

    for (let i = 0; i < 16; i++) {
      block[i] = data[offset + i] ^ prev[i]
    }

    prev = aesEncryptBlock(block, words)

    for (let i = 0; i < 16; i++) {
      out.push(prev[i])
    }
  }

  return out
}


// ==================== 获取打卡摘要 ====================

/**
 * 查询并保存指定业务日期的考勤摘要，默认查询今天
 *
 * @param day 查询日，按手机本地日期处理
 * @return 考勤摘要或查询失败原因
 * @author Kai
 * @date 2026/11/24 16:26
 */
async function getAttendanceSummary(day = new Date()) {
  now = new Date()
  const dateKey = formatDateKey(day)
  try {
    const raw = await fetchAttendance(dateKey)
    now = new Date()
    const data = normalizeAttendanceData(raw, dateKey)

    // 历史接口若明确返回其他业务日期，不能把那天的考勤保存到查询日。
    if (dateKey !== formatDateKey(now)
        && String(data.date).replace(/\//g, "-").slice(0, 10) !== dateKey) {
      throw new Error("考勤返回日期与查询日期不一致")
    }

    if (data.ok) {
      data.snapshotUpdatedAt = new Date().toISOString()
      saveAttendanceSnapshot(data, day)
      if (data.hasOutRecord) {
        try {
          if (data.targetReached && Keychain.contains(missedCheckoutKey(dateKey))) Keychain.remove(missedCheckoutKey(dateKey))
          if (dateKey === formatDateKey(now)) await Notification.removePending(["attendance-helper-checkout-due", "attendance-helper-upcoming-work"])
        } catch (_) {}
      }
      if(dateKey===formatDateKey(now) && ((data.hasOutRecord && data.targetReached)||confirmedMissedCheckout(dateKey))) {clearCheckoutSnooze(); await cancelCheckoutEscalation()}
    }

    return data
  } catch (e) {
    return {
      ok: false,
      error: String(e && e.message ? e.message : e)
    }
  }
}

/**
 * 保存小组件展示所需字段，不保存完整原始响应
 *
 * @param data 标准化打卡摘要
 * @param day 快照对应的考勤业务日期
 * @author Kai
 * @date 2026/11/25 10:53
 */
function saveAttendanceSnapshot(data, day) {
  if (!data || !data.ok) {
    return
  }

  const snapshot = {
    savedAt: data.snapshotUpdatedAt || new Date().toISOString(),
    date: formatDateKey(day),
    personName: data.personName || "",
    orgName: data.orgName || "",
    shiftName: data.shiftName || "",
    inTime: data.inTime ? data.inTime.toISOString() : null,
    // 保留原始离场记录，次日回看时仍可按原始工卡结算。
    latestOutTime: data.outSwipeTime ? data.outSwipeTime.toISOString() : null,
    inStatusDesc: data.inStatusDesc || "",
    outStatusDesc: data.outSwipeStatus || ""
  }

  try {
    // 历史补查不覆盖当天小组件的离线快照。
    if (snapshot.date === formatDateKey(now)) {
      Keychain.set(CONFIG.ATTENDANCE_CACHE_KEY, JSON.stringify(snapshot))
    }
  } catch (e) {
    // 缓存失败不影响这次真实查询
  }

    try {
        // 完整日期作为文件名，跨周仍可复用同一天的记录。
        const { files, directory } = attendanceHistoryStorage()
        if (!files.fileExists(directory)) {
            files.createDirectory(directory, true)
        }
        files.writeString(files.joinPath(directory, snapshot.date + ".json"), JSON.stringify({
            ...snapshot,
            owner: CONFIG.USERNAME
        }))
    } catch (e) {
        // 锁屏或文件暂不可用时仍返回接口结果。
    }
}

/**
 * 小组件读取今天的快照，并按本次运行时刻重算工时
 *
 * @return 打卡摘要。没有今天的快照时 ok 为 false
 * @author Kai
 * @date 2026/11/19 20:50
 */
function loadCachedAttendanceSummary() {
  try {
    if (!Keychain.contains(CONFIG.ATTENDANCE_CACHE_KEY)) {
      return {
        ok: false,
        cacheMiss: true,
        error: "暂无缓存，请运行“更新打卡小组件”"
      }
    }

    const snapshot = JSON.parse(Keychain.get(CONFIG.ATTENDANCE_CACHE_KEY))
    if (!snapshot || !snapshot.date) {
      return {
        ok: false,
        cacheMiss: true,
        error: "本地缓存无效，请运行“更新打卡小组件”"
      }
    }

    const snapshotDate = String(snapshot.date).split("/").join("-").slice(0, 10)
    if (snapshotDate !== formatDateKey(now)) {
      return {
        ok: false,
        cacheMiss: true,
        error: "缓存日期为 " + snapshot.date + "，请触发一次更新"
      }
    }

    const raw = {
      date: snapshotDate,
      personName: snapshot.personName || "",
      orgName: snapshot.orgName || "",
      shiftName: snapshot.shiftName || "",
      clockInTime: snapshot.inTime || null,
      clockOffTime: snapshot.latestOutTime || null,
      inStatusDesc: snapshot.inStatusDesc || "",
      outStatusDesc: snapshot.outStatusDesc || ""
    }

    const data = normalizeAttendanceData(raw)
    if (data.ok) {
      data.snapshotUpdatedAt = snapshot.savedAt || null
      data.isCached = true
    }
    return data
  } catch (e) {
    return {
      ok: false,
      cacheMiss: true,
      error: "读取本地缓存失败：" + String(e && e.message ? e.message : e)
    }
  }
}

/**
 * 快照写入时间，显示成小时和分钟
 *
 * @param data 打卡摘要
 * @return 时间文本
 * @author Kai
 * @date 2026/11/19 20:50
 */
function getSnapshotUpdatedText(data) {
  if (!data || !data.snapshotUpdatedAt) {
    return "--"
  }

  const date = new Date(data.snapshotUpdatedAt)
  return isNaN(date.getTime()) ? "--" : formatTime(date)
}


// ==================== 解析接口数据 ====================

/**
 * 判断离场刷脸是否可用于考勤结算
 *
 * @param inTime 首张上班卡时间
 * @param outTime 接口返回的离场刷脸时间
 * @param today 是否为今天的考勤
 * @return 可用于结算的下班卡时间或 null
 * @author Kai
 * @date 2026/11/25 10:52
 */
function resolveAttendanceCheckout(inTime, outTime, today) {
    if (!today || !inTime || !outTime) {
        return outTime
    }
    // 目标时刻前的门禁刷脸也可能是短暂外出，不能结束今日考勤。
    const targetTimeMs = inTime.getTime() + CONFIG.TARGET_HOURS * 3600000
    return outTime.getTime() >= targetTimeMs && outTime <= now ? outTime : null
}

/**
 * 解析考勤响应，使用查询日补全只含时分秒的打卡时间
 *
 * @param raw 考勤接口响应或缓存还原的数据
 * @param dateHint 响应没有业务日期时使用的日期，格式为 yyyy-MM-dd
 * @return 标准化考勤摘要
 * @author Kai
 * @date 2026/11/25 10:52
 */
function normalizeAttendanceData(raw, dateHint = formatDateKey(now)) {
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
  ]) || dateHint

  const clockInRaw = deepPick(root, [
    "clockInTime",
    "inTime",
    "onClockTime",
    "onTime",
    "startTime",
    "checkInTime",
    "signInTime"
  ])

  // 班次未打卡标志优先，避免把计划下班时间当成刷脸记录。
  const shift = (root.dailyDetail || root).shiftDetails?.[0]
  const offClocked = shift?.offClocked
  const latestOutRaw = [false, 0, "0"].includes(offClocked) ? null : deepPick(root, [
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

  // 原始离场状态写入快照，今日界面仅展示已认定的下班状态。
  const outSwipeStatus = deepPick(root, [
    "outStatusDesc",
    "clockOffStatusDesc",
    "clockOutStatusDesc",
    "offStatusDesc",
    "outStatus",
    "clockOutStatusName",
    "signOutStatusDesc"
  ]) || ""

  const inTime = parseAnyDateTime(clockInRaw, dateStr)
  const outSwipeTime = parseAnyDateTime(latestOutRaw, dateStr)
  const today = String(dateStr).replace(/\//g, "-").slice(0, 10) === formatDateKey(now)
  const latestOutTime = resolveAttendanceCheckout(inTime, outSwipeTime, today)
  const outStatusDesc = today && inTime && !latestOutTime ? "" : outSwipeStatus

  const hasClockIn = !!inTime
  const hasOutRecord = !!latestOutTime

  const targetMs = CONFIG.TARGET_HOURS * 60 * 60 * 1000

  let currentWorkMs = 0
  let latestOutWorkMs = 0
  let targetTime = null

  // 没打下班卡时不累计工时。倒计时只算到应走时间，到点后剩余为 0。
  let remainingMs = 0

  if (hasClockIn) {
    targetTime = new Date(inTime.getTime() + targetMs)

    if (hasOutRecord) {
      // 已打下班卡：工时固定为下班卡减上班卡
      latestOutWorkMs = Math.max(
          0,
          latestOutTime.getTime() - inTime.getTime()
      )
      currentWorkMs = latestOutWorkMs
      if (currentWorkMs < targetMs) {
        remainingMs = targetMs - currentWorkMs
      }
    } else if (now.getTime() < targetTime.getTime()) {
      remainingMs = targetTime.getTime() - now.getTime()
    }
  }

  const targetReached = hasClockIn && remainingMs <= 0 && (
      hasOutRecord
          ? currentWorkMs >= targetMs
          : !!(targetTime && now.getTime() >= targetTime.getTime())
  )

  const remainingMinutes = remainingMs > 0
      ? Math.ceil(remainingMs / 1000 / 60)
      : 0

  const countdownText = !hasClockIn
      ? "--"
      : remainingMs > 0
          ? formatCountdown(remainingMs)
          : hasOutRecord ? "考勤正常" : "未打下班卡"

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
    outSwipeTime,
    outSwipeStatus,

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

function attendanceCheckResultText(data) {
    if (!data?.ok) return "检查失败：" + managementErrorText(data?.error || "未知错误")
    if (data.isRestDay) return "休息日"
    if (!data.hasClockIn) return "未检测到上班卡"
    if (missingCheckout(data)) return confirmedMissedCheckout() ? "已确认漏卡 · 本机已记录" : "⚠ 未打下班卡，请立即打卡"
    if (data.hasOutRecord) return data.targetReached ? "考勤正常 · 已打下班卡" : "已打下班卡 · 工时不足"
    return "工作中 · 还差 " + formatRemainText(data.remainingMinutes)
}

// 离开公司时只对已经到点且尚未打卡的情况升级提醒。
function leaveCheckStatus(data) {
  if (!data?.ok) return "check_failed"
  if (data.isRestDay) return "rest_day"
  if (!data.hasClockIn) return "no_clock_in"
  if (missingCheckout(data)) return confirmedMissedCheckout() ? "missed_confirmed" : checkoutSnoozed() ? "snoozed" : "missing_checkout"
  if (data.hasOutRecord && data.targetReached) return "completed"
  return "before_target"
}
function checkoutSnoozeKey(day = formatDateKey(now)) {
  return "attendance-checkout-snooze:"+CONFIG.USERNAME+":"+day
}
function checkoutSnoozed() {
  return !!CONFIG.USERNAME && Number(readKeychainValue(checkoutSnoozeKey())||0)>Date.now()
}
function clearCheckoutSnooze() {
  const key=checkoutSnoozeKey()
  if(Keychain.contains(key)) Keychain.remove(key)
}
function checkoutShortcutOutput(data, action) {
  const status=data?.decisionStatus || leaveCheckStatus(data)
  const resolved=status==="completed" || status==="missed_confirmed"
  const focusAction=resolved?"off":status==="missing_checkout" && ["leave","recheck","check"].includes(action)?"on":"keep"
  const message=status==="snoozed"?"已暂停强提醒，5分钟后请重新检查":status==="missed_confirmed"?"已确认漏卡 · 本机已记录":attendanceCheckResultText(data)
  return {ok:!!data?.ok,status,message,focusAction,requiresAction:status==="missing_checkout",shouldLock:status==="missing_checkout" && action==="leave"}
}
function checkoutEscalationIds() {
  return [0,1,3,5,"snooze"].map(m => "attendance-helper-leave-alert-"+m)
}
async function handleCheckoutDecision(action) {
  if(!CONFIG.USERNAME) return {ok:false,error:"请先配置账号"}
  now=new Date()
  const day=formatDateKey(now)
  let data=await getAttendanceSummary()
  // 手动确认可使用当天已有快照，但绝不把网络故障当作打卡成功。
  if(!data.ok) {
    const cached=loadCachedAttendanceSummary()
    if(cached.ok && String(cached.date).replace(/\\//g,"-").slice(0,10)===day && missingCheckout(cached)) data=cached
  }
  if(formatDateKey(new Date())!==day) return {ok:false,error:"日期已变化，请重新操作"}
  if(data.ok && data.hasOutRecord && data.targetReached) { await cancelCheckoutEscalation(); clearCheckoutSnooze(); return data }
  if(confirmedMissedCheckout(day)) {
    await cancelCheckoutEscalation(); clearCheckoutSnooze()
    return {...data,ok:true,decisionStatus:"missed_confirmed"}
  }
  if(!missingCheckout(data)) return {ok:false,error:data.ok?"当前没有待确认的下班漏卡":data.error}
  if(action==="confirm_missed") {
    Keychain.set(missedCheckoutKey(day),"1")
    clearCheckoutSnooze()
    await cancelCheckoutEscalation()
    try {await Notification.removePending(["attendance-helper-checkout-due","attendance-helper-upcoming-work"])} catch (_) {}
    return {...data,decisionStatus:"missed_confirmed"}
  }
  const until=Date.now()+5*60000
  await cancelCheckoutEscalation()
  const n=new Notification()
  n.identifier="attendance-helper-leave-alert-snooze"
  n.title="🚨 请重新确认下班卡"
  n.body="暂停提醒已结束，请检查打卡；无法返回时可确认漏卡。"
  n.sound="alert"
  n.openURL="scriptable:///run?scriptName=AttendanceHelper&mode=manage"
  n.setTriggerDate(new Date(until))
  await n.schedule()
  Keychain.set(checkoutSnoozeKey(day),String(until))
  return {...data,decisionStatus:"snoozed"}
}
async function cancelCheckoutEscalation() {
  try { await Notification.removePending(checkoutEscalationIds()) } catch (_) {}
  try { await Notification.removeDelivered(checkoutEscalationIds()) } catch (_) {}
}
async function scheduleCheckoutEscalation(data) {
  await cancelCheckoutEscalation()
  const start=Date.now()
  for (const minutes of [0,1,3,5]) {
    const at=new Date(start+minutes*60000)
    // 避免把当天的漏卡通知延续到第二天。
    if (formatDateKey(at)!==formatDateKey(now)) continue
    const n=new Notification()
    n.identifier="attendance-helper-leave-alert-"+minutes
    n.title=minutes===0 ? "🚨 请立即返回打下班卡！" : "🚨 下班卡仍需确认"
    n.body=minutes===0 ? "已到下班时间，未检测到有效下班卡。"+formatNotifyTimes(data) : "请检查最新打卡结果；如已打卡，请刷新考勤以停止提醒。"
    n.sound="alert"
    n.openURL="scriptable:///run?scriptName=AttendanceHelper&mode=manage"
    if(minutes) n.setTriggerDate(at)
    await n.schedule()
  }
}
async function handleLeaveCompany(existingData, escalate = true) {
  const data = existingData || await getAttendanceSummary()
  const state=leaveCheckStatus(data)
  if(state==="check_failed") {
    // 查询失败不等于漏卡：只发检查失败通知，不触发强提醒。
    await notify("打卡检查失败，请手动确认", data.error)
  } else if(state==="missing_checkout") {
    if(escalate) await scheduleCheckoutEscalation(data)
    else await notifyBrief("⚠ 未打下班卡！请立即打卡",formatNotifyTimes(data))
  } else if(state==="completed" || state==="missed_confirmed") {
    clearCheckoutSnooze()
    await cancelCheckoutEscalation()
  }
  // 未达到下班时间、无上班卡、已完成或已确认漏卡时静默返回。
  return data
}

// ==================== 功能 2：预约快满 9 小时提醒 ====================

/**
 * 读取本机的小组件主题和提前提醒设置。
 *
 * @return 经校验的考勤偏好设置
 * @author Kai
 * @date 2026/11/25 11:47
 */
function readAttendancePreferences() {
    const saved = readAttendanceRecord("attendance-helper-preferences-v1") || {}
    const styles = ["cyber", "fitness", "minimal", "heatmap"]
    return {
        theme: ["navy", "teal", "slate"].includes(saved.theme) ? saved.theme : "navy",
        remindMinutes: [0, 5, 15, 30, 45, 60].includes(saved.remindMinutes)
            ? saved.remindMinutes : CONFIG.NEAR_MINUTES,
        // 旧版偏好自动迁移：不同尺寸各有默认风格，用户可独立调整。
        widgetStyleSmall: styles.includes(saved.widgetStyleSmall) ? saved.widgetStyleSmall : "minimal",
        widgetStyleMedium: styles.includes(saved.widgetStyleMedium) ? saved.widgetStyleMedium : "fitness",
        widgetStyleLarge: styles.includes(saved.widgetStyleLarge) ? saved.widgetStyleLarge : "heatmap"
    }
}

/**
 * 读取考勤核查页与桌面状态格共用的主题颜色。
 *
 * @return 标题底色、强调色与日历浅底色
 * @author Kai
 * @date 2026/11/25 12:14
 */
function attendancePalette() {
    const palettes = {
        navy: { ink: "#213C62", accent: "#528AD9", paper: "#EEF4FC" },
        teal: { ink: "#184C49", accent: "#3A9D90", paper: "#E9F6F3" },
        slate: { ink: "#414450", accent: "#868A9F", paper: "#F0F0F5" }
    }
    return palettes[readAttendancePreferences().theme]
}

/**
 * 保存考勤配置，并在提醒时间变化时重排通知。
 *
 * @param next 更新后的本机偏好
 * @param previous 保存前的偏好
 * @author Kai
 * @date 2026/11/25 13:01
 */
async function saveAttendancePreferences(next, previous) {
    Keychain.set("attendance-helper-preferences-v1", JSON.stringify(next))
    if (next.remindMinutes === previous.remindMinutes) return

    // 清理同一业务日的预约，然后按新的提前量安排提醒。
    await Notification.removePending(["attendance-helper-upcoming-work"])
    const key = "schedule9-" + formatDateKey(now)
    if (Keychain.contains(key)) Keychain.remove(key)
    await handleScheduleNineHours()
}

/**
 * 为今日尚在工作的用户预约达到目标工时前的通知
 *
 * @author Kai
 * @date 2026/11/24 17:55
 */
async function handleScheduleNineHours(existingData) {
    now = new Date()
    const minutes = readAttendancePreferences().remindMinutes
    if (!(await isChinaWorkday(now))) return {ok:true,isRestDay:true}

  const data = existingData || await getAttendanceSummary()

  if (!data.ok) {
    await notify("工时提醒失败", data.error)
    return data
  }

  if (!data.hasClockIn) {
    await notifyBrief("未打卡", "今天还没有上班记录")
    return data
  }

  if (data.hasOutRecord) {
    await Notification.removePending(["attendance-helper-checkout-due"])
    return data
  }
  if (missingCheckout(data)) {
    await handleNearNineHours(data)
    return data
  }
  // 到点提醒独立于提前提醒开关；仅提示检查，不假定实时接口结果。
  const due = new Notification()
  due.identifier = "attendance-helper-checkout-due"
  due.title = "⚠ 下班时间到了，请确认下班卡"
  due.subtitle = "请立即打卡并刷新考勤确认，不要仅看工时。"
  due.sound = "default"
  due.setTriggerDate(data.targetTime)
  await due.schedule()
  if (!minutes) return data

  const remindTime = new Date(
      data.inTime.getTime() +
      (CONFIG.TARGET_HOURS * 60 - minutes) * 60 * 1000
  )

  const key = "schedule9-" + formatDateKey(now)

  if (Keychain.contains(key)) {
    return data
  }

  if (remindTime <= new Date()) {
    await notifyBrief(
        formatRemainTitle(data.remainingMinutes),
        formatNotifyTimes(data)
    )
  } else {
    const n = new Notification()
    n.identifier = "attendance-helper-upcoming-work"
    n.title = formatRemainTitle(minutes)
    n.subtitle = formatNotifyTimes(data)
    n.sound = "default"
    n.setTriggerDate(remindTime)
    await n.schedule()
  }

  Keychain.set(key, "1")
  return data
}


// ==================== 功能 3：定时检查是否快满 9 小时 ====================

/**
 * 在定时检查中补发提前通知或到点通知
 *
 * @author Kai
 * @date 2026/11/24 17:55
 */
async function handleNearNineHours(existingData) {
  now = new Date()
  if (!(await isChinaWorkday(now))) return {ok:true,isRestDay:true}
  const data = existingData || await getAttendanceSummary()

  if (!data.ok || !data.hasClockIn) return data

  if (data.targetReached || missingCheckout(data)) {
    if (missingCheckout(data) && checkoutSnoozed()) return data
    if (data.hasOutRecord) await Notification.removePending(["attendance-helper-checkout-due"])
    const key = "targetReached-" + CONFIG.USERNAME + ":" + formatDateKey(now) + (data.hasOutRecord ? "-done" : confirmedMissedCheckout() ? "-confirmed-missed" : "-missing")

    if (!Keychain.contains(key)) {
      await notifyBrief(
          data.hasOutRecord ? "考勤正常 · 已打下班卡" : (confirmedMissedCheckout() ? "⚠ 已确认漏卡 · 已使用一次漏卡机会" : "⚠ 未打下班卡！请立即打卡"),
          formatNotifyTimes(data)
      )

      Keychain.set(key, "1")
    }

    return data
  }

  // 已成功预约提前通知时，让 iOS 投递，避免定时检查重复提醒。
  if (
      !Keychain.contains("schedule9-" + formatDateKey(now)) &&
      !data.hasOutRecord &&
      data.remainingMinutes <= readAttendancePreferences().remindMinutes &&
      data.remainingMinutes > 0
  ) {
    const key = "near9-" + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notifyBrief(
          formatRemainTitle(data.remainingMinutes),
          formatNotifyTimes(data)
      )

      Keychain.set(key, "1")
    }
  }
  return data
}


// ==================== 小组件多风格渲染 ====================

function widgetStyleKey(family) {
    if (family === "small") return "widgetStyleSmall"
    if (family === "large" || family === "extraLarge") return "widgetStyleLarge"
    return "widgetStyleMedium"
}

function widgetStyleForFamily(family, override) {
    if (WIDGET_STYLE_IDS.includes(override)) return override
    const preferences = readAttendancePreferences()
    return preferences[widgetStyleKey(family)] || WIDGET_STYLE_DEFAULTS[family] || "fitness"
}

function widgetStylePalette(style) {
    const palettes = {
        cyber: {
            background: "#071321", background2: "#102B42", text: "#F2FAFF",
            muted: "#91AFC3", accent: "#54E6DC", accent2: "#A8FF75",
            track: "#203B50", cell: "#10283B", good: "#39C7A2",
            warning: "#E6AD54", abnormal: "#D96A69", neutral: "#344C60"
        },
        fitness: {
            background: "#0C1017", background2: "#151E29", text: "#F5F7FA",
            muted: "#98A5B4", accent: "#B9F36A", accent2: "#63B9FF",
            track: "#2B3540", cell: "#18222D", good: "#65D5A6",
            warning: "#F2B75E", abnormal: "#F17B72", neutral: "#354252"
        },
        minimal: {
            background: "#F2F2EC", background2: "#E7E8E0", text: "#171A18",
            muted: "#777D77", accent: "#222824", accent2: "#5C665E",
            track: "#D7D9D0", cell: "#E5E7DF", good: "#AFC7B6",
            warning: "#E7D4AC", abnormal: "#D9B6B0", neutral: "#D6D9D1"
        },
        heatmap: {
            background: "#0C1724", background2: "#15283A", text: "#F3F7FB",
            muted: "#92A7BA", accent: "#53D6D0", accent2: "#A7F0A1",
            track: "#263A4C", cell: "#172A3B", good: "#26715E",
            warning: "#A16530", abnormal: "#A84747", neutral: "#344A60"
        }
    }
    return palettes[style] || palettes.fitness
}

function applyWidgetStyleBackground(widget, style) {
    const p = widgetStylePalette(style)
    if (style === "cyber" || style === "heatmap") {
        const gradient = new LinearGradient()
        gradient.startPoint = new Point(0, 0)
        gradient.endPoint = new Point(1, 1)
        gradient.locations = [0, 1]
        gradient.colors = [new Color(p.background2), new Color(p.background)]
        widget.backgroundGradient = gradient
    } else {
        widget.backgroundColor = new Color(p.background)
    }
}

function widgetWorkProgress(data) {
    if (!data || !data.ok || !data.hasClockIn || !data.inTime) return 0
    const start = data.inTime.getTime()
    const target = data.targetTime ? data.targetTime.getTime() : start + CONFIG.TARGET_HOURS * 3600000
    const end = data.hasOutRecord && data.latestOutTime ? data.latestOutTime.getTime() : Date.now()
    return Math.max(0, Math.min(1, (end - start) / Math.max(1, target - start)))
}

function widgetElapsedText(data) {
    if (!data || !data.ok) return "需更新"
    if (!data.hasClockIn || !data.inTime) return "未打卡"
    const end = data.hasOutRecord && data.latestOutTime ? data.latestOutTime : now
    return formatShortDuration(Math.max(0, end.getTime() - data.inTime.getTime()))
}

function missedCheckoutKey(day) { return "attendance-missed-checkout:" + CONFIG.USERNAME + ":" + day }
function confirmedMissedCheckout(day = formatDateKey(now)) { return !!CONFIG.USERNAME && readKeychainValue(missedCheckoutKey(day)) === "1" }
function checkoutWarningTitle(data) { return confirmedMissedCheckout() && missingCheckout(data) ? "已确认漏卡" : "未打下班卡" }
function missingCheckout(data) {
    return !!(data && data.ok && data.hasClockIn && !data.hasOutRecord && (data.targetReached || (data.targetTime && Date.now() >= data.targetTime.getTime())))
}

function widgetStatusText(data) {
    if (data && data.isRestDay) return "休息日"
    if (!data || !data.ok) return data && data.cacheMiss ? "需要更新" : "数据暂不可用"
    if (!data.hasClockIn) return "等待上班卡"
    if (data.targetReached && data.hasOutRecord) return "今日工时已达标"
    if (missingCheckout(data)) return checkoutWarningTitle(data) + "！"
    return "距离达标还差 " + formatRemainText(data.remainingMinutes || 0)
}

function addStyledHeader(widget, label, p) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    const title = row.addText(label)
    title.font = Font.boldSystemFont(10)
    title.textColor = new Color(p.muted)
    title.lineLimit = 1
    row.addSpacer()
    const stamp = row.addText(formatTime(now))
    stamp.font = Font.mediumSystemFont(9)
    stamp.textColor = new Color(p.muted)
    stamp.lineLimit = 1
}

function addStyledProgress(parent, data, width, p, height = 5) {
    const track = parent.addStack()
    track.layoutHorizontally()
    track.backgroundColor = new Color(p.track)
    track.cornerRadius = Math.ceil(height / 2)
    track.size = new Size(width, height)
    const progress = data && data.ok ? widgetWorkProgress(data) : 0
    const fillWidth = Math.max(0, Math.min(width, Math.round(width * progress)))
    if (fillWidth > 0) {
        const fill = track.addStack()
        fill.backgroundColor = new Color(missingCheckout(data) ? "#EF4444" : p.accent)
        fill.cornerRadius = Math.ceil(height / 2)
        fill.size = new Size(fillWidth, height)
    }
    if (fillWidth < width) track.addSpacer(width - fillWidth)
}

function addStyledInfoRow(parent, items, width, p, height = 42) {
    const row = parent.addStack()
    row.layoutHorizontally()
    row.spacing = 6
    const cellWidth = Math.floor((width - 12) / 3)
    items.forEach((item, index) => {
        const cell = row.addStack()
        cell.layoutVertically()
        cell.backgroundColor = new Color(p.cell)
        cell.cornerRadius = 8
        cell.setPadding(5, 7, 5, 7)
        cell.size = new Size(index === 2 ? width - 12 - cellWidth * 2 : cellWidth, height)
        const label = cell.addText(item[0])
        label.font = Font.systemFont(9)
        label.textColor = new Color(p.muted)
        label.lineLimit = 1
        cell.addSpacer(2)
        const value = cell.addText(item[1])
        value.font = Font.boldSystemFont(13)
        value.textColor = new Color(p.text)
        value.lineLimit = 1
        value.minimumScaleFactor = 0.65
    })
}

function fitnessPunchProgress(data) {
    if (!data || !data.ok) return 0
    if (data.hasOutRecord) return 1
    return data.hasClockIn ? 0.5 : 0
}

function createFitnessRingsImage(data, size, workProgressOverride, punchProgressOverride) {
    const context = new DrawContext()
    context.size = new Size(size, size)
    context.opaque = false
    context.respectScreenScale = true
    const palette = widgetStylePalette("fitness")
    const workProgress = Number.isFinite(workProgressOverride)
        ? Math.max(0, Math.min(1, workProgressOverride))
        : widgetWorkProgress(data)
    const punchProgress = Number.isFinite(punchProgressOverride)
        ? Math.max(0, Math.min(1, punchProgressOverride))
        : fitnessPunchProgress(data)
    // 外环：工时目标完成度；内环：上下班两次打卡的完成度（各占 50%）。
    const specs = [
        { inset: 4, width: 7, progress: workProgress, color: missingCheckout(data) && !Number.isFinite(workProgressOverride) ? "#EF4444" : palette.accent },
        { inset: 17, width: 6, progress: punchProgress, color: missingCheckout(data) && !Number.isFinite(punchProgressOverride) ? "#EF4444" : palette.accent2 }
    ]
    for (const spec of specs) {
        const rect = new Rect(spec.inset, spec.inset, size - spec.inset * 2, size - spec.inset * 2)
        context.setStrokeColor(new Color("#2B3540"))
        context.setLineWidth(spec.width)
        context.strokeEllipse(rect)
        if (spec.progress <= 0) continue
        const cx = size / 2, cy = size / 2
        const radius = (size - spec.inset * 2) / 2
        const start = -Math.PI / 2
        const end = start + Math.PI * 2 * spec.progress
        const steps = Math.max(2, Math.ceil(72 * spec.progress))
        const path = new Path()
        for (let i = 0; i <= steps; i++) {
            const angle = start + (end - start) * i / steps
            const point = new Point(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
            if (i === 0) path.move(point)
            else path.addLine(point)
        }
        context.addPath(path)
        context.setStrokeColor(new Color(spec.color))
        context.setLineWidth(spec.width)
        context.strokePath()
    }
    return context.getImage()
}

function addFitnessRing(parent, data, size, workProgressOverride, punchProgressOverride) {
    const image = parent.addImage(createFitnessRingsImage(data, size, workProgressOverride, punchProgressOverride))
    image.imageSize = new Size(size, size)
    image.resizable = false
    image.centerAlignImage()
}

function addFitnessMetricLine(parent, labelText, valueText, width, color, fontSize = 9) {
    const row = parent.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.size = new Size(width, fontSize + 5)
    const dot = row.addStack()
    dot.backgroundColor = new Color(color)
    dot.cornerRadius = 3
    dot.size = new Size(6, 6)
    row.addSpacer(4)
    const label = row.addText(labelText)
    label.font = Font.mediumSystemFont(fontSize)
    label.textColor = new Color("#98A5B4")
    label.lineLimit = 1
    row.addSpacer()
    const value = row.addText(valueText)
    value.font = Font.mediumSystemFont(fontSize)
    value.textColor = new Color("#F5F7FA")
    value.lineLimit = 1
    value.minimumScaleFactor = 0.55
}

function addFitnessProgressTrack(parent, width, progress, color, height = 4) {
    const track = parent.addStack()
    track.layoutHorizontally()
    track.backgroundColor = new Color("#2B3540")
    track.cornerRadius = Math.ceil(height / 2)
    track.size = new Size(width, height)
    const fillWidth = Math.max(0, Math.min(width, Math.round(width * progress)))
    if (fillWidth > 0) {
        const fill = track.addStack()
        fill.backgroundColor = new Color(color)
        fill.cornerRadius = Math.ceil(height / 2)
        fill.size = new Size(fillWidth, height)
    }
    if (fillWidth < width) track.addSpacer(width - fillWidth)
}


function getWidgetMonthModel(data) {
    const todayKey = formatDateKey(now)
    const current = attendanceMonth()
    const savedMonth = attendanceMonth(readKeychainValue("attendance-widget-month:" + CONFIG.USERNAME))
    const month = savedMonth > current ? current : savedMonth
    const year = month.getFullYear()
    const monthKey = formatDateKey(month).slice(0, 7)
    const holidays = { [year]: readAttendanceRecord("attendance-history-calendar-" + year)?.holidays }
    const checked = data && data.ok ? new Map([[todayKey, data]]) : new Map()
    const weeks = attendanceMonthWeeks(month).map(week => week.map(date => {
        if (!date) return null
        const key = formatDateKey(date)
        return key <= todayKey
            ? buildAttendanceHistoryDay(date, holidays, checked)
            : { key, workday: false, state: "future", workedMs: null, requiredMs: CONFIG.TARGET_HOURS * 3600000 }
    }))
    const days = weeks.flat().filter(Boolean)
    const workdays = days.filter(day => day.workday)
    const settled = workdays.filter(day => Number.isFinite(day.workedMs))
    const averageClock = field => {
        const values = workdays
            .map(day => day[field])
            .filter(value => value && Number.isFinite(value.getTime()))
            .map(value => value.getHours() * 60 + value.getMinutes())
        if (!values.length) return "—"
        const minutes = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) % 1440
        return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0")
    }
    return {
        month, monthKey, weeks, days, workdays,
        normal: workdays.filter(day => day.state === "normal").length,
        warnings: workdays.filter(day => day.state === "warning").length,
        pending: workdays.filter(day => day.state === "neutral").length,
        active: workdays.filter(day => day.state === "active").length,
        average: settled.length
            ? formatShortDuration(settled.reduce((sum, day) => sum + day.workedMs, 0) / settled.length)
            : "—",
        averageIn: averageClock("clockInAt"),
        averageOut: averageClock("clockOutAt")
    }
}
function largeWidgetScale() {
    return Math.max(0.9, Math.min(1.12, homeScreenWidgetWidth("large") / 364))
}

function renderLargeMonthStats(widget, model, width, p, height = 38) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 6
    row.size = new Size(width, height)
    const items = [
        ["本月达标", model.normal + " 天", p.good],
        ["待核查", model.warnings + " 天", p.warning],
        ["平均工时", model.average, p.accent]
    ]
    const cellWidth = Math.floor((width - 12) / 3)
    items.forEach((item, index) => {
        const cell = row.addStack()
        cell.layoutVertically()
        cell.centerAlignContent()
        cell.backgroundColor = new Color(p.cell)
        cell.cornerRadius = 8
        cell.setPadding(5, 6, 5, 6)
        cell.size = new Size(index === 2 ? width - 12 - cellWidth * 2 : cellWidth, height)
        const label = cell.addText(item[0])
        label.font = Font.systemFont(8)
        label.textColor = new Color(p.muted)
        label.lineLimit = 1
        const value = cell.addText(item[1])
        value.font = Font.boldSystemFont(11)
        value.textColor = new Color(item[2])
        value.lineLimit = 1
        value.minimumScaleFactor = 0.65
    })
}

function renderLargeWeekSummary(widget, model, width, p, rowHeight = 17, weekCount = 6) {
    addWidgetSectionTitle(widget, "每周达标情况", p)
    const weeks = model.weeks.slice(-weekCount)
    for (let index = 0; index < weeks.length; index++) {
        const days = weeks[index].filter(day => day && day.workday)
        if (!days.length) continue
        const done = days.filter(day => day.state === "normal").length
        const row = widget.addStack()
        row.layoutHorizontally()
        row.centerAlignContent()
        row.size = new Size(width, rowHeight)
        const label = row.addText(days[0].key.slice(-2) + "—" + days[days.length - 1].key.slice(-2) + "日")
        label.font = Font.systemFont(8)
        label.textColor = new Color(p.muted)
        label.size = new Size(48, rowHeight)
        const barWidth = Math.max(60, width - 112)
        const track = row.addStack()
        track.layoutHorizontally()
        track.centerAlignContent()
        track.backgroundColor = new Color(p.track)
        track.cornerRadius = 4
        track.size = new Size(barWidth, 5)
        const ratio = done / days.length
        if (ratio > 0) {
            const fill = track.addStack()
            fill.backgroundColor = new Color(p.good)
            fill.cornerRadius = 4
            fill.size = new Size(Math.max(2, Math.round(barWidth * ratio)), 5)
        }
        row.addSpacer(5)
        const count = row.addText(done + "/" + days.length)
        count.font = Font.boldSystemFont(8)
        count.textColor = new Color(p.text)
        count.size = new Size(42, rowHeight)
    }
}function renderLargeRecentLogs(widget, model, width, p, count = 4, rowHeight = 20) {
    addWidgetSectionTitle(widget, "最近打卡记录", p)
    const records = model.workdays
        .filter(day => day.clockInAt || Number.isFinite(day.workedMs))
        .slice(-count)
        .reverse()
    if (!records.length) {
        const empty = widget.addText("本月暂无可展示的打卡记录")
        empty.font = Font.systemFont(9)
        empty.textColor = new Color(p.muted)
        return
    }
    const weekdays = ["一", "二", "三", "四", "五", "六", "日"]
    for (const day of records) {
        const row = widget.addStack()
        row.layoutHorizontally()
        row.centerAlignContent()
        row.size = new Size(width, rowHeight)
        const dateCol = row.addStack()
        dateCol.layoutHorizontally()
        dateCol.centerAlignContent()
        dateCol.size = new Size(Math.floor(width * 0.26), rowHeight)
        const date = dateCol.addText(day.key.slice(5).replace("-", "/") + " 周" + (weekdays[day.weekday] || ""))
        date.font = Font.systemFont(rowHeight >= 20 ? 10 : 8)
        date.textColor = new Color(p.muted)
        date.lineLimit = 1
        dateCol.addSpacer(null)
        row.addSpacer(null)
        const times = row.addText(day.clockIn + "  —  " + day.clockOut)
        times.font = Font.mediumSystemFont(rowHeight >= 20 ? 10 : 8)
        times.textColor = new Color(p.text)
        times.lineLimit = 1
        times.minimumScaleFactor = 0.62
        row.addSpacer(null)
        const status = day.state === "normal" ? "达标"
            : day.state === "warning" ? "待核查"
            : day.state === "active" ? "进行中" : "待查"
        const statusCol = row.addStack()
        statusCol.layoutHorizontally()
        statusCol.centerAlignContent()
        statusCol.size = new Size(Math.floor(width * 0.19), rowHeight)
        statusCol.addSpacer(null)
        const badge = statusCol.addText(status)
        badge.font = Font.boldSystemFont(rowHeight >= 20 ? 10 : 8)
        badge.textColor = new Color(day.state === "normal" ? p.good : day.state === "warning" ? p.warning : p.accent)
        badge.lineLimit = 1
        badge.minimumScaleFactor = 0.75
    }
}

function addWidgetSectionTitle(widget, title, p) {
    const label = widget.addText(title)
    label.font = Font.boldSystemFont(9)
    label.textColor = new Color(p.muted)
    label.lineLimit = 1
}


function addWidgetMonthNavigation(widget, model, width, p, label) {
    const header = widget.addStack()
    header.layoutHorizontally()
    header.centerAlignContent()
    header.size = new Size(width, 22)
    const current = attendanceMonth()

    function addArrow(offset) {
        const button = header.addStack()
        button.centerAlignContent()
        button.size = new Size(22, 22)
        const target = new Date(model.month.getFullYear(), model.month.getMonth() + offset, 1)
        if (target.getFullYear() < 2000 || target > current) return
        const key = formatDateKey(target).slice(0, 7)
        const symbol = button.addText(offset < 0 ? "‹" : "›")
        symbol.font = Font.boldSystemFont(18)
        symbol.textColor = new Color(p.accent)
        if (typeof button.setAction === "function" && Number.parseInt(Device.systemVersion(), 10) >= 17) {
            button.setAction(offset < 0 ? "上个月" : "下个月", { id: "attendance-month:" + key })
        } else {
            button.url = getWeeklyAttendanceUrl(key)
        }
    }

    addArrow(-1)
    const center = header.addStack()
    center.layoutHorizontally()
    center.centerAlignContent()
    center.size = new Size(Math.max(90, width - 44), 22)
    const title = center.addText(model.monthKey.replace("-", " / "))
    title.font = Font.boldSystemFont(11)
    title.textColor = new Color(p.text)
    title.lineLimit = 1
    title.url = getWeeklyAttendanceUrl(model.monthKey)
    center.addSpacer()
    const meta = center.addText(label || (model.normal + "/" + model.workdays.length + " OK"))
    meta.font = Font.mediumSystemFont(8)
    meta.textColor = new Color(p.muted)
    meta.lineLimit = 1
    addArrow(1)
}

function widgetDayProgress(day, data) {
    if (!day || !day.workday) return 0
    const required = Number(day.requiredMs) > 0 ? Number(day.requiredMs) : CONFIG.TARGET_HOURS * 3600000
    if (Number.isFinite(day.workedMs)) {
        return Math.max(0, Math.min(1, day.workedMs / Math.max(1, required)))
    }
    if (day.state === "normal") return 1
    if (day.state === "active" && day.key === formatDateKey(now)) return widgetWorkProgress(data)
    return 0
}

function addCyberTimelineEvent(parent, index, label, value, color, p) {
    const row = parent.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    const dot = row.addStack()
    dot.backgroundColor = new Color(color)
    dot.cornerRadius = 3
    dot.size = new Size(6, 6)
    row.addSpacer(6)
    const title = row.addText(index + " / " + label)
    title.font = Font.mediumSystemFont(9)
    title.textColor = new Color(p.muted)
    title.lineLimit = 1
    row.addSpacer()
    const detail = row.addText(value)
    detail.font = Font.boldSystemFont(11)
    detail.textColor = new Color(p.text)
    detail.lineLimit = 1
    detail.minimumScaleFactor = 0.65
}

function renderCyberWeekStrip(widget, data, width, p) {
    addWidgetSectionTitle(widget, "最近 7 天 · 出勤轨迹", p)
    const days = getRecentWidgetDays(data, 7)
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 4
    const cellWidth = Math.max(18, Math.floor((width - 24) / 7))
    const weekdays = ["一", "二", "三", "四", "五", "六", "日"]
    const barHeight = Math.round((width >= 320 ? 32 : 25) * largeWidgetScale())
    for (const day of days) {
        const cell = row.addStack()
        cell.layoutVertically()
        cell.centerAlignContent()
        cell.size = new Size(cellWidth, barHeight + 25)
        const weekday = cell.addText(weekdays[day.weekday] || "·")
        weekday.font = Font.systemFont(8)
        weekday.textColor = new Color(p.muted)
        const track = cell.addStack()
        track.layoutVertically()
        track.backgroundColor = new Color(p.track)
        track.cornerRadius = 4
        track.size = new Size(Math.max(12, cellWidth - 8), barHeight)
        const progress = widgetDayProgress(day, data)
        const fillHeight = progress > 0 ? Math.max(3, Math.round(barHeight * progress)) : 0
        if (fillHeight > 0) {
            track.addSpacer(barHeight - fillHeight)
            const fill = track.addStack()
            fill.backgroundColor = new Color(day.state === "normal" ? p.good
                : day.state === "warning" ? p.warning
                : day.state === "active" ? p.accent
                : p.neutral)
            fill.cornerRadius = 4
            fill.size = new Size(Math.max(12, cellWidth - 8), fillHeight)
        } else {
            track.addSpacer(barHeight)
        }
        const date = cell.addText(day.key.slice(-2))
        date.font = Font.mediumSystemFont(8)
        date.textColor = new Color(p.text)
    }
}function addLargeAttendanceLine(parent, label, value, color, p, width) {
    const row = parent.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    row.backgroundColor = new Color(p.cell)
    row.cornerRadius = 7
    row.setPadding(4, 7, 4, 7)
    row.size = new Size(width, 26)

    const title = row.addText(label)
    title.font = Font.systemFont(9)
    title.textColor = new Color(p.muted)
    title.lineLimit = 1

    row.addSpacer(4)
    const detail = row.addText(value)
    detail.font = Font.boldSystemFont(12)
    detail.textColor = new Color(color || p.text)
    detail.lineLimit = 1
    detail.minimumScaleFactor = 0.62
}

function renderLargeTodayPanel(widget, data, width, p) {
    const scale = largeWidgetScale()
    const panelHeight = Math.round(98 * scale)
    const gap = 8
    const heroWidth = Math.max(122, Math.floor((width - gap) * 0.42))
    const detailWidth = Math.max(120, width - heroWidth - gap)

    const panel = widget.addStack()
    panel.layoutHorizontally()
    panel.spacing = gap
    panel.size = new Size(width, panelHeight)

    const hero = panel.addStack()
    hero.layoutVertically()
    hero.backgroundColor = new Color(p.cell)
    hero.cornerRadius = 11
    hero.setPadding(7, 8, 7, 8)
    hero.size = new Size(heroWidth, panelHeight)

    const kicker = hero.addText(!data || !data.ok || !data.hasClockIn ? "今日状态" : data.hasOutRecord && !data.targetReached ? "工时还差" : "距离可下班")
    kicker.font = Font.boldSystemFont(9)
    kicker.textColor = new Color(p.muted)
    kicker.lineLimit = 1

    let countdown
    if (!data || !data.ok) {
        countdown = hero.addText(data && data.cacheMiss ? "需要更新" : "暂不可用")
    } else if (!data.hasClockIn) {
        countdown = hero.addText("等待上班卡")
    } else if (!data.hasOutRecord && showsLiveCountdown(data)) {
        countdown = addLiveCountdown(hero, data, Font.boldSystemFont(25), p.accent)
    } else {
        countdown = hero.addText(missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : formatRemainCompact(data.remainingMinutes))
    }
    countdown.font = Font.boldSystemFont(25)
    countdown.textColor = new Color(missingCheckout(data) ? "#EF4444" : data && data.ok && data.hasOutRecord && !data.targetReached ? p.warning : p.accent)
    countdown.lineLimit = 1
    countdown.minimumScaleFactor = 0.55

    const caption = hero.addText(!data || !data.ok
        ? "请刷新考勤数据"
        : !data.hasClockIn
            ? "打卡后开始计时"
            : data.hasOutRecord
                ? (data.targetReached ? "今日工时已达标" : "工时尚未达标")
                : data.targetReached
                    ? (confirmedMissedCheckout() ? "已使用一次漏卡机会" : "请立即打下班卡！")
                    : "目标工时 " + CONFIG.TARGET_HOURS + " 小时")
    caption.font = Font.mediumSystemFont(8)
    caption.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.muted)
    caption.lineLimit = 1
    caption.minimumScaleFactor = 0.65

    hero.addSpacer(3)
    addStyledProgress(hero, data, Math.max(30, heroWidth - 16), p, 5)
    hero.addSpacer(3)
    const target = hero.addText(data && data.ok && data.targetTime
        ? "预计可下班  " + formatTime(data.targetTime)
        : "预计可下班  —")
    target.font = Font.boldSystemFont(8)
    target.textColor = new Color(p.text)
    target.lineLimit = 1
    target.minimumScaleFactor = 0.65

    const details = panel.addStack()
    details.layoutVertically()
    details.spacing = 4
    details.size = new Size(detailWidth, panelHeight)
    addLargeAttendanceLine(details, "上班打卡",
        data && data.ok && data.hasClockIn ? formatTime(data.inTime) : "待打卡",
        data && data.ok && data.hasClockIn ? p.good : p.muted, p, detailWidth)
    addLargeAttendanceLine(details, "可下班时间",
        data && data.ok && data.targetTime ? formatTime(data.targetTime) : "—",
        data && data.ok && data.targetTime ? p.accent : p.muted, p, detailWidth)
    addLargeAttendanceLine(details, "下班打卡",
        data && data.ok && data.hasOutRecord
            ? formatTime(data.latestOutTime)
            : missingCheckout(data) ? checkoutWarningTitle(data) : "待打卡",
        data && data.ok && data.hasOutRecord ? p.good
            : data && data.ok && data.targetReached ? "#EF4444" : p.muted,
        p, detailWidth)
}

function renderCyberLargeWidget(widget, data, width, p, showToday = true) {
    const model = getWidgetMonthModel(data)
    const scale = largeWidgetScale()
    if (showToday) {
        renderLargeTodayPanel(widget, data, width, p)
        widget.addSpacer(6)
    widget.addSpacer(null)
    }

    renderCyberWeekStrip(widget, data, width, p)
    widget.addSpacer(5)
    widget.addSpacer(null)
    addWidgetMonthNavigation(widget, model, width, p, "本月概览")
    renderLargeMonthStats(widget, model, width, p, Math.round((width >= 320 ? 40 : 36) * scale))
    widget.addSpacer(5)
    widget.addSpacer(null)
    renderLargeRecentLogs(widget, model, width, p, width >= 320 ? 4 : 3, Math.round((width >= 320 ? 21 : 17) * scale))
}

function renderFitnessWeekBars(widget, data, width, p, barHeightOverride = 72) {
    addWidgetSectionTitle(widget, "最近 7 天 · 工时完成度", p)
    const days = getRecentWidgetDays(data, 7)
    widget.addSpacer(3)
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 6
    const barWidth = Math.max(12, Math.floor((width - 36) / 7))
    const scale = largeWidgetScale()
    const barHeight = Math.round(barHeightOverride * scale)
    const weekdays = ["一", "二", "三", "四", "五", "六", "日"]
    for (const day of days) {
        const column = row.addStack()
        column.layoutVertically()
        column.centerAlignContent()
        column.size = new Size(barWidth, barHeight + 27)
        const progress = widgetDayProgress(day, data)
        const track = column.addStack()
        track.layoutVertically()
        track.backgroundColor = new Color(p.track)
        track.cornerRadius = 5
        track.size = new Size(barWidth, barHeight)
        const fillHeight = progress > 0 ? Math.max(3, Math.round(barHeight * progress)) : 0
        if (fillHeight > 0) {
            track.addSpacer(barHeight - fillHeight)
            const fill = track.addStack()
            fill.backgroundColor = new Color(day.state === "normal" ? p.good
                : day.state === "warning" ? p.warning
                : day.state === "active" ? p.accent2
                : p.neutral)
            fill.cornerRadius = 5
            fill.size = new Size(barWidth, fillHeight)
        } else {
            track.addSpacer(barHeight)
        }
        const date = column.addText(String(Number(day.key.slice(-2))))
        date.font = Font.mediumSystemFont(8)
        date.textColor = new Color(p.text)
        const weekday = column.addText(weekdays[day.weekday] || "·")
        weekday.font = Font.systemFont(7)
        weekday.textColor = new Color(p.muted)
    }
}function renderFitnessLargeWidget(widget, data, width, p, showToday = true) {
    const model = getWidgetMonthModel(data)
    const scale = largeWidgetScale()
    if (showToday) {
        renderLargeTodayPanel(widget, data, width, p)
        widget.addSpacer(6)
        widget.addSpacer(null)
    }

    const workdayCount = model.workdays.length
    const recordedCount = model.normal + model.warnings + model.active
    const achievement = workdayCount ? model.normal / workdayCount : 0
    const coverage = workdayCount ? recordedCount / workdayCount : 0

    const ringSize = Math.round(72 * scale)
    const summary = widget.addStack()
    summary.layoutHorizontally()
    summary.centerAlignContent()
    summary.size = new Size(width, Math.round(78 * scale))
    // 大号主题：外圈表示本月达标率，内圈表示已有考勤记录的覆盖率。
    addFitnessRing(summary, data, ringSize, achievement, coverage)
    summary.addSpacer(10)

    const statsWidth = Math.max(100, width - ringSize - 10)
    const stats = summary.addStack()
    stats.layoutVertically()
    stats.spacing = 3
    stats.size = new Size(statsWidth, Math.round(78 * scale))

    addFitnessMetricLine(stats, "外圈 · 本月达标", model.normal + " / " + workdayCount + " 天", statsWidth, p.accent, 9)
    addFitnessProgressTrack(stats, statsWidth, achievement, p.accent, 5)
    addFitnessMetricLine(stats, "内圈 · 记录覆盖", Math.round(coverage * 100) + "%", statsWidth, p.accent2, 9)
    addFitnessProgressTrack(stats, statsWidth, coverage, p.accent2, 5)

    const footer = stats.addText("平均工时 " + model.average + "  ·  待核查 " + model.warnings + " 天")
    footer.font = Font.systemFont(8)
    footer.textColor = new Color(p.muted)
    footer.lineLimit = 1
    footer.minimumScaleFactor = 0.65

    widget.addSpacer(5)
    widget.addSpacer(null)
    renderFitnessWeekBars(widget, data, width, p, 42)
    widget.addSpacer(5)
    widget.addSpacer(null)
    renderLargeMonthStats(widget, model, width, p, Math.round(34 * scale))
}

function renderMinimalLargeWidget(widget, data, width, p, showToday = true) {
    const model = getWidgetMonthModel(data)
    const scale = largeWidgetScale()
    if (showToday) {
        renderLargeTodayPanel(widget, data, width, p)
        widget.addSpacer(6)
    widget.addSpacer(null)
    }

    addWidgetMonthNavigation(widget, model, width, p, "本月概览")
    const summary = widget.addStack()
    summary.layoutHorizontally()
    summary.centerAlignContent()
    summary.size = new Size(width, Math.round(56 * scale))
    const count = summary.addText(String(model.normal).padStart(2, "0"))
    count.font = Font.boldSystemFont(38)
    count.textColor = new Color(p.text)
    count.lineLimit = 1
    const slash = summary.addText(" / " + model.workdays.length)
    slash.font = Font.mediumSystemFont(16)
    slash.textColor = new Color(p.muted)

    const side = summary.addStack()
    side.layoutVertically()
    side.addSpacer(2)
    const caption = side.addText("本月达标天数")
    caption.font = Font.boldSystemFont(9)
    caption.textColor = new Color(p.muted)
    const average = side.addText("平均工时  " + model.average)
    average.font = Font.mediumSystemFont(9)
    average.textColor = new Color(p.text)
    const pending = side.addText("待核查  " + model.warnings + " 天")
    pending.font = Font.systemFont(8)
    pending.textColor = new Color(p.muted)

    widget.addSpacer(5)
    widget.addSpacer(null)
    renderLargeRecentLogs(widget, model, width, p, 3, Math.round(17 * scale))
    widget.addSpacer(5)
    widget.addSpacer(null)
    renderLargeWeekSummary(widget, model, width, p, Math.round(13 * scale), 4)
}

function widgetHeatmapCellColor(day, data) {
    if (!day || day.state === "future") return "#172A3B"
    if (!day.workday) return "#1B2B3B"
    if (day.state === "normal") return "#2F9D75"
    if (day.state === "active") return "#2F9CC7"
    if (day.state === "warning") {
        if (day.checkoutMissing) return "#C83D3D"
        const progress = widgetDayProgress(day, data)
        if (progress >= 0.75) return "#B77B37"
        if (progress >= 0.4) return "#80552F"
        return "#583D2A"
    }
    return "#3A5066"
}

function addWidgetHeatmapLegendItem(parent, color, label, p) {
    const item = parent.addStack()
    item.layoutHorizontally()
    item.centerAlignContent()
    const swatch = item.addStack()
    swatch.backgroundColor = new Color(color)
    swatch.cornerRadius = 2
    swatch.size = new Size(7, 7)
    item.addSpacer(3)
    const text = item.addText(label)
    text.font = Font.systemFont(8)
    text.textColor = new Color(p.muted)
    text.lineLimit = 1
}

function renderHeatmapLargeWidget(widget, data, width, p, showToday = true) {
    const scale = largeWidgetScale()
    if (showToday) {
        renderLargeTodayPanel(widget, data, width, p)
        widget.addSpacer(6)
        widget.addSpacer(null)
    }

    // 热力图保留整月矩阵；工作日顶部显示今天的打卡与实时倒计时。
    renderWidgetMonthCalendar(widget, data, width, "heatmap", {
        height: Math.round((showToday ? (width >= 320 ? 170 : 145) : (width >= 320 ? 240 : 195)) * scale),
        fontSize: 9,
        gap: 3,
        stretchRows: true
    })
}

function renderCyberWidget(widget, data, family, width, showToday = true) {
    const p = widgetStylePalette("cyber")
    const large = family === "large" || family === "extraLarge"
    const small = family === "small"
    addStyledHeader(widget, large && !showToday ? "本月考勤" : "今日考勤", p)
    if (!data || !data.ok) {
        widget.addSpacer(8)
        renderErrorBlock(widget, data || { error: "暂无考勤数据" })
        return
    }
    if (large) {
        renderCyberLargeWidget(widget, data, width, p, showToday)
        return
    }

    const headline = widget.addText(data.hasClockIn
        ? (missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : formatRemainCompact(data.remainingMinutes))
        : "未打卡")
    headline.font = Font.boldSystemFont(small ? 24 : 31)
    headline.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.accent)
    headline.lineLimit = 1
    headline.minimumScaleFactor = 0.62

    const status = widget.addText(widgetStatusText(data))
    status.font = Font.mediumSystemFont(9)
    status.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.muted)
    status.lineLimit = 1
    status.minimumScaleFactor = 0.65

    widget.addSpacer(large ? 7 : 6)
    addStyledProgress(widget, data, width, p, 4)
    widget.addSpacer(6)
    addStyledInfoRow(widget, [
        ["上班打卡", data.hasClockIn ? formatTime(data.inTime) : "—"],
        ["预计达标", data.targetTime ? formatTime(data.targetTime) : "—"],
        ["下班打卡", data.hasOutRecord ? formatTime(data.latestOutTime) : "—"]
    ], width, p, small ? 34 : 40)
}function renderFitnessWidget(widget, data, family, width, showToday = true) {
    const p = widgetStylePalette("fitness")
    const large = family === "large" || family === "extraLarge"
    const small = family === "small"
    addStyledHeader(widget, large && !showToday ? "本月考勤" : "今日考勤", p)
    if (!data || !data.ok) {
        widget.addSpacer(8)
        renderErrorBlock(widget, data || { error: "暂无考勤数据" })
        return
    }
    if (large) {
        renderFitnessLargeWidget(widget, data, width, p, showToday)
        return
    }

    const live = showsLiveCountdown(data)
    const row = widget.addStack()
    row.layoutHorizontally()
    row.centerAlignContent()
    const ringSize = small ? 58 : 78
    const infoWidth = Math.max(64, width - ringSize - 12)
    row.size = new Size(width, small ? 64 : 82)
    addFitnessRing(row, data, ringSize)
    row.addSpacer(12)

    const info = row.addStack()
    info.layoutVertically()
    info.size = new Size(infoWidth, small ? 62 : 80)

    if (small) {
        const caption = info.addText(live ? "距可下班" : "今日状态")
        caption.font = Font.systemFont(8)
        caption.textColor = new Color(p.muted)
        caption.lineLimit = 1
        if (live) {
            addLiveCountdown(info, data, Font.boldSystemFont(15), p.text)
        } else {
            const status = info.addText(missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : data.hasClockIn ? "工时不足" : "未打卡")
            status.font = Font.boldSystemFont(15)
            status.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.text)
            status.lineLimit = 1
            status.minimumScaleFactor = 0.65
        }
        info.addSpacer(2)
        addFitnessMetricLine(info, "工时", widgetElapsedText(data) + "/" + CONFIG.TARGET_HOURS + "h", infoWidth, p.accent, 7)
        addFitnessProgressTrack(info, infoWidth, widgetWorkProgress(data), missingCheckout(data) ? "#EF4444" : p.accent, 3)
        addFitnessMetricLine(info, "打卡", ((data.hasClockIn ? 1 : 0) + (data.hasOutRecord ? 1 : 0)) + "/2 次", infoWidth, p.accent2, 7)
        addFitnessProgressTrack(info, infoWidth, fitnessPunchProgress(data), missingCheckout(data) ? "#EF4444" : p.accent2, 3)
    } else {
        const countdownRow = info.addStack()
        countdownRow.layoutHorizontally()
        countdownRow.centerAlignContent()
        const caption = countdownRow.addText(live ? "距可下班" : "今日状态")
        caption.font = Font.systemFont(9)
        caption.textColor = new Color(p.muted)
        caption.lineLimit = 1
        countdownRow.addSpacer(5)
        if (live) {
            addLiveCountdown(countdownRow, data, Font.boldSystemFont(23), p.text)
        } else {
            const status = countdownRow.addText(widgetStatusText(data))
            status.font = Font.boldSystemFont(19)
            status.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.text)
            status.lineLimit = 1
            status.minimumScaleFactor = 0.62
        }

        info.addSpacer(3)
        addFitnessMetricLine(info, "工时", widgetElapsedText(data) + " / " + CONFIG.TARGET_HOURS + "h", infoWidth, p.accent, 9)
        addFitnessProgressTrack(info, infoWidth, widgetWorkProgress(data), missingCheckout(data) ? "#EF4444" : p.accent, 4)
        addFitnessMetricLine(info, "打卡", ((data.hasClockIn ? 1 : 0) + (data.hasOutRecord ? 1 : 0)) + " / 2 次", infoWidth, p.accent2, 9)
        addFitnessProgressTrack(info, infoWidth, fitnessPunchProgress(data), missingCheckout(data) ? "#EF4444" : p.accent2, 4)
    }

    if (small) {
        widget.addSpacer(4)
        const line = widget.addText("上班 " + (data.hasClockIn ? formatTime(data.inTime) : "—") + "  ·  下班 " + (data.hasOutRecord ? formatTime(data.latestOutTime) : "—"))
        line.font = Font.mediumSystemFont(8)
        line.textColor = new Color(p.muted)
        line.lineLimit = 1
        line.minimumScaleFactor = 0.6
        return
    }

    widget.addSpacer(7)
    addStyledInfoRow(widget, [
        ["上班", data.hasClockIn ? formatTime(data.inTime) : "--"],
        ["可下班", data.targetTime ? formatTime(data.targetTime) : "--"],
        ["下班", data.hasOutRecord ? formatTime(data.latestOutTime) : "--"]
    ], width, p, 38)
}function addMinimalMetricRow(widget, items, width, p, height = 42) {
    const row = widget.addStack()
    row.layoutHorizontally()
    row.size = new Size(width, height)
    const separatorWidth = 1
    const cellWidth = Math.floor((width - separatorWidth * 2) / 3)
    items.forEach((item, index) => {
        const cell = row.addStack()
        cell.layoutVertically()
        cell.centerAlignContent()
        cell.size = new Size(index === 2 ? width - separatorWidth * 2 - cellWidth * 2 : cellWidth, height)
        const label = cell.addText(item[0].toUpperCase())
        label.font = Font.mediumSystemFont(8)
        label.textColor = new Color(p.muted)
        label.lineLimit = 1
        cell.addSpacer(4)
        const value = cell.addText(item[1])
        value.font = Font.boldSystemFont(largeFontForMetric(height))
        value.textColor = new Color(p.text)
        value.lineLimit = 1
        value.minimumScaleFactor = 0.6
        if (index < 2) {
            const divider = row.addStack()
            divider.backgroundColor = new Color(p.track)
            divider.size = new Size(separatorWidth, Math.max(18, height - 8))
        }
    })
}

function largeFontForMetric(height) {
    return height >= 44 ? 14 : 12
}

function renderMinimalWidget(widget, data, family, width, showToday = true) {
    const p = widgetStylePalette("minimal")
    const large = family === "large" || family === "extraLarge"
    const small = family === "small"
    addStyledHeader(widget, large && !showToday ? "本月考勤" : "今日考勤", p)
    if (!data || !data.ok) {
        widget.addSpacer(8)
        const error = widget.addText(data && data.cacheMiss ? "需要更新" : "暂时不可用")
        error.font = Font.boldSystemFont(17)
        error.textColor = new Color(p.text)
        error.lineLimit = 1
        const detail = widget.addText(data && data.error || "运行脚本同步考勤")
        detail.font = Font.systemFont(9)
        detail.textColor = new Color(p.muted)
        detail.lineLimit = 3
        return
    }
    if (large) {
        renderMinimalLargeWidget(widget, data, width, p, showToday)
        return
    }

    widget.addSpacer(8)
    const headline = widget.addText(data.hasClockIn
        ? (missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : formatRemainCompact(data.remainingMinutes))
        : "未打卡")
    headline.font = Font.boldSystemFont(small ? 25 : 35)
    headline.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.text)
    headline.lineLimit = 1
    headline.minimumScaleFactor = 0.62

    const subtitle = widget.addText(data.hasClockIn
        ? "距目标工时"
        : getStatusMeta(data).subText)
    subtitle.font = Font.systemFont(9)
    subtitle.textColor = new Color(p.muted)
    subtitle.lineLimit = 1

    if (small) {
        widget.addSpacer(5)
        const line = widget.addText((data.hasClockIn ? formatTime(data.inTime) : "--") + "  /  " + (data.targetTime ? formatTime(data.targetTime) : "--"))
        line.font = Font.mediumSystemFont(10)
        line.textColor = new Color(p.muted)
        line.lineLimit = 1
        return
    }

    widget.addSpacer(9)
    addMinimalMetricRow(widget, [
        ["上班", data.hasClockIn ? formatTime(data.inTime) : "--"],
        ["目标", data.targetTime ? formatTime(data.targetTime) : "--"],
        ["下班", data.hasOutRecord ? formatTime(data.latestOutTime) : "--"]
    ], width, p, 48)
}function getRecentWidgetDays(data, count) {
    const dates = Array.from({ length: count }, (_, index) => addDays(now, index - count + 1))
    const holidays = {}
    for (const year of new Set(dates.map(date => date.getFullYear()))) {
        holidays[year] = readAttendanceRecord("attendance-history-calendar-" + year)?.holidays
    }
    const checked = data && data.ok ? new Map([[formatDateKey(now), data]]) : new Map()
    return dates.map(date => buildAttendanceHistoryDay(date, holidays, checked))
}

function renderRecentHeatmapRow(widget, data, width, p, tileHeight = 30) {
    const days = getRecentWidgetDays(data, 7)
    const row = widget.addStack()
    row.layoutHorizontally()
    row.spacing = 3
    const tileWidth = Math.max(14, Math.floor((width - 18) / 7))
    const stateColors = { normal: p.good, warning: p.warning, active: p.accent, neutral: p.neutral }
    const todayKey = formatDateKey(now)
    const showTodayProgress = tileHeight >= 44
    for (const day of days) {
        const isToday = day.key === todayKey
        const tile = row.addStack()
        tile.layoutVertically()
        tile.centerAlignContent()
        tile.cornerRadius = 5
        tile.backgroundColor = new Color(isToday
            ? p.background2
            : !day.workday ? p.cell : stateColors[day.state] || p.neutral)
        tile.size = new Size(tileWidth, tileHeight)
        if (isToday) {
            // 今日格不再只是普通状态色块：描边标识今天，底部进度条展示当日工时进度。
            tile.borderColor = new Color(p.accent)
            tile.borderWidth = 1.5
        }

        // 每一行都占满格子宽度，并用左右弹性留白确保日期与状态符号真正居中。
        tile.addSpacer()
        const numberLine = tile.addStack()
        numberLine.layoutHorizontally()
        numberLine.centerAlignContent()
        numberLine.size = new Size(tileWidth, 12)
        numberLine.addSpacer()
        const number = numberLine.addText(String(Number(day.key.slice(-2))))
        number.font = Font.mediumSystemFont(8)
        number.textColor = new Color(isToday ? p.accent2 : p.text)
        number.centerAlignText()
        numberLine.addSpacer()

        const markLine = tile.addStack()
        markLine.layoutHorizontally()
        markLine.centerAlignContent()
        markLine.size = new Size(tileWidth, 11)
        markLine.addSpacer()
        const mark = markLine.addText(!day.workday ? "—" : day.state === "normal" ? "✓" : day.state === "warning" ? "!" : day.state === "active" ? "●" : "·")
        mark.font = Font.boldSystemFont(8)
        mark.textColor = new Color(isToday ? p.accent : p.text)
        mark.centerAlignText()
        markLine.addSpacer()

        if (isToday && showTodayProgress) {
            tile.addSpacer(2)
            const trackWidth = Math.max(8, tileWidth - 12)
            const track = tile.addStack()
            track.layoutHorizontally()
            track.backgroundColor = new Color(p.track)
            track.cornerRadius = 2
            track.size = new Size(trackWidth, 3)
            const progress = data && data.ok ? widgetWorkProgress(data) : 0
            const fillWidth = Math.max(0, Math.min(trackWidth, Math.round(trackWidth * progress)))
            if (fillWidth > 0) {
                const fill = track.addStack()
                fill.backgroundColor = new Color(p.accent2)
                fill.cornerRadius = 2
                fill.size = new Size(fillWidth, 3)
            }
            if (fillWidth < trackWidth) track.addSpacer(trackWidth - fillWidth)
        }
        tile.addSpacer()
    }
}

function renderHeatmapWidget(widget, data, family, width, showToday = true) {
    const p = widgetStylePalette("heatmap")
    const large = family === "large" || family === "extraLarge"
    const small = family === "small"
    addStyledHeader(widget, large ? (showToday ? "今日考勤" : "本月考勤") : "近 7 天考勤", p)
    if (!data || !data.ok) {
        widget.addSpacer(8)
        renderErrorBlock(widget, data || { error: "暂无考勤数据" })
        return
    }
    if (large) {
        renderHeatmapLargeWidget(widget, data, width, p, showToday)
        return
    }

    const headline = widget.addText(data.hasClockIn
        ? (missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : "还差 " + formatRemainText(data.remainingMinutes))
        : "等待上班卡")
    headline.font = Font.boldSystemFont(small ? 17 : 22)
    headline.textColor = new Color(missingCheckout(data) ? "#EF4444" : p.text)
    headline.lineLimit = 1
    headline.minimumScaleFactor = 0.65
    const sub = widget.addText("今日 " + widgetElapsedText(data) + "  ·  " + (data.hasClockIn ? formatTime(data.inTime) : "未打卡"))
    sub.font = Font.systemFont(9)
    sub.textColor = new Color(p.muted)
    sub.lineLimit = 1
    sub.minimumScaleFactor = 0.65
    widget.addSpacer(8)
    renderRecentHeatmapRow(widget, data, width, p, small ? 30 : 48)
    if (!small) {
        widget.addSpacer(7)
        addStyledProgress(widget, data, width, p, 4)
    }
}function renderStyledStatsWidget(widget, data, family, style, width, showHeader = true) {
    const p = widgetStylePalette(style)
    const large = family === "large" || family === "extraLarge"
    const count = large ? 14 : 7
    const days = getRecentWidgetDays(data, count)
    const workdays = days.filter(day => day.workday)
    const normal = workdays.filter(day => day.state === "normal").length
    const warnings = workdays.filter(day => day.state === "warning").length
    const recorded = workdays.filter(day => ["normal", "warning", "active"].includes(day.state)).length
    const achievement = workdays.length ? normal / workdays.length : 0
    const coverage = workdays.length ? recorded / workdays.length : 0
    const title = "近 " + count + " 天考勤记录"
    if (showHeader) addStyledHeader(widget, title, p)
    else addWidgetSectionTitle(widget, title, p)
    widget.addSpacer(large ? 8 : 6)
    if (large) widget.addSpacer(null)
    if (style === "fitness") {
        const row = widget.addStack()
        row.layoutHorizontally()
        row.centerAlignContent()
        addFitnessRing(row, data, large ? 78 : 58, achievement, coverage)
        row.addSpacer(10)
        const summary = row.addStack()
        summary.layoutVertically()
        const total = summary.addText(normal + " / " + workdays.length)
        total.font = Font.boldSystemFont(large ? 28 : 23)
        total.textColor = new Color(p.text)
        const label = summary.addText("工作日达标")
        label.font = Font.systemFont(8)
        label.textColor = new Color(p.accent)
        const warn = summary.addText("记录覆盖 " + Math.round(coverage * 100) + "% · 待核查 " + warnings + " 天")
        warn.font = Font.systemFont(9)
        warn.textColor = new Color(p.accent2)
    } else {
        const total = widget.addText(style === "cyber" ? String(normal).padStart(2, "0") + " / " + count : normal + " 天达标")
        total.font = Font.boldSystemFont(large ? 30 : 24)
        total.textColor = new Color(p.accent)
        total.lineLimit = 1
        const detail = widget.addText("待核查 " + warnings + " 天  ·  其余休息或待查")
        detail.font = Font.systemFont(9)
        detail.textColor = new Color(p.muted)
        detail.lineLimit = 1
    }
    widget.addSpacer(large ? 9 : 7)
    if (large) widget.addSpacer(null)
    const rowCount = large ? 2 : 1
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const rowDays = days.slice(rowIndex * 7, rowIndex * 7 + 7)
        if (!rowDays.length) continue
        const row = widget.addStack()
        row.layoutHorizontally()
        row.spacing = 4
        const tileWidth = Math.floor((width - 24) / 7)
        for (const day of rowDays) {
            const tile = row.addStack()
            tile.layoutVertically()
            tile.centerAlignContent()
            tile.cornerRadius = 5
            tile.size = new Size(tileWidth, large ? 31 : 38)
            const colors = { normal: p.good, warning: p.warning, active: p.accent, neutral: p.neutral }
            tile.backgroundColor = new Color(day.workday ? (colors[day.state] || p.neutral) : p.cell)
            const date = tile.addText(day.key.slice(-2))
            date.font = Font.mediumSystemFont(8)
            date.textColor = new Color(p.text)
            const mark = tile.addText(!day.workday ? "—" : day.state === "normal" ? "✓" : day.state === "warning" ? "!" : day.state === "active" ? "●" : "·")
            mark.font = Font.boldSystemFont(8)
            mark.textColor = new Color(p.text)
        }
        if (rowIndex < rowCount - 1) {
            widget.addSpacer(4)
            if (large) widget.addSpacer(null)
        }
    }
}

async function renderStyledWidget(widget, data, family, style, width, layout, calendarOnly = false) {
    const contentWidth = width || mediumWidgetContentWidth(10)
    const large = family === "large" || family === "extraLarge"

    if (large && layout === "stats") {
        const p = widgetStylePalette(style)
        if (!calendarOnly) {
            addStyledHeader(widget, "今日考勤", p)
            if (data && data.ok) {
                renderLargeTodayPanel(widget, data, contentWidth, p)
            } else {
                renderErrorBlock(widget, data || { error: "暂无考勤数据" })
            }
            widget.addSpacer(6)
            widget.addSpacer(null)
            renderStyledStatsWidget(widget, data, family, style, contentWidth, false)
        } else {
            renderStyledStatsWidget(widget, data, family, style, contentWidth, true)
        }
        return
    }

    if (layout === "stats") {
        renderStyledStatsWidget(widget, data, family, style, contentWidth)
    } else if (style === "cyber") {
        renderCyberWidget(widget, data, family, contentWidth, !calendarOnly)
    } else if (style === "fitness") {
        renderFitnessWidget(widget, data, family, contentWidth, !calendarOnly)
    } else if (style === "heatmap") {
        renderHeatmapWidget(widget, data, family, contentWidth, !calendarOnly)
    } else {
        renderMinimalWidget(widget, data, family, contentWidth, !calendarOnly)
    }
}


// ==================== 功能 4：桌面小组件 ====================

/**
 * 创建今日打卡组件，按桌面或锁屏尺寸渲染
 *
 * @param data 今日打卡摘要
 * @param previewFamily 手动预览的组件尺寸
 * @return 已配置外观、点击链接和刷新时间的小组件
 * @author Kai
 * @date 2026/11/25 13:00
 */
async function createWidget(data, previewFamily, previewStyle) {
  // 管理页预览时，显式选择的尺寸优先；真正由桌面运行时则使用 config.widgetFamily。
  const family = previewFamily || config.widgetFamily || "medium"
  const isAccessory = family.indexOf("accessory") === 0
  const layout = config.runsInWidget ? readWidgetLayout(args.widgetParameter) : null
  const hasCalendar = family === "large" || family === "extraLarge"
  const statsOnly = layout === "stats" && family === "medium"
  const style = widgetStyleForFamily(family, previewStyle)
  const widget = new ListWidget()
  const isPreview = !!previewFamily && !config.runsInWidget
  const workday = isPreview || statsOnly || await isChinaWorkday(now)
  const calendarOnly = statsOnly || (!workday && hasCalendar)

  if (!workday && !calendarOnly) {
    widget.refreshAfterDate = morningRefreshOn(addDays(now, 1))
    return widget
  }

  if (!isAccessory) applyWidgetStyleBackground(widget, style)
  if (missingCheckout(data) && workday && !isAccessory) {
    widget.backgroundGradient = null
    widget.backgroundColor = new Color(style === "minimal" ? "#FDE8E7" : "#481D24")
    if (statsOnly) {
      const alert = widget.addText("⚠ " + checkoutWarningTitle(data) + "！"); alert.font = Font.boldSystemFont(14); alert.textColor = new Color("#EF4444"); widget.addSpacer(3)
    }
  }

  if (family === "accessoryRectangular") {
    renderAccessoryRectangular(widget, data)
  } else if (family === "accessoryCircular") {
    renderAccessoryCircular(widget, data)
  } else if (family === "accessoryInline") {
    renderAccessoryInline(widget, data)
  } else if (family === "small") {
    // 小号正方形：上下留白减半，避免内容被纵向 padding 挤压。
    widget.setPadding(7, 10, 7, 10)
    await renderStyledWidget(widget, data, family, style, Math.floor(homeScreenWidgetWidth("medium") / 2 - 20), layout)
  } else if (hasCalendar) {
    // 大号 / 特大号月历：上下留白减半，保留左右安全边距，让日历和今日信息更舒展。
    widget.setPadding(5, 16, 5, 16)
    const largeWidth = Math.max(250, homeScreenWidgetWidth("large") - 32)
    await renderStyledWidget(widget, data, family, style, largeWidth, layout, calendarOnly)
  } else if (statsOnly) {
    widget.setPadding(15, 12, 15, 12)
    renderStyledStatsWidget(widget, data, family, style, mediumWidgetContentWidth(12))
  } else {
    widget.setPadding(15, 12, 15, 12)
    await renderStyledWidget(widget, data, family, style, mediumWidgetContentWidth(12), layout)
  }

  const opensHistory = statsOnly || family === "medium" || hasCalendar
  widget.url = opensHistory ? getWeeklyAttendanceUrl() : getWidgetUrl()
  widget.refreshAfterDate = getNextWidgetRefreshDate(
      data, !calendarOnly && (family === "medium" || hasCalendar)
  )
  return widget
}

/**
 * 解析组件参数，空参数沿用各尺寸默认布局。
 *
 * @param raw Scriptable 中填写的组件参数
 * @return today、stats 或 null
 * @author Kai
 * @date 2026/11/25 11:28
 */
function readWidgetLayout(raw) {
    const layout = typeof raw === "string" ? raw.trim().toLowerCase() : ""
    return ["today", "stats"].includes(layout) ? layout : null
}

/**
 * 锁屏矩形第二行以外的状态句
 *
 * @param data 打卡摘要
 * @return 一行状态
 * @author Kai
 * @date 2026/11/19 20:50
 */
function getLockScreenInlineText(data) {
  if (!data || !data.ok) {
    return "打卡数据需更新"
  }
  if (!data.hasClockIn) {
    return "今日未打卡"
  }

  if (data.hasOutRecord) {
    if (data.targetReached) {
      return "打卡正常 · 下班卡 " + formatTime(data.latestOutTime)
    }
    return data.remainingMinutes > 0
        ? formatRemainTitle(data.remainingMinutes)
        : "工时不足"
  }

  if (data.targetReached) {
    return confirmedMissedCheckout() ? "⚠ 已确认漏卡 · 已使用一次漏卡机会" : "⚠ 未打下班卡，请立即打卡"
  }
  return data.remainingMinutes > 0
      ? formatRemainTitle(data.remainingMinutes) + "可下班"
      : "已满 9 小时"
}

/**
 * 锁屏圆形里的短状态
 *
 * @param data 打卡摘要
 * @return 短文本
 * @author Kai
 * @date 2026/11/19 20:50
 */
function getLockScreenShortText(data) {
  if (!data || !data.ok) {
    return "更新"
  }
  if (!data.hasClockIn) {
    return "未打卡"
  }

  if (data.hasOutRecord) {
    if (data.targetReached) {
      return "正常"
    }
    return data.remainingMinutes > 0 ? formatRemainCompact(data.remainingMinutes) : "不足"
  }

  if (data.targetReached) {
    return confirmedMissedCheckout() ? "已漏卡" : "⚠ 漏卡"
  }
  return data.remainingMinutes > 0 ? formatRemainCompact(data.remainingMinutes) : "可下班"
}

/**
 * 未到应走时间时，用系统倒计时显示当前时间到应走时间
 *
 * 到点后改成文字，避免系统倒计时过点后继续往上加。
 *
 * @param widget 锁屏组件
 * @param data 打卡摘要
 * @param fallbackText 不倒计时时显示的文字
 * @return 日期元素或文字元素
 * @author Kai
 * @date 2026/11/25 10:53
 */
function addLockScreenCountdown(widget, data, fallbackText) {
  if (showsLiveCountdown(data)) {
    return addLiveCountdown(widget, data, Font.boldSystemFont(13), "#FFFFFF")
  }

  return widget.addText(fallbackText)
}

/**
 * 根据有效上班卡和当前时刻判断是否显示距可下班倒计时
 *
 * @param data 打卡摘要
 * @return 需要跟着当前时间倒计时时返回 true
 * @author Kai
 * @date 2026/11/24 17:59
 */
function showsLiveCountdown(data) {
    // 倒计时以当前时间为准，下班卡只用于结算工时。
    return !!(data && data.ok && data.hasClockIn
        && data.targetTime && data.targetTime.getTime() > Date.now())
}

/**
 * 画一个走到应走时间就停的系统倒计时
 *
 * @param parent 父级组件或堆栈
 * @param data 打卡摘要
 * @param font 字体
 * @param color 颜色
 * @return 倒计时元素
 * @author Kai
 * @date 2026/11/23 18:29
 */
function addLiveCountdown(parent, data, font, color) {
  const timer = parent.addDate(data.targetTime)
  timer.applyTimerStyle()
  timer.font = font
  timer.textColor = new Color(color || "#FFFFFF")
  timer.lineLimit = 1
  timer.minimumScaleFactor = 0.65
  return timer
}

/**
 * 锁屏矩形：第一行倒计时或状态，第二行上下班时间，第三行快照时间
 *
 * @param widget 锁屏组件
 * @param data 打卡摘要
 * @author Kai
 * @date 2026/11/19 20:50
 */
function renderAccessoryRectangular(widget, data) {
  widget.setPadding(0, 0, 0, 0)

  const title = addLockScreenCountdown(widget, data, getLockScreenInlineText(data))
  if (missingCheckout(data)) title.textColor = new Color("#EF4444")
  title.font = Font.boldSystemFont(13)
  title.lineLimit = 1
  title.minimumScaleFactor = 0.65

  widget.addSpacer(2)

  const times = data && data.ok && data.hasClockIn
      ? "上班卡 " + formatTime(data.inTime) + " · 下班卡 " + (data.hasOutRecord ? formatTime(data.latestOutTime) : "未打")
      : "运行更新打卡快捷指令"
  const detail = widget.addText(times)
  detail.font = Font.systemFont(10)
  detail.lineLimit = 1
  detail.minimumScaleFactor = 0.65

  if (data && data.ok) {
    const updated = widget.addText("更新 " + getSnapshotUpdatedText(data))
    updated.font = Font.systemFont(9)
    updated.lineLimit = 1
  }
}

/**
 * 锁屏圆形：只放倒计时或短状态
 *
 * @param widget 锁屏组件
 * @param data 打卡摘要
 * @author Kai
 * @date 2026/11/19 20:50
 */
function renderAccessoryCircular(widget, data) {
  widget.setPadding(0, 0, 0, 0)
  widget.addSpacer()

  const text = addLockScreenCountdown(widget, data, getLockScreenShortText(data))
  if (missingCheckout(data)) text.textColor = new Color("#EF4444")
  text.font = Font.boldSystemFont(15)
  text.centerAlignText()
  text.lineLimit = 1
  text.minimumScaleFactor = 0.5

  widget.addSpacer()
}

/**
 * 锁屏日期上方的单行
 *
 * @param widget 锁屏组件
 * @param data 打卡摘要
 * @author Kai
 * @date 2026/11/19 20:50
 */
function renderAccessoryInline(widget, data) {
  const text = addLockScreenCountdown(widget, data, getLockScreenInlineText(data))
  if (missingCheckout(data)) text.textColor = new Color("#EF4444")
  text.font = Font.systemFont(12)
  text.lineLimit = 1
  text.minimumScaleFactor = 0.65
}


// ==================== 小号组件 ====================

/**
 * 在小号组件中纵向显示当前状态与两张打卡记录
 *
 * @param widget 小号桌面组件
 * @param data 今日打卡摘要
 * @author Kai
 * @date 2026/11/24 17:47
 */
async function renderSmallWidget(widget, data) {
  addCompactHeader(widget, "打卡")

  widget.addSpacer(5)

  if (!data.ok) {
    const t = widget.addText(data.cacheMiss ? "需要更新" : "加载失败")
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

  if (showsLiveCountdown(data)) {
    const status = addLiveCountdown(widget, data, Font.boldSystemFont(18), meta.color)
    status.minimumScaleFactor = 0.65
  } else {
    const status = widget.addText(meta.shortText)
    status.font = Font.boldSystemFont(18)
    status.textColor = new Color(meta.color)
    status.lineLimit = 1
    status.minimumScaleFactor = 0.65
  }

  widget.addSpacer(4)

  const sub = widget.addText(meta.subText)
  sub.font = Font.systemFont(11)
  sub.textColor = new Color("#D1D5DB")
  sub.lineLimit = 1
  sub.minimumScaleFactor = 0.65

    // 把剩余高度留给状态和打卡记录之间，避免底部堆积空白。
    widget.addSpacer()

  addMiniLine(
      widget,
      "上班卡",
      data.hasClockIn ? formatTime(data.inTime) : "--"
  )

  addMiniLine(
      widget,
      "下班卡",
      data.hasOutRecord ? formatTime(data.latestOutTime) : "未打"
  )

}


// ==================== 中号组件，推荐使用 ====================

/**
 * 用系统倒计时和三格状态呈现今日考勤。
 *
 * @param widget 中号桌面组件
 * @param data 今日打卡摘要
 * @param contentWidth 去掉两侧外边距后的可用宽度
 * @author Kai
 * @date 2026/11/25 13:00
 */
async function renderMediumWidget(widget, data, contentWidth = mediumWidgetContentWidth()) {
    addCompactHeader(widget, "今日打卡", contentWidth)
    widget.addSpacer(4)
    if (!data.ok) {
        renderErrorBlock(widget, data)
        return
    }

    // 倒计时交给系统更新，达标后原位显示考勤状态。
    const meta = getStatusMeta(data)
    const live = showsLiveCountdown(data)
    const headline = widget.addStack()
    headline.centerAlignContent()
    headline.spacing = 8
    if (live) {
        const label = headline.addText("距可下班")
        label.font = Font.systemFont(12)
        label.textColor = new Color("#B8C6D8")
        addLiveCountdown(headline, data, Font.boldSystemFont(28), "#FFFFFF")
    } else {
        const status = headline.addText(meta.mainText)
        status.font = Font.boldSystemFont(23)
        status.textColor = new Color(meta.color)
        status.lineLimit = 1
        status.minimumScaleFactor = 0.7
    }

    widget.addSpacer(5)
    addProgressBar(widget, data, contentWidth)

    // 当天短暂外出已在摘要里过滤，只有有效下班卡才能点亮下班格。
    widget.addSpacer()
    const row = widget.addStack()
    // 标题、进度条和三张卡片采用同一宽度，限制原生横排的弹性展开。
    row.size = new Size(contentWidth, 58)
    row.spacing = 6
    const width = Math.floor((contentWidth - 12) / 3)
    addInfoCell(row, "上班卡", data.hasClockIn ? formatTime(data.inTime) : "待打卡",
        data.hasClockIn ? "done" : "idle", width)
    addInfoCell(row, "可下班", data.hasClockIn ? formatTime(data.targetTime) : "—",
        live ? "active" : "idle", width)
    addInfoCell(row, "下班卡", data.hasOutRecord ? formatTime(data.latestOutTime) : "待打卡",
        data.hasOutRecord ? "done" : data.targetReached ? "warning" : "idle", contentWidth - 12 - width * 2)
}


/**
 * 按星期槽位隔离每天的快照，日期校验避免读取到上周记录
 *
 * @param dayOfWeek 星期序号
 * @return 本机钥匙串键名
 * @author Kai
 * @date 2026/11/24 16:12
 */
function weeklySnapshotKey(dayOfWeek) {
    return "attendance-weekly-snapshot-v1-" + dayOfWeek
}

/**
 * 定位仅保存在本机的逐日考勤快照
 *
 * @return 文件管理器与快照目录
 * @author Kai
 * @date 2026/11/24 16:31
 */
function attendanceHistoryStorage() {
    const files = FileManager.local()
    return { files, directory: files.joinPath(files.documentsDirectory(), "AttendanceHistoryV1") }
}

/**
 * 读取业务日期快照，兼容旧版星期槽位和单日缓存
 *
 * @param date 要读取的考勤日期
 * @return 对应日期的快照，缺失时为空
 * @author Kai
 * @date 2026/11/24 16:31
 */
function readHistorySnapshot(date) {
    const dateKey = formatDateKey(date)
    try {
        const { files, directory } = attendanceHistoryStorage()
        const path = files.joinPath(directory, dateKey + ".json")
        if (files.fileExists(path)) {
            const record = JSON.parse(files.readString(path))
            if (record.date === dateKey && record.owner === CONFIG.USERNAME) {
                return record
            }
        }
    } catch (e) {
        // 日文件暂不可读时，仍可使用旧版快照。
    }

    const weekly = readAttendanceRecord(weeklySnapshotKey(date.getDay()))
    const legacy = weekly && weekly.date === dateKey
        ? weekly : readAttendanceRecord(CONFIG.ATTENDANCE_CACHE_KEY)
    return legacy && legacy.date === dateKey ? legacy : null
}

/**
 * 按日期解读年度节假日表，缺少年度表时沿用单日缓存和星期规则
 *
 * @param date 考勤日期
 * @param holidays 按年份索引的节假日表
 * @return 日期类型、显示名称和是否应出勤
 * @author Kai
 * @date 2026/11/24 16:31
 */
function historyDayKind(date, holidays) {
    const dateKey = formatDateKey(date)
    const year = holidays[date.getFullYear()]
    const entry = year && year[dateKey.slice(5)]
    const cached = year ? null : readAttendanceRecord("china-workday-" + dateKey)

    if ((entry && entry.holiday === true) || (cached && cached.type === 2)) {
        return { kind: "holiday", label: (entry || cached).name || "节假日", workday: false }
    }
    if ((entry && entry.holiday === false) || (cached && cached.type === 3)) {
        return { kind: "makeup", label: "调休补班", workday: true }
    }

    const workday = cached && typeof cached.isWorkday === "boolean"
        ? cached.isWorkday : isNormalWeekday(date)
    return workday
        ? { kind: "work", label: "工作日", workday }
        : { kind: "weekend", label: "休息日", workday }
}

/**
 * 获取并缓存年度节假日表，沿用桌面端的年度接口
 *
 * @param year 日历年份
 * @param cached 本地年度表缓存
 * @return 按月日索引的节假日表，离线时可退回旧表
 * @author Kai
 * @date 2026/11/24 16:31
 */
async function loadHistoryHolidays(year, cached) {
    if (cached && Date.now() - cached.savedAt < CONFIG.HOLIDAY_CACHE_HOURS * 3600000) {
        return cached.holidays
    }

    let holidays = cached ? cached.holidays : null
    try {
        const request = new Request("https://timor.tech/api/holiday/year/" + year)
        request.timeoutInterval = 8
        const result = await request.loadJSON()
        if (result && result.code === 0 && result.holiday
            && typeof result.holiday === "object" && !Array.isArray(result.holiday)) {
            holidays = result.holiday
            Keychain.set("attendance-history-calendar-" + year, JSON.stringify({
                savedAt: Date.now(),
                holidays
            }))
        }
    } catch (e) {
        // 保留已缓存的日历，避免离线时节假日和补班标记消失。
    }
    return holidays
}

/**
 * 生成原生历史列表使用的某天考勤和状态
 *
 * @param date 日历格对应的日期
 * @param holidays 已加载的年度节假日表
 * @param checked 本次页面打开期间已查询的日期
 * @return 日期类型、打卡时间和工时状态
 * @author Kai
 * @date 2026/11/25 12:57
 */
function buildAttendanceHistoryDay(date, holidays, checked) {
    const key = formatDateKey(date)
    const today = key === formatDateKey(now)
    const { kind, label, workday } = historyDayKind(date, holidays)
    const record = checked.get(key) || readHistorySnapshot(date)
    const clockIn = record && record.inTime ? new Date(record.inTime) : null
    // 今日历史卡也会读到旧快照，应用与小组件相同的离场判断。
    const rawOut = record && (record.outSwipeTime || record.latestOutTime)
    const outSwipe = rawOut ? new Date(rawOut) : null
    const clockOut = resolveAttendanceCheckout(clockIn, outSwipe, today)
    let workedMs = clockIn && clockOut ? Math.max(0, clockOut - clockIn) : null
    const deficit = workedMs === null ? 0 : Math.ceil((CONFIG.TARGET_HOURS * 3600000 - workedMs) / 60000)
    let status = label
    let state = "neutral"

    if (workday) {
        if (!record) {
            status = checked.has(key) ? "查询失败 · 待核对" : "等待补查"
            state = checked.has(key) ? "warning" : "neutral"
        } else if (!clockIn) {
            status = today ? "待打上班卡" : "上班卡待核对"
            state = today ? "neutral" : "warning"
        } else if (!clockOut) {
            status = today ? "进行中" : "下班卡待核对"
            state = today ? "active" : "warning"
        } else {
            status = deficit > 0 ? "工时差 " + formatRemainText(deficit) : "正常"
            state = deficit > 0 ? "warning" : "normal"
        }
    }

    // 保留系统原判，核查结果只影响本机考勤日历。
    const originalStatus = status
    const review = workday ? readAttendanceReview(key) : null
    const leaveHours = Math.max(0, Math.min(CONFIG.TARGET_HOURS, Number(review?.leaveHours) || 0))
    const requiredMs = Math.round((CONFIG.TARGET_HOURS - leaveHours) * 3600000)
    // 已批准的部分请假会把当天可接受的离场时间提前。
    if (leaveHours > 0 && workedMs === null && clockIn && outSwipe
        && outSwipe <= now && outSwipe - clockIn >= requiredMs) {
        workedMs = outSwipe - clockIn
    }
    if (review?.decision === "abnormal") {
        status = "已确认异常"
        state = "warning"
    } else if (review?.confirmed) {
        status = leaveHours > 0 ? "请假已核实 · 正常" : "已确认正常"
        state = "normal"
    } else if (leaveHours > 0 && (requiredMs === 0 || (workedMs !== null && workedMs >= requiredMs))) {
        status = "请假后达标"
        state = "normal"
    } else if (leaveHours > 0 && workedMs !== null) {
        status = "扣除请假仍差 " + formatRemainText(Math.ceil((requiredMs - workedMs) / 60000))
        state = "warning"
    }

    const locallyConfirmed = confirmedMissedCheckout(key)
    const corrected = !!(clockIn && (clockOut || (workedMs !== null ? outSwipe : null)) && workedMs !== null && workedMs >= requiredMs)
    const checkoutMissing = !!(workday && clockIn && requiredMs > 0 && ((!clockOut && workedMs === null) || (locallyConfirmed && !corrected)) && (!today || Date.now() >= clockIn.getTime() + requiredMs))
    const missedConfirmed = checkoutMissing && locallyConfirmed
    if (checkoutMissing && (today || missedConfirmed)) { status = missedConfirmed ? "已确认漏卡" : "未打下班卡"; state = "warning" }
    return {
        key, kind, label, workday, status, state, workedMs, checkoutMissing, missedConfirmed,
        // 统计取校验后的工卡时间，请假后认可的离场卡也参与平均。
        clockInAt: clockIn,
        clockOutAt: clockOut || (workedMs !== null ? outSwipe : null),
        originalStatus, review, leaveHours, requiredMs,
        outSwipe: outSwipe ? formatTime(outSwipe) : "—",
        weekday: (date.getDay() + 6) % 7,
        clockIn: clockIn ? formatTime(clockIn) : "—",
        clockOut: clockOut || workedMs !== null ? formatTime(clockOut || outSwipe) : "—",
        worked: workedMs === null ? "—" : formatShortDuration(workedMs)
    }
}

/**
 * 容错读取钥匙串内的考勤或节假日缓存
 *
 * @param key 钥匙串缓存键
 * @return 缓存对象，缺失或损坏时为空
 * @author Kai
 * @date 2026/11/24 16:31
 */
function readAttendanceRecord(key) {
    try {
        return JSON.parse(readKeychainValue(key) || "null")
    } catch (e) {
        return null
    }
}

/**
 * 读取当前账号对指定日期的本机核查记录。
 *
 * @param key 考勤日期，格式为 yyyy-MM-dd
 * @return 含请假时长与核查结果的记录，未核查时为空
 * @author Kai
 * @date 2026/11/25 11:47
 */
function readAttendanceReview(key) {
    return readAttendanceRecord("attendance-review-v1:" + CONFIG.USERNAME + ":" + key)
}

/**
 * 将月份参数归一为该月第一天。
 *
 * @param value yyyy-MM 格式的月份参数
 * @return 本地月份起始时间，空值或非法值回到本月
 * @author Kai
 * @date 2026/11/25 11:47
 */
function attendanceMonth(value) {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value || ""))
    return match && Number(match[1]) >= 2000
        ? new Date(Number(match[1]), Number(match[2]) - 1, 1)
        : new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * 将月内日期按周一至周日对齐。
 *
 * @param month 该月第一天
 * @return 按周排列的日期格，月外的格为空
 * @author Kai
 * @date 2026/11/25 11:47
 */
function attendanceMonthWeeks(month) {
    const year = month.getFullYear()
    const index = month.getMonth()
    const count = new Date(year, index + 1, 0).getDate()
    const offset = (month.getDay() + 6) % 7
    const weeks = []
    for (let start = 1 - offset; start <= count; start += 7) {
        weeks.push(Array.from({ length: 7 }, (_, slot) => {
            const day = start + slot
            return day >= 1 && day <= count ? new Date(year, index, day) : null
        }))
    }
    return weeks
}

/** 统一管理中心：WebView 只负责展示，所有请求、配置和核查保留在 Scriptable。 */
async function presentAttendanceHistory(initialMonth) {
    let view = new WebView()
    const todayKey = formatDateKey(now)
    const current = attendanceMonth()
    let month = attendanceMonth(initialMonth)
    if (month > current) month = current
    const checked = new Map()
    const holidays = {}
    let open = true, busy = false, syncText = "本机缓存 · 可手动补查"
    let nextForegroundCheck = 0, nextCacheDraw = 0, midnightNotified = false, scheduledTarget = ""
    const monthKey = () => formatDateKey(month).slice(0, 7)
    const currentMonth = formatDateKey(current).slice(0, 7)
    const configured = () => !!(CONFIG.USERNAME && CONFIG.PASSWORD && CONFIG.DEVICE_ID)
    const canSync = () => configured() || !!readStoredToken()
    function ensureYear(year) {
        if (!(year in holidays)) holidays[year] = readAttendanceRecord("attendance-history-calendar-" + year)?.holidays || null
    }
    function dayModel(date) {
        const key = formatDateKey(date)
        // 今日以最新持久化快照为准，避免另一个检查脚本已同步、管理页仍读旧内存。
        if(key === todayKey) { const cached = readHistorySnapshot(date), local = checked.get(key); if(cached && (!local || String(cached.savedAt||"") >= String(local.snapshotUpdatedAt||""))) checked.delete(key) }
        if (key > todayKey) return { key, uiState: "future", status: "未到该日期" }
        ensureYear(date.getFullYear())
        const day = buildAttendanceHistoryDay(date, holidays, checked)
        const decision = day.review?.decision || (day.review?.confirmed ? "normal" : "auto")
        const uiState = !day.workday ? "rest" : decision === "abnormal" ? "abnormal" :
            day.state === "normal" ? "normal" : day.state === "active" ? "active" :
            /等待补查|查询失败/.test(day.originalStatus) ? "pending" : day.state === "warning" ? "warning" : "pending"
        return { ...day, uiState, decision, reviewed: !!day.review }
    }
    function model() {
        const weeks = attendanceMonthWeeks(month).map(week => week.map(date => date ? dayModel(date) : null))
        const days = [].concat(...weeks).filter(day => day && day.workday)
        const mean = values => values.length ? values.reduce((a,b) => a+b,0)/values.length : null
        const avgClock = field => {
            const val = mean(days.map(d => d[field]).filter(d => d && Number.isFinite(d.getTime())).map(d => d.getHours()*60+d.getMinutes()))
            if (val === null) return "—"
            const m = Math.round(val)%1440
            return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0")
        }
        const avg = mean(days.map(d=>d.workedMs).filter(Number.isFinite))
        const td = dayModel(now)
        const target = td.clockInAt ? new Date(td.clockInAt.getTime()+td.requiredMs) : null
        const elapsed = td.workedMs !== null ? td.workedMs : td.clockInAt ? Math.max(0,Date.now()-td.clockInAt.getTime()) : 0
        const remain = Math.max(0, td.requiredMs-elapsed)
        const headline = td.checkoutMissing ? (td.missedConfirmed ? "已确认漏卡" : "未打下班卡！") : !td.workday ? "休息日" : !td.clockInAt ? "等待上班卡" : remain > 0 ? formatShortDuration(elapsed) : "工时已达标"
        const subtitle = td.checkoutMissing ? (td.missedConfirmed ? "已无法返回，已使用一次漏卡机会" : "工时已达标，请立即打下班卡") : !td.workday ? td.label : !td.clockInAt ? "同步后查看最新工卡" : remain>0 ? "距应出勤时长还差 " + formatRemainText(Math.ceil(remain/60000)) : "今日应出勤工时已满足"
        return { month:monthKey(), monthLabel:month.getFullYear()+" 年 "+(month.getMonth()+1)+" 月", currentMonth,
            todayKey, selected:monthKey()===currentMonth?todayKey:formatDateKey(month), canNext:month<current, canPrev:month.getFullYear()>2000||month.getMonth()>0,
            weeks, average:{in:avgClock("clockInAt"),out:avgClock("clockOutAt"),worked:avg===null?"—":formatShortDuration(avg)},
            today:{status:td.status,headline,subtitle,checkText:syncText,snoozed:checkoutSnoozed(),checkoutMissing:td.checkoutMissing,missedConfirmed:td.missedConfirmed,clockIn:td.clockIn,clockOut:td.clockOut,target:target?formatTime(target):"—",progress:td.workday&&td.clockInAt?(td.requiredMs?Math.min(100,Math.round(elapsed/td.requiredMs*100)):100):0},
            preferences:readAttendancePreferences(),targetHours:CONFIG.TARGET_HOURS,accountConfigured:configured(),canSync:canSync(),
            accountLabel:CONFIG.USERNAME?String(CONFIG.USERNAME).replace(/.(?=.{4})/g,"•"):"未配置",accountUsername:CONFIG.USERNAME||"",accountDevice:CONFIG.DEVICE_ID||"",busy,
            syncText:canSync()?syncText:"请先在考勤配置中添加账号" }
    }
    const serialize = value => JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")
    async function evaluateAck(code, stage) {
        let lastError = null
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const result = await view.evaluateJavaScript("(function(){" + code + ";return 'AH5:OK';})()", false)
                if (result === "AH5:OK") return
                lastError = new Error("WebView 返回值异常（" + typeof result + "）")
            } catch (error) {
                lastError = error
            }
            if (attempt < 4) await pause(160)
        }
        throw new Error(stage + "：" + managementErrorText(lastError || "页面通信失败"))
    }
    async function draw() {
        if (open) await evaluateAck("window.setAttendanceModel(" + serialize(model()) + ")", "刷新页面")
    }
    async function toast(message) {
        if (open) await evaluateAck("window.attendanceToast(" + serialize(String(message)) + ")", "显示消息")
    }
    function validDate(key) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key)) || key>todayKey || key.slice(0,7)!==monthKey()) throw new Error("无效的核查日期")
        const [y,m,d]=key.split("-").map(Number), date=new Date(y,m-1,d)
        if(formatDateKey(date)!==key) throw new Error("无效的日期")
        return date
    }
    async function queryDate(date) {
        const key=formatDateKey(date)
        const result=await getAttendanceSummary(date)
        if(open) checked.set(key,result.ok?result:null)
        return result
    }
    async function checkFromManagement(kind = "auto") {
        const manual = kind !== "auto"
        if (!canSync() || !open || busy) {
            if(manual && !canSync()) await toast("请先配置账号")
            return
        }
        if (formatDateKey(new Date()) !== todayKey) {
            syncText="日期已变化，请关闭后重新打开管理页"
            if(manual) await toast(syncText)
            await draw()
            return
        }
        busy = true
        nextForegroundCheck = Date.now() + 60000
        try {
            if (!manual && !(await isChinaWorkday(new Date()))) return
            quietForegroundCheck = !manual
            if(manual) { syncText="正在检查今日打卡…"; await draw() }
            const data = await queryDate(new Date())
            syncText = attendanceCheckResultText(data) + " · " + formatTime(new Date())
            if (data.ok && open) {
                const target = data.targetTime ? String(data.targetTime.getTime()) : ""
                try {
                    if (kind === "leave" || kind === "check") await handleLeaveCompany(data, kind === "leave")
                    else if (kind === "schedule9" || (kind !== "near9" && target && target !== scheduledTarget && !data.hasOutRecord && !missingCheckout(data))) {
                        const result = await handleScheduleNineHours(data)
                        if(result?.ok && !result.isRestDay) scheduledTarget=target
                    } else await handleNearNineHours(data)
                } catch (error) { syncText += " · 通知失败：" + managementErrorText(error) }
            } else if (!data.ok && (kind==="leave" || kind==="check")) {
                try { await handleLeaveCompany(data) } catch (_) {}
            }
            if (manual) await toast(syncText)
        } catch (e) { syncText = "检查失败 · " + managementErrorText(e); if(manual) await toast(syncText) }
        finally { quietForegroundCheck=false; busy=false; nextForegroundCheck=Date.now()+60000; if(open) await draw() }
    }
    async function syncMonth() {
        if(!canSync()) throw new Error("请先配置账号")
        busy=true
        syncText="正在读取节假日…"
        await draw()
        let success=0, failed=0, failure=""
        try {
            const year=month.getFullYear()
            holidays[year]=await loadHistoryHolidays(year,readAttendanceRecord("attendance-history-calendar-"+year))
            const dates=[].concat(...attendanceMonthWeeks(month)).filter(d=>d&&formatDateKey(d)<=todayKey&&historyDayKind(d,holidays).workday&&(!readHistorySnapshot(d)||formatDateKey(d)===todayKey))
            for(let i=0;i<dates.length&&open;i++) {
                syncText="正在同步 "+(i+1)+" / "+dates.length+" · "+formatDateKey(dates[i]).slice(5)
                await draw()
                const r=await queryDate(dates[i])
                if(r.ok) success++; else {failed++; failure=r.error||"请求失败"; break}
            }
            syncText=failed?"已同步 "+success+" 天 · 中断："+failure:dates.length?"本次同步 "+success+" 天 · 已完成":"本月缓存已齐全"
        } finally {busy=false;await draw()}
    }
    // 只将无账号/考勤数据的静态页面写入本地临时目录。
    // 使用 loadFile 避开部分设备 loadHTML 回传整个 DOM 的问题。
    const html = attendanceManagementHTML()
    const fm = FileManager.local()
    const path = fm.joinPath(fm.temporaryDirectory(), "AttendanceHelper-ui-" + Date.now() + ".html")
    let stage = "写入页面模板", closed = null, failure = null
    const pause = ms => new Promise(resolve => Timer.schedule(ms, false, resolve))
    async function ready() {
        const result = await view.evaluateJavaScript("(function(){return document.readyState!=='loading' && window.__attendanceReady===true && typeof window.setAttendanceModel==='function' && typeof window.takeAttendanceAction==='function' && !!document.getElementById('boot-status') ? 'AH5:READY' : 'AH5:NOT_READY';})()", false)
        return result === "AH5:READY"
    }
    async function loadPage(useFile) {
        let loadError = null
        try {
            if (useFile) await view.loadFile(path)
            else await view.loadHTML(html, "https://attendance-helper.invalid/")
        } catch (e) { loadError = e }
        // WebView 首次启动、预览和设备负载会影响脚本注入时序。
        // 最多等待 6 秒，以页面主动上报 READY 为准，不用短暂延迟猜测加载完成。
        for (let i=0;i<40;i++) {
            try {
                if (await ready()) {
                    await pause(120)
                    if (await ready()) return
                }
            } catch (_) {}
            await pause(150)
        }
        throw new Error(managementErrorText(loadError || "页面脚本未初始化"))
    }
    try {
        // 无论从 Scriptable 直接运行还是由桌面小组件 URL Scheme 唤起，
        // 都统一先呈现 WebView，再加载页面和注入数据，避免隐藏状态下初始化后白屏。
        stage = "打开管理窗口"
        closed = Promise.resolve(view.present(true)).then(() => { open=false }, e => { failure=e;open=false })
        await pause(500)
        if (!open) return

        fm.writeString(path, html)
        stage = "加载本地 HTML"
        try { await loadPage(true) }
        catch (_) {
            stage = "加载 HTML 备用方式"
            await loadPage(false)
        }
        stage = "初始化数据"
        await draw()
        // 页面已可见后统一触发首屏重绘。
        await pause(160)
        await evaluateAck("window.dispatchEvent(new Event('resize'));var main=document.querySelector('main.wrap');if(main){main.style.webkitTransform='translateZ(0)';setTimeout(function(){main.style.webkitTransform='';window.dispatchEvent(new Event('resize'))},120)}", "页面首屏重绘")
        stage = "操作桥接"
        while (open) {
            // 不使用 completion、浏览器异步回调或 Promise.race；一次读取一个动作。
            let event = null
            let bridgeError = null
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    event = await view.evaluateJavaScript("window.takeAttendanceAction()", false)
                    if (typeof event === "string" && event.startsWith("AH5:")) break
                    bridgeError = new Error("桥接返回值异常（" + typeof event + "）")
                } catch (error) {
                    bridgeError = error
                }
                if (attempt < 4) await pause(140)
            }
            if (!open) break
            if (typeof event !== "string" || !event.startsWith("AH5:")) {
                throw new Error("操作桥接暂不可用：" + managementErrorText(bridgeError || "请重新打开页面"))
            }
            const {action,data={}} = JSON.parse(event.slice(4))
            if (action === "idle") {
                const stamp = Date.now()
                if (formatDateKey(new Date()) !== todayKey) {
                    if(!midnightNotified){midnightNotified=true;syncText="日期已变化，请关闭后重新打开管理页";await draw()}
                } else if (canSync() && !busy && stamp >= nextForegroundCheck) {
                    await checkFromManagement("auto")
                } else if (stamp >= nextCacheDraw) {
                    nextCacheDraw = stamp + 15000; now = new Date(); await draw()
                }
                await pause(300); continue
            }
            try {
                if(action==="month") {
                    const offset=Number(data.offset)
                    if(![-1,0,1].includes(offset)) continue
                    const next=offset===0?current:new Date(month.getFullYear(),month.getMonth()+offset,1)
                    if(next<=current&&next.getFullYear()>=2000) {month=next;syncText="本机缓存 · 可手动补查"}
                } else if(action==="confirmMissed") {
                    const day = dayModel(now)
                    if(!CONFIG.USERNAME || !day.checkoutMissing) throw new Error("当前没有待处理的漏卡")
                    if(data.key !== todayKey || typeof data.confirmed !== "boolean") throw new Error("漏卡确认已过期，请重新操作")
                    const key = missedCheckoutKey(todayKey)
                    if(data.confirmed) { Keychain.set(key,"1"); clearCheckoutSnooze(); await cancelCheckoutEscalation(); try{await Notification.removePending(["attendance-helper-checkout-due","attendance-helper-upcoming-work"])}catch(_){} } else if(Keychain.contains(key)) Keychain.remove(key)
                    await toast(data.confirmed ? "已确认漏卡 · 本机已记录，实际豁免以公司核算为准" : "已撤销漏卡确认")
                } else if(action==="phoneWarning") {
                    // 用户主动点击：跳转已安装的快捷指令，不假装 Scriptable 能直接控制专注模式。
                    Safari.open("shortcuts://run-shortcut?name="+encodeURIComponent("考勤警告处理")+"&input=text&text="+encodeURIComponent("recheck"))
                } else if(action==="snoozeCheckout") {
                    const result=await handleCheckoutDecision("snooze"); await toast(checkoutShortcutOutput(result,"snooze").message)
                } else if(action==="checkToday") await checkFromManagement("check")
                else if(action==="sync") await syncMonth()
                else if(action==="refreshToday"||action==="refreshDay") {
                    if(!canSync()) throw new Error("请先配置账号")
                    if(action==="refreshToday") { await checkFromManagement("refresh"); continue }
                    const date=validDate(data.key)
                    busy=true;syncText="正在查询 "+formatDateKey(date);await draw()
                    try {const r=await queryDate(date);syncText=r.ok?"已更新 "+formatDateKey(date):"查询失败："+r.error;await toast(syncText)} finally {busy=false}
                } else if(action==="settings") {
                    if(!["navy","teal","slate"].includes(data.theme)||![0,5,15,30,45,60].includes(data.remindMinutes)
                        || !WIDGET_STYLE_IDS.includes(data.widgetStyleSmall)
                        || !WIDGET_STYLE_IDS.includes(data.widgetStyleMedium)
                        || !WIDGET_STYLE_IDS.includes(data.widgetStyleLarge)) throw new Error("无效的配置")
                    const prev=readAttendancePreferences()
                    const styleChanged = prev.widgetStyleSmall !== data.widgetStyleSmall
                        || prev.widgetStyleMedium !== data.widgetStyleMedium
                        || prev.widgetStyleLarge !== data.widgetStyleLarge
                    await saveAttendancePreferences({
                        ...prev, theme:data.theme, remindMinutes:data.remindMinutes,
                        widgetStyleSmall:data.widgetStyleSmall,
                        widgetStyleMedium:data.widgetStyleMedium,
                        widgetStyleLarge:data.widgetStyleLarge
                    },prev)
                    await toast("配置已保存" + (styleChanged ? " · 正在预览所选尺寸" : " · 桌面组件下次刷新生效"))
                    if (styleChanged && ["small","medium","large"].includes(data.previewFamily)
                        && WIDGET_STYLE_IDS.includes(data.previewStyle)) {
                        await runWidgetUpdate({presentPreview:true,family:data.previewFamily,style:data.previewStyle})
                    }
                } else if(action==="review"||action==="resetReview") {
                    const day=dayModel(validDate(data.key))
                    if(!CONFIG.USERNAME) throw new Error("请先配置账号，再进行核查")
                    if(!day.workday) throw new Error("休息日无需核查")
                    const key="attendance-review-v1:"+CONFIG.USERNAME+":"+day.key
                    if(action==="resetReview") {if(Keychain.contains(key))Keychain.remove(key);await toast("已恢复系统原判")}
                    else {
                        const h=Number(data.leaveHours), decision=data.decision
                        if(!Number.isFinite(h)||h<0||h>CONFIG.TARGET_HOURS||!["auto","normal","abnormal"].includes(decision))throw new Error("请检查请假时长及核查结果")
                        if(decision==="auto"&&!h) {if(Keychain.contains(key))Keychain.remove(key)}
                        else Keychain.set(key,JSON.stringify({leaveHours:h,confirmed:decision==="normal",decision,reviewedAt:new Date().toISOString()}))
                        await toast("本机核查已保存")
                    }
                } else if(action==="previewWidget") {
                    const family=["small","medium","large"].includes(data.family)?data.family:"medium"
                    const style=WIDGET_STYLE_IDS.includes(data.style)?data.style:widgetStyleForFamily(family)
                    await runWidgetUpdate({presentPreview:true,family,style})
                } else if(action==="account") {
                    const username=String(data.username||"").trim(), deviceId=String(data.deviceId||"").trim(), password=String(data.password||"")||(username===CONFIG.USERNAME?CONFIG.PASSWORD:"")
                    const changed=username!==CONFIG.USERNAME||password!==CONFIG.PASSWORD||deviceId!==CONFIG.DEVICE_ID
                    saveAccountToKeychain({username,password,deviceId})
                    if(changed) { checked.clear(); scheduledTarget=""; nextForegroundCheck=0 }
                    syncText="账户已保存 · 请同步考勤";await toast("账户已保存")
                } else if(action==="tool") {
                    switch(data.name) {
                        case "previewMedium": await runWidgetUpdate({presentPreview:true});break
                        case "previewLarge": await runWidgetUpdate({presentPreview:true,family:"large"});break
                        case "previewSmall": await runWidgetUpdate({presentPreview:true,family:"small"});break
                        case "check":case "leave":await checkFromManagement("leave");break
                        case "schedule9":await checkFromManagement("schedule9");break
                        case "near9":await checkFromManagement("near9");break
                        case "debug":await handleDebug();break
                        case "update": {const changed=await updateScriptFromGit();await toast(changed?"更新完成，请重新运行脚本":"已是最新版本");break}
                    }
                }
            } catch(e) {busy=false;await toast(e.message||e)}
            await draw()
        }
    } catch (e) {
        if (!closed || open) failure = e
        if (closed && open) {
            try { await evaluateAck("window.attendanceBootError(" + serialize(stage + "：" + managementErrorText(e)) + ")", "显示错误") } catch (_) {}
            // 等待用户关闭 WebView，避免在已展示的页面上叠加原生表格。
        }
    } finally {
        if (closed) await closed
        open = false
        try { if (fm.fileExists(path)) fm.remove(path) } catch (_) {}
    }
    if (failure) throw new Error(stage + "：" + managementErrorText(failure))
}

// 不在 Alert、日志中输出包含账号、设备编号、打卡记录的整页 HTML。
function managementErrorText(error) {
    const text = String(error && error.message || error || "未知错误")
    if (/<(?:!doctype|html|head|body|script)\b/i.test(text)) return "WebView 返回了 HTML 文档，而非预期的结果"
    let safe=text
    for (const value of [CONFIG.USERNAME,CONFIG.PASSWORD,CONFIG.DEVICE_ID,readStoredToken()]) {
        if(value) safe=safe.split(String(value)).join("[已隐藏]")
    }
    return safe.slice(0,300)
}


function attendanceManagementHTML() {
    return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover\"><title>考勤管理</title><style>\n:root{color-scheme:light dark;--bg:#f5f6f8;--card:#fff;--ink:#172033;--muted:#687487;--line:#e8ebf0;--soft:#f0f3f7;--accent:#315fbd;--accent-bg:#eaf1ff;--good:#087b5b;--good-bg:#e5f5ed;--bad:#b34534;--bad-bg:#fff0ec;--warn:#97600d;--warn-bg:#fff5dd;--radius:20px}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;background:var(--bg);color:var(--ink);-webkit-tap-highlight-color:transparent}body[data-theme=teal]{--accent:#167e74;--accent-bg:#e3f5f1}body[data-theme=slate]{--accent:#5a637a;--accent-bg:#eef0f6}html,body,button,a{touch-action:manipulation}button,input,textarea{font:inherit}button{color:inherit;cursor:pointer;border:0;background:none}button:disabled{opacity:.35;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button:active:not(:disabled){opacity:.82}.wrap{max-width:560px;margin:auto;padding:64px 16px 32px;padding-top:max(64px,calc(env(safe-area-inset-top) + 20px));padding-bottom:max(32px,env(safe-area-inset-bottom))}.top{display:flex;align-items:center;justify-content:space-between;margin:0 0 20px}.eyebrow{font-size:11px;letter-spacing:1.5px;font-weight:700;color:var(--muted);margin-bottom:5px}h1,h2,h3,p{margin:0}h1{font-size:30px;letter-spacing:-1.2px;font-weight:750}h2{font-size:18px;letter-spacing:-.3px}h3{font-size:15px}.icon-btn{width:44px;height:44px;display:grid;place-items:center;border:1px solid var(--line);background:var(--card);border-radius:15px;flex:none}.icon-btn svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.tools{display:flex;gap:8px}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:0 3px 12px #17203304}.hero{background:#17283f;color:#fff;border:none;padding:19px;position:relative;overflow:hidden}.hero::after{content:'';position:absolute;width:180px;height:180px;border:1px solid #ffffff15;border-radius:50%;right:-64px;top:-90px;box-shadow:0 0 0 24px #ffffff09,0 0 0 48px #ffffff06;pointer-events:none}.hero-top,.section-head,.month-head,.detail-top,.modal-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.hero.checkout-warning{background:#782626}.hero.checkout-warning .pill{background:#b91c1c;color:#fff}.hero.checkout-warning .progress i{background:#fca5a5}.hero.checkout-warning small{color:#fff1f2}.hero small{color:#b8c8de;font-size:12px}.hero-main{font-size:32px;font-weight:750;letter-spacing:-1px;margin:9px 0 4px;font-variant-numeric:tabular-nums}.hero .pill{color:#dceaff;background:#ffffff1e}.progress{height:6px;border-radius:20px;background:#ffffff20;margin:16px 0;overflow:hidden}.progress i{height:100%;display:block;background:#9ac2ff;border-radius:20px}.hero-grid,.metric-grid,.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.hero-grid>div{border-left:1px solid #ffffff23;padding-left:10px}.hero-grid>div:first-child{border:0;padding:0}.hero-grid b{display:block;font-size:18px;margin-top:5px;font-variant-numeric:tabular-nums}.section-head{margin:20px 2px 10px}.sub{font-size:12px;color:var(--muted);line-height:1.5}.metric-grid{gap:7px;margin-bottom:12px}.metric{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:11px 5px;text-align:center;min-width:0}.metric b{display:block;font-size:25px;line-height:1.15;font-variant-numeric:tabular-nums}.metric small{display:block;font-size:11px;color:var(--muted);margin-top:4px}.metric[data-active=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.good-text{color:var(--good)}.bad-text{color:var(--bad)}.warn-text{color:var(--warn)}.month-head{margin-bottom:15px}.month-title{font-size:19px;font-weight:750;white-space:nowrap;letter-spacing:-.4px}.month-nav{display:flex;gap:5px;align-items:center}.month-nav button,.mini{padding:8px 10px;border-radius:10px;background:var(--soft);font-size:12px;font-weight:650;min-height:36px}.month-nav .arrow{font-size:21px;line-height:1;width:36px;padding:0}.week,.calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.week{margin-bottom:7px}.week span{text-align:center;font-size:11px;color:var(--muted);font-weight:600;padding:4px 0}.day{min-width:0;min-height:49px;aspect-ratio:1 / 1.12;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border:1px solid transparent;border-radius:12px;background:var(--soft);padding:3px 0;font-variant-numeric:tabular-nums;position:relative}.day b{font-size:16px;line-height:1.1}.day em{font-style:normal;font-size:9px;line-height:1;white-space:nowrap}.day.normal{background:var(--good-bg);color:var(--good)}.day.warning{background:var(--warn-bg);color:var(--warn)}.day.abnormal{background:var(--bad-bg);color:var(--bad)}.day.active{background:var(--accent-bg);color:var(--accent)}.day.pending{background:var(--soft);color:var(--muted);border:1px dashed var(--line)}.day.rest{background:transparent;color:var(--muted)}.day.future{background:transparent;color:var(--muted);opacity:.48}.day.selected{outline:2px solid var(--accent);outline-offset:-2px}.day.today:after{content:'';position:absolute;right:5px;top:5px;width:5px;height:5px;background:var(--accent);border-radius:50%}.legend{display:flex;flex-wrap:wrap;gap:10px 13px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}.legend span{display:flex;align-items:center;gap:4px}.dot{width:8px;height:8px;border-radius:3px;background:var(--soft);border:1px solid var(--line)}.dot.normal{background:var(--good)}.dot.warning{background:var(--warn)}.dot.abnormal{background:var(--bad)}.dot.active{background:var(--accent)}.pill{display:inline-flex;align-items:center;padding:5px 9px;border-radius:9px;font-size:11px;font-weight:650;white-space:nowrap;background:var(--soft);color:var(--muted)}.pill.normal{background:var(--good-bg);color:var(--good)}.pill.warning{background:var(--warn-bg);color:var(--warn)}.pill.abnormal{background:var(--bad-bg);color:var(--bad)}.pill.active{background:var(--accent-bg);color:var(--accent)}.detail-grid{margin:13px 0;gap:6px}.detail-grid div{background:var(--soft);padding:11px 5px;border-radius:12px;text-align:center;min-width:0}.detail-grid small{display:block;color:var(--muted);font-size:11px;margin-bottom:6px}.detail-grid b{font-size:17px;white-space:nowrap;letter-spacing:-.4px;font-variant-numeric:tabular-nums}.line{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:13px}.line span:first-child{color:var(--muted);flex:none}.line span:last-child{text-align:right;overflow-wrap:anywhere}.primary,.secondary,.danger{width:100%;min-height:44px;border-radius:13px;padding:10px 13px;font-size:14px;font-weight:650;background:var(--accent);color:#fff}.secondary{background:var(--soft);color:var(--ink)}.danger{background:var(--bad-bg);color:var(--bad)}.actions{display:flex;gap:8px;margin-top:12px}.actions>*{flex:1}.review-list{padding:0 14px}.review-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:12px 0;border-bottom:1px solid var(--line)}.review-row:last-child{border:0}.date-chip{background:var(--soft);border-radius:11px;min-width:45px;padding:8px 4px;text-align:center;font-size:12px;font-weight:700}.review-row .grow{flex:1;min-width:0}.review-row strong{font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-row small{display:block;font-size:11px;color:var(--muted);margin-top:4px}.chevron{color:var(--muted);font-size:20px}.empty{padding:19px 8px;text-align:center;font-size:13px;color:var(--muted)}.sync{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 3px;margin:0 0 10px}.sync span{font-size:12px;color:var(--muted);overflow-wrap:anywhere}html.modal-open{overflow:hidden;overscroll-behavior:none}body.modal-open{position:fixed;left:0;right:0;width:100%;overflow:hidden}.overlay{position:fixed;inset:0;z-index:10;background:#101b326e;display:flex;align-items:center;justify-content:center;overflow:hidden;overscroll-behavior:none;touch-action:pan-y;padding:max(60px,calc(env(safe-area-inset-top) + 12px)) 12px max(24px,env(safe-area-inset-bottom))}.overlay[hidden]{display:none!important}.modal{display:flex;flex-direction:column;max-width:440px;width:100%;min-height:0;max-height:100%;overflow:hidden;margin:0;background:var(--card);border-radius:24px;padding:0;box-shadow:0 16px 64px #0003}.modal-head{flex:0 0 auto;margin:0;padding:18px 20px 12px;background:var(--card);border-bottom:1px solid var(--line)}#modal-content{flex:0 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;touch-action:pan-y;padding:16px 20px 20px}.close{width:34px;height:34px;border-radius:50%;background:var(--soft);font-size:21px;color:var(--muted);flex:none}.field-title{font-size:13px;font-weight:700;margin:16px 0 9px}.options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.style-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}.style-tab{min-height:36px;border-radius:11px;background:var(--soft);font-size:12px;font-weight:700}.style-tab.on{background:var(--accent-bg);color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}.widget-style-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.widget-style-card{min-width:0;text-align:left;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:8px}.widget-style-card.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:var(--accent-bg)}.widget-style-card strong{display:block;font-size:12px;margin-top:7px}.widget-style-card small{display:block;font-size:10px;color:var(--muted);margin-top:3px}.style-sample{height:55px;border-radius:9px;padding:8px;display:flex;flex-direction:column;justify-content:center;gap:5px;overflow:hidden}.style-sample b{font-size:18px;line-height:1}.style-sample span{font-size:8px;letter-spacing:.7px}.style-sample i{height:4px;border-radius:4px;display:block;background:#ffffff30;overflow:hidden}.style-sample i:after{content:'';display:block;width:52%;height:100%;background:currentColor;border-radius:4px}.style-sample.cyber{background:#071321;color:#54E6DC}.style-sample.fitness{background:#0C1017;color:#B9F36A;align-items:center;position:relative}.style-sample.fitness:before{content:'';width:35px;height:35px;border-radius:50%;border:4px solid #B9F36A;border-right-color:#FF8176;border-bottom-color:#63B9FF;position:absolute;right:10px;top:9px}.style-sample.minimal{background:#F2F2EC;color:#171A18}.style-sample.heatmap{background:#0C1724;color:#F3F7FB}.style-sample.heatmap i{height:8px;background:linear-gradient(90deg,#26715E 0 12%,#A16530 12% 24%,#26715E 24% 52%,#344A60 52% 64%,#26715E 64% 100%)}.style-preview{margin-top:9px}.option{background:var(--soft);border:1px solid transparent;border-radius:12px;min-height:40px;font-size:12px;font-weight:600;padding:8px 4px}.option.on{background:var(--accent-bg);border-color:var(--accent);color:var(--accent)}.swatch{display:block;width:24px;height:24px;border-radius:9px;margin:0 auto 5px}.form-control{width:100%;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:12px;padding:11px;font-size:16px;min-height:44px}.form-control+ .form-control{margin-top:8px}textarea.form-control{resize:vertical;min-height:76px}.muted-note{font-size:12px;color:var(--muted);line-height:1.6;margin-top:9px}.tool-row{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:13px 0;border-top:1px solid var(--line);font-size:14px}.tool-row span:last-child{color:var(--muted)}.toast{position:fixed;bottom:max(20px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:#17283f;color:white;padding:12px 18px;border-radius:13px;z-index:20;font-size:13px;max-width:90%;width:max-content;box-shadow:0 5px 20px #0003}.toast[hidden]{display:none}.filter{display:flex;gap:5px;overflow:auto;margin-bottom:8px}.filter button{white-space:nowrap}.filter .on{background:var(--accent-bg);color:var(--accent)}@media(max-width:350px){.wrap{padding-left:10px;padding-right:10px}.card{padding:12px}.week,.calendar{gap:3px}.day{min-height:42px;border-radius:9px}.day em{font-size:8px}.month-title{font-size:17px}.month-nav{gap:3px}.month-nav button{padding:6px}.month-nav .arrow{width:31px}}@media(prefers-color-scheme:dark){:root{--bg:#11141b;--card:#1b202a;--ink:#e9edf4;--muted:#a1aec0;--line:#303745;--soft:#262e3a;--accent:#91b4ff;--accent-bg:#283b5b;--good:#75d7b3;--good-bg:#19382e;--bad:#ffad9e;--bad-bg:#452a2a;--warn:#f4c477;--warn-bg:#413525}.primary{color:#101a2a}body[data-theme=teal]{--accent:#77d8c6;--accent-bg:#20413d}body[data-theme=slate]{--accent:#bac5da;--accent-bg:#343e51}}\n#boot-status[hidden]{display:none!important}#boot-status{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}#boot-status[data-error]{color:var(--bad)}.boot-card{display:flex;align-items:center;gap:10px;min-height:52px;color:var(--muted)}.boot-dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 5px var(--accent-bg);flex:none}\n</style></head><body><main class=\"wrap\"><header class=\"top\"><div><div class=\"eyebrow\">考勤 · 管理工作台</div><h1>考勤管理</h1></div><div class=\"tools\"><button class=\"icon-btn\" id=\"refresh\" aria-label=\"同步考勤\"><svg viewBox=\"0 0 24 24\"><path d=\"M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7\"/></svg></button><button class=\"icon-btn\" id=\"settings\" aria-label=\"考勤配置\"><svg viewBox=\"0 0 24 24\"><path d=\"M4 7h16M4 17h16\"/><circle cx=\"9\" cy=\"7\" r=\"2.5\" fill=\"var(--card)\"/><circle cx=\"15\" cy=\"17\" r=\"2.5\" fill=\"var(--card)\"/></svg></button></div></header><div class=\"card boot-card\" id=\"boot-status\" role=\"status\"><span class=\"boot-dot\"></span><span id=\"boot-message\">正在加载考勤数据…</span></div><div id=\"hero\"></div><div class=\"section-head\"><h2>月度考勤</h2><span class=\"sub\" id=\"month-summary\"></span></div><div class=\"metric-grid\" id=\"metrics\"></div><div class=\"sync\"><span id=\"sync-status\" role=\"status\"></span><button class=\"mini\" id=\"sync\">补查本月</button></div><section class=\"card\"><div class=\"month-head\"><div class=\"month-title\" id=\"month-title\"></div><div class=\"month-nav\"><button class=\"arrow\" id=\"prev\" aria-label=\"上月\">‹</button><button id=\"current\">本月</button><button class=\"arrow\" id=\"next\" aria-label=\"下月\">›</button></div></div><div class=\"week\"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div><div class=\"calendar\" id=\"calendar\"></div><div class=\"legend\"><span><i class=\"dot normal\"></i>正常</span><span><i class=\"dot warning\"></i>待核查</span><span><i class=\"dot abnormal\"></i>确认异常</span><span><i class=\"dot active\"></i>进行中</span><span><i class=\"dot\"></i>待查 / 休息</span></div></section><div id=\"detail\"></div><section class=\"card\" id=\"averages\"></section><div class=\"section-head\"><h2>考勤核查</h2><span class=\"sub\">仅影响本机判定</span></div><div class=\"filter\" id=\"filters\"></div><section class=\"card review-list\" id=\"review-list\"></section><p class=\"muted-note\" style=\"text-align:center\">考勤助手 · 本机核查不修改企业原始工卡</p></main><div class=\"overlay\" id=\"overlay\" hidden><section class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"modal-title\"><div class=\"modal-head\"><h2 id=\"modal-title\"></h2><button class=\"close\" id=\"close\" aria-label=\"关闭弹窗\">×</button></div><div id=\"modal-content\"></div></section></div><div class=\"toast\" id=\"toast\" role=\"status\" hidden></div><script>\nwindow.__attendanceReady=false;\nwindow.__attendanceRendered=false;\nwindow.attendanceBootError=function(message){var el=document.getElementById('boot-status');if(el){el.hidden=false;el.setAttribute('data-error','1');el.textContent='管理页面初始化失败：'+String(message)+'。请关闭后重新打开；也可在返回菜单后使用“原生考勤管理”。'}};\nwindow.addEventListener('error',function(e){window.attendanceBootError(e.message||'未知脚本错误')});\nwindow.addEventListener('unhandledrejection',function(e){window.attendanceBootError(e.reason&&e.reason.message||e.reason||'未知异步错误')});\nwindow.addEventListener('DOMContentLoaded',function(){window.__attendanceDomReady=true});\n</script><script>\n(function(){'use strict';var model=null,selected='',filter='todo',queue=[],modalType='',draft=null,toastTimer=null;var $=function(id){return document.getElementById(id)};var esc=function(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]})};var statusNames={normal:'正常',warning:'待核查',abnormal:'确认异常',active:'进行中',pending:'待查',rest:'休息',future:'未到'};var tags={normal:'正常',warning:'待核',abnormal:'异常',active:'进行',pending:'待查',rest:'休',future:''};function emit(action,data){queue.push({action:action,data:data||{}})}window.takeAttendanceAction=function(){return 'AH5:'+JSON.stringify(queue.length?queue.shift():{action:'idle'})};function toast(t){if(!t)return;$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(function(){$('toast').hidden=true},3600)}window.attendanceToast=toast;function pill(d){return '<span class=\"pill '+esc(d.uiState)+'\">'+esc(statusNames[d.uiState]||d.status)+'</span>'}function metric(n,l,f,c){return '<button class=\"metric\" data-filter=\"'+f+'\" data-active=\"'+(filter===f)+'\"><b class=\"'+c+'\">'+n+'</b><small>'+l+'</small></button>'}function stats(items){return items.map(function(x){return '<div><small>'+esc(x[0])+'</small><b>'+esc(x[1])+'</b></div>'}).join('')}function line(k,v){return '<div class=\"line\"><span>'+esc(k)+'</span><span>'+esc(v)+'</span></div>'}function render(){if(!model)return;document.body.dataset.theme=model.preferences.theme;var t=model.today;var weeks=model.weeks;var days=[].concat.apply([],weeks).filter(Boolean);var done=days.filter(function(d){return d.uiState==='normal'}).length;var todo=days.filter(function(d){return d.uiState==='warning'}).length;var bad=days.filter(function(d){return d.uiState==='abnormal'}).length;var pending=days.filter(function(d){return d.uiState==='pending'}).length;var active=days.filter(function(d){return d.uiState==='active'}).length;$('hero').innerHTML='<section class=\"card hero'+(t.checkoutMissing?' checkout-warning':'')+'\"><div class=\"hero-top\"><small>今日 · '+esc(model.todayKey)+'</small><span class=\"pill\">'+esc(t.status)+'</span></div><div class=\"hero-main\">'+esc(t.headline)+'</div><small>'+esc(t.subtitle)+'</small><div class=\"progress\" role=\"progressbar\" aria-valuenow=\"'+t.progress+'\" aria-valuemin=\"0\" aria-valuemax=\"100\"><i style=\"width:'+t.progress+'%\"></i></div><div class=\"hero-grid\">'+stats([['上班',t.clockIn],['下班',t.clockOut],['达标时间',t.target]])+'</div><small style=\"display:block;margin-top:10px\" role=\"status\">'+esc(t.checkText||'')+'</small><div class=\"actions\"><button class=\"secondary\" type=\"button\" id=\"check-today\" '+(model.busy||!model.canSync?'disabled':'')+'>'+(model.busy?'检查中…':'检查打卡')+'</button>'+(t.checkoutMissing?'<button class=\"secondary\" id=\"confirm-missed\" type=\"button\" '+(model.busy?'disabled':'')+'>'+(t.missedConfirmed?'撤销漏卡确认':'已无法返回 · 确认漏卡')+'</button>':'')+'</div>'+(t.checkoutMissing&&!t.missedConfirmed?'<div class=\"actions\"><button class=\"secondary\" type=\"button\" id=\"snooze-checkout\" '+(model.busy||t.snoozed?'disabled':'')+'>'+(t.snoozed?'已暂停提醒':'稍后提醒（5分钟）')+'</button></div>':'')+'<div class=\"actions\"><button class=\"secondary\" type=\"button\" id=\"phone-warning\" '+(model.busy?'disabled':'')+'>同步手机警告状态</button></div></section>';$('month-summary').textContent='待查 '+pending+' · 进行中 '+active;$('metrics').innerHTML=metric(done,'正常','normal','good-text')+metric(todo,'待核查','todo','warn-text')+metric(bad,'确认异常','abnormal','bad-text');$('month-title').textContent=model.monthLabel;$('next').disabled=!model.canNext;$('prev').disabled=!model.canPrev;$('current').disabled=model.month===model.currentMonth;$('sync-status').textContent=model.syncText;$('sync').disabled=model.busy||!model.canSync;$('refresh').disabled=model.busy||!model.canSync;$('sync').textContent=model.busy?'同步中…':'补查本月';$('calendar').innerHTML=[].concat.apply([],weeks).map(function(d){if(!d)return '<div></div>';return '<button class=\"day '+d.uiState+(selected===d.key?' selected':'')+(d.key===model.todayKey?' today':'')+'\" data-day=\"'+d.key+'\" aria-label=\"'+esc(d.key+' '+d.status)+'\" '+(d.uiState==='future'?'disabled':'')+'><b>'+Number(d.key.slice(-2))+'</b><em>'+esc(tags[d.uiState])+'</em></button>'}).join('');var d=days.find(function(x){return x.key===selected});$('detail').innerHTML=d&&d.uiState!=='future'?'<section class=\"card\"><div class=\"detail-top\"><h2>'+esc(d.key.slice(5).replace('-',' 月 ')+' 日')+'</h2>'+pill(d)+'</div><div class=\"detail-grid\">'+stats([['上班',d.clockIn],['下班',d.clockOut],['实际工时',d.worked]])+'</div>'+line('系统原判',d.originalStatus)+line('本机判定',d.status)+(d.outSwipe!==d.clockOut?line('原始离场卡',d.outSwipe):'')+(d.leaveHours?line('已批准请假',d.leaveHours+' 小时'):'')+'<div class=\"actions\">'+(d.workday?'<button class=\"primary\" id=\"open-review\">核查与修正</button>':'')+'<button class=\"secondary\" id=\"refresh-day\" '+(model.busy||!model.canSync?'disabled':'')+'>查询此日</button></div></section>':'';$('averages').innerHTML='<div class=\"section-head\" style=\"margin:0 0 10px\"><h3>月度统计</h3><span class=\"sub\">仅统计有效工卡</span></div><div class=\"detail-grid\" style=\"margin:0\">'+stats([['平均上班',model.average.in],['平均下班',model.average.out],['平均工时',model.average.worked]])+'</div>';$('filters').innerHTML=[['todo','待核查'],['abnormal','确认异常'],['reviewed','已核实'],['pending','待查'],['all','全部']].map(function(x){return '<button class=\"mini '+(filter===x[0]?'on':'')+'\" data-filter=\"'+x[0]+'\">'+x[1]+'</button>'}).join('');var list=days.filter(function(d){if(d.uiState==='future')return false;switch(filter){case 'todo':return d.uiState==='warning';case 'abnormal':return d.uiState==='abnormal';case 'reviewed':return d.reviewed;case 'normal':return d.uiState==='normal';case 'pending':return d.uiState==='pending';default:return d.workday||d.reviewed}}).reverse();$('review-list').innerHTML=list.length?list.map(function(d){return '<button class=\"review-row\" data-day=\"'+d.key+'\" data-list=\"1\"><span class=\"date-chip\">'+d.key.slice(5).replace('-','/')+'</span><span class=\"grow\"><strong>'+esc(d.status)+'</strong><small>'+esc(d.clockIn+' – '+d.clockOut+' · '+d.worked)+'</small></span>'+pill(d)+'<span class=\"chevron\">›</span></button>'}).join(''):'<div class=\"empty\">暂无此类记录</div>'}window.setAttendanceModel=function(m){try{var old=model&&model.month;model=m;if(old!==m.month||!selected)selected=m.selected;render();var boot=$('boot-status');if(boot)boot.hidden=true;window.__attendanceRendered=true;return true}catch(error){window.attendanceBootError(error&&error.message||error);throw error}};var parentScrollY=null;function lockParentScroll(){if(parentScrollY!==null)return;parentScrollY=window.scrollY||window.pageYOffset||0;document.body.style.top=(-parentScrollY)+'px';document.documentElement.classList.add('modal-open');document.body.classList.add('modal-open')}function unlockParentScroll(){if(parentScrollY===null)return;var restoreY=parentScrollY;parentScrollY=null;document.body.classList.remove('modal-open');document.documentElement.classList.remove('modal-open');document.body.style.top='';window.scrollTo(0,restoreY)}function closeModal(){modalType='';draft=null;$('overlay').hidden=true;$('modal-content').innerHTML='';$('modal-content').scrollTop=0;unlockParentScroll()}function openModal(type,title,html){lockParentScroll();modalType=type;$('modal-title').textContent=title;$('modal-content').innerHTML=html;$('overlay').hidden=false;$('modal-content').scrollTop=0}var styleFamily='medium';function styleKey(family){return family==='small'?'widgetStyleSmall':family==='large'?'widgetStyleLarge':'widgetStyleMedium'}function settings(){draft={theme:model.preferences.theme,remindMinutes:model.preferences.remindMinutes,widgetStyleSmall:model.preferences.widgetStyleSmall,widgetStyleMedium:model.preferences.widgetStyleMedium,widgetStyleLarge:model.preferences.widgetStyleLarge};styleFamily='medium';openModal('settings','考勤配置','<p class=\"sub\">组件样式按尺寸独立保存；修改后会预览当前尺寸，桌面组件下次刷新生效。</p><div class=\"field-title\">小组件样式</div><div class=\"style-tabs\" id=\"style-size-tabs\"></div><div class=\"widget-style-grid\" id=\"widget-style-options\"></div><button class=\"secondary style-preview\" id=\"preview-widget\">预览当前尺寸</button><div class=\"field-title\">组件配色</div><div class=\"options\" id=\"theme-options\"></div><div class=\"field-title\">提前下班提醒</div><div class=\"options\" id=\"reminder-options\"></div><div class=\"muted-note\">目标工时 '+model.targetHours+' 小时；提醒关闭后会取消已预约的提前通知。</div><div class=\"actions\"><button class=\"secondary\" data-close>关闭</button><button class=\"primary\" id=\"save-settings\">保存配置</button></div><div class=\"field-title\">账户与工具</div><button class=\"tool-row\" id=\"account\"><span>账号配置</span><span>'+esc(model.accountLabel)+' ›</span></button><button class=\"tool-row\" id=\"more-tools\"><span>其他工具</span><span>›</span></button>');drawOptions()}function drawWidgetStyles(){var tabs=[['small','小号'],['medium','中号'],['large','大号']];$('style-size-tabs').innerHTML=tabs.map(function(x){return '<button class=\"style-tab '+(styleFamily===x[0]?'on':'')+'\" data-style-family=\"'+x[0]+'\">'+x[1]+'</button>'}).join('');var current=draft[styleKey(styleFamily)];var options=[['cyber','赛博控制台','霓虹仪表 · 工时倒计时','04:28','运行中'],['fitness','运动环形','目标进度 · 工时累计','04h32m','目标进度'],['minimal','极简工时账本','清晰排版 · 每日记录','04:28','剩余工时'],['heatmap','月历热力图','整月状态 · 一目了然','15 天','本月考勤']];$('widget-style-options').innerHTML=options.map(function(x){return '<button class=\"widget-style-card '+(current===x[0]?'on':'')+'\" data-widget-style=\"'+x[0]+'\"><div class=\"style-sample '+x[0]+'\"><b>'+x[3]+'</b><span>'+x[4]+'</span><i></i></div><strong>'+x[1]+'</strong><small>'+x[2]+'</small></button>'}).join('')}function drawOptions(){ $('theme-options').innerHTML=[['navy','深海蓝','#315fbd'],['teal','松石绿','#167e74'],['slate','岩灰','#5a637a']].map(function(x){return '<button class=\"option '+(draft.theme===x[0]?'on':'')+'\" data-theme-choice=\"'+x[0]+'\"><i class=\"swatch\" style=\"background:'+x[2]+'\"></i>'+x[1]+'</button>'}).join('');$('reminder-options').innerHTML=[5,15,30,45,60,0].map(function(x){return '<button class=\"option '+(draft.remindMinutes===x?'on':'')+'\" data-reminder=\"'+x+'\">'+(x?x+' 分钟':'关闭')+'</button>'}).join('');drawWidgetStyles()}function review(d){if(!d||!d.workday)return;draft={key:d.key,leaveHours:d.leaveHours||0};openModal('review','核查 '+d.key.slice(5),'<p class=\"sub\">原判：'+esc(d.originalStatus)+'</p><div class=\"detail-grid\">'+stats([['上班',d.clockIn],['下班',d.clockOut],['工时',d.worked]])+'</div><div class=\"actions\"><button class=\"primary\" data-quick-review=\"normal\">确认正常</button><button class=\"danger\" data-quick-review=\"abnormal\">确认异常</button></div><div class=\"field-title\">请假时长（可选）</div><input class=\"form-control\" id=\"hours\" type=\"number\" inputmode=\"decimal\" min=\"0\" max=\"'+model.targetHours+'\" step=\"any\" value=\"'+d.leaveHours+'\"><button class=\"secondary\" id=\"save-review\" style=\"margin-top:8px\">按请假时长判断</button>'+(d.reviewed?'<button class=\"secondary\" id=\"reset-review\" style=\"margin-top:8px\">恢复原判</button>':''))}function account(){openModal('account','账号配置','<p class=\"sub\">账户信息通过 Scriptable 钥匙串保存。不会向页面回传已有密码。</p><div class=\"field-title\">账号</div><input class=\"form-control\" id=\"username\" autocomplete=\"username\" value=\"'+esc(model.accountUsername)+'\"><div class=\"field-title\">密码</div><input class=\"form-control\" type=\"password\" id=\"password\" autocomplete=\"current-password\" placeholder=\"'+(model.accountConfigured?'留空保留原密码（同账号）':'输入密码')+'\"><div class=\"field-title\">设备编号</div><input class=\"form-control\" id=\"device\" value=\"'+esc(model.accountDevice)+'\"><div class=\"actions\"><button class=\"secondary\" data-close>取消</button><button class=\"primary\" id=\"save-account\">保存账户</button></div>')}function tools(){openModal('tools','小组件与维护','<p class=\"sub\">使用原脚本的功能，组件预览及 诊断 可能弹出原生窗口。</p>'+[['previewSmall','预览小号小组件'],['previewMedium','预览中号小组件'],['previewLarge','预览大号组件'],['check','检查打卡'],['leave','离开公司检查'],['schedule9','预约工时提醒'],['near9','检查工时提醒'],['debug','诊断信息'],['update','从代码仓库更新脚本']].map(function(x){return '<button class=\"tool-row\" data-tool=\"'+x[0]+'\"><span>'+x[1]+'</span><span>›</span></button>'}).join('')+'<p class=\"muted-note\">仓库更新会覆盖本地代码；请先将新版提交至仓库。</p>')}function selectedDay(){return [].concat.apply([],model.weeks).find(function(d){return d&&d.key===selected})}function sendAndClose(action,data){emit(action,data);closeModal()}document.addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled||!model)return;var ds=b.dataset;if(ds.day){selected=ds.day;render();if(ds.list){var d=selectedDay();if(d&&d.workday)review(d)}return}if(ds.filter){filter=ds.filter;render();return}if(ds.themeChoice){draft.theme=ds.themeChoice;drawOptions();return}if(ds.reminder!==undefined){draft.remindMinutes=Number(ds.reminder);drawOptions();return}if(ds.styleFamily){styleFamily=ds.styleFamily;drawWidgetStyles();return}if(ds.widgetStyle){draft[styleKey(styleFamily)]=ds.widgetStyle;drawWidgetStyles();return}if(ds.quickReview){sendAndClose('review',{key:draft.key,decision:ds.quickReview,leaveHours:draft.leaveHours});return}if(ds.close!==undefined||b.id==='close'){closeModal();return}if(ds.tool){if(ds.tool==='update'){openModal('update','确认更新','<p class=\"muted-note\">更新将覆盖本地脚本。确定仓库中已经包含这一版管理页？</p><div class=\"actions\"><button class=\"secondary\" data-close>取消</button><button class=\"primary\" id=\"confirm-update\">确认更新</button></div>')}else sendAndClose('tool',{name:ds.tool});return}switch(b.id){case 'settings':settings();break;case 'prev':emit('month',{offset:-1});break;case 'next':emit('month',{offset:1});break;case 'current':emit('month',{offset:0});break;case 'sync':emit('sync',{});break;case 'refresh':emit('refreshToday',{});break;case 'check-today':emit('checkToday',{});break;case 'snooze-checkout':emit('snoozeCheckout',{});break;case 'phone-warning':emit('phoneWarning',{});break;case 'confirm-missed':if(model.busy||!model.today.checkoutMissing)return;var nextMissed=!model.today.missedConfirmed;draft={key:model.todayKey,missedConfirmed:nextMissed};openModal('missed',nextMissed?'确认无法返回打卡':'撤销漏卡确认','<p class=\"muted-note\">'+(nextMissed?'确认今天无法返回公司打卡？将标记为已确认漏卡。本次将占用一次漏卡机会。此操作只记录本机状态，不修改企业考勤。':'撤销后恢复未打下班卡警告，不会修改企业工卡。')+'</p><div class=\"actions\"><button type=\"button\" class=\"secondary\" data-close>取消</button><button type=\"button\" class=\"danger\" id=\"save-missed\">'+(nextMissed?'确认漏卡':'确认撤销')+'</button></div>');break;case 'save-missed':if(modalType!=='missed'||!draft||model.busy)return;sendAndClose('confirmMissed',{key:draft.key,confirmed:draft.missedConfirmed});break;case 'refresh-day':emit('refreshDay',{key:selected});break;case 'open-review':review(selectedDay());break;case 'save-settings':sendAndClose('settings',{theme:draft.theme,remindMinutes:draft.remindMinutes,widgetStyleSmall:draft.widgetStyleSmall,widgetStyleMedium:draft.widgetStyleMedium,widgetStyleLarge:draft.widgetStyleLarge,previewFamily:styleFamily,previewStyle:draft[styleKey(styleFamily)]});break;case 'preview-widget':emit('previewWidget',{family:styleFamily,style:draft[styleKey(styleFamily)]});break;case 'save-review':var val=$('hours').value;var h=Number(val);if(val===''||!Number.isFinite(h)||h<0||h>model.targetHours){toast('请输入有效的请假小时数');return}sendAndClose('review',{key:draft.key,decision:'auto',leaveHours:h});break;case 'reset-review':sendAndClose('resetReview',{key:draft.key});break;case 'account':account();break;case 'save-account':var u=$('username').value.trim(),p=$('password').value,dev=$('device').value.trim();if(!u||!dev||(!p&&(u!==model.accountUsername||!model.accountConfigured))){toast('请填写完整的账户资料');return}sendAndClose('account',{username:u,password:p,deviceId:dev});break;case 'more-tools':tools();break;case 'confirm-update':sendAndClose('tool',{name:'update'});break}});$('overlay').addEventListener('click',function(e){if(e.target===$('overlay'))closeModal()});$('overlay').addEventListener('touchmove',function(e){if(!e.target.closest('#modal-content'))e.preventDefault()},{passive:false});document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal()});\nwindow.__attendanceReady=true;\nwindow.__attendanceReadyAt=Date.now();\n})();\n\n</script></body></html>\n"
}


async function reviewAttendanceDay(day) {
    const detail = new Alert()
    detail.title = day.key + " · " + day.status
    detail.message = "上班 " + day.clockIn + "　下班 " + day.clockOut + "\n实际工时 " + day.worked + "\n系统原判：" + day.originalStatus + "\n本机判定：" + day.status + "\n请假：" + day.leaveHours + " 小时"
    if (!day.workday) { detail.addAction("关闭"); await detail.presentAlert(); return false }
    if (!CONFIG.USERNAME) { await presentMessage("无法核查", "请先配置账号"); return false }
    detail.addAction("按规则判断 / 记录请假")
    detail.addAction("确认正常")
    detail.addAction("确认异常")
    if (day.review) detail.addDestructiveAction("撤销修正")
    detail.addCancelAction("取消")
    const action = await detail.presentAlert()
    if(action<0)return false
    const key="attendance-review-v1:"+CONFIG.USERNAME+":"+day.key
    if(action===3){if(Keychain.contains(key))Keychain.remove(key);return true}
    const decision=["auto","normal","abnormal"][action]
    if(!decision)return false
    if(decision!=="auto") {
        Keychain.set(key,JSON.stringify({leaveHours:day.leaveHours||0,confirmed:decision==="normal",decision,reviewedAt:new Date().toISOString()}))
        return true
    }
    const input=new Alert()
    input.title="请假时长"
    input.addTextField("已批准请假小时数",String(day.leaveHours||0))
    input.addAction("保存")
    input.addCancelAction("取消")
    if(await input.presentAlert()!==0)return false
    const raw=input.textFieldValue(0).trim(), hours=Number(raw)
    if(!raw||!Number.isFinite(hours)||hours<0||hours>CONFIG.TARGET_HOURS){
        await presentMessage("无法保存","请输入有效请假时长。")
        return false
    }
    if(decision==="auto"&&!hours){if(Keychain.contains(key))Keychain.remove(key)}
    else Keychain.set(key,JSON.stringify({leaveHours:hours,confirmed:decision==="normal",decision,reviewedAt:new Date().toISOString()}))
    return true
}

/**
 * 根据所选月份已取得的工卡计算平均工时与打卡时刻。
 *
 * @param table 原生考勤统计表
 * @param days 所选月份的日期明细
 * @param palette 当前主题色
 * @author Kai
 * @date 2026/11/25 12:57
 */
function addAttendanceMonthlyStats(table, days, palette) {
    const workdays = days.filter(day => day.workday)
    // 分别统计三种样本，缺失工卡不会被当成零值计入平均。
    const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const formatAverageClock = field => {
        const clocks = workdays.map(day => day[field]).filter(date => date && Number.isFinite(date.getTime()))
        const average = mean(clocks.map(date => date.getHours() * 60 + date.getMinutes()))
        if (average === null) return "—"
        const minutes = Math.round(average) % (24 * 60)
        return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0")
    }
    const duration = mean(workdays.map(day => day.workedMs).filter(Number.isFinite))
    const row = new UITableRow()
    row.height = 68
    row.cellSpacing = 0
    row.backgroundColor = new Color(palette.paper)
    for (const [value, label] of [
        [duration === null ? "—" : formatShortDuration(duration), "平均工时"],
        [formatAverageClock("clockInAt"), "平均上班"],
        [formatAverageClock("clockOutAt"), "平均下班"]
    ]) {
        const item = row.addText(value, label)
        item.widthWeight = 1
        item.centerAligned()
        item.titleColor = new Color(palette.accent)
        item.titleFont = Font.boldSystemFont(17)
        item.subtitleColor = new Color(palette.muted)
        item.subtitleFont = Font.systemFont(10)
    }
    table.addRow(row)
}

/**
 * 以 iOS 原生弹出菜单管理组件主题与提前提醒。
 *
 * 设置独立于月历内容，不再把选项展开插入日历网格，避免页面跳动和布局变形。
 * @author Kai
 * @date 2026/11/25 13:20
 */
async function presentAttendanceSettings() {
    const themeOptions = [
        ["navy", "深海蓝"],
        ["teal", "松石绿"],
        ["slate", "岩灰"]
    ]
    const reminderOptions = [
        [5, "提前 5 分钟"],
        [15, "提前 15 分钟"],
        [30, "提前 30 分钟"],
        [45, "提前 45 分钟"],
        [60, "提前 60 分钟"],
        [0, "关闭提前提醒"]
    ]

    // 选完一项后回到设置首页，方便连续修改主题和提醒。
    while (true) {
        const preferences = readAttendancePreferences()
        const themeName = (themeOptions.find(item => item[0] === preferences.theme) || themeOptions[0])[1]
        const reminderName = (reminderOptions.find(item => item[0] === preferences.remindMinutes) || reminderOptions[0])[1]
        const menu = new Alert()
        menu.title = "考勤设置"
        menu.message = "组件主题：" + themeName + "\n提前提醒：" + reminderName + "\n\n选择要调整的项目"
        const styleLabels = { cyber: "赛博控制台", fitness: "运动环形", minimal: "极简工时账本", heatmap: "月历热力图" }
        menu.message += "\n小号：" + styleLabels[preferences.widgetStyleSmall]
            + "\n中号：" + styleLabels[preferences.widgetStyleMedium]
            + "\n大号：" + styleLabels[preferences.widgetStyleLarge]
        menu.addAction("管理页面配色")
        menu.addAction("提前下班提醒")
        menu.addAction("小组件样式")
        menu.addCancelAction("完成")
        const action = await menu.presentSheet()

        if (action === 0) {
            const picker = new Alert()
            picker.title = "管理页面配色"
            picker.message = "选择考勤管理页面与原生月历的配色"
            for (const [value, label] of themeOptions) {
                picker.addAction((preferences.theme === value ? "✓  " : "") + label)
            }
            picker.addCancelAction("返回")
            const index = await picker.presentSheet()
            if (index >= 0 && index < themeOptions.length) {
                const previous = readAttendancePreferences()
                try {
                    await saveAttendancePreferences({ ...previous, theme: themeOptions[index][0] }, previous)
                } catch (error) {
                    await presentMessage("保存设置失败", String(error && error.message ? error.message : error))
                }
            }
            continue
        }

        if (action === 1) {
            const picker = new Alert()
            picker.title = "提前下班提醒"
            picker.message = "达到目标工时前，提前多久通知你？"
            for (const [value, label] of reminderOptions) {
                picker.addAction((preferences.remindMinutes === value ? "✓  " : "") + label)
            }
            picker.addCancelAction("返回")
            const index = await picker.presentSheet()
            if (index >= 0 && index < reminderOptions.length) {
                const previous = readAttendancePreferences()
                try {
                    await saveAttendancePreferences({ ...previous, remindMinutes: reminderOptions[index][0] }, previous)
                } catch (error) {
                    await presentMessage("保存设置失败", String(error && error.message ? error.message : error))
                }
            }
            continue
        }

        if (action === 2) {
            const families = [["small", "小号"], ["medium", "中号"], ["large", "大号"]]
            const familyPicker = new Alert()
            familyPicker.title = "选择组件尺寸"
            families.forEach(item => familyPicker.addAction(item[1]))
            familyPicker.addCancelAction("返回")
            const familyIndex = await familyPicker.presentSheet()
            if (familyIndex < 0 || familyIndex >= families.length) continue
            const family = families[familyIndex][0]
            const key = widgetStyleKey(family)
            const stylePicker = new Alert()
            stylePicker.title = families[familyIndex][1] + "组件样式"
            const styleOptions = [["cyber", "赛博控制台"], ["fitness", "运动环形"], ["minimal", "极简工时账本"], ["heatmap", "月历热力图"]]
            styleOptions.forEach(item => stylePicker.addAction((preferences[key] === item[0] ? "✓  " : "") + item[1]))
            stylePicker.addCancelAction("返回")
            const styleIndex = await stylePicker.presentSheet()
            if (styleIndex >= 0 && styleIndex < styleOptions.length) {
                const previous = readAttendancePreferences()
                const style = styleOptions[styleIndex][0]
                await saveAttendancePreferences({ ...previous, [key]: style }, previous)
                const preview = new Alert()
                preview.title = "样式已保存"
                preview.message = "是否立即预览这个尺寸？"
                preview.addAction("预览")
                preview.addCancelAction("稍后")
                if (await preview.presentAlert() === 0) await runWidgetUpdate({ presentPreview: true, family, style })
            }
            continue
        }

        break
    }
}

/**
 * 在原生月历中查看考勤并补查当前月份的缺失工卡。
 *
 * @param initialMonth 从小组件进入时传入的 yyyy-MM 月份
 * @author Kai
 * @date 2026/11/25 12:57
 */
async function presentNativeAttendanceHistory(initialMonth) {
    const table = new UITable()
    const todayKey = formatDateKey(now)
    const current = attendanceMonth()
    const checked = new Map()
    const holidays = {}
    const knownYears = new Set()
    // 翻月后的补查使用新的选月，已有查询结果仍可复用。
    let month = attendanceMonth(initialMonth)
    if (month > current) month = current
    let open = true
    let presented = false
    let syncing = false
    let syncFailed = false
    let monthChanged = false
    // 按日期保存选中项，自动补查后仍停留在用户正在看的那天。
    let selectedKey = month.getTime() === current.getTime() ? todayKey : formatDateKey(month)

    /**
     * 重绘选月日历，异常列表和日期格共用同一个核查入口。
     *
     * @author Kai
     * @date 2026/11/25 11:47
     */
    function draw() {
        const weeks = attendanceMonthWeeks(month).map(week => week.map(date =>
            date && formatDateKey(date) <= todayKey ? buildAttendanceHistoryDay(date, holidays, checked) : date
        ))
        const days = weeks.flat().filter(day => day && day.key)
        const warnings = days.filter(day => day.state === "warning")
        const normal = days.filter(day => day.state === "normal").length
        const pending = days.filter(day => day.workday && day.state === "neutral").length
        const selected = days.find(day => day.key === selectedKey)

        table.removeAllRows()
        const palette = { ...attendancePalette(), surface: "#FFFFFF", muted: "#687487", neutral: "#8491A2", warning: "#C24141", normal: "#168466", active: "#315FBD" }
        table.showSeparators = false

        // 页面标题卡片。
        const heading = new UITableRow()
        heading.height = 82
        heading.backgroundColor = new Color(palette.ink)
        const title = heading.addText(
            month.getFullYear() + " 年 " + (month.getMonth() + 1) + " 月",
            "考勤月历  ·  工时统计与异常核查"
        )
        title.titleFont = Font.boldSystemFont(24)
        title.titleColor = Color.white()
        title.subtitleFont = Font.systemFont(11)
        title.subtitleColor = new Color("#D2DCE8")
        table.addRow(heading)
        const td = buildAttendanceHistoryDay(now, holidays, checked)
        if (td.checkoutMissing) {
            const alertRow = new UITableRow(); alertRow.height = 60; alertRow.backgroundColor = new Color("#782626")
            const alertText = alertRow.addText(td.missedConfirmed ? "⚠ 已确认漏卡" : "⚠ 未打下班卡", td.missedConfirmed ? "已使用一次漏卡机会 · 点击撤销确认" : "工时已达标 · 点击确认无法返回")
            alertRow.dismissOnSelect = false
            alertRow.onSelect = async () => {
                const ask = new Alert(); ask.title = td.missedConfirmed ? "撤销漏卡确认" : "确认无法返回打卡"; ask.message = "仅记录本机漏卡状态，不修改企业原始考勤"; ask.addAction("确认"); ask.addCancelAction("取消")
                if(await ask.presentAlert() !== 0 || !CONFIG.USERNAME) return
                const key = missedCheckoutKey(todayKey); if(td.missedConfirmed) Keychain.remove(key); else {Keychain.set(key,"1"); clearCheckoutSnooze(); await cancelCheckoutEscalation()} draw(); table.reload()
            }
            alertText.titleColor = Color.white(); alertText.subtitleColor = Color.white(); table.addRow(alertRow)
        }

        // 设置使用原生弹出层，不在日历中内联展开，保证月历网格始终稳定。
        const settingsRow = new UITableRow()
        settingsRow.height = 42
        settingsRow.backgroundColor = new Color(palette.surface)
        const settingsButton = settingsRow.addButton("⚙  考勤设置")
        settingsButton.widthWeight = 1
        settingsButton.centerAligned()
        settingsButton.titleFont = Font.semiboldSystemFont(12)
        settingsButton.titleColor = new Color(palette.accent)
        settingsButton.dismissOnTap = false
        settingsButton.onTap = async () => {
            await presentAttendanceSettings()
            draw()
        }
        table.addRow(settingsRow)

        // 月度状态概览。
        const metricsTitle = new UITableRow()
        metricsTitle.height = 34
        metricsTitle.backgroundColor = new Color(palette.surface)
        const metricsLabel = metricsTitle.addText("本月概况", "按已获取的工作日记录统计")
        metricsLabel.titleFont = Font.semiboldSystemFont(13)
        metricsLabel.titleColor = new Color(palette.ink)
        metricsLabel.subtitleFont = Font.systemFont(10)
        metricsLabel.subtitleColor = new Color(palette.muted)
        table.addRow(metricsTitle)

        const metrics = new UITableRow()
        metrics.height = 66
        metrics.cellSpacing = 0
        metrics.backgroundColor = new Color(palette.paper)
        for (const [count, label, tint] of [
            [normal, "正常", palette.normal],
            [warnings.length, "异常", palette.warning],
            [pending, "待查", palette.neutral]
        ]) {
            const metric = metrics.addText(String(count), label)
            metric.widthWeight = 1
            metric.centerAligned()
            metric.titleFont = Font.boldSystemFont(21)
            metric.titleColor = new Color(tint)
            metric.subtitleFont = Font.systemFont(10)
            metric.subtitleColor = new Color(palette.muted)
        }
        table.addRow(metrics)

        // 月份切换。
        const controls = new UITableRow()
        controls.height = 46
        controls.cellSpacing = 6
        controls.backgroundColor = new Color(palette.surface)
        for (const [label, date] of [
            ["‹ 上月", new Date(month.getFullYear(), month.getMonth() - 1, 1)],
            ["回到本月", current],
            ["下月 ›", new Date(month.getFullYear(), month.getMonth() + 1, 1)]
        ]) {
            const canNavigate = date <= current
            const cell = canNavigate ? controls.addButton(label) : controls.addText(label)
            cell.widthWeight = 1
            cell.centerAligned()
            cell.titleFont = Font.semiboldSystemFont(12)
            cell.titleColor = new Color(canNavigate ? palette.accent : "#B7C0CC")
            if (!canNavigate) continue
            cell.dismissOnTap = false
            cell.onTap = () => {
                if (date.getTime() === month.getTime()) return
                month = date
                selectedKey = date.getTime() === current.getTime() ? todayKey : formatDateKey(date)
                monthChanged = true
                syncFailed = false
                // 重新进入月份时重试失败查询，成功记录继续从快照读取。
                for (const [key, result] of checked) {
                    if (!result) checked.delete(key)
                }
                draw()
                startSync()
            }
        }
        table.addRow(controls)

        const calendarTitle = new UITableRow()
        calendarTitle.height = 36
        calendarTitle.backgroundColor = new Color(palette.surface)
        const calendarLabel = calendarTitle.addText("每日考勤", "点击日期查看工卡和核查记录")
        calendarLabel.titleFont = Font.semiboldSystemFont(13)
        calendarLabel.titleColor = new Color(palette.ink)
        calendarLabel.subtitleFont = Font.systemFont(10)
        calendarLabel.subtitleColor = new Color(palette.muted)
        table.addRow(calendarTitle)

        // 状态图例与日期网格使用相同的列间距，避免星期标题和日期错位。
        const legend = new UITableRow()
        legend.height = 32
        legend.cellSpacing = 3
        legend.backgroundColor = new Color(palette.surface)
        for (const [label, tint] of [
            ["✓ 正常", palette.normal],
            ["! 异常", palette.warning],
            ["● 进行中", palette.active],
            ["· 待查", palette.neutral],
            ["休 休息", "#9AA5B4"]
        ]) {
            const item = legend.addText(label)
            item.widthWeight = 1
            item.centerAligned()
            item.titleFont = Font.systemFont(9)
            item.titleColor = new Color(tint)
        }
        table.addRow(legend)

        const weekdays = new UITableRow()
        weekdays.cellSpacing = 3
        weekdays.height = 32
        weekdays.backgroundColor = new Color(palette.paper)
        for (const weekday of "一二三四五六日") {
            const label = weekdays.addText(weekday)
            label.widthWeight = 1
            label.titleFont = Font.semiboldSystemFont(11)
            label.titleColor = new Color(palette.muted)
            label.centerAligned()
        }
        table.addRow(weekdays)

        // 七列固定等宽；日期与状态符号放在同一格，选中日单独使用主题强调色。
        const dateColors = {
            normal: palette.normal,
            warning: palette.warning,
            active: palette.active,
            neutral: palette.neutral
        }
        const stateMarks = { normal: "✓", warning: "!", active: "●", neutral: "·" }
        for (const week of weeks) {
            const row = new UITableRow()
            row.height = 42
            row.cellSpacing = 3
            row.backgroundColor = new Color(palette.surface)

            for (const day of week) {
                if (!day || !day.key) {
                    const empty = row.addText(day ? String(day.getDate()) : " ")
                    empty.widthWeight = 1
                    empty.centerAligned()
                    empty.titleFont = Font.mediumSystemFont(12)
                    empty.titleColor = new Color("#C2CAD4")
                    continue
                }

                const isSelected = day.key === selectedKey
                const isToday = day.key === todayKey
                const mark = !day.workday ? "休" : (stateMarks[day.state] || "·")
                const titleText = (isToday ? "今" : isSelected ? "◆" : mark) + String(Number(day.key.slice(-2)))
                const cell = row.addButton(titleText)
                cell.widthWeight = 1
                cell.centerAligned()
                cell.titleFont = isSelected ? Font.boldSystemFont(13) : Font.semiboldSystemFont(12)
                cell.titleColor = new Color(isSelected
                    ? palette.accent
                    : day.workday ? (dateColors[day.state] || palette.neutral) : "#9AA5B4")
                cell.dismissOnTap = false
                cell.onTap = () => {
                    selectedKey = day.key
                    draw()
                }
            }
            table.addRow(row)
        }

        addAttendanceMonthlyStats(table, days, palette)

        if (selected) {
            const detail = new UITableRow()
            detail.height = 70
            detail.backgroundColor = new Color(palette.paper)
            const text = detail.addText(
                selected.key + "  ·  " + selected.status,
                "上班 " + selected.clockIn + "   ·   下班 " + selected.clockOut
                    + "   ·   工时 " + selected.worked
            )
            text.titleFont = Font.semiboldSystemFont(14)
            text.titleColor = new Color(palette.ink)
            text.subtitleFont = Font.systemFont(11)
            text.subtitleColor = new Color(palette.muted)
            table.addRow(detail)

            const action = new UITableRow()
            action.height = 44
            action.backgroundColor = new Color(palette.surface)
            const check = action.addButton("查看原始工卡与核查记录  ›")
            check.centerAligned()
            check.titleFont = Font.semiboldSystemFont(12)
            check.titleColor = new Color(palette.accent)
            check.dismissOnTap = false
            check.onTap = async () => {
                if (await reviewAttendanceDay(selected)) draw()
            }
            table.addRow(action)
        }

        const notice = new UITableRow()
        notice.height = 56
        notice.backgroundColor = new Color(palette.surface)
        const noticeText = notice.addText(
            "异常与待核查",
            syncing ? "正在补查本月考勤记录…"
                : syncFailed ? "补查中断，重新打开页面可重试"
                    : warnings.length ? warnings.length + " 个日期需要核查，点击下方项目处理"
                        : pending ? pending + " 个工作日等待补查"
                            : "本月暂无待核查异常"
        )
        noticeText.titleFont = Font.semiboldSystemFont(13)
        noticeText.titleColor = new Color(palette.ink)
        noticeText.subtitleFont = Font.systemFont(10)
        noticeText.subtitleColor = new Color(palette.muted)
        table.addRow(notice)

        for (const day of warnings) {
            const row = new UITableRow()
            row.height = 46
            row.backgroundColor = new Color("#FFF7F2")
            const check = row.addButton(day.key.slice(5) + "  ·  " + day.status + "  ›")
            check.leftAligned()
            check.titleFont = Font.mediumSystemFont(12)
            check.titleColor = new Color(palette.warning)
            check.dismissOnTap = false
            check.onTap = async () => {
                if (await reviewAttendanceDay(day)) draw()
            }
            table.addRow(row)
        }

        if (presented) table.reload()
    }

    /**
     * 依次补查所选月份的节假日表和缺失工卡。
     *
     * @author Kai
     * @date 2026/11/25 11:47
     */
    async function startSync() {
        if (syncing) return
        syncing = true
        draw()
        try {
            while (open) {
                monthChanged = false
                const year = month.getFullYear()
                if (!knownYears.has(year)) {
                    const cached = readAttendanceRecord("attendance-history-calendar-" + year)
                    holidays[year] = cached?.holidays
                    knownYears.add(year)
                    holidays[year] = await loadHistoryHolidays(year, cached)
                } else {
                    const next = attendanceMonthWeeks(month).flat().find(date => date
                        && formatDateKey(date) <= todayKey
                        && historyDayKind(date, holidays).workday
                        && !checked.has(formatDateKey(date))
                        && !readHistorySnapshot(date))
                    if (!next) break
                    const result = await getAttendanceSummary(next)
                    checked.set(formatDateKey(next), result.ok ? result : null)
                }
                if (open) draw()
            }
        } catch (error) {
            syncFailed = true
            console.log("考勤历史补查失败：" + String(error))
        } finally {
            syncing = false
            if (open) draw()
            if (open && monthChanged) startSync()
        }
    }

    draw()
    const closed = table.present(true)
    presented = true
    if (readStoredToken() || (CONFIG.USERNAME && CONFIG.PASSWORD && CONFIG.DEVICE_ID)) startSync()
    try {
        await closed
    } finally {
        open = false
    }
}


/**
 * 生成打开考勤月历的 Scriptable 链接。
 *
 * @param month 可选的目标月份，格式为 yyyy-MM
 * @return 考勤月历链接
 * @author Kai
 * @date 2026/11/25 11:47
 */
function getWeeklyAttendanceUrl(month) {
    const runUrl = URLScheme.forRunningScript()
    return runUrl + (runUrl.includes("?") ? "&" : "?") + "mode=week"
        + (month ? "&month=" + encodeURIComponent(month) : "")
}

// ==================== 大号组件 ====================

/**
 * 用本地快照绘制近期考勤汇总与日期状态。
 *
 * @param widget 承载统计区的桌面组件
 * @param data 本次刷新取得的今日考勤
 * @param count 展示的自然日数
 * @param standalone 是否单独展示统计
 * @author Kai
 * @date 2026/11/25 12:18
 */
function renderWidgetAttendanceStats(widget, data, count, standalone) {
    const dates = Array.from({ length: count }, (_, index) => addDays(now, index - count + 1))
    const holidays = {}
    for (const year of new Set(dates.map(date => date.getFullYear()))) {
        holidays[year] = readAttendanceRecord("attendance-history-calendar-" + year)?.holidays
    }
    // 组件只使用本地快照，历史详情页负责补查缺失日期。
    const checked = data.ok ? new Map([[formatDateKey(now), data]]) : new Map()
    const days = dates.map(date => buildAttendanceHistoryDay(date, holidays, checked))
    const normal = days.filter(day => day.state === "normal").length
    const warnings = days.filter(day => day.state === "warning").length
    const settled = days.filter(day => day.workday && day.workedMs !== null)
    const average = settled.length
        ? formatShortDuration(settled.reduce((sum, day) => sum + day.workedMs, 0) / settled.length)
        : "—"
    addCompactHeader(widget, "近 " + count + " 天考勤")
    widget.addSpacer(5)
    const totals = widget.addText("达标 " + normal + " · 待核对 " + warnings + " · 平均 " + average)
    totals.font = Font.boldSystemFont(standalone ? 15 : 12)
    totals.textColor = Color.white()
    totals.lineLimit = 1
    totals.minimumScaleFactor = 0.7

    // 按天显示与历史页一致的状态，用符号区分休息和无记录。
    const states = {
        normal: ["✓", "#166254"],
        active: ["·", "#225DA4"],
        warning: ["!", "#7A552A"],
        neutral: ["?", "#3D5069"]
    }
    for (let start = 0; start < count; start += 7) {
        widget.addSpacer(6)
        const row = widget.addStack()
        row.spacing = 4
        for (const day of days.slice(start, start + 7)) {
            const [symbol, color] = day.workday ? states[day.state] : ["—", "#283649"]
            const tile = row.addStack()
            tile.layoutVertically()
            tile.setPadding(4, 4, 4, 4)
            tile.backgroundColor = new Color(color)
            tile.cornerRadius = 5
            tile.size = new Size(32, 33)
            for (const value of [day.key.slice(-2), symbol]) {
                const label = tile.addText(value)
                label.centerAlignText()
                label.font = Font.mediumSystemFont(10)
                label.textColor = Color.white()
            }
        }
    }
}

/**
 * 保存翻月动作指定的目标月份，供组件自动重绘时读取。
 *
 * @param actionId Scriptable 传入的交互动作标识
 * @return 是否处理了日历翻月动作
 * @author Kai
 * @date 2026/11/25 11:47
 */
function saveWidgetCalendarAction(actionId) {
    const match = /^attendance-month:(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(String(actionId || ""))
    if (!match || attendanceMonth(match[1]) > attendanceMonth()) return false
    Keychain.set("attendance-widget-month:" + CONFIG.USERNAME, match[1])
    return true
}

/**
 * 绘制大号桌面组件的七列月历和翻月入口。
 *
 * @param widget 承载月历的组件容器
 * @param data 本次刷新取得的今日考勤摘要
 * @param contentWidth 去掉两侧外边距后的可用宽度
 * @author Kai
 * @date 2026/11/25 13:00
 */
function renderWidgetMonthCalendar(widget, data, contentWidth, style = "heatmap", options = {}) {
    const stylePalette = widgetStylePalette(style)
    const todayKey = formatDateKey(now)
    const current = attendanceMonth()
    const savedMonth = attendanceMonth(readKeychainValue("attendance-widget-month:" + CONFIG.USERNAME))
    const month = savedMonth > current ? current : savedMonth
    const year = month.getFullYear()
    const monthKey = formatDateKey(month).slice(0, 7)
    const holidays = { [year]: readAttendanceRecord("attendance-history-calendar-" + year)?.holidays }
    const checked = data && data.ok ? new Map([[todayKey, data]]) : new Map()
    const weeks = attendanceMonthWeeks(month).map(week => week.map(date => {
        if (!date) return null
        const key = formatDateKey(date)
        return key <= todayKey
            ? buildAttendanceHistoryDay(date, holidays, checked)
            : { key, workday: false, state: "future" }
    }))
    const days = weeks.flat().filter(Boolean)
    const normal = days.filter(day => day.state === "normal").length
    const warnings = days.filter(day => day.state === "warning").length
    const pending = days.filter(day => day.workday && day.state === "neutral").length

    // 先按可用宽度计算七列，横向留白由 createWidget 的统一 padding 控制。
    const gap = Number.isFinite(options.gap) ? options.gap : 4
    const width = Math.max(20, Math.floor((contentWidth - gap * 6) / 7))
    const gridWidth = width * 7 + gap * 6
    const header = widget.addStack()
    header.layoutHorizontally()
    header.size = new Size(gridWidth, 22)
    header.centerAlignContent()
    for (const offset of [-1, 0, 1]) {
        const button = header.addStack()
        button.centerAlignContent()
        if (offset === 0) {
            button.size = new Size(Math.max(80, gridWidth - 52), 22)
            button.addSpacer()
            const title = button.addText(monthKey + "  ·  ✓" + normal + "  !" + warnings + "  ?" + pending)
            title.font = Font.boldSystemFont(10)
            title.textColor = new Color(stylePalette.text)
            title.lineLimit = 1
            title.minimumScaleFactor = 0.62
            title.url = getWeeklyAttendanceUrl(monthKey)
            button.addSpacer()
            continue
        }
        button.size = new Size(26, 22)
        const target = new Date(year, month.getMonth() + offset, 1)
        if (target > current) continue
        const key = formatDateKey(target).slice(0, 7)
        const symbol = button.addText(offset < 0 ? "‹" : "›")
        symbol.font = Font.boldSystemFont(18)
        symbol.textColor = new Color(stylePalette.accent)
        if (typeof button.setAction === "function" && Number.parseInt(Device.systemVersion(), 10) >= 17) {
            button.setAction(offset < 0 ? "上个月" : "下个月", { id: "attendance-month:" + key })
        } else {
            button.url = getWeeklyAttendanceUrl(key)
        }
    }

    widget.addSpacer(2)
    const weekdays = widget.addStack()
    weekdays.layoutHorizontally()
    weekdays.spacing = gap
    weekdays.size = new Size(gridWidth, 14)
    for (const day of "一二三四五六日") {
        const column = weekdays.addStack()
        column.centerAlignContent()
        column.size = new Size(width, 14)
        const label = column.addText(day)
        label.font = Font.systemFont(8)
        label.textColor = new Color(stylePalette.muted)
        label.centerAlignText()
    }

    const colors = style === "minimal"
        ? { normal: "#CBD9CF", warning: "#E7D7B6", active: "#343B36", neutral: "#D8DAD3", rest: "#E9EAE4", future: "#F0F1EC" }
        : { normal: stylePalette.good, warning: stylePalette.warning, active: stylePalette.accent, neutral: stylePalette.neutral, rest: stylePalette.cell, future: stylePalette.background2 }
    const tileText = style === "minimal" ? "#353A36" : "#FFFFFF"
    const calendarHeight = Math.max(120, Number.isFinite(options.height) ? options.height : Math.round(contentWidth * 0.46))
    const rowHeight = Math.max(18, Math.floor(calendarHeight / weeks.length))
    const fontSize = Number.isFinite(options.fontSize) ? options.fontSize : 10
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
        const week = weeks[weekIndex]
        widget.addSpacer(3)
        // 将剩余高度分配到行间，而不是留在组件上下两端。
        if (options.stretchRows && weekIndex > 0) widget.addSpacer(null)
        const row = widget.addStack()
        row.layoutHorizontally()
        row.spacing = gap
        row.size = new Size(gridWidth, rowHeight)
        for (const day of week) {
            const tile = row.addStack()
            tile.layoutHorizontally()
            tile.centerAlignContent()
            tile.size = new Size(width, rowHeight)
            if (!day) continue
            tile.cornerRadius = style === "minimal" ? 4 : 6
            tile.setPadding(1, 0, 1, 0)
            tile.backgroundColor = new Color(day.workday
                ? (colors[day.state] || colors.future)
                : colors.rest)
            // 左右使用等量弹性留白，让 1 位和 2 位日期都严格落在色块中心。
            tile.addSpacer()
            const label = tile.addText(String(Number(day.key.slice(-2))))
            label.font = Font.mediumSystemFont(fontSize)
            label.textColor = new Color(day.state === "future" ? stylePalette.muted : tileText)
            label.centerAlignText()
            label.lineLimit = 1
            tile.addSpacer()
        }
    }
}

/**
 * 大号沿用中号今日布局，并在下方追加当月考勤日历。
 *
 * @param widget 大号桌面组件
 * @param data 今日打卡摘要
 * @param contentWidth 去掉两侧外边距后的可用宽度
 * @author Kai
 * @date 2026/11/25 13:00
 */
async function renderLargeWidget(widget, data, contentWidth) {
    const today = widget.addStack()
    today.layoutVertically()
    // 用中号双列宽度估算其单行高度，扣除上下各 15 点的共同留白。
    // 固定此区域后，中号自己的弹性间距只在今日区域内分配。
    const height = Math.max(120, Math.round(homeScreenWidgetWidth("medium") / 2) - 48)
    today.size = new Size(contentWidth, height)
    await renderMediumWidget(today, data, contentWidth)
    // 稍微拉开今日卡片与月历，避免两区贴在一起。
    widget.addSpacer(14)
    renderWidgetMonthCalendar(widget, data, contentWidth)
}

// ==================== 小组件公共 UI ====================

/**
 * 绘制组件标题和右侧更新时间。
 *
 * @param widget 标题行所在的容器
 * @param titleText 组件标题
 * @param contentWidth 需与下方内容对齐时传入宽度
 * @author Kai
 * @date 2026/11/25 13:04
 */
function addCompactHeader(widget, titleText, contentWidth) {
  const row = widget.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()
    // 约束标题横排的弹性间距，右侧时间不会单独延伸到卡片外。
    if (contentWidth !== undefined) row.size = new Size(contentWidth, 17)

  const title = row.addText(titleText)
  title.font = Font.boldSystemFont(13)
  title.textColor = Color.white()
  title.lineLimit = 1

  row.addSpacer()

  const time = row.addText(formatTime(now))
  time.font = Font.systemFont(10)
  time.textColor = new Color("#B2C0D0")
  time.lineLimit = 1
}

function renderErrorBlock(widget, data) {
  const error = widget.addText(data.cacheMiss ? "需要更新" : "接口请求失败")
  error.font = Font.boldSystemFont(15)
  error.textColor = new Color("#FCA5A5")
  error.lineLimit = 1

  widget.addSpacer(5)

  const msg = widget.addText(data.error || "请检查账号、密码、网络或 deviceid")
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

/**
 * 按完成、计时、待核对或空闲状态绘制打卡格。
 *
 * @param parent 容纳信息格的横排
 * @param label 考勤项目名称
 * @param value 打卡时间或状态文案
 * @param state 打卡格的视觉状态
 * @param width 打卡格宽度
 * @author Kai
 * @date 2026/11/25 12:18
 */
function addInfoCell(parent, label, value, state, width) {
    const palette = attendancePalette()
    // 用边框和亮度辅助区分当前阶段。
    const colors = {
        done: ["#164640", "#348677", "#C5F7DF"],
        active: [palette.ink, palette.accent, "#FFFFFF"],
        warning: ["#502323", "#EF4444", "#FFD1D1"],
        idle: ["#243347", "#536881", "#B8C6D8"]
    }
    const [background, border, foreground] = colors[state]
    const cell = parent.addStack()
    cell.layoutVertically()
    cell.backgroundColor = new Color(background)
    cell.borderColor = new Color(border)
    cell.borderWidth = state === "active" ? 1.5 : 0.5
    cell.cornerRadius = 10
    cell.setPadding(6, 8, 6, 8)
    cell.size = new Size(width, 58)

    const title = cell.addText(label)
    title.font = Font.mediumSystemFont(11)
    title.textColor = new Color(foreground)
    title.lineLimit = 1

    cell.addSpacer(2)
    const detail = cell.addText(value)
    detail.font = Font.boldSystemFont(18)
    detail.textColor = new Color(foreground)
    detail.lineLimit = 1
    detail.minimumScaleFactor = 0.65
}

/**
 * 绘制上班首卡到目标时刻的工时进度。
 *
 * @param parent 进度条容器
 * @param data 今日考勤摘要
 * @param width 进度条宽度
 * @author Kai
 * @date 2026/11/25 12:18
 */
function addProgressBar(parent, data, width) {
    if (!data.hasClockIn) return

    // 进度使用组件刷新时刻，系统倒计时仍会独立推进。
    const total = data.targetTime - data.inTime
    const ratio = total > 0 ? Math.max(0, Math.min(1, (now - data.inTime) / total)) : 1
    const track = parent.addStack()
    track.layoutHorizontally()
    track.backgroundColor = new Color("#374B66")
    track.cornerRadius = 2
    track.size = new Size(width, 4)
    const filled = Math.round(width * ratio)
    if (filled > 0) {
        const fill = track.addStack()
        fill.backgroundColor = new Color(missingCheckout(data) ? "#EF4444" : ratio >= 1 && data.hasOutRecord ? "#34D399" : attendancePalette().accent)
        fill.cornerRadius = 2
        fill.size = new Size(filled, 4)
    }
    if (filled < width) track.addSpacer(width - filled)
}

// ==================== 状态文案 ====================

/**
 * 小组件主状态。未满 9 小时时，还差时长按小时和分钟显示。
 *
 * @param data 打卡摘要
 * @return 主文案、短文案、副文案和颜色
 * @author Kai
 * @date 2026/11/23 14:36
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

  if (data.targetReached && !data.hasOutRecord) {
    return {
      mainText: checkoutWarningTitle(data) + "！",
      shortText: confirmedMissedCheckout() ? "已漏卡" : "漏打下班卡",
      subText: confirmedMissedCheckout() ? "已使用一次漏卡机会" : "工时已满，请立即打卡",
      color: "#EF4444"
    }
  }

  if (data.targetReached) {
    return {
      mainText: "考勤正常",
      shortText: "已打卡",
      subText: `上班卡 ${formatTime(data.inTime)}，已达标`,
      color: "#34D399"
    }
  }

  const remainText = formatRemainText(data.remainingMinutes || 0)

  if (data.hasOutRecord) {
    return {
      mainText: "还差 " + remainText,
      shortText: remainText,
      subText: "下班卡 " + formatTime(data.latestOutTime),
      color: "#F87171"
    }
  }

  return {
    mainText: "还差 " + remainText,
    shortText: remainText,
    subText: "可下班 " + formatTime(data.targetTime),
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
        `上班卡：${data.hasClockIn ? formatTime(data.inTime) : "未打卡"} ${data.inStatusDesc || ""}\n` +
        `下班卡：${data.hasOutRecord ? formatTime(data.latestOutTime) : "未打"} ${data.outStatusDesc || ""}\n\n` +
        `当前工时：${data.hasOutRecord ? formatDuration(data.currentWorkMs) : "--"}\n` +
        `离场时工时：${data.hasOutRecord ? formatDuration(data.latestOutWorkMs) : "--"}\n` +
        `可下班：${data.hasClockIn ? formatTime(data.targetTime) : "--"}\n` +
        `是否已满：${data.targetReached ? "是" : "否"}\n` +
        `还差：${missingCheckout(data) ? checkoutWarningTitle(data) : data.targetReached ? "考勤正常" : formatRemainText(data.remainingMinutes)}\n` +
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

  return formatRemainText(Math.ceil(ms / 1000 / 60))
}

/**
 * 剩余工时，按小时和分钟书写
 *
 * 不足 1 小时只写分钟。整小时不补 0 分钟。
 *
 * @param minutes 剩余分钟
 * @return 如 1小时20分钟、2小时、5分钟
 * @author Kai
 * @date 2026/11/23 14:36
 */
function formatRemainText(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60

  if (hours <= 0) {
    return mins + "分钟"
  }

  if (mins <= 0) {
    return hours + "小时"
  }

  return hours + "小时" + mins + "分钟"
}

/**
 * 通知和状态标题里的还差时长
 *
 * @param minutes 剩余分钟
 * @return 如 还差 1小时20分钟
 * @author Kai
 * @date 2026/11/23 14:36
 */
function formatRemainTitle(minutes) {
  return "还差 " + formatRemainText(minutes)
}

/**
 * 锁屏圆形里的还差时长，空间只够时和分
 *
 * @param minutes 剩余分钟
 * @return 如 1时20分、2时、5分
 * @author Kai
 * @date 2026/11/23 14:36
 */
function formatRemainCompact(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  const hours = Math.floor(total / 60)
  const mins = total % 60

  if (hours <= 0) {
    return mins + "分"
  }

  if (mins <= 0) {
    return hours + "时"
  }

  return hours + "时" + mins + "分"
}

function formatDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

/**
 * 判断是否为中国工作日，含调休补班
 *
 * timor.tech 的 type：0 工作日，1 周末，2 节假日，3 调休补班。
 *
 * @param date 待判断日期
 * @return 是工作日时返回 true
 * @author Kai
 * @date 2026/11/19 20:50
 */
async function isChinaWorkday(date) {
  const dateKey = formatDateKey(date)
  const cacheKey = "china-workday-" + dateKey

  try {
    if (Keychain.contains(cacheKey)) {
      const cached = JSON.parse(Keychain.get(cacheKey))
      const ageMs = Date.now() - cached.savedAt

      if (ageMs < CONFIG.HOLIDAY_CACHE_HOURS * 60 * 60 * 1000) {
        return cached.isWorkday
      }
    }
  } catch (e) {
    // 缓存坏了就重新请求
  }

  try {
    const url = CONFIG.HOLIDAY_API_BASE + "/" + encodeURIComponent(dateKey)
    const req = new Request(url)
    req.method = "GET"
    req.timeoutInterval = 8
    req.headers = {
      "Content-Type": "application/json"
    }

    const json = await req.loadJSON()
    if (!json || json.code !== 0 || !json.type) {
      throw new Error("节假日接口返回异常")
    }

    const type = Number(json.type.type)
    const isWorkday = type === 0 || type === 3

    Keychain.set(cacheKey, JSON.stringify({
      date: dateKey,
      isWorkday: isWorkday,
      type: type,
      name: json.type.name || "",
      savedAt: Date.now()
    }))

    return isWorkday
  } catch (e) {
    if (CONFIG.HOLIDAY_FALLBACK_TO_WEEKDAY) {
      return isNormalWeekday(date)
    }
    return false
  }
}

/**
 * 节假日接口失败时，按周一到周五判断
 *
 * @param date 待判断日期
 * @return 是工作日时返回 true
 * @author Kai
 * @date 2026/11/19 20:50
 */
function isNormalWeekday(date) {
  const day = date.getDay()
  return day >= 1 && day <= 5
}


// ==================== 工具函数：小组件 / 通知 ====================

/**
 * 小组件点击跳转的快捷指令地址
 *
 * 使用 x-callback-url，并带本次渲染时间戳，减轻点一下没反应。
 *
 * @return shortcuts URL
 * @author Kai
 * @date 2026/11/19 20:50
 */
function getWidgetUrl() {
  const name = encodeURIComponent(CONFIG.SHORTCUT_NAME)
  return "shortcuts://x-callback-url/run-shortcut?name=" + name + "&_n=" + Date.now()
}

/**
 * 下次建议刷新时间
 *
 * 早上未打卡时按间隔查询。倒计时由系统推进，进度条随组件刷新更新。
 * 已到可下班时间或未打卡且过了早上窗口，就等到下一个早上。
 *
 * @param data 打卡摘要
 * @param refreshProgress 是否在达标前刷新进度条
 * @return 刷新时间
 * @author Kai
 * @date 2026/11/25 11:30
 */
function getNextWidgetRefreshDate(data, refreshProgress = false) {
  const start = morningRefreshOn(now)
  const end = clockOn(now, CONFIG.MORNING_REFRESH_END)

    // 带进度条的布局每半小时请求刷新，最晚在目标时刻请求刷新。
    if (showsLiveCountdown(data)) {
        return refreshProgress
            ? new Date(Math.min(data.targetTime.getTime(), now.getTime() + 30 * 60000))
            : data.targetTime
    }

  if (missingCheckout(data)) {
    const midnight = addDays(now, 1); midnight.setHours(0,0,0,0)
    return new Date(Math.min(Date.now() + 10 * 60000, midnight.getTime()))
  }
  if (data && data.ok && data.hasClockIn) {
    return morningRefreshOn(addDays(now, 1))
  }

  if (now.getTime() < start.getTime()) {
    return start
  }

  if (now.getTime() < end.getTime()) {
    return new Date(Date.now() + CONFIG.MORNING_REFRESH_MINUTES * 60 * 1000)
  }

  return morningRefreshOn(addDays(now, 1))
}

/**
 * 中号小组件去掉内边距后的内容宽度
 *
 * 三个信息格按去掉两侧内边距后的宽度平分。
 *
 * @param horizontalPadding 每侧的外边距，默认 10 点
 * @return 内容宽度，单位是点
 * @author Kai
 * @date 2026/11/25 13:00
 */
function mediumWidgetContentWidth(horizontalPadding = 10) {
    // 与标题行使用相同的内容边界，避免卡片和进度条提前结束。
    return homeScreenWidgetWidth("medium") - horizontalPadding * 2
}

/**
 * 按机型估算桌面小组件宽度
 *
 * @param family 小组件尺寸，中号和大号在 iPhone 上使用相同的横向跨度
 * @return 小组件宽度，单位是点
 * @author Kai
 * @date 2026/11/24 17:47
 */
function homeScreenWidgetWidth(family) {
  const screen = Device.screenSize()
  const key = Math.round(screen.width) + "x" + Math.round(screen.height)
  const mediumWidths = {
    "320x568": 292,
    "375x667": 329,
    "375x812": 329,
    "390x844": 338,
    "393x852": 338,
    "402x874": 364,
    "414x736": 348,
    "414x896": 360,
    "428x926": 364,
    "430x932": 364,
    "440x956": 364
  }

  if ((family === "medium" || family === "large") && mediumWidths[key]) {
    return mediumWidths[key]
  }

  if (Device.isPad && Device.isPad()) {
    return Math.round((screen.width - 90) / 2)
  }

  return mediumWidths["390x844"]
}

/**
 * 某一天的早上刷新时刻
 *
 * @param day 目标日期
 * @return 当天早上开始拉上班卡的时间
 * @author Kai
 * @date 2026/11/23 18:24
 */
function morningRefreshOn(day) {
  return clockOn(day, CONFIG.MORNING_REFRESH_START)
}

/**
 * 把日期定到当天的某个时分
 *
 * @param day 目标日期
 * @param hhmm 时分，格式 HH:mm
 * @return 当天的这个时刻
 * @author Kai
 * @date 2026/11/23 18:24
 */
function clockOn(day, hhmm) {
  const parts = String(hhmm || "08:00").split(":")
  return new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      Number(parts[0]) || 0,
      Number(parts[1]) || 0,
      0,
      0
  )
}

/**
 * 日期加减天数
 *
 * @param day 起始日期
 * @param days 增加的天数，负数表示往前
 * @return 新日期
 * @author Kai
 * @date 2026/11/23 18:24
 */
function addDays(day, days) {
  const next = new Date(day.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/**
 * 通知第二行：上班卡和下班卡分开写
 *
 * 已打下班卡时显示下班时间。还没打时下班卡写未打，后面附上可下班时间。
 *
 * @param data 打卡摘要
 * @return 一行打卡时间
 * @author Kai
 * @date 2026/11/23 14:36
 */
function formatNotifyTimes(data) {
  const start = data.hasClockIn ? formatTime(data.inTime) : "--"
  let text = "上班卡 " + start

  if (data.hasOutRecord && data.latestOutTime) {
    return text + " · 下班卡 " + formatTime(data.latestOutTime)
  }

  text += " · 下班卡 未打"

  if (data.targetTime) {
    text += " · 可下班 " + formatTime(data.targetTime)
  }

  return text
}

/**
 * 只占标题和副标题两行的通知。Scriptable 不能改通知图标。
 *
 * @param title 第一行
 * @param subtitle 第二行
 * @author Kai
 * @date 2026/11/19 20:43
 */
async function notifyBrief(title, subtitle) {
  const n = new Notification()
  n.title = title
  n.subtitle = subtitle
  n.sound = "default"
  await n.schedule()
}

async function notify(title, body) {
  const n = new Notification()
  n.title = title
  n.body = body
  n.sound = "default"
  await n.schedule()
}