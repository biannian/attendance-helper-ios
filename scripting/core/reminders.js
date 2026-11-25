import { Notification } from "scripting";
// Storage and TimeIntervalNotificationTrigger are native runtime globals.
import { CONFIG } from "./config";
import { getPreferences } from "./store";
import { getTodaySummary, isChinaWorkday } from "./attendance";
import { formatDateKey, formatRemainTitle, formatTime } from "./rules";

async function sendNotification(title, body, identifier) {
  await Notification.schedule({
    identifier: identifier || ("attendance-" + Date.now()),
    title,
    subtitle: body,
    trigger: new TimeIntervalNotificationTrigger({
      timeInterval: 1,
      repeats: false
    })
  });
}

function notifyTimes(data) {
  const start = data.hasClockIn ? formatTime(data.inTime) : "--";
  if (data.hasOutRecord && data.latestOutTime) {
    return "上班卡 " + start + " · 下班卡 " + formatTime(data.latestOutTime);
  }
  return "上班卡 " + start + " · 下班卡 未打" +
    (data.targetTime ? " · 可下班 " + formatTime(data.targetTime) : "");
}

export async function cancelUpcomingReminder() {
  try { await Notification.removePendings(["attendance-helper-upcoming-work"]); } catch (_) {}
}

export async function handleScheduleNineHours() {
  const preferences = getPreferences();
  const minutes = preferences.remindMinutes;
  const dateKey = formatDateKey(new Date());
  if (!minutes) {
    await cancelUpcomingReminder();
    return { ok: true, message: "提前下班提醒已关闭" };
  }
  if (!(await isChinaWorkday(new Date()))) return { ok: true, message: "今天是休息日" };

  const data = await getTodaySummary({ force: true });
  if (!data.ok) {
    await sendNotification("考勤提醒失败", data.error);
    return { ok: false, error: data.error };
  }
  if (!data.hasClockIn) {
    await sendNotification("今天还没有上班卡", "同步后会自动安排提前下班提醒");
    return { ok: true, message: "尚未打上班卡" };
  }
  if (data.hasOutRecord || data.targetReached) {
    await cancelUpcomingReminder();
    return { ok: true, message: "今天已经达到下班条件" };
  }

  if (Storage.get("attendance-helper-schedule9-" + dateKey)) return { ok: true, message: "今日提醒已安排", data };
  const remindAt = new Date(data.targetTime.getTime() - minutes * 60000);
  await cancelUpcomingReminder();
  if (remindAt <= new Date()) {
    await sendNotification(formatRemainTitle(data.remainingMinutes), notifyTimes(data));
  } else {
    await Notification.schedule({
      identifier: "attendance-helper-upcoming-work",
      title: formatRemainTitle(minutes),
      subtitle: notifyTimes(data),
      trigger: new TimeIntervalNotificationTrigger({
        timeInterval: Math.max(1, Math.floor((remindAt.getTime() - Date.now()) / 1000)),
        repeats: false
      })
    });
  }
  Storage.set("attendance-helper-schedule9-" + dateKey, true);
  return { ok: true, message: "已安排提前 " + minutes + " 分钟提醒" };
}

export async function handleNearNineHours() {
  if (!(await isChinaWorkday(new Date()))) return { ok: true, message: "今天是休息日" };
  const data = await getTodaySummary({ force: true });
  if (!data.ok || !data.hasClockIn) return { ok: false, error: data.error || "尚未打上班卡" };

  const dateKey = formatDateKey(new Date());
  const preferences = getPreferences();
  if (data.targetReached) {
    const key = "attendance-helper-target-reached-" + dateKey;
    if (!Storage.get(key)) {
      await sendNotification(data.hasOutRecord ? "已打下班卡" : "⚠ 未打下班卡，请立即打卡", notifyTimes(data), key);
      Storage.set(key, true);
    }
    return { ok: true, message: "工时已达标", data };
  }

  const scheduleKey = "attendance-helper-schedule9-" + dateKey;
  const nearKey = "attendance-helper-near9-" + dateKey;
  if (!Storage.get(scheduleKey) && preferences.remindMinutes > 0 &&
      data.remainingMinutes <= preferences.remindMinutes && data.remainingMinutes > 0 &&
      !Storage.get(nearKey)) {
    await sendNotification(formatRemainTitle(data.remainingMinutes), notifyTimes(data), nearKey);
    Storage.set(nearKey, true);
  }
  return { ok: true, message: "工时检查完成", data };
}

export async function handleLeaveCompany() {
  const data = await getTodaySummary({ force: true });
  if (!data.ok) {
    await sendNotification("考勤查询失败", data.error);
    return data;
  }
  if (!data.hasClockIn) {
    await sendNotification("未检测到上班卡", "请检查今天的考勤记录");
  } else if (data.hasOutRecord) {
    await sendNotification(
      data.targetReached ? "考勤正常" : "工时不足",
      notifyTimes(data) + " · 实际工时 " + Math.floor(data.currentWorkMs / 3600000) + "小时"
    );
  } else if (data.targetReached) {
    await sendNotification("⚠ 未打下班卡，请立即打卡", notifyTimes(data));
  } else {
    await sendNotification(formatRemainTitle(data.remainingMinutes), notifyTimes(data));
  }
  return data;
}
