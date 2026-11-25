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

  // 设备 ID 在钥匙串里的键名
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

const now = new Date()

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

const mode = launch.mode


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
  await presentMessage("设置账号", accountSaveError)
  Script.complete()
} else if (mode === "account") {
  await presentMessage("设置账号", "已记在钥匙串。之后更新脚本不会覆盖账号、密码和设备 ID。")
  Script.complete()
} else {
  const fromShortcut = isLaunchedFromShortcut()

  if (mode === "widget" || mode === "refresh") {
    await runWidgetUpdate({ presentPreview: !fromShortcut && mode !== "refresh" })
  } else if (mode === "leave") {
    await handleLeaveCompany()
  } else if (mode === "schedule9") {
    await handleScheduleNineHours()
  } else if (mode === "near9") {
    await handleNearNineHours()
  } else if (mode === "debug") {
    await handleDebug()
  } else if (mode === "week") {
    // 点击中号组件后直接打开全屏考勤历史。
    try {
      await presentAttendanceHistory(args.queryParameters?.month)
    } catch (e) {
      await presentMessage("考勤历史", "页面无法打开，请重试。\n" + String(e.message || e))
    }
  } else if (mode === "update") {
    await handleUpdateScript()
  } else {
    await showMainMenu()
  }

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
    if (!config.runsInWidget && args.queryParameters && args.queryParameters.mode === "week") {
        return { mode: "week", account: null }
    }

    // 布局参数只在桌面组件中使用，仍以普通小组件模式加载考勤。
    if (config.runsInWidget && readWidgetLayout(args.widgetParameter)) {
        return { mode: "widget", account: null }
    }

  const raw = config.runsInWidget
      ? (args.widgetParameter || "widget")
      : (args.shortcutParameter || args.widgetParameter || "widget")

  return parseLaunchParameter(raw)
}

/**
 * 把快捷指令参数拆成运行模式和账号
 *
 * 四行文本时，第一行是动作，后面三行是账号、密码、设备 ID。
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
    "refresh",
    "leave",
    "schedule9",
    "near9",
    "week",
    "debug",
    "update",
    "account"
  ].indexOf(mode) !== -1
}

/**
 * 从钥匙串恢复账号、密码和设备 ID
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
 * 账号、密码或设备 ID 有变化时，清掉旧登录 Token 和打卡快照。
 *
 * @param account 账号、密码、设备 ID
 * @author Kai
 * @date 2026/11/23 18:25
 */
