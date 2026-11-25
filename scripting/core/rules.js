import { CONFIG } from "./config.js";

export function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function formatTime(date) {
  if (!date || !Number.isFinite(date.getTime())) return "--";
  return String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

export function formatShortDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0h0m";
  const total = Math.floor(ms / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours + "h" + minutes + "m";
}

export function formatRemainText(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours <= 0) return mins + "分钟";
  if (mins <= 0) return hours + "小时";
  return hours + "小时" + mins + "分钟";
}

export function formatRemainTitle(minutes) {
  return "还差 " + formatRemainText(minutes);
}

export function isNormalWeekday(date) {
  return date.getDay() >= 1 && date.getDay() <= 5;
}

export function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  let date = String(dateValue).trim().replace(/\//g, "-");
  date = date.split("T")[0].split(" ")[0];
  let time = String(timeValue).trim();
  if (/^\d{1,2}:\d{2}$/.test(time)) time += ":00";
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(time)) {
    const p = time.split(":");
    time = p[0].padStart(2, "0") + ":" + p[1].padStart(2, "0") + ":" + p[2].padStart(2, "0");
  }
  const result = new Date(date + "T" + time);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function parseAnyDateTime(value, dateHint) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^\d{13}$/.test(text)) return new Date(Number(text));
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
    return parseDateTime(dateHint || formatDateKey(new Date()), text);
  }
  const normalized = text.replace(" ", "T");
  const result = new Date(normalized);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function unwrapPayload(raw) {
  if (!raw) return raw;
  let value = raw;
  for (const candidate of [raw.data, raw.result, raw.content, raw.response, raw.body]) {
    if (candidate) { value = candidate; break; }
  }
  if (Array.isArray(value)) return value[0] || null;
  for (const key of ["records", "list", "rows"]) {
    if (value && Array.isArray(value[key])) return value[key][0] || value;
  }
  return value;
}

export function deepPick(root, keys) {
  if (!root || typeof root !== "object") return undefined;
  const wanted = keys.map(key => String(key).toLowerCase());
  const visited = new Set();
  function walk(value, depth) {
    if (!value || typeof value !== "object" || depth > 6 || visited.has(value)) return undefined;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = walk(item, depth + 1);
        if (found !== undefined && found !== null && found !== "") return found;
      }
      return undefined;
    }
    for (const name of Object.keys(value)) {
      if (wanted.includes(name.toLowerCase())) {
        const found = value[name];
        if (found !== undefined && found !== null && found !== "") return found;
      }
    }
    for (const name of Object.keys(value)) {
      const child = value[name];
      if (child && typeof child === "object") {
        const found = walk(child, depth + 1);
        if (found !== undefined && found !== null && found !== "") return found;
      }
    }
    return undefined;
  }
  return walk(root, 0);
}

export function resolveAttendanceCheckout(inTime, outTime, isToday, now = new Date()) {
  if (!inTime || !outTime) return null;
  if (!isToday) return outTime;
  const target = inTime.getTime() + CONFIG.TARGET_HOURS * 3600000;
  return outTime.getTime() >= target && outTime.getTime() <= now.getTime()
    ? outTime : null;
}

