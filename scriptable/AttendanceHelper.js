/*
 * Copyright (c) iGroup China.
 * All rights reserved.
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

  // 私有仓库。更新脚本时从这里下载，不用再整段复制
  GITHUB_REPO: "biannian/attendance-helper-ios",

  // 仓库里的脚本路径
  GITHUB_SCRIPT_PATH: "scriptable/AttendanceHelper.js",

  // 更新时读取的分支
  GITHUB_REF: "main",

  // 可留空。第一次更新时填写只读 Token，之后记在钥匙串
  GITHUB_TOKEN: "",

  // GitHub Token 在钥匙串里的键名
  GITHUB_TOKEN_KEYCHAIN: "attendance-helper-github-token",

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
  let data = await getAttendanceSummary()
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
 * 清掉上一账号的登录 Token 和打卡快照
 *
 * @author Kai
 * @date 2026/11/23 18:25
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
 * @param options 展示选项。presentPreview 为 true 时弹出中号预览
 * @author Kai
 * @date 2026/11/19 20:50
 */
async function runWidgetUpdate(options) {
  const presentPreview = !!(options && options.presentPreview)
  const data = await getAttendanceSummary()
  const widget = await createWidget(data)
  Script.setWidget(widget)

  if (presentPreview) {
    await widget.presentMedium()
  }
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
  alert.addAction("更新脚本")
  alert.addAction("设置账号")
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
 * 从私有仓库拉取脚本并写回当前文件
 *
 * @return 文件内容有变化时返回 true
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function updateScriptFromGit() {
  const token = await getGitHubToken()
  const latest = await downloadScriptSource(token)
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
 * 读取 GitHub 只读 Token，没有时让用户填一次
 *
 * @return Token 字符串
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function getGitHubToken() {
  try {
    if (Keychain.contains(CONFIG.GITHUB_TOKEN_KEYCHAIN)) {
      const saved = String(Keychain.get(CONFIG.GITHUB_TOKEN_KEYCHAIN) || "").trim()
      if (saved) {
        return saved.replace(/^Bearer\s+/i, "")
      }
    }
  } catch (e) {
    // 钥匙串读不到时再问用户
  }

  if (CONFIG.GITHUB_TOKEN) {
    return String(CONFIG.GITHUB_TOKEN).trim().replace(/^Bearer\s+/i, "")
  }

  const alert = new Alert()
  alert.title = "更新脚本"
  alert.message = "仓库是私有的。填一次 GitHub 只读 Token，之后记在钥匙串，不用再复制整段代码。"
  alert.addTextField("github_pat_ 或 ghp_")
  alert.addAction("保存并更新")
  alert.addCancelAction("取消")

  const index = await alert.presentAlert()

  if (index !== 0) {
    throw new Error("已取消更新")
  }

  const token = String(alert.textFieldValue(0) || "").trim().replace(/^Bearer\s+/i, "")

  if (!token) {
    throw new Error("没有填写 GitHub Token")
  }

  try {
    Keychain.set(CONFIG.GITHUB_TOKEN_KEYCHAIN, token)
  } catch (e) {
    // 记不住也继续用这一次
  }

  return token
}

/**
 * 下载仓库里的打卡脚本
 *
 * @param token GitHub 只读 Token
 * @return 脚本源码
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function downloadScriptSource(token) {
  const url =
      "https://api.github.com/repos/" +
      CONFIG.GITHUB_REPO +
      "/contents/" +
      CONFIG.GITHUB_SCRIPT_PATH +
      "?ref=" + encodeURIComponent(CONFIG.GITHUB_REF)
  const req = new Request(url)
  req.method = "GET"
  req.timeoutInterval = 20
  req.headers = {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github.raw",
    "User-Agent": "AttendanceHelper",
    "X-GitHub-Api-Version": "2022-11-28"
  }

  let text = ""
  let status = 0

  try {
    text = await req.loadString()
    status = req.response ? req.response.statusCode : 0
  } catch (e) {
    status = req.response ? req.response.statusCode : 0
    text = ""
  }

  if (status === 401 || status === 403) {
    try {
      Keychain.remove(CONFIG.GITHUB_TOKEN_KEYCHAIN)
    } catch (e) {
      // 清不掉也无妨，下次会再问
    }
    throw new Error("GitHub Token 无效，或没有读取这个仓库的权限")
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
 * 确认下载下来的是打卡脚本，避免把错误页写进文件
 *
 * @param code 下载到的文本
 * @return 可以写回时返回 true
 * @author Kai
 * @date 2026/11/19 19:03
 */
function isAttendanceScript(code) {
  if (!code || code.length < 500) {
    return false
  }

  if (code.indexOf("<html") !== -1 || code.indexOf("<!DOCTYPE") !== -1) {
    return false
  }

  return code.indexOf("AttendanceHelper") !== -1 &&
      code.indexOf("fetchAttendance") !== -1 &&
      code.indexOf("API_BASE") !== -1
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
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/23 18:56
 */
async function requestAttendance(token) {
  const accessToken = String(token || "").trim()
  if (!accessToken) {
    throw makeAuthError(null, "还没有登录", 401)
  }

  const date = formatDateKey(new Date())
  // 时间戳避免系统把 GET 打卡结果缓存成旧的下班卡
  const url =
      `${CONFIG.API_BASE}?date=${encodeURIComponent(date)}` +
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
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/23 18:56
 */
async function fetchAttendance() {
  let token = readStoredToken()

  try {
    return await requestAttendance(token)
  } catch (e) {
    if (!e || !e.authFailure) {
      throw e
    }

    // 999999 表示 Token 还在，但这次登录还没进入团队
    if (Number(e.authCode) === 999999 && token) {
      try {
        await selectCurrentTeam(token)
        return await requestAttendance(token)
      } catch (teamError) {
        if (!teamError || !teamError.authFailure) {
          throw teamError
        }
      }
    }
  }

  token = await refreshAccessToken()
  return await requestAttendance(token)
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

async function getAttendanceSummary() {
  try {
    const raw = await fetchAttendance()
    const data = normalizeAttendanceData(raw)

    if (data.ok) {
      data.snapshotUpdatedAt = new Date().toISOString()
      saveAttendanceSnapshot(data)
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
 * @author Kai
 * @date 2026/11/19 20:50
 */
function saveAttendanceSnapshot(data) {
  if (!data || !data.ok) {
    return
  }

  const snapshot = {
    savedAt: data.snapshotUpdatedAt || new Date().toISOString(),
    date: formatDateKey(now),
    personName: data.personName || "",
    orgName: data.orgName || "",
    shiftName: data.shiftName || "",
    inTime: data.inTime ? data.inTime.toISOString() : null,
    latestOutTime: data.latestOutTime ? data.latestOutTime.toISOString() : null,
    inStatusDesc: data.inStatusDesc || "",
    outStatusDesc: data.outStatusDesc || ""
  }

  try {
    Keychain.set(CONFIG.ATTENDANCE_CACHE_KEY, JSON.stringify(snapshot))
  } catch (e) {
    // 缓存失败不影响这次真实查询
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

  // 接口里的下班卡时间。打卡之后工时停在这一刻，不再按当前时间累计。
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

async function handleScheduleNineHours() {
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
    await notifyBrief(
        formatRemainTitle(data.remainingMinutes),
        formatNotifyTimes(data)
    )
  } else {
    const n = new Notification()
    n.title = formatRemainTitle(CONFIG.NEAR_MINUTES)
    n.subtitle = formatNotifyTimes(data)
    n.sound = "default"
    n.setTriggerDate(remindTime)
    await n.schedule()
  }

  Keychain.set(key, "1")
}


// ==================== 功能 3：定时检查是否快满 9 小时 ====================

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

  if (
      data.remainingMinutes <= CONFIG.NEAR_MINUTES &&
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

async function createWidget(data) {
  const family = config.widgetFamily || "medium"
  const isAccessory = family.indexOf("accessory") === 0

  const widget = new ListWidget()

  // 休息日隐藏全部组件内容。工作日包含调休补班。
  if (!(await isChinaWorkday(now))) {
    widget.refreshAfterDate = morningRefreshOn(addDays(now, 1))
    return widget
  }

  if (!isAccessory) {
    widget.backgroundColor = new Color("#111827")
  }

  if (family === "accessoryRectangular") {
    renderAccessoryRectangular(widget, data)
  } else if (family === "accessoryCircular") {
    renderAccessoryCircular(widget, data)
  } else if (family === "accessoryInline") {
    renderAccessoryInline(widget, data)
  } else if (family === "small") {
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
  widget.refreshAfterDate = getNextWidgetRefreshDate(data)

  return widget
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
 * 到点或已有下班卡后改成文字，避免系统倒计时过点后继续往上加。
 *
 * @param widget 锁屏组件
 * @param data 打卡摘要
 * @param fallbackText 不倒计时时显示的文字
 * @return 日期元素或文字元素
 * @author Kai
 * @date 2026/11/23 18:28
 */
function addLockScreenCountdown(widget, data, fallbackText) {
  if (showsLiveCountdown(data)) {
    return addLiveCountdown(widget, data, Font.boldSystemFont(13), "#FFFFFF")
  }

  return widget.addText(fallbackText)
}

/**
 * 还没打下班卡，并且当前时间还没到应走时间
 *
 * @param data 打卡摘要
 * @return 需要跟着当前时间倒计时时返回 true
 * @author Kai
 * @date 2026/11/23 18:29
 */
function showsLiveCountdown(data) {
  return !!(
      data &&
      data.ok &&
      data.hasClockIn &&
      !data.hasOutRecord &&
      !data.targetReached &&
      data.targetTime &&
      data.targetTime.getTime() > Date.now()
  )
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

async function renderSmallWidget(widget, data) {
  addCompactHeader(widget, "打卡")

  widget.addSpacer(7)

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

  widget.addSpacer(7)

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

  const status = statusRow.addText(showsLiveCountdown(data) ? "距应走" : meta.mainText)
  status.font = Font.boldSystemFont(16)
  status.textColor = new Color(meta.color)
  status.lineLimit = 1
  status.minimumScaleFactor = 0.65

  statusRow.addSpacer()

  if (showsLiveCountdown(data)) {
    addLiveCountdown(statusRow, data, Font.boldSystemFont(16), "#FFFFFF")
  } else {
    const workText = statusRow.addText(
        data.hasOutRecord ? formatShortDuration(data.currentWorkMs) : "--"
    )
    workText.font = Font.boldSystemFont(12)
    workText.textColor = Color.white()
    workText.lineLimit = 1
    workText.minimumScaleFactor = 0.7
  }

  card.addSpacer(4)

  const contentWidth = mediumWidgetContentWidth()
  const cellGap = 8
  const cellWidth = Math.floor((contentWidth - cellGap) / 2)

  addProgressBar(card, data, contentWidth - 16)

  widget.addSpacer(6)

  const grid = widget.addStack()
  grid.layoutVertically()

  const row1 = grid.addStack()
  row1.layoutHorizontally()

  addInfoCell(
      row1,
      "上班卡",
      data.hasClockIn ? formatTime(data.inTime) : "--",
      "#60A5FA",
      cellWidth,
      32
  )

  row1.addSpacer(cellGap)

  addInfoCell(
      row1,
      "可下班",
      data.hasClockIn ? formatTime(data.targetTime) : "--",
      "#34D399",
      cellWidth,
      32
  )

  grid.addSpacer(4)

  const row2 = grid.addStack()
  row2.layoutHorizontally()

  addInfoCell(
      row2,
      "下班卡",
      data.hasOutRecord ? formatTime(data.latestOutTime) : "未打",
      data.hasOutRecord ? "#F87171" : "#9CA3AF",
      cellWidth,
      32
  )

  row2.addSpacer(cellGap)

  addInfoCell(
      row2,
      "更新",
      formatTime(now),
      "#9CA3AF",
      cellWidth,
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

  if (showsLiveCountdown(data)) {
    const title = addLiveCountdown(statusCard, data, Font.boldSystemFont(22), meta.color)
    title.minimumScaleFactor = 0.7
  } else {
    const title = statusCard.addText(meta.mainText)
    title.font = Font.boldSystemFont(22)
    title.textColor = new Color(meta.color)
    title.lineLimit = 1
    title.minimumScaleFactor = 0.7
  }

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
      "上班卡",
      data.hasClockIn
          ? `${formatTime(data.inTime)} ${data.inStatusDesc || ""}`.trim()
          : "未打卡"
  )

  addDetailRow(
      widget,
      "下班卡",
      data.hasOutRecord
          ? `${formatTime(data.latestOutTime)} ${data.outStatusDesc || ""}`.trim()
          : "未打"
  )

  addDetailRow(
      widget,
      "当前工时",
      data.hasOutRecord ? formatDuration(data.currentWorkMs) : "--"
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
  // 没打下班卡时不画进度，避免把未结算工时画成一直在涨
  if (!data.hasOutRecord || data.targetReached) {
    return
  }

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
 * 早上没打卡时按间隔再拉。拉到上班时间后停到可下班时刻，倒计时由系统自己走。
 * 过了早上窗口、已经下班，或可下班时间已过，就等到下一个早上。
 *
 * @param data 打卡摘要
 * @return 刷新时间
 * @author Kai
 * @date 2026/11/23 18:24
 */
function getNextWidgetRefreshDate(data) {
  const start = morningRefreshOn(now)
  const end = clockOn(now, CONFIG.MORNING_REFRESH_END)

  if (data && data.ok && data.hasClockIn) {
    if (
        !data.hasOutRecord &&
        data.targetTime &&
        data.targetTime.getTime() > Date.now() + 60 * 1000
    ) {
      return data.targetTime
    }

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
 * 四个信息格按这个宽度平分，避免宽屏右侧留空。
 *
 * @return 内容宽度，单位是点
 * @author Kai
 * @date 2026/11/23 18:24
 */
function mediumWidgetContentWidth() {
  return Math.max(280, homeScreenWidgetWidth("medium") - 20)
}

/**
 * 按机型估算桌面小组件宽度
 *
 * @param family 小组件尺寸，目前使用 medium
 * @return 小组件宽度，单位是点
 * @author Kai
 * @date 2026/11/23 18:24
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

  if (family === "medium" && mediumWidths[key]) {
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