function saveAccountToKeychain(account) {
  const username = String(account && account.username || "").trim()
  const password = account && account.password != null ? String(account.password) : ""
  const deviceId = String(account && account.deviceId || "").trim()

  if (!username || !password || !deviceId) {
    throw new Error("账号、密码、设备 ID 都要填")
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
  alert.addTextField("设备 ID", CONFIG.DEVICE_ID || "")
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
  const widget = await createWidget(data, options?.family)
  Script.setWidget(widget)

  if (presentPreview) {
    if (options?.family === "large") await widget.presentLarge()
    else await widget.presentMedium()
  }
}


// ==================== 手动运行菜单 ====================

/**
 * 展示考勤工具和中号、大号预览入口。
 *
 * @author Kai
 * @date 2026/11/25 12:18
 */
async function showMainMenu() {
  const alert = new Alert()
  alert.title = "打卡助手"
  alert.message = "请选择要执行的操作"
  alert.addAction("预览中号小组件")
  alert.addAction("查看 Debug 信息")
  alert.addAction("离开公司检查")
  alert.addAction("预约 9 小时提醒")
  alert.addAction("检查是否快满 9 小时")
  alert.addAction("更新脚本")
  alert.addAction("设置账号")
  alert.addAction("预览大号月历组件")
  alert.addCancelAction("取消")

  const index = await alert.presentSheet()

  if (index === 0) {
    await runWidgetUpdate({ presentPreview: true })
  } else if (index === 1) {
    await handleDebug()
  } else if (index === 2) {
    await handleLeaveCompany()
  } else if (index === 3) {
    await handleScheduleNineHours()
  } else if (index === 4) {
    await handleNearNineHours()
  } else if (index === 5) {
    await handleUpdateScript()
  } else if (index === 6) {
    await promptAndSaveAccount()
  } else if (index === 7) {
    await runWidgetUpdate({ presentPreview: true, family: "large" })
  }
}


// ==================== 从 GitHub 更新脚本 ====================

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

  if (current === latest) {
    return false
  }

  fm.writeString(path, latest)
  return true
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
  if (config.runsInWidget) {
    throw new Error("新设备需要安全验证，请在 Scriptable 里打开脚本运行一次")
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
async function getAttendanceSummary(day = now) {
  const dateKey = formatDateKey(day)
  try {
    const raw = await fetchAttendance(dateKey)
    const data = normalizeAttendanceData(raw, dateKey)

    // 历史接口若明确返回其他业务日期，不能把那天的考勤保存到查询日。
    if (dateKey !== formatDateKey(now)
        && String(data.date).replace(/\//g, "-").slice(0, 10) !== dateKey) {
      throw new Error("考勤返回日期与查询日期不一致")
    }

    if (data.ok) {
      data.snapshotUpdatedAt = new Date().toISOString()
      saveAttendanceSnapshot(data, day)
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
          : "已达标"

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

async function handleLeaveCompany() {
  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("打卡检查失败", data.error)
    return
  }

  if (!data.hasClockIn) {
    await notifyBrief("未打卡", "今天还没有上班记录")
    return
  }

  if (!data.targetReached) {
    await notifyBrief(
        formatRemainTitle(data.remainingMinutes),
        formatNotifyTimes(data)
    )
    return
  }

  await notifyBrief(
      data.hasOutRecord ? "已满 9 小时" : "已满，未打卡",
      formatNotifyTimes(data)
  )
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
    return {
        theme: ["navy", "teal", "slate"].includes(saved.theme) ? saved.theme : "navy",
        remindMinutes: [0, 5, 15, 30, 45, 60].includes(saved.remindMinutes)
            ? saved.remindMinutes : CONFIG.NEAR_MINUTES
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
 * 打开考勤配置，修改后保存到本机并重新预约当天提醒
 *
 * @author Kai
 * @date 2026/11/24 17:55
 */
async function presentAttendancePreferences() {
    const themeValues = ["navy", "teal", "slate"]
    const themeLabels = ["深海蓝", "松石绿", "岩灰"]
    const minuteValues = [30, 15, 5, 45, 60, 0]

    while (true) {
        const preferences = readAttendancePreferences()
        const menu = new Alert()
        menu.title = "考勤配置"
        menu.message = "每日目标 " + CONFIG.TARGET_HOURS + " 小时。提醒使用 iOS 通知。"
        menu.addAction("组件主题 · " + themeLabels[themeValues.indexOf(preferences.theme)])
        menu.addAction("提前提醒 · " + (preferences.remindMinutes ? preferences.remindMinutes + " 分钟" : "关闭"))
        menu.addCancelAction("完成")
        const section = await menu.presentSheet()
        if (section < 0) return

        const choice = new Alert()
        const labels = [
            themeLabels,
            minuteValues.map(minutes => minutes ? "提前 " + minutes + " 分钟" : "关闭提前提醒")
        ][section]
        choice.title = ["组件主题", "提前提醒"][section]
        for (const label of labels) choice.addAction(label)
        choice.addCancelAction("返回")
        const selected = await choice.presentSheet()
        if (selected < 0) continue

        const next = { ...preferences }
        if (section === 0) next.theme = themeValues[selected]
        if (section === 1) next.remindMinutes = minuteValues[selected]
        Keychain.set("attendance-helper-preferences-v1", JSON.stringify(next))

        if (next.remindMinutes !== preferences.remindMinutes) {
            // 只取消本脚本使用固定标识预约的提前通知。
            try {
                await Notification.removePending(["attendance-helper-upcoming-work"])
                const key = "schedule9-" + formatDateKey(now)
                if (Keychain.contains(key)) Keychain.remove(key)
                if (next.remindMinutes) {
                    await handleScheduleNineHours()
                }
            } catch (error) {
                await presentMessage("提前提醒", "设置已保存，今日提醒预约失败：" + String(error.message || error))
            }
        }
    }
}

/**
 * 为今日尚在工作的用户预约达到目标工时前的通知
 *
 * @author Kai
 * @date 2026/11/24 17:55
 */
async function handleScheduleNineHours() {
    const minutes = readAttendancePreferences().remindMinutes
    if (!minutes) return
  if (!(await isChinaWorkday(now))) {
    return
  }

  const data = await getAttendanceSummary()

  if (!data.ok) {
    await notify("工时提醒失败", data.error)
    return
  }

  if (!data.hasClockIn) {
    await notifyBrief("未打卡", "今天还没有上班记录")
    return
  }

  if (data.targetReached || data.hasOutRecord) {
    return
  }

  const remindTime = new Date(
      data.inTime.getTime() +
      (CONFIG.TARGET_HOURS * 60 - minutes) * 60 * 1000
  )

  const key = "schedule9-" + formatDateKey(now)

  if (Keychain.contains(key)) {
    return
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
}


// ==================== 功能 3：定时检查是否快满 9 小时 ====================

/**
 * 在定时检查中补发提前通知或到点通知
 *
 * @author Kai
 * @date 2026/11/24 17:55
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

  if (data.targetReached) {
    const key = "targetReached-" + formatDateKey(now)

    if (!Keychain.contains(key)) {
      await notifyBrief(
          data.hasOutRecord ? "已满 9 小时" : "已满，未打卡",
          formatNotifyTimes(data)
      )

      Keychain.set(key, "1")
    }

    return
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
}


// ==================== 功能 4：桌面小组件 ====================

/**
 * 创建今日打卡组件，按桌面或锁屏尺寸渲染
 *
 * @param data 今日打卡摘要
 * @param previewFamily 手动预览的组件尺寸
 * @return 已配置外观、点击链接和刷新时间的小组件
 * @author Kai
 * @date 2026/11/25 12:18
 */
async function createWidget(data, previewFamily) {
  const family = config.widgetFamily || previewFamily || "medium"
  const isAccessory = family.indexOf("accessory") === 0
    // 小号和锁屏按系统分配的尺寸渲染，统计仅用于有足够空间的桌面组件。
    const layout = config.runsInWidget ? readWidgetLayout(args.widgetParameter) : null
    // 大号与很大号均在今日区域下方追加月历。
    const hasCalendar = family === "large" || family === "extraLarge"
    const statsOnly = layout === "stats" && (family === "medium" || hasCalendar)

  const widget = new ListWidget()

    // 大号月历和统计专用布局在休息日仍可查看历史。
    const workday = statsOnly || await isChinaWorkday(now)
    const calendarOnly = statsOnly || (!workday && hasCalendar)
  if (!workday && !calendarOnly) {
    widget.refreshAfterDate = morningRefreshOn(addDays(now, 1))
    return widget
  }

  if (!isAccessory) {
        // 左上保留低饱和蓝灰高光，右下压暗，让内容在各尺寸都保持对比。
        const background = new LinearGradient()
        background.startPoint = new Point(0, 0)
        background.endPoint = new Point(1, 1)
        background.locations = [0, 0.5, 1]
        const theme = readAttendancePreferences().theme
        const colors = {
            navy: ["#2F4F76", "#20344E", "#101B2B"],
            teal: ["#25595A", "#183D41", "#102628"],
            slate: ["#414854", "#2B3039", "#1A1E25"]
        }
        background.colors = colors[theme].map(hex => new Color(hex))
        widget.backgroundGradient = background
  }

  if (family === "accessoryRectangular") {
    renderAccessoryRectangular(widget, data)
  } else if (family === "accessoryCircular") {
    renderAccessoryCircular(widget, data)
  } else if (family === "accessoryInline") {
    renderAccessoryInline(widget, data)
  } else if (family === "small") {
    widget.setPadding(14, 10, 14, 10)
    await renderSmallWidget(widget, data)
  } else if (calendarOnly) {
    widget.setPadding(16, 10, 16, 10)
    if (hasCalendar) renderWidgetMonthCalendar(widget, data)
    else renderWidgetAttendanceStats(widget, data, 7, true)
  } else if (hasCalendar) {
    widget.setPadding(15, 10, 15, 10)
    await renderLargeWidget(widget, data)
  } else {
    widget.setPadding(15, 10, 15, 10)
    await renderMediumWidget(widget, data)
  }

    // 展示统计的组件可直接打开完整历史。
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
    return "已满 9 小时，请检查下班卡"
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
    return "漏卡"
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
 * @author Kai
 * @date 2026/11/25 12:06
 */
async function renderMediumWidget(widget, data) {
    addCompactHeader(widget, "今日打卡")
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
    addProgressBar(widget, data, mediumWidgetContentWidth())

    // 当天短暂外出已在摘要里过滤，只有有效下班卡才能点亮下班格。
    widget.addSpacer()
    const row = widget.addStack()
    row.spacing = 6
    const width = Math.floor((mediumWidgetContentWidth() - 12) / 3)
    addInfoCell(row, "上班卡", data.hasClockIn ? formatTime(data.inTime) : "待打卡",
        data.hasClockIn ? "done" : "idle", width)
    addInfoCell(row, "可下班", data.hasClockIn ? formatTime(data.targetTime) : "—",
        live ? "active" : "idle", width)
    addInfoCell(row, "下班卡", data.hasOutRecord ? formatTime(data.latestOutTime) : "待打卡",
        data.hasOutRecord ? "done" : data.targetReached ? "warning" : "idle", width)
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
 * @date 2026/11/25 12:18
 */
function buildAttendanceHistoryDay(date, holidays, checked) {
    const key = formatDateKey(date)
    const today = key === formatDateKey(now)
    const { kind, label, workday } = historyDayKind(date, holidays)
    const record = readHistorySnapshot(date) || checked.get(key)
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
    if (review?.confirmed) {
        status = leaveHours > 0 ? "请假已核实 · 正常" : "已确认正常"
        state = "normal"
    } else if (leaveHours > 0 && (requiredMs === 0 || (workedMs !== null && workedMs >= requiredMs))) {
        status = "请假后达标"
        state = "normal"
    } else if (leaveHours > 0 && workedMs !== null) {
        status = "扣除请假仍差 " + formatRemainText(Math.ceil((requiredMs - workedMs) / 60000))
    }

    return {
        key, kind, label, workday, status, state, workedMs,
        originalStatus, review, leaveHours, requiredMs,
        outSwipe: outSwipe ? formatTime(outSwipe) : "—",
        weekday: (date.getDay() + 6) % 7,
        clockIn: clockIn ? formatTime(clockIn) : "—",
        clockOut: clockOut ? formatTime(clockOut) : "—",
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
 * @return 含请假时长与确认说明的记录，未核查时为空
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

/**
 * 显示一天的原始工卡和核查结果，提示用户补记请假或人工确认。
 *
 * @param day 含原始工卡、工时及核查结果的日历记录
 * @return 是否更新了本机核查记录
 * @author Kai
 * @date 2026/11/25 12:18
 */
async function reviewAttendanceDay(day) {
    const detail = new Alert()
    detail.title = day.key + " · " + day.status
    detail.message = [
        "上班 " + day.clockIn + "　下班 " + day.clockOut,
        "实际工时 " + day.worked + "　应出勤 " + formatShortDuration(day.requiredMs),
        "系统原判 " + day.originalStatus,
        ...(day.outSwipe !== day.clockOut ? ["门禁离场记录 " + day.outSwipe] : []),
        "请假 " + day.leaveHours + " 小时",
        ...(day.review?.note ? ["核查说明 " + day.review.note] : [])
    ].join("\n")
    if (!day.workday) {
        detail.addAction("关闭")
        await detail.presentAlert()
        return false
    }
    detail.addAction("记录请假")
    detail.addAction("确认正常")
    if (day.review) detail.addDestructiveAction("撤销修正")
    detail.addCancelAction("关闭")
    const action = await detail.presentAlert()
    if (action < 0) return false

    const key = "attendance-review-v1:" + CONFIG.USERNAME + ":" + day.key
    if (action === 2) {
        Keychain.remove(key)
        return true
    }
    const input = new Alert()
    input.title = action === 0 ? "请假小时数" : "确认正常"
    input.message = action === 0
        ? "输入已批准的请假时长。填 " + CONFIG.TARGET_HOURS + " 表示全天请假。"
        : "请记录你确认这天正常的原因。"
    input.addTextField(action === 0 ? "例如 2.5" : "例如 已查到请假审批", action === 0 && day.leaveHours ? String(day.leaveHours) : "")
    input.addAction(action === 0 ? "请假已核实，确认正常" : "保存")
    if (action === 0) input.addAction("仅记录时长，按工时判断")
    input.addCancelAction("取消")
    const saveMode = await input.presentAlert()
    if (saveMode < 0) return false

    // 人工确认必须留说明，请假只扣减应出勤时长。
    const value = input.textFieldValue(0).trim()
    const hours = Number(value)
    if (!value || (action === 0 && (!Number.isFinite(hours) || hours < 0 || hours > CONFIG.TARGET_HOURS))) {
        await presentMessage("无法保存", action === 0 ? "请输入有效的请假小时数。" : "请输入核查说明。")
        return false
    }
    const review = action === 0
        ? { leaveHours: hours, confirmed: hours > 0 && saveMode === 0,
            note: hours > 0 && saveMode === 0 ? "已核实请假" : "" }
        : { leaveHours: day.leaveHours, confirmed: true, note: value }
    Keychain.set(key, JSON.stringify(review))
    return true
}

/**
 * 打开月历核查页，按当前选月逐日补查缺失的工作日。
 *
 * @param initialMonth 从小组件进入时传入的 yyyy-MM 月份
 * @author Kai
 * @date 2026/11/25 11:47
 */
async function presentAttendanceHistory(initialMonth) {
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
        table.removeAllRows()
        // 统一页首、汇总和日期区配色，配置返回时重新读取主题。
        const palette = attendancePalette()
        table.showSeparators = false

        const heading = new UITableRow()
        heading.height = 70
        heading.backgroundColor = new Color(palette.ink)
        const title = heading.addText(month.getFullYear() + " 年 " + (month.getMonth() + 1) + " 月", "考勤核查")
        title.titleFont = Font.boldSystemFont(23)
        title.titleColor = Color.white()
        title.subtitleColor = new Color("#E0E7EF")
        title.widthWeight = 4
        const settings = heading.addButton("配置")
        settings.dismissOnTap = false
        settings.onTap = async () => {
            await presentAttendancePreferences()
            draw()
        }
        table.addRow(heading)

        const metrics = new UITableRow()
        metrics.height = 55
        metrics.cellSpacing = 0
        metrics.backgroundColor = new Color(palette.paper)
        for (const [count, label, tint] of [
            [normal, "正常", "#146A56"], [warnings.length, "异常", "#9C4B21"], [pending, "待查", palette.ink]
        ]) {
            const metric = metrics.addText(String(count), label)
            metric.centerAligned()
            metric.titleFont = Font.boldSystemFont(19)
            metric.titleColor = new Color(tint)
            metric.subtitleColor = new Color("#495465")
        }
        table.addRow(metrics)

        const controls = new UITableRow()
        controls.height = 40
        for (const [label, date] of [
            ["‹ 上月", new Date(month.getFullYear(), month.getMonth() - 1, 1)],
            ["本月", current],
            ["下月 ›", new Date(month.getFullYear(), month.getMonth() + 1, 1)]
        ]) {
            const cell = date > current ? controls.addText("") : controls.addButton(label)
            cell.centerAligned()
            if (date > current) continue
            cell.dismissOnTap = false
            cell.onTap = () => {
                if (date.getTime() === month.getTime()) return
                month = date
                monthChanged = true
                syncFailed = false
                draw()
                startSync()
            }
        }
        table.addRow(controls)

        // 沿用 Month Grid 的七列居中排版，日期使用原生按钮承接核查操作。
        const weekdays = new UITableRow()
        weekdays.cellSpacing = 0
        weekdays.height = 30
        weekdays.backgroundColor = new Color(palette.paper)
        for (const weekday of "一二三四五六日") {
            const label = weekdays.addText(weekday)
            label.titleFont = Font.mediumSystemFont(12)
            label.titleColor = new Color(palette.ink)
            label.centerAligned()
        }
        table.addRow(weekdays)

        // 使用短标记和颜色同时区分考勤状态，当天日期用强调色加粗。
        const symbols = { normal: "·", warning: "!", active: "·", neutral: "?" }
        const dateColors = { normal: "#148267", warning: "#BA5A25", active: palette.accent, neutral: "#738197" }
        for (const week of weeks) {
            const row = new UITableRow()
            row.height = 42
            row.cellSpacing = 0
            for (const day of week) {
                if (!day || !day.key) {
                    row.addText(day ? String(day.getDate()) : "").centerAligned()
                    continue
                }
                const marker = day.workday ? symbols[day.state] : "—"
                const cell = row.addButton(Number(day.key.slice(-2)) + marker)
                cell.centerAligned()
                cell.titleFont = day.key === todayKey ? Font.boldSystemFont(15) : Font.systemFont(14)
                cell.titleColor = new Color(day.key === todayKey ? palette.accent
                    : day.workday ? dateColors[day.state] : "#738197")
                cell.dismissOnTap = false
                cell.onTap = async () => {
                    if (await reviewAttendanceDay(day)) draw()
                }
            }
            table.addRow(row)
        }

        const notice = new UITableRow()
        notice.height = 49
        notice.backgroundColor = new Color(palette.paper)
        const noticeText = notice.addText("异常待核查", syncing ? "正在补查本月考勤"
            : syncFailed ? "补查中断，重新打开可重试"
                : warnings.length ? "点日期查看原判、登记请假或确认正常"
                    : pending ? "仍有日期等待补查" : "本月暂无待核查异常")
        noticeText.titleColor = new Color(palette.ink)
        noticeText.subtitleColor = new Color("#495465")
        table.addRow(notice)

        for (const day of warnings) {
            const row = new UITableRow()
            row.height = 46
            const detail = row.addText(day.key.slice(5) + "　" + day.status, "上 " + day.clockIn + "　下 " + day.clockOut)
            detail.widthWeight = 4
            const check = row.addButton("核查")
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
    startSync()
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
 * @author Kai
 * @date 2026/11/25 12:18
 */
function renderWidgetMonthCalendar(widget, data) {
    const palette = attendancePalette()
    const todayKey = formatDateKey(now)
    const current = attendanceMonth()
    const savedMonth = attendanceMonth(readKeychainValue("attendance-widget-month:" + CONFIG.USERNAME))
    const month = savedMonth > current ? current : savedMonth
    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const monthKey = formatDateKey(month).slice(0, 7)
    const holidays = { [year]: readAttendanceRecord("attendance-history-calendar-" + year)?.holidays }
    const checked = data.ok ? new Map([[todayKey, data]]) : new Map()
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

    // 月历标题的待查数来自当前月份，避免大号时间线因未定义变量而刷新失败。
    const pending = days.filter(day => day.workday && day.state === "neutral").length
    const width = Math.floor((mediumWidgetContentWidth() - 18) / 7)
    const gridWidth = 7 * width + 18
    const header = widget.addStack()
    header.size = new Size(gridWidth, 24)
    header.centerAlignContent()
    // 两个翻月按钮各占固定的一列，标题只能使用剩余宽度。
    for (const offset of [-1, 0, 1]) {
        const button = header.addStack()
        button.centerAlignContent()
        if (offset === 0) {
            button.size = new Size(gridWidth - 56, 24)
            button.addSpacer()
            const title = button.addText(monthKey + "  正常 " + normal + " · 异常 " + warnings + " · 待查 " + pending)
            title.font = Font.boldSystemFont(11)
            title.textColor = Color.white()
            title.lineLimit = 1
            title.minimumScaleFactor = 0.7
            title.url = getWeeklyAttendanceUrl(monthKey)
            button.addSpacer()
            continue
        }
        button.size = new Size(28, 24)
        const target = new Date(year, monthIndex + offset, 1)
        if (target > current) continue
        const label = offset < 0 ? "‹" : "›"
        button.addSpacer()
        const key = formatDateKey(target).slice(0, 7)
        const symbol = button.addText(label)
        symbol.font = Font.boldSystemFont(18)
        symbol.textColor = new Color(palette.accent)
        // 新版 Scriptable 直接在组件内翻页，旧版进入该月核查页。
        if (typeof button.setAction === "function" && Number.parseInt(Device.systemVersion(), 10) >= 17) {
            button.setAction(offset < 0 ? "上个月" : "下个月", { id: "attendance-month:" + key })
        } else {
            button.url = getWeeklyAttendanceUrl(key)
        }
        button.addSpacer()
    }

    const weekdays = widget.addStack()
    weekdays.spacing = 3
    for (const day of "一二三四五六日") {
        const column = weekdays.addStack()
        column.size = new Size(width, 13)
        const label = column.addText(day)
        label.font = Font.systemFont(9)
        label.textColor = new Color("#AABCD2")
    }

    // 未来日期和月外空格只作占位，工作日按核查结果着色。
    const colors = { normal: "#26715E", warning: "#A16530", active: palette.accent, neutral: palette.ink }
    // 周数较少时把空间分给日期行，避免底部留下大片空白。
    const rowHeight = Math.floor(108 / weeks.length)
    for (const week of weeks) {
        widget.addSpacer(2)
        const row = widget.addStack()
        row.spacing = 3
        for (const day of week) {
            const tile = row.addStack()
            tile.size = new Size(width, rowHeight)
            if (!day) continue
            tile.cornerRadius = 4
            tile.setPadding(0, 5, 0, 5)
            tile.centerAlignContent()
            tile.addSpacer()
            tile.backgroundColor = new Color(day.workday ? colors[day.state] : "#263549")
            const label = tile.addText(String(Number(day.key.slice(-2))))
            label.font = Font.mediumSystemFont(10)
            label.textColor = new Color(day.state === "future" ? "#8695A8" : "#FFFFFF")
            tile.addSpacer()
        }
    }
}

/**
 * 大号沿用中号今日布局，并在下方追加当月考勤日历。
 *
 * @param widget 大号桌面组件
 * @param data 今日打卡摘要
 * @author Kai
 * @date 2026/11/25 12:06
 */
async function renderLargeWidget(widget, data) {
    const today = widget.addStack()
    today.layoutVertically()
    // 用中号双列宽度估算其单行高度，扣除上下各 15 点的共同留白。
    // 固定此区域后，中号自己的弹性间距只在今日区域内分配。
    const width = mediumWidgetContentWidth()
    today.size = new Size(width, Math.max(120, Math.round(width / 2) - 30))
    await renderMediumWidget(today, data)
    widget.addSpacer(8)
    renderWidgetMonthCalendar(widget, data)
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
        warning: ["#493822", "#A87D3F", "#FFD896"],
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
        fill.backgroundColor = new Color(ratio >= 1 ? "#34D399" : attendancePalette().accent)
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
      mainText: "已到应走时间",
      shortText: "可下班",
      subText: `应走 ${formatTime(data.targetTime)}`,
      color: "#34D399"
    }
  }

  if (data.targetReached) {
    return {
      mainText: "已满 9 小时",
      shortText: "可下班",
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
        `还差：${data.targetReached ? "已达标" : formatRemainText(data.remainingMinutes)}\n` +
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
 * @return 内容宽度，单位是点
 * @author Kai
 * @date 2026/11/25 12:18
 */
function mediumWidgetContentWidth() {
    // 留出左右边距和系统缩放余量，跨设备避免固定列宽撑破卡片。
    return Math.min(336, homeScreenWidgetWidth("medium") - 36)
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