export function normalizeAttendanceData(raw, dateHint = formatDateKey(new Date()), now = new Date()) {
  const payload = unwrapPayload(raw);
  const root = payload || raw || {};
  const personName = deepPick(root, ["personName", "userName", "employeeName", "name", "realName"]) || "";
  const orgName = deepPick(root, ["orgName", "deptName", "departmentName", "organizationName"]) || "";
  const shiftName = deepPick(root, ["shiftName", "className", "workShiftName"]) || "";
  const dateValue = deepPick(root, ["date", "workDate", "attendanceDate", "recordDate", "day", "statisticsDate"]) || dateHint;
  const date = String(dateValue).replace(/\//g, "-").slice(0, 10);
  const inRaw = deepPick(root, ["clockInTime", "inTime", "onClockTime", "onTime", "startTime", "checkInTime", "signInTime"]);
  const shift = (root.dailyDetail || root).shiftDetails?.[0];
  const offClocked = shift?.offClocked;
  const outRaw = [false, 0, "0"].includes(offClocked) ? null :
    deepPick(root, ["clockOffTime", "clockOutTime", "outTime", "offTime", "latestOutTime", "lastOutTime", "checkOutTime", "signOutTime"]);
  const inStatusDesc = deepPick(root, ["inStatusDesc", "clockInStatusDesc", "onClockStatusDesc", "inStatus", "clockInStatusName", "signInStatusDesc"]) || "";
  const outSwipeStatus = deepPick(root, ["outStatusDesc", "clockOffStatusDesc", "clockOutStatusDesc", "offStatusDesc", "outStatus", "clockOutStatusName", "signOutStatusDesc"]) || "";
  const inTime = parseAnyDateTime(inRaw, date);
  const outSwipeTime = parseAnyDateTime(outRaw, date);
  const isToday = date === formatDateKey(now);
  const latestOutTime = resolveAttendanceCheckout(inTime, outSwipeTime, isToday, now);
  const outStatusDesc = isToday && inTime && !latestOutTime ? "" : outSwipeStatus;
  const hasClockIn = !!inTime;
  const hasOutRecord = !!latestOutTime;
  const targetMs = CONFIG.TARGET_HOURS * 3600000;
  let currentWorkMs = 0;
  let latestOutWorkMs = 0;
  let targetTime = null;
  let remainingMs = 0;

  if (hasClockIn) {
    targetTime = new Date(inTime.getTime() + targetMs);
    if (hasOutRecord) {
      latestOutWorkMs = Math.max(0, latestOutTime.getTime() - inTime.getTime());
      currentWorkMs = latestOutWorkMs;
      if (currentWorkMs < targetMs) remainingMs = targetMs - currentWorkMs;
    } else if (now.getTime() < targetTime.getTime()) {
      remainingMs = targetTime.getTime() - now.getTime();
    }
  }

  const targetReached = hasClockIn && remainingMs <= 0 && (
    hasOutRecord ? currentWorkMs >= targetMs : !!(targetTime && now.getTime() >= targetTime.getTime())
  );
  const remainingMinutes = remainingMs > 0 ? Math.ceil(remainingMs / 60000) : 0;
  const countdownText = !hasClockIn ? "--" : remainingMs > 0 ? formatRemainText(remainingMinutes) : hasOutRecord ? "考勤正常" : "未打下班卡";

  return {
    ok: true, raw, personName, orgName, shiftName, date,
    hasClockIn, hasOutRecord, inTime, latestOutTime, outSwipeTime, outSwipeStatus,
    inStatusDesc, outStatusDesc, currentWorkMs, latestOutWorkMs,
    targetTime, targetReached, remainingMinutes, countdownText,
    workedText: hasOutRecord ? formatShortDuration(currentWorkMs) : "--"
  };
}

export function monthWeeks(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const weeks = [];
  for (let start = 1 - offset; start <= count; start += 7) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const day = start + i;
      return day >= 1 && day <= count ? new Date(month.getFullYear(), month.getMonth(), day) : null;
    }));
  }
  return weeks;
}

