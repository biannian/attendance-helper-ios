/*
 * Copyright (c) iGroup China.
 * All rights reserved.
 */

/**
 * 打卡脚本安装器
 *
 * 从公开仓库下载 AttendanceHelper.js，写进 Scriptable。
 * 只需要把这一小段放进 Scriptable 并运行一次，不需要 GitHub Token。
 *
 * @author Kai
 * @date 2026/11/24 15:37
 * @description 避免每次把整份打卡脚本复制进 Scriptable
 */

/** 安装来源与脚本文件名 */
const INSTALL = {
    /** 公开仓库 */
    repo: "biannian/attendance-helper-ios",
    /** 仓库里的脚本路径 */
    path: "scriptable/AttendanceHelper.js",
    /** 读取的分支 */
    ref: "main",
    /** 写进 Scriptable 后的文件名 */
    scriptName: "AttendanceHelper.js"
}

await installAttendanceScript()
Script.complete()

/**
 * 下载并安装打卡脚本
 *
 * @author Kai
 * @date 2026/11/24 15:37
 */
async function installAttendanceScript() {
    let message = ""

    try {
        const code = await downloadAttendanceScript()
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
 * 从公开仓库下载打卡脚本，请求头不带 Token
 *
 * @return 脚本源码
 * @author Kai
 * @date 2026/11/24 15:37
 */
async function downloadAttendanceScript() {
    const url = "https://raw.githubusercontent.com/" +
        INSTALL.repo +
        "/" +
        encodeURIComponent(INSTALL.ref) +
        "/" +
        INSTALL.path
    const request = new Request(url)
    request.method = "GET"
    request.timeoutInterval = 20
    request.headers = {
        "Accept": "text/plain",
        "User-Agent": "AttendanceHelper"
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

    if (status === 404) {
        throw new Error("下载失败：仓库还不是公开的，或脚本路径不对")
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
