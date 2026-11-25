export function parseLaunchParameter(raw) {
  let value = raw;
  const modes = ["manage","widget","refresh","leave","schedule9","near9","week","debug","update","account"];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) value = JSON.parse(trimmed);
    else {
      const lines = value.split(/\r?\n/);
      const mode = lines[0].trim().toLowerCase() || "refresh";
      if (!modes.includes(mode)) throw new Error("不支持的考勤动作");
      if (lines.length === 1) return { mode, account: null };
      if (lines.length !== 4) throw new Error("账号参数须为四行");
      value = { mode, username: lines[1], password: lines[2], deviceId: lines[3] };
    }
  }
  const mode = String(value?.mode || value?.action || "account").toLowerCase();
  if (!modes.includes(mode)) throw new Error("不支持的考勤动作");
  const username = String(value?.username || value?.userName || value?.user || "").trim();
  const password = String(value?.password ?? "");
  const deviceId = String(value?.deviceId || value?.deviceid || value?.deviceID || "").trim();
  if (username || password || deviceId) {
    if (!username || !password || !deviceId) throw new Error("请填写完整账号资料");
    return { mode, account: { username, password, deviceId } };
  }
  return { mode, account: null };
}
