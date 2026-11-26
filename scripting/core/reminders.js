import { Notification } from "scripting";
import { getPreferences } from "./store";
import { getTodaySummary, isChinaWorkday } from "./attendance";
import { formatDateKey, formatRemainTitle, formatTime, missingCheckout } from "./rules";

const EARLY = "attendance-helper-upcoming-work";
const DUE = "attendance-helper-checkout-due";
const prefix = "attendance-helper-notice-v2-";
function key(kind) { return prefix + formatDateKey(new Date()) + "-" + kind; }

async function schedule(id, title, subtitle, at) {
  const result = await Notification.schedule({
    identifier: id, title, subtitle,
    trigger: new TimeIntervalNotificationTrigger({
      timeInterval: Math.max(1, Math.ceil((at - Date.now()) / 1000)), repeats: false
    })
  });
  if (result === false) throw new Error("通知预约失败，请检查通知权限");
}
function notifyTimes(data) {
  return "上班 " + formatTime(data.inTime) + " · 可下班 " + formatTime(data.targetTime);
}
async function removePending(id, kind) {
  await Notification.removePendings([id]);
  // Only forget a future appointment; keep an already-due event deduplicated.
  const old = Storage.get(key(kind));
  if (old && old.at > Date.now()) Storage.remove(key(kind));
}
export async function cancelUpcomingReminder() {
  await removePending(EARLY, "early");
  await removePending(DUE, "due");
}
async function arrange(kind, id, title, body, at) {
  const old = Storage.get(key(kind));
  const now = Date.now();
  if (old && old.at <= now) return; // One alert per kind per day.
  if (old && old.at === at) return;
  if (old) await removePending(id, kind);
  await schedule(id, title, body, at);
  Storage.set(key(kind), { at });
}

async function reconcile(existingData) {
  if (!(await isChinaWorkday(new Date()))) {
    await cancelUpcomingReminder();
    return { ok: true, message: "休息日，无需提醒" };
  }
  const data = existingData || await getTodaySummary({ force: true });
  if (!data?.ok || data.refreshError) return { ok: false, message: "同步暂不可用，未发送提醒", data };
  if (!data.hasClockIn || !data.targetTime || data.hasOutRecord) {
    await cancelUpcomingReminder();
    return { ok: true, message: data.hasOutRecord ? "已打下班卡" : "等待上班卡", data };
  }
  const prefs = getPreferences();
  const target = data.targetTime.getTime();
  const now = Date.now();
  const earlyAt = target - prefs.remindMinutes * 60000;
  if (!prefs.remindMinutes || now >= target) {
    await removePending(EARLY, "early");
  } else {
    const remaining = Math.max(1, Math.ceil((target-now)/60000));
    await arrange("early", EARLY, formatRemainTitle(now >= earlyAt ? remaining : prefs.remindMinutes), notifyTimes(data), earlyAt);
  }
  if (!prefs.checkoutReminderEnabled) {
    await removePending(DUE, "due");
  } else if (data.missedConfirmed) {
    await removePending(DUE, "due");
  } else {
    // A scheduled notification cannot fetch attendance at delivery time.
    await arrange("due", DUE, now >= target ? "未打下班卡，请检查" : "已到下班时间，请确认打卡", "请打卡后刷新考勤确认", target);
  }
  return { ok: true, message: now >= target ? (data.missedConfirmed ? "已漏卡 · 待补卡" : "工时已满，请确认下班卡") : "提醒已安排，未到时间不通知", data };
}
export async function handleScheduleNineHours(existingData) { return reconcile(existingData); }
export async function handleNearNineHours(existingData) { return reconcile(existingData); }
export async function handleLeaveCompany() {
  const data = await getTodaySummary({ force: true });
  // Early exits and successful checkout are silent; due alerts share the same deduplication.
  await reconcile(data);
  return data;
}
