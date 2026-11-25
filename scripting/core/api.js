import { Script, WebViewController } from "scripting";
import { CONFIG } from "./config";
import { encryptLoginPassword } from "./crypto";
import { getAccount, getToken, setToken } from "./store";

function authError(message, code = 401) {
  const error = new Error(message || "登录状态已失效");
  error.authFailure = true;
  error.authCode = Number(code) || 401;
  return error;
}

function isAuthFailure(status, json, message) {
  const code = json?.code == null ? null : Number(json.code);
  const text = String(json?.msg || json?.message || message || "");
  if (status === 401 || [401, 999999, 999998, 999997, 999996].includes(code)) return true;
  return /access token|token expired|invalid access token|登录状态已?失效|请重新登录/i.test(text);
}

async function requestJSON(url, options = {}) {
  const response = await fetch(new Request(url, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body == null ? undefined : JSON.stringify(options.body),
    timeout: options.timeout || 15,
    debugLabel: options.debugLabel || "考勤接口"
  }));
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (options.allowNewDeviceCode && Number(json?.code) === CONFIG.NEW_DEVICE_CODE && response.ok) return json;
  if (isAuthFailure(response.status, json, "")) {
    throw authError(json?.msg || json?.message || "登录状态已失效", json?.code || response.status);
  }
  if (!json) throw new Error("接口没有返回有效 JSON");
  if (!response.ok) throw new Error(json.msg || json.message || ("HTTP " + response.status));
  if (options.allowNewDeviceCode && Number(json.code) === CONFIG.NEW_DEVICE_CODE) return json;
  if (json.code != null && ![0, 200].includes(Number(json.code))) {
    throw new Error(json.msg || json.message || ("接口异常：" + json.code));
  }
  return json;
}

function openLoginHeaders(extra = {}) {
  const account = getAccount();
  return {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Authorization": CONFIG.LOGIN_BASIC,
    "deviceid": account.deviceId,
    "STN-PhoneType": "Iphone",
    "devicename": "unknow 0",
    "terminal": "2",
    "User-Agent": CONFIG.USER_AGENT,
    ...extra
  };
}

async function collectCaptchaParam() {
  if (Script.env !== "index") throw new Error("新设备需要安全验证，请打开考勤助手进行验证");
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system;padding:18px">
<p>新设备需要安全验证。请完成下方滑块验证，然后关闭此页面。</p>
<div id="captcha-element"></div><button id="captcha-button" style="display:none"></button><p id="done"></p>
<script>
window.AliyunCaptchaConfig={region:"cn",prefix:"1jgloq"};
window.__captchaParam="";
function boot(){
 if(!window.initAliyunCaptcha){setTimeout(boot,200);return;}
 initAliyunCaptcha({
  SceneId:"1w0ysb3s",mode:"embed",element:"#captcha-element",button:"#captcha-button",
  success:function(value){window.__captchaParam=String(value||"");document.getElementById("done").textContent="验证通过，请关闭页面";},
  fail:function(){},
  getInstance:function(){var timer=setInterval(function(){var body=document.getElementById("aliyunCaptcha-captcha-body");if(body){body.dispatchEvent(new Event("click"));clearInterval(timer);}},200);}
 });
}
boot();
</script>
<script src="https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js"></script>
</body></html>`;
  const web = new WebViewController({ ephemeral: true });
  try {
    const loaded = await web.loadHTML(html, "https://www.hikiot.com/");
    if (!loaded) throw new Error("安全验证页面加载失败");
    await web.present({ navigationTitle: "新设备安全验证" });
    return String(await web.evaluateJavaScript("return window.__captchaParam || ''") || "").trim();
  } finally {
    web.dispose();
  }
}

async function askSmsCode() {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system;padding:22px">
<h3>短信验证码</h3><p>验证码已发送到登录手机号。请输入 6 位数字，点击保存后关闭页面。</p>
<input id="code" inputmode="numeric" maxlength="6" placeholder="6 位验证码" style="font-size:22px;padding:12px;width:90%;border:1px solid #aaa;border-radius:10px">
<button onclick="window.__smsCode=document.getElementById('code').value;document.getElementById('done').textContent='已保存，请关闭页面';" style="margin-top:16px;padding:12px 18px">保存验证码</button><p id="done"></p>
<script>window.__smsCode="";</script></body></html>`;
  const web = new WebViewController({ ephemeral: true });
  try {
    await web.loadHTML(html);
    await web.present({ navigationTitle: "输入短信验证码" });
    const code = String(await web.evaluateJavaScript("return window.__smsCode || ''") || "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("未填写有效的 6 位短信验证码");
    return code;
  } finally {
    web.dispose();
  }
}

async function verifyNewDevice() {
  const account = getAccount();
  if (!account.username) throw new Error("新设备验证缺少登录手机号");
  const captcha = await collectCaptchaParam();
  if (!captcha) throw new Error("已取消新设备安全验证");
  const sent = await requestJSON(CONFIG.SEND_MESSAGE_URL, {
    method: "POST",
    headers: openLoginHeaders(),
    body: { phone: account.username, captchaVerifyParam: captcha },
    debugLabel: "发送新设备短信"
  });
  if (Number(sent.code) !== 0) throw new Error(sent.msg || "发送短信验证码失败");
  const code = await askSmsCode();
  const login = await requestJSON(CONFIG.CODE_LOGIN_URL, {
    method: "POST",
    headers: openLoginHeaders({ "login-source": "link-web" }),
    body: { phone: account.username, code, isAuto: false },
    debugLabel: "新设备验证码登录"
  });
  const token = login?.data?.token;
  if (!token) throw new Error(login?.msg || "新设备验证失败");
  return token;
}

async function authorizedJSON(url, method, token, body) {
  return requestJSON(url, {
    method,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "deviceid": getAccount().deviceId,
      "terminal": "2",
      "STN-PhoneType": "Iphone",
      "devicename": "unknow 0",
      "User-Agent": CONFIG.USER_AGENT
    },
    body,
    debugLabel: "账号团队接口"
  });
}

