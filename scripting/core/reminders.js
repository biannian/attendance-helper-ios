import { Notification } from "scripting";
// Storage and TimeIntervalNotificationTrigger are native runtime globals.
import { CONFIG } from "./config";
import { getPreferences } from "./store";
import { getTodaySummary, isChinaWorkday } from "./attendance";
import { formatDateKey, formatRemainTitle, formatTime, missingCheckout } from "./rules";

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
  try { await Notification.removePendings(["attendance-helper-upcoming-work", "attendance-helper-checkout-due"]); } catch (_) {}
}

export async function handleScheduleNineHours() {
  const preferences = getPreferences();
  const minutes = preferences.remindMinutes;
  const dateKey = formatDateKey(new Date());
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
  if (data.hasOutRecord) {
    await cancelUpcomingReminder();
    return { ok: true, message: "已检测到下班卡", data };
  }
  if (missingCheckout(data)) return handleNearNineHours(data);
  // The deadline notification is independent of optional advance reminders.
  await Notification.schedule({ identifier: "attendance-helper-checkout-due", title: "⚠ 下班时间到了，请确认下班卡", subtitle: "请打卡并刷新考勤确认", trigger: new TimeIntervalNotificationTrigger({ timeInterval: Math.max(1, Math.ceil((data.targetTime.getTime()-Date.now())/1000)), repeats: false }) });
  if (!minutes) return { ok: true, message: "已安排下班打卡提醒", data };

  if (Storage.get("attendance-helper-schedule9-" + dateKey)) return { ok: true, message: "今日提醒已安排", data };
  const remindAt = new Date(data.targetTime.getTime() - minutes * 60000);
  await Notification.removePendings(["attendance-helper-upcoming-work"]);
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

export async function handleNearNineHours(existingData) {
  if (!(await isChinaWorkday(new Date()))) return { ok: true, message: "今天是休息日" };
  const data = existingData || await getTodaySummary({ force: true });
  if (!data.ok || !data.hasClockIn) return { ok: false, error: data.error || "尚未打上班卡" };

  const dateKey = formatDateKey(new Date());
  const preferences = getPreferences();
  if (data.targetReached) {
    if (data.hasOutRecord) await cancelUpcomingReminder();
    const key = "attendance-helper-target-reached-" + dateKey + (data.hasOutRecord ? "-done" : data.missedConfirmed ? "-correction" : "-missing");
    if (!Storage.get(key)) {
      await sendNotification(data.hasOutRecord ? "考勤正常 · 已打下班卡" : data.missedConfirmed ? "⚠ 已漏卡，请申请补卡" : "⚠ 未打下班卡！请立即打卡", notifyTimes(data), key);
      Storage.set(key, true);
    }
    return { ok: true, message: data.hasOutRecord ? "考勤正常 · 已打下班卡" : data.missedConfirmed ? "已漏卡 · 待补卡" : "未打下班卡！请立即打卡", data };
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
  } else if (missingCheckout(data)) {
    await sendNotification(data.missedConfirmed ? "⚠ 已漏卡，请申请补卡" : "⚠ 未打下班卡！请立即打卡", notifyTimes(data));
  } else {
    await sendNotification("⚠ 下班卡未确认", formatRemainTitle(data.remainingMinutes) + " · " + notifyTimes(data));
  }
  return data;
}
