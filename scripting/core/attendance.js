import { CONFIG } from "./config";
import { fetchAttendance } from "./api";
import {
  addDays,
  buildAttendanceHistoryDay,
  formatDateKey,
  formatRemainText,
  formatShortDuration,
  formatTime,
  isNormalWeekday,
  monthWeeks,
  normalizeAttendanceData
} from "./rules";
import {
  getAccount,
  isMissedCheckoutConfirmed,
  setMissedCheckoutConfirmed,
  readHistorySnapshot,
  readReview,
  getTodaySnapshot,
  saveTodaySnapshot,
  writeHistorySnapshot,
  writeReview,
  readHolidayDay,
  writeHolidayDay,
  readHolidayYear,
  writeHolidayYear
} from "./store";

function snapshotFromData(data, dateKey) {
  return {
    savedAt: new Date().toISOString(),
    date: dateKey,
    personName: data.personName || "",
    orgName: data.orgName || "",
    shiftName: data.shiftName || "",
    inTime: data.inTime ? data.inTime.toISOString() : null,
    outSwipeTime: data.outSwipeTime ? data.outSwipeTime.toISOString() : null,
    latestOutTime: data.outSwipeTime ? data.outSwipeTime.toISOString() : null,
    inStatusDesc: data.inStatusDesc || "",
    outStatusDesc: data.outSwipeStatus || "",
    owner: getAccount().username
  };
}

export function loadCachedTodaySummary(now = new Date()) {
  try {
    const snapshot = getTodaySnapshot();
    if (!snapshot || !getAccount().username || snapshot.owner !== getAccount().username || snapshot.date !== formatDateKey(now)) {
      return { ok: false, cacheMiss: true, error: "暂无今天的考勤快照，请刷新一次" };
    }
    const raw = {
      date: snapshot.date,
      personName: snapshot.personName,
      orgName: snapshot.orgName,
      shiftName: snapshot.shiftName,
      clockInTime: snapshot.inTime,
      clockOffTime: snapshot.outSwipeTime || snapshot.latestOutTime,
      inStatusDesc: snapshot.inStatusDesc,
      outStatusDesc: snapshot.outStatusDesc
    };
    const data = normalizeAttendanceData(raw, snapshot.date, now);
    data.missedConfirmed = !data.hasOutRecord && isMissedCheckoutConfirmed(snapshot.date);
    data.snapshotUpdatedAt = snapshot.savedAt;
    data.isCached = true;
    return data;
  } catch (error) {
    return { ok: false, cacheMiss: true, error: "读取本地快照失败：" + String(error) };
  }
}

