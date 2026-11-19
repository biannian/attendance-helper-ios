/*
 * Copyright (c) iGroup China.
 * All rights reserved.
 */

/**
 * 打卡脚本安装器
 *
 * 从私有仓库下载 AttendanceHelper.js，写进 Scriptable。
 * 只需要把这一小段放进 Scriptable 并运行一次。
 *
 * @author Kai
 * @date 2026/11/19 19:03
 * @description 避免每次把整份打卡脚本复制进 Scriptable
 */

/** 安装来源与脚本文件名 */
const INSTALL = {
    /** 私有仓库 */
    repo: "biannian/attendance-helper-ios",
    /** 仓库里的脚本路径 */
    path: "scriptable/AttendanceHelper.js",
    /** 读取的分支 */
    ref: "main",
    /** 写进 Scriptable 后的文件名 */
    scriptName: "AttendanceHelper.js",
    /** GitHub Token 在钥匙串里的键名，和打卡脚本共用 */
    tokenKey: "attendance-helper-github-token"
}

await installAttendanceScript()
Script.complete()

/**
 * 下载并安装打卡脚本
 *
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function installAttendanceScript() {
    let message = ""

    try {
        const token = await askGitHubToken()
        const code = await downloadAttendanceScript(token)
        const path = await writeAttendanceScript(code)
        message = "已安装到 " + path + "。小组件请选择 AttendanceHelper。以后再运行本安装器即可更新。"
    } catch (error) {
        message = String(error && error.message ? error.message : error)
    }

    const alert = new Alert()
    alert.title = "安装打卡脚本"
    alert.message = message
    alert.addAction("好")
    await alert.present()
}

/**
 * 读取或询问 GitHub 只读 Token
 *
 * @return Token 字符串
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function askGitHubToken() {
    try {
        if (Keychain.contains(INSTALL.tokenKey)) {
            const saved = String(Keychain.get(INSTALL.tokenKey) || "").trim()
            if (saved) {
                return saved.replace(/^Bearer\s+/i, "")
            }
        }
    } catch (error) {
        // 钥匙串读不到时再问用户
    }

    const alert = new Alert()
    alert.title = "安装打卡脚本"
    alert.message = "仓库是私有的。填一次 GitHub 只读 Token，之后记在钥匙串。"
    alert.addTextField("github_pat_ 或 ghp_")
    alert.addAction("安装")
    alert.addCancelAction("取消")

    if (await alert.presentAlert() !== 0) {
        throw new Error("已取消安装")
    }

    const token = String(alert.textFieldValue(0) || "").trim().replace(/^Bearer\s+/i, "")

    if (!token) {
        throw new Error("没有填写 GitHub Token")
    }

    try {
        Keychain.set(INSTALL.tokenKey, token)
    } catch (error) {
        // 记不住也继续用这一次
    }

    return token
}

/**
 * 下载仓库中的打卡脚本
 *
 * @param token GitHub 只读 Token
 * @return 脚本源码
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function downloadAttendanceScript(token) {
    const url = "https://api.github.com/repos/" +
        INSTALL.repo +
        "/contents/" +
        INSTALL.path +
        "?ref=" + encodeURIComponent(INSTALL.ref)
    const request = new Request(url)
    request.method = "GET"
    request.timeoutInterval = 20
    request.headers = {
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github.raw",
        "User-Agent": "AttendanceHelper",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    let text = ""
    let status = 0

    try {
        text = await request.loadString()
        status = request.response ? request.response.statusCode : 0
    } catch (error) {
        status = request.response ? request.response.statusCode : 0
        text = ""
    }

    if (status === 401 || status === 403) {
        try {
            Keychain.remove(INSTALL.tokenKey)
        } catch (error) {
            // 清不掉也无妨，下次会再问
        }
        throw new Error("GitHub Token 无效，或没有读取这个仓库的权限")
    }

    if (status && status !== 200) {
        throw new Error("下载失败：" + status)
    }

    if (!text || text.length < 500 || text.indexOf("fetchAttendance") === -1) {
        throw new Error("下载内容不是打卡脚本")
    }

    return text
}

/**
 * 把脚本写进 Scriptable 的脚本目录
 *
 * @param code 脚本源码
 * @return 写入后的文件路径
 * @author Kai
 * @date 2026/11/19 19:03
 */
async function writeAttendanceScript(code) {
    const pathName = module.filename || ""
    const files = pathName.indexOf("iCloud") !== -1
        ? FileManager.iCloud()
        : FileManager.local()
    const path = files.joinPath(files.documentsDirectory(), INSTALL.scriptName)

    if (files.fileExists(path)) {
        await files.downloadFileFromiCloud(path)
    }

    files.writeString(path, code)
    return path
}
