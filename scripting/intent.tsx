import { Intent, Script, Widget, Navigation, VStack, Text } from "scripting";
import { AppView } from "./app_view";
import { getTodaySummary, debugSummary } from "./core/attendance";
import { saveAccount, getAccount, getLiveActivityId } from "./core/store";
import { handleLeaveCompany, handleNearNineHours, handleScheduleNineHours, cancelUpcomingReminder } from "./core/reminders";
import { syncAttendanceLiveActivity } from "./core/live_activity_service";
import { parseLaunchParameter } from "./core/launch";

async function main() {
  const input = Intent.shortcutParameter;
  const raw = (input?.type === "text" ? input.value : undefined) ?? Intent.textsParameter?.[0] ?? Script.queryParameters?.action ?? "refresh";
  if (raw === "diagnostic") {
    await Navigation.present({ element: <VStack padding={16}><Text font="title2">考勤助手 · 诊断</Text><Text>快捷指令前台界面已启动</Text></VStack> });
    Script.exit(Intent.text("前台界面正常")); return;
  }
  const req = parseLaunchParameter(raw);
  if (req.account) {
    const old = getAccount();
    if (req.account.username !== old.username || req.account.password !== old.password || req.account.deviceId !== old.deviceId) {
      if (getLiveActivityId()) throw new Error("请在 App 内切换账号，以便结束旧实时活动");
      await cancelUpcomingReminder();
      saveAccount(req.account);
    }
  }
  if (req.mode === "manage" || req.mode === "week") {
    await Navigation.present({ element: <AppView initialTab={req.mode === "week" ? "calendar" : "today"} /> });
    Script.exit(Intent.text("管理界面已关闭")); return;
  }
  if (req.mode !== "account" && !getAccount().configured) {
    Script.exit(Intent.text("请先打开考勤助手并配置账号")); return;
  }
  let result;
  switch(req.mode) {
    case "account": result = { ok: !!getAccount().configured }; break;
    case "refresh": case "widget": {
      const data = await getTodaySummary({ force: true });
      if (data.ok) { try { await syncAttendanceLiveActivity(data); } catch (_) {} }
      result = { ok: data.ok, message: data.ok ? "考勤已刷新" : "考勤刷新失败，请打开管理页" }; break;
    }
    case "leave": result = await handleLeaveCompany(); break;
    case "schedule9": result = await handleScheduleNineHours(); break;
    case "near9": result = await handleNearNineHours(); break;
    case "debug": Script.exit(Intent.text(debugSummary(await getTodaySummary({ force: true })))); return;
    default: throw new Error("请在 Scripting App 内打开管理、更新或预览功能");
  }
  Widget.reloadAll();
  Script.exit(Intent.text(result?.ok ? (result.message || "操作完成") : "操作失败，请打开考勤助手检查"));
}
main().catch(error => {
  const category = error instanceof TypeError ? "TypeError" : error instanceof ReferenceError ? "ReferenceError" : "RuntimeError";
  console.error("考勤快捷指令启动失败：" + category);
  Script.exit(Intent.text("考勤操作失败：" + category + "，请查看脚本控制台"));
});
