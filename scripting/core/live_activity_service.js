import { LiveActivity } from "scripting";
import { getPreferences, getLiveActivityId, setLiveActivityId } from "./store";
import { formatShortDuration, formatTime, missingCheckout, checkoutWarningTitle } from "./rules";
import { AttendanceCountdownActivity } from "../live_activity";
import { isChinaWorkday } from "./attendance";

function activityState(data) {
  const phase = data.hasOutRecord ? "finished" : missingCheckout(data) ? "ready" : "working";
  return {
    phase,
    missedConfirmed: !!data.missedConfirmed,
    startedAt: data.inTime.getTime(),
    targetAt: data.targetTime.getTime(),
    clockInText: formatTime(data.inTime),
    targetText: formatTime(data.targetTime),
    statusText: phase === "working" ? "正在工作" : phase === "ready" ? checkoutWarningTitle(data) : "已打下班卡",
    workedText: data.hasOutRecord
      ? formatShortDuration(data.currentWorkMs)
      : formatShortDuration(Math.max(0, Date.now() - data.inTime.getTime()))
  };
}

export async function syncAttendanceLiveActivity(data) {
  const preferences = getPreferences();
  const savedId = getLiveActivityId();
  if (!preferences.liveActivityEnabled) {
    if (savedId) await endSavedActivity("灵动岛倒计时已关闭");
    return { ok: true, message: "Live Activity 已关闭" };
  }
  if (!(await isChinaWorkday(new Date()))) {
    if (savedId) await endSavedActivity("今天是休息日");
    return { ok: true, message: "休息日不启动考勤倒计时" };
  }
  if (!data?.ok || !data.hasClockIn || !data.targetTime) {
    if (savedId && !data?.ok) return { ok: false, message: "数据暂不可用，保留现有活动" };
    if (savedId) await endSavedActivity("今日没有有效上班卡");
    return { ok: true, message: "当前不需要启动倒计时" };
  }

  if (data.hasOutRecord) {
    if (savedId) await endSavedActivity(data.targetReached ? "今日考勤完成，辛苦了！" : "已检测到下班卡 · 工时不足", data);
    return { ok: true, message: "已结束考勤倒计时" };
  }

  if (!(await LiveActivity.areActivitiesEnabled())) {
    return { ok: false, message: "请在 iOS 设置中允许 Scripting 的实时活动" };
  }

  const state = activityState(data);
  let currentState = savedId ? await LiveActivity.getActivityState(savedId) : null;
  let activity = savedId && (currentState === "active" || currentState === "stale") ? await LiveActivity.from(savedId, "AttendanceCountdown") : null;
  if (savedId && (currentState === "active" || currentState === "stale") && typeof activity?.update !== "function") {
    return { ok: false, message: "实时活动暂无法恢复，请在锁屏关闭旧活动后刷新" };
  }

  if (!activity || !currentState || currentState === "dismissed" || currentState === "ended") {
    activity = AttendanceCountdownActivity();
    const started = await activity.start(state, {
      staleDate: data.targetTime.getTime() + 4 * 3600000,
      relevanceScore: 1
    });
    if (!started || !activity.activityId) {
      setLiveActivityId("");
      return { ok: false, message: "iOS 没有启动实时活动，请检查系统设置" };
    }
    setLiveActivityId(activity.activityId);
    return { ok: true, message: "灵动岛倒计时已启动" };
  }

  if (currentState === "active" || currentState === "stale") {
    await activity.update(state, {
      staleDate: data.targetTime.getTime() + 4 * 3600000,
      relevanceScore: 1
    });
  }
  return { ok: true, message: "灵动岛倒计时已同步" };
}

export async function endSavedActivity(reason, data) {
  const id = getLiveActivityId();
  if (!id) return;
  try {
    const state = await LiveActivity.getActivityState(id);
    const activity = await LiveActivity.from(id, "AttendanceCountdown");
    if (state === "active" || state === "stale" || state === "ended") {
      if (typeof activity?.end !== "function") throw new Error("实时活动无法恢复");
      const ended = await activity.end({
        phase: "finished",
        startedAt: data?.inTime?.getTime() ?? Date.now(),
        targetAt: data?.targetTime?.getTime() ?? Date.now(),
        clockInText: data?.inTime ? formatTime(data.inTime) : "--",
        targetText: data?.targetTime ? formatTime(data.targetTime) : "--",
        clockOutText: data?.latestOutTime ? formatTime(data.latestOutTime) : undefined,
        statusText: reason,
        workedText: data?.hasOutRecord ? formatShortDuration(data.currentWorkMs) : "--"
      }, { dismissTimeInterval: 0 });
      if (ended === false) throw new Error("实时活动结束失败");
    }
  } catch (_) {
    throw new Error("无法结束旧实时活动，请先在锁屏关闭后重试");
  }
  setLiveActivityId("");
}