export async function getAttendanceSummary(day = new Date()) {
  const dateKey = formatDateKey(day);
  try {
    const owner = getAccount();
    const raw = await fetchAttendance(dateKey);
    const current = getAccount();
    if (!owner.username || owner.username !== current.username || owner.password !== current.password || owner.deviceId !== current.deviceId) throw new Error("账号已切换，请重新刷新");
    const data = normalizeAttendanceData(raw, dateKey, new Date());
    if (data.ok && data.hasOutRecord && isMissedCheckoutConfirmed(dateKey)) setMissedCheckoutConfirmed(dateKey, false);
    data.missedConfirmed = !data.hasOutRecord && isMissedCheckoutConfirmed(dateKey);
    if (String(data.date).replace(/\//g, "-").slice(0, 10) !== dateKey) {
      throw new Error("考勤返回日期与查询日期不一致");
    }
    if (data.ok) {
      const snapshot = snapshotFromData(data, dateKey);
      writeHistorySnapshot(snapshot);
      if (dateKey === formatDateKey(new Date())) saveTodaySnapshot(snapshot);
      data.snapshotUpdatedAt = snapshot.savedAt;
    }
    return data;
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function getTodaySummary(options = {}) {
  if (options.force) {
    const fresh = await getAttendanceSummary(new Date());
    if (fresh.ok) return fresh;
    const cached = loadCachedTodaySummary();
    return cached.ok ? { ...cached, refreshError: fresh.error } : fresh;
  }
  const fresh = await getAttendanceSummary(new Date());
  if (fresh.ok) return fresh;
  const cached = loadCachedTodaySummary();
  return cached.ok ? { ...cached, refreshError: fresh.error } : fresh;
}

export async function isChinaWorkday(date) {
  const dateKey = formatDateKey(date);
  const cached = readHolidayDay(dateKey);
  if (cached && Date.now() - cached.savedAt < CONFIG.HOLIDAY_CACHE_HOURS * 3600000) {
    return !!cached.isWorkday;
  }
  try {
    const response = await fetch(new Request(
      CONFIG.HOLIDAY_API_BASE + "/info/" + encodeURIComponent(dateKey),
      { method: "GET", timeout: 8, debugLabel: "查询中国节假日" }
    ));
    const json = await response.json();
    if (!json || json.code !== 0 || !json.type) throw new Error("节假日接口返回异常");
    const type = Number(json.type.type);
    const value = {
      date: dateKey,
      isWorkday: type === 0 || type === 3,
      type,
      name: json.type.name || "",
      savedAt: Date.now()
    };
    writeHolidayDay(dateKey, value);
    return value.isWorkday;
  } catch (_) {
    return CONFIG.HOLIDAY_FALLBACK_TO_WEEKDAY ? isNormalWeekday(date) : false;
  }
}

export async function loadYearHolidays(year) {
  const cached = readHolidayYear(year);
  if (cached && Date.now() - cached.savedAt < CONFIG.HOLIDAY_CACHE_HOURS * 3600000) {
    return cached.holidays || {};
  }
  try {
    const response = await fetch(new Request(
      CONFIG.HOLIDAY_API_BASE + "/year/" + year,
      { method: "GET", timeout: 8, debugLabel: "查询年度节假日" }
    ));
    const json = await response.json();
    if (json && json.code === 0 && json.holiday && typeof json.holiday === "object") {
      writeHolidayYear(year, { savedAt: Date.now(), holidays: json.holiday });
      return json.holiday;
    }
  } catch (_) {}
  return cached?.holidays || {};
}

function holidayForDate(date, holidays) {
  const key = formatDateKey(date);
  const monthDay = key.slice(5);
  if (holidays && holidays[monthDay]) return holidays[monthDay];
  return readHolidayDay(key);
}

export function getCachedHistoryDay(date, holidays = {}) {
  const key = formatDateKey(date);
  const record = readHistorySnapshot(key);
  return buildAttendanceHistoryDay(date, record, readReview(key), holidayForDate(date, holidays), new Date(), isMissedCheckoutConfirmed(key));
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function averageClock(days, field) {
  const minutes = average(days.map(day => {
    const date = day[field];
    return date instanceof Date ? date.getHours() * 60 + date.getMinutes() : null;
  }).filter(Number.isFinite));
  if (minutes == null) return "—";
  const rounded = Math.round(minutes) % 1440;
  return String(Math.floor(rounded / 60)).padStart(2, "0") + ":" +
    String(rounded % 60).padStart(2, "0");
}

export function summarizeMonth(days) {
  const workdays = days.filter(day => day && day.workday);
  const valid = workdays.filter(day => day.workedMs !== null);
  const avgMs = average(valid.map(day => day.workedMs));
  return {
    workdays: workdays.length,
    normal: workdays.filter(day => day.state === "normal").length,
    warnings: workdays.filter(day => day.state === "warning").length,
    pending: workdays.filter(day => day.state === "pending" || day.state === "neutral").length,
    averageIn: averageClock(workdays, "clockInAt"),
    averageOut: averageClock(workdays, "clockOutAt"),
    averageWorked: avgMs == null ? "—" : formatShortDuration(avgMs)
  };
}

export async function getAttendanceMonth(monthDate = new Date(), options = {}) {
  const month = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const now = new Date();
  const todayKey = formatDateKey(now);
  const holidays = options.offline
    ? (readHolidayYear(month.getFullYear())?.holidays || {})
    : await loadYearHolidays(month.getFullYear());
  const weeks = monthWeeks(month);
  const dates = weeks.flat().filter(Boolean);
  const checked = new Map();

  if (options.sync !== false && (getAccount().configured)) {
    for (const date of dates) {
      const key = formatDateKey(date);
      if (key > todayKey) continue;
      const record = readHistorySnapshot(key);
      const holiday = holidayForDate(date, holidays);
      const workday = holiday?.holiday === true || holiday?.type === 2
        ? false
        : holiday?.holiday === false || holiday?.type === 3
          ? true
          : typeof holiday?.isWorkday === "boolean"
            ? holiday.isWorkday : isNormalWeekday(date);
      if (!workday || record) continue;
      const result = await getAttendanceSummary(date);
      checked.set(key, result.ok ? readHistorySnapshot(key) : null);
    }
  }

  const days = dates.map(date => {
    const key = formatDateKey(date);
    if (key > todayKey) return { key, future: true, status: "未到该日期", workday: false, state: "future" };
    const record = checked.has(key) ? checked.get(key) : readHistorySnapshot(key);
    const day = buildAttendanceHistoryDay(date, record, readReview(key), holidayForDate(date, holidays), now, isMissedCheckoutConfirmed(key));
    return { ...day, ...(checked.has(key) && !record && !day.review ? { state: "warning", status: "查询失败 · 待核对" } : {}), reviewed: !!day.review, decision: day.review?.decision || "auto" };
  });

  const byKey = Object.fromEntries(days.map(day => [day.key, day]));
  const weekModels = weeks.map(week => week.map(date => date ? byKey[formatDateKey(date)] : null));
  const workdays = days.filter(day => day.workday);
  const stats = summarizeMonth(days);
  return {
    month,
    monthKey: formatDateKey(month).slice(0, 7),
    monthLabel: month.getFullYear() + " 年 " + (month.getMonth() + 1) + " 月",
    weeks: weekModels,
    days,
    stats,
    todayKey,
    currentMonthKey: todayKey.slice(0, 7),
    canNext: month.getTime() < new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    canPrev: month.getFullYear() > 2000,
    workdays
  };
}

export function saveAttendanceReview(dateKey, decision, leaveHours = 0) {
  const value = {
    decision: ["normal", "abnormal", "auto"].includes(decision) ? decision : "auto",
    confirmed: decision === "normal",
    leaveHours: Math.max(0, Math.min(CONFIG.TARGET_HOURS, Number(leaveHours) || 0)),
    updatedAt: new Date().toISOString()
  };
  if (value.decision === "auto" && value.leaveHours === 0) {
    writeReview(dateKey, null);
    return null;
  }
  writeReview(dateKey, value);
  return value;
}

export function resetAttendanceReview(dateKey) {
  _writeReview(dateKey, null);
}

export function getRecentAttendanceDays(count = 7) {
  const today = new Date();
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const key = formatDateKey(date);
    const yearHolidays = readHolidayYear(date.getFullYear())?.holidays || {};
    const holiday = yearHolidays[key.slice(5)] || readHolidayDay(key);
    const record = readHistorySnapshot(key);
    days.push(buildAttendanceHistoryDay(date, record, readReview(key), holiday, today, isMissedCheckoutConfirmed(key)));
  }
  return days;
}

export function debugSummary(data) {
  if (!data?.ok) return data?.error || "暂无考勤数据";
  return [
    "姓名：" + (data.personName || "--"),
    "组织：" + (data.orgName || "--"),
    "班次：" + (data.shiftName || "--"),
    "日期：" + data.date,
    "",
    "上班卡：" + (data.hasClockIn ? formatTime(data.inTime) : "未打卡") + " " + (data.inStatusDesc || ""),
    "原始离场卡：" + (data.outSwipeTime ? formatTime(data.outSwipeTime) : "未打"),
    "有效下班卡：" + (data.hasOutRecord ? formatTime(data.latestOutTime) : "未打"),
    "当前工时：" + (data.hasOutRecord ? formatShortDuration(data.currentWorkMs) : "--"),
    "可下班：" + (data.targetTime ? formatTime(data.targetTime) : "--"),
    "是否达标：" + (data.targetReached ? "是" : "否"),
    "剩余：" + (data.targetReached ? "已达标" : formatRemainText(data.remainingMinutes))
  ].join("\n");
}
