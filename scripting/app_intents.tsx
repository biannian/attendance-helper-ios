import { AppIntentManager, AppIntentProtocol, Widget } from "scripting";
import { getTodaySummary, isChinaWorkday } from "./core/attendance";
import { getPreferences } from "./core/store";
import { syncAttendanceLiveActivity } from "./core/live_activity_service";
import { handleScheduleNineHours, handleNearNineHours } from "./core/reminders";

export const RefreshAttendanceIntent = AppIntentManager.register({
  name: "RefreshAttendance",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    const data = await getTodaySummary({ force: true });
    const workday = await isChinaWorkday(new Date());
    if (data.ok) {
      await syncAttendanceLiveActivity(data);
      if (workday && getPreferences().remindMinutes > 0 && data.hasClockIn && !data.hasOutRecord) await handleScheduleNineHours();
    }
    Widget.reloadAll();
    console.log(data.ok ? "考勤已刷新" : (data.error || "考勤刷新失败"));
  }
});

export const ScheduleReminderIntent = AppIntentManager.register({
  name: "ScheduleAttendanceReminder",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    const result = await handleScheduleNineHours();
    Widget.reloadAll();
    console.log(result.message || "提醒已更新");
  }
});

export const CheckAttendanceIntent = AppIntentManager.register({
  name: "CheckAttendance",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    const result = await handleNearNineHours();
    if (result.data?.ok) { try { await syncAttendanceLiveActivity(result.data); } catch (_) {} }
    Widget.reloadAll();
    console.log(result.message || "检查完成");
  }
});
