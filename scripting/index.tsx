import { Navigation, NavigationStack, VStack, Text, Script, Widget } from "scripting";
import { AppView } from "./app_view";
import { getTodaySummary, debugSummary, isChinaWorkday } from "./core/attendance";
import { getPreferences } from "./core/store";
import { handleLeaveCompany, handleScheduleNineHours, handleNearNineHours } from "./core/reminders";
import { syncAttendanceLiveActivity } from "./core/live_activity_service";

async function runAction(action) {
  if (action === "refresh" || action === "widget") {
    const workday = await isChinaWorkday(new Date());
    const data = await getTodaySummary({ force: true });
    if (data.ok) {
      await syncAttendanceLiveActivity(data);
      if (getPreferences().remindMinutes > 0 && data.hasClockIn && !data.hasOutRecord) {
        await handleScheduleNineHours();
      }
    }
    Widget.reloadAll();
    return data;
  }
  if (action === "leave") { const data = await handleLeaveCompany(); if (data?.ok) await syncAttendanceLiveActivity(data); return data; }
  if (action === "schedule9") return handleScheduleNineHours();
  if (action === "near9") { const result = await handleNearNineHours(); if (result.data?.ok) await syncAttendanceLiveActivity(result.data); return result; }
  if (action === "debug") return debugSummary(await getTodaySummary({ force: true }));
  if (action === "update") return "请在 Scripting 的脚本设置中检查远程仓库更新";
  return null;
}

async function main() {
  const action = String(Script.queryParameters?.action || Script.widgetParameter || "manage").toLowerCase();
  if (action !== "manage" && action !== "week" && action !== "account") {
    const result = await runAction(action);
    Script.exit(result);
    return;
  }
  if (Script.queryParameters?.diagnostic === "ui") {
    await Navigation.present({ element: <NavigationStack><VStack padding={16} navigationTitle="考勤助手诊断"><Text>基础界面渲染正常</Text><Text>请返回并尝试正常启动。</Text></VStack></NavigationStack> });
  } else {
    await Navigation.present({ element: <AppView initialTab={action === "week" ? "calendar" : action === "account" ? "settings" : "today"} /> });
  }
  Script.exit();
}

main().catch(async error => {
  // Do not expose raw exception contents: login errors may include account data.
  const category = error instanceof TypeError ? "TypeError" : error instanceof ReferenceError ? "ReferenceError" : "RuntimeError";
  console.error("考勤助手启动失败：" + category);
  try { await Dialog.alert({ title: "考勤助手启动失败", message: "启动阶段：" + category + "。请使用诊断入口检查基础界面，或在编辑器查看报错（勿分享账号、密码或 Token）。" }); } catch (_) {}
  Script.exit({ ok: false, error: category });
});