export function buildAttendanceHistoryDay(date, record, review, holiday, now = new Date(), confirmedMissed = false) {
  const key = formatDateKey(date);
  const today = key === formatDateKey(now);
  const holidayFlag = holiday?.holiday;
  const cachedType = holiday?.type;
  let kind = "work";
  let label = "工作日";
  let workday = true;

  if (holidayFlag === true || cachedType === 2) {
    kind = "holiday"; label = holiday?.name || "节假日"; workday = false;
  } else if (holidayFlag === false || cachedType === 3) {
    kind = "makeup"; label = "调休补班"; workday = true;
  } else if (typeof holiday?.isWorkday === "boolean") {
    workday = holiday.isWorkday;
    kind = workday ? "work" : "weekend";
    label = workday ? "工作日" : "休息日";
  } else {
    workday = isNormalWeekday(date);
    kind = workday ? "work" : "weekend";
    label = workday ? "工作日" : "休息日";
  }

  const clockIn = record?.inTime ? new Date(record.inTime) : null;
  const rawOut = record?.outSwipeTime || record?.latestOutTime || null;
  const outSwipe = rawOut ? new Date(rawOut) : null;
  const clockOut = resolveAttendanceCheckout(clockIn, outSwipe, today, now);
  let workedMs = clockIn && clockOut ? Math.max(0, clockOut.getTime() - clockIn.getTime()) : null;
  const leaveHours = Math.max(0, Math.min(CONFIG.TARGET_HOURS, Number(review?.leaveHours) || 0));
  const requiredMs = Math.round((CONFIG.TARGET_HOURS - leaveHours) * 3600000);
  let status = label;
  let state = "neutral";

  if (workday) {
    if (!record) {
      status = "等待补查"; state = "pending";
    } else if (!clockIn) {
      status = today ? "待打上班卡" : "上班卡待核对"; state = today ? "neutral" : "warning";
    } else if (!clockOut) {
      status = today ? "进行中" : "下班卡待核对"; state = today ? "active" : "warning";
    } else {
      const deficit = Math.ceil((CONFIG.TARGET_HOURS * 3600000 - workedMs) / 60000);
      status = deficit > 0 ? "工时差 " + formatRemainText(deficit) : "正常";
      state = deficit > 0 ? "warning" : "normal";
    }
  }

  const originalStatus = status;
  if (leaveHours > 0 && workedMs === null && clockIn && outSwipe &&
      outSwipe <= now && outSwipe.getTime() - clockIn.getTime() >= requiredMs) {
    workedMs = outSwipe.getTime() - clockIn.getTime();
  }

  if (review?.decision === "abnormal") {
    status = "已确认异常"; state = "warning";
  } else if (review?.decision === "normal" || review?.confirmed) {
    status = leaveHours > 0 ? "请假已核实 · 正常" : "已确认正常"; state = "normal";
  } else if (leaveHours > 0 && (requiredMs === 0 || (workedMs !== null && workedMs >= requiredMs))) {
    status = "请假后达标"; state = "normal";
  } else if (leaveHours > 0 && workedMs !== null) {
    status = "扣除请假仍差 " + formatRemainText(Math.ceil((requiredMs - workedMs) / 60000));
    state = "warning";
  }

  const checkoutMissing = !!(workday && clockIn && requiredMs > 0 && !clockOut && workedMs === null && (!today || now.getTime() >= clockIn.getTime() + requiredMs));
  const missedConfirmed = checkoutMissing && confirmedMissed;
  if (checkoutMissing && (today || missedConfirmed)) { status = missedConfirmed ? "已漏卡 · 待补卡" : "未打下班卡"; state = "warning"; }
  return {
    key, kind, label, workday, status, state, workedMs, checkoutMissing, missedConfirmed,
    clockInAt: clockIn,
    clockOutAt: clockOut || (workedMs !== null ? outSwipe : null),
    originalStatus, review: review || null, leaveHours, requiredMs,
    outSwipe: outSwipe ? formatTime(outSwipe) : "—",
    weekday: (date.getDay() + 6) % 7,
    clockIn: clockIn ? formatTime(clockIn) : "—",
    clockOut: (clockOut || (workedMs !== null ? outSwipe : null))
      ? formatTime(clockOut || outSwipe) : "—",
    worked: workedMs === null ? "—" : formatShortDuration(workedMs)
  };
}

export function missingCheckout(data, now = new Date()) {
  return !!(data?.ok && data.hasClockIn && !data.hasOutRecord && (data.targetReached || (data.targetTime && now.getTime() >= data.targetTime.getTime())));
}
export function checkoutWarningTitle(data) { return data?.missedConfirmed ? "已漏卡·待补卡" : "未打下班卡"; }
