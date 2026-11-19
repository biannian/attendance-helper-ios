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
// widget     桌面小组件 / 手动预览
// leave      离开公司时检查工时是否满 9 小时
// schedule9  工作日根据上班时间预约“快满 9 小时”提醒
// near9      工作日下午定时检查是否快满 / 已满 9 小时
// debug      查看接口解析结果
// update     从 GitHub 下载最新脚本并覆盖当前文件
//
// 快捷指令 / 小组件参数：
// widget / leave / schedule9 / near9 / debug / update
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
  TOKEN: "1c1ae3b0-a900-45ba-b0da-234d5cb8f1c1",

  // 登录账号。打卡接口报 Token 失效时，用它重新登录
  USERNAME: "19002664001",

  // 登录密码明文。提交前按网页登录页同一套 AES 加密
  PASSWORD: "K1panguangke",

  // 密码登录接口。成功时 data.token 是新的 Bearer Token
  LOGIN_URL: "https://api.hikiot.com/api-saas/open/v1/pwdLogin",

  // 网页端固定的客户端标识，不是用户 Token
  LOGIN_BASIC: "Basic bGluay13ZWI6bGluaw==",

  // 钥匙串键名。登录成功后把新 Token 存在这里，小组件下次直接用
  TOKEN_KEYCHAIN: "attendance-helper-token",

  // 已登记的 deviceid。换成本机没登记过的值会要求安全验证，拿不到 Token
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

  // 私有仓库。更新脚本时从这里下载，不用再整段复制
  GITHUB_REPO: "biannian/attendance-helper-ios",

  // 仓库里的脚本路径
  GITHUB_SCRIPT_PATH: "scriptable/AttendanceHelper.js",

  // 更新时读取的分支
  GITHUB_REF: "main",

  // 可留空。第一次更新时填写只读 Token，之后记在钥匙串
  GITHUB_TOKEN: "",

  // GitHub Token 在钥匙串里的键名
  GITHUB_TOKEN_KEYCHAIN: "attendance-helper-github-token"
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
  } else if (mode === "update") {
    await handleUpdateScript()
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
  alert.addAction("更新脚本")
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
  } else if (index === 5) {
    await handleUpdateScript()
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
 * @return 钥匙串中的 Token；没有时返回配置里的初始 Token
 * @author Kai
 * @date 2026/11/19 18:57
 */
function readStoredToken() {
  try {
    if (Keychain.contains(CONFIG.TOKEN_KEYCHAIN)) {
      const saved = Keychain.get(CONFIG.TOKEN_KEYCHAIN)
      if (saved) {
        return saved
      }
    }
  } catch (e) {
    // 锁屏时钥匙串可能读不到，继续用配置里的 Token
  }

  return CONFIG.TOKEN
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

  if (statusCode === 401 || code === 401) {
    return true
  }

  return /access token|token expired|invalid access token|登录状态已失效|请重新登录/i.test(text)
}

/**
 * 拉取一天的打卡数据
 *
 * @param token Bearer Token，不要带 Bearer 前缀
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/19 18:57
 */
async function requestAttendance(token) {
  const date = formatDateKey(new Date())
  const url =
      `${CONFIG.API_BASE}?date=${encodeURIComponent(date)}&ID=${encodeURIComponent(CONFIG.ID)}`

  const req = new Request(url)
  req.method = "GET"
  req.timeoutInterval = 15

  req.headers = {
    "Authorization": `Bearer ${token}`,
    "UNI-Request-Source": "1",
    "terminal": "1",
    "appNo": "__UNI__89A1A02",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept": "*/*",
    "deviceid": CONFIG.DEVICE_ID,
    "versionCode": "1986",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app"
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
      const err = new Error(message || "登录已失效")
      err.authFailure = true
      throw err
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
    const err = new Error(json.msg || json.message || "登录已失效")
    err.authFailure = true
    throw err
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
  req.headers = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Authorization": CONFIG.LOGIN_BASIC,
    "login-source": "link-web",
    "deviceid": CONFIG.DEVICE_ID,
    "STN-PhoneType": "Iphone",
    "devicename": "unknow 0",
    "terminal": "2",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 (Immersed/47) uni-app"
  }

  const text = await req.loadString()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (e) {
    json = null
  }

  const token = json && json.data ? json.data.token : ""
  if (!json || Number(json.code) !== 0 || !token) {
    throw new Error((json && (json.msg || json.message)) || "更新 Token 失败")
  }

  writeStoredToken(token)
  return token
}

/**
 * 获取打卡数据。Token 失效时自动登录一次并重试
 *
 * @return 打卡接口 JSON
 * @author Kai
 * @date 2026/11/19 18:57
 */
async function fetchAttendance() {
  const token = readStoredToken()

  try {
    return await requestAttendance(token)
  } catch (e) {
    if (!e || !e.authFailure) {
      throw e
    }
  }

  const freshToken = await refreshAccessToken()
  return await requestAttendance(freshToken)
}


// ==================== 登录密码加密 ====================
// 与网页登录页一致：AES-256-CBC、PKCS7，只对密文做 Base64。

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
