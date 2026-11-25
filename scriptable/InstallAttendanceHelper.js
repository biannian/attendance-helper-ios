/*
 * Copyright (c) iGroup.
 * All rights reserved.
 */

/**
 * 打卡脚本安装器
 *
 * 从公开仓库下载 AttendanceHelper.js，写进 Scriptable。
 * 只需要把这一小段放进 Scriptable 并运行一次，不需要 GitHub Token。
 *
 * @author Kai
 * @date 2026/11/24 17:02
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
        message = "已安装 AttendanceHelper 和 AttendanceCheck。小组件仍选 AttendanceHelper；检查、刷新及提醒快捷指令改用 AttendanceCheck，并关闭运行时显示。账号无需重新设置。以后再次运行安装器即可同时更新。特定路径：" + path
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
 * @date 2026/11/24 17:02
 */
async function downloadAttendanceScript() {
    return await downloadVerifiedAttendanceSource(INSTALL.repo,INSTALL.ref,INSTALL.path)
}

async function downloadVerifiedAttendanceSource(repo, ref, path) {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/")
    const suffix = "?ref=" + encodeURIComponent(ref) + "&_update=" + Date.now()
    const sources = [
        {name:"GitHub Raw",url:"https://raw.githubusercontent.com/"+repo+"/"+encodeURIComponent(ref)+"/"+encodedPath+"?_update="+Date.now(),accept:"text/plain"},
        {name:"GitHub API",url:"https://api.github.com/repos/"+repo+"/contents/"+encodedPath+suffix,accept:"application/vnd.github.raw+json"}
    ]
    const errors=[]
    for (const source of sources) {
        try {
            const req=new Request(source.url)
            req.method="GET"
            req.timeoutInterval=20
            req.headers={"Accept":source.accept,"Cache-Control":"no-cache","User-Agent":"AttendanceHelper"}
            const raw=await req.loadString()
            const status=req.response?.statusCode||0
            if(status && status!==200) throw new Error("HTTP "+status)
            let code=String(raw||"").replace(/^\uFEFF/,"")
            // API 某些代理会忽略 raw Accept，返回标准 JSON/base64 文件对象。
            if(code.trimStart().startsWith("{")) {
                const obj=JSON.parse(code)
                if(obj.encoding!=="base64" || obj.path!==path || typeof obj.content!=="string") throw new Error("非预期的 API 文件响应")
                const decoded=Data.fromBase64String(obj.content.replace(/\s/g,""))
                if(!decoded) throw new Error("Base64 解码失败")
                code=decoded.toRawString().replace(/^\uFEFF/,"")
            }
            const valid=code.length>=500
                && /^\s*\/\*\s*\* Copyright \(c\) iGroup(?: China)?\./.test(code)
                && /^const CONFIG\s*=\s*\{/m.test(code)
                && /^async function fetchAttendance\(/m.test(code)
                && /^async function getAttendanceSummary\(/m.test(code)
                && /(?:^|\n)async function notify\(/.test(code)
            if(!valid) {
                const type=/^\s*</.test(code)?"HTML 网页":"非完整脚本"
                throw new Error(type+"，"+code.length+" 字符")
            }
            // 只编译，不执行，拒绝意外截断或语法错误的内容。
            const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
            new AsyncFunction(code)
            return code
        } catch(error) {
            errors.push(source.name+": "+String(error?.message||error).replace(/\s+/g," ").slice(0,160))
        }
    }
    throw new Error("下载验证失败，未覆盖现有脚本。\n"+errors.join("\n"))
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
    const workerPath = files.joinPath(files.documentsDirectory(), "AttendanceCheck.js")
    if (files.fileExists(workerPath)) await files.downloadFileFromiCloud(workerPath)
    files.writeString(workerPath, code)
    return path
}