async function selectCurrentTeam(token) {
  const detail = await authorizedJSON(CONFIG.ACCOUNT_DETAIL_URL, "GET", token);
  const data = detail.data || {};
  const teams = Array.isArray(data.teamInfoList) ? data.teamInfoList : [];
  const teamNo = data.onLineTeamNo || teams[0]?.teamNo || "";
  if (!teamNo) throw new Error("登录成功，但账号没有可进入的团队");
  await authorizedJSON(CONFIG.TEAM_CHANGE_URL, "POST", token, {
    teamNo,
    terminal: 2
  });
  return teamNo;
}

export async function refreshAccessToken() {
  const account = getAccount();
  if (!account.username || !account.password || !account.deviceId) {
    throw new Error("请先在考勤配置中填写账号、密码和设备 ID");
  }
  const login = await requestJSON(CONFIG.LOGIN_URL, {
    method: "POST",
    headers: openLoginHeaders({ "login-source": "link-web" }),
    body: {
      username: account.username,
      password: encryptLoginPassword(account.password),
      isAuto: false
    },
    debugLabel: "账号密码登录",
    allowNewDeviceCode: true
  });

  let token = login?.data?.token || "";
  if (Number(login?.code) === CONFIG.NEW_DEVICE_CODE) {
    token = await verifyNewDevice();
  }
  if (!token) throw new Error(login?.msg || "登录接口没有返回 Token");
  const current = getAccount();
  if (current.username !== account.username || current.password !== account.password || current.deviceId !== account.deviceId) throw new Error("账号已切换，请重新登录");
  await selectCurrentTeam(token);
  const latest = getAccount();
  if (latest.username !== account.username || latest.password !== account.password || latest.deviceId !== account.deviceId) throw new Error("账号已切换，请重新登录");
  setToken(token);
  return token;
}

async function requestAttendance(token, dateKey) {
  if (!token) throw authError("还没有登录");
  const url = CONFIG.API_BASE +
    "?date=" + encodeURIComponent(dateKey) +
    "&ID=" + encodeURIComponent(CONFIG.STATIC_ID) +
    "&_cb=" + Date.now();
  return requestJSON(url, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "UNI-Request-Source": "1",
      "terminal": "1",
      "appNo": CONFIG.APP_NO,
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Accept": "*/*",
      "deviceid": getAccount().deviceId,
      "versionCode": CONFIG.VERSION_CODE,
      "User-Agent": CONFIG.USER_AGENT,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache"
    },
    debugLabel: "查询每日考勤"
  });
}

export async function fetchAttendance(dateKey) {
  let token = getToken();
  try {
    return await requestAttendance(token, dateKey);
  } catch (error) {
    if (!error?.authFailure) throw error;
    if (Number(error.authCode) === 999999 && token) {
      try {
        await selectCurrentTeam(token);
        return await requestAttendance(token, dateKey);
      } catch (teamError) {
        if (!teamError?.authFailure) throw teamError;
      }
    }
  }
  token = await refreshAccessToken();
  return requestAttendance(token, dateKey);
}
