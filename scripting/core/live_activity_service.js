import { LiveActivity } from "scripting";
import { getPreferences, getLiveActivityId, setLiveActivityId } from "./store";
import { formatShortDuration, formatTime } from "./rules";
import { AttendanceCountdownActivity } from "../live_activity";
import { isChinaWorkday } from "./attendance";

function activityState(data) {
  const phase = data.hasOutRecord ? "finished" : data.targetReached ? "ready" : "working";
  return {
    phase,
    startedAt: data.inTime.getTime(),
    targetAt: data.targetTime.getTime(),
    clockInText: formatTime(data.inTime),
    targetText: formatTime(data.targetTime),
    statusText: phase === "working" ? "正在工作" : phase === "ready" ? "可以下班" : "已打下班卡",
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
    if (savedId) await endSavedActivity("已检测到下班卡");
    return { ok: true, message: "已结束考勤倒计时" };
  }

  if (!(await LiveActivity.areActivitiesEnabled())) {
    return { ok: false, message: "请在 iOS 设置中允许 Scripting 的实时活动" };
  }

  const state = activityState(data);
  let activity = savedId ? LiveActivity.from(savedId, "AttendanceCountdown") : null;
  let currentState = activity ? await activity.getActivityState() : null;

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

export async function endSavedActivity(reason) {
  const id = getLiveActivityId();
  if (!id) return;
  try {
    const activity = LiveActivity.from(id, "AttendanceCountdown");
    const state = await activity.getActivityState();
    if (state && state !== "dismissed") {
      await activity.end({
        phase: "finished",
        startedAt: Date.now(),
        targetAt: Date.now(),
        clockInText: "--",
        targetText: "--",
        statusText: reason,
        workedText: "--"
      }, { dismissTimeInterval: 0 });
    }
  } catch (_) {
    throw new Error("无法结束旧实时活动，请先在锁屏关闭后重试");
  }
  setLiveActivityId("");
}
