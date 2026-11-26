import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceDisplayProgress,
  buildAttendanceHistoryDay,
  formatRemainText,
  normalizeAttendanceData,
  resolveAttendanceCheckout
} from "../core/rules.js";

test("today ignores a door-exit swipe before the 9-hour target", () => {
  const now = new Date(2026, 10, 25, 12, 0, 0);
  const data = normalizeAttendanceData({
    data: {
      date: "2026-11-25",
      clockInTime: "09:30:00",
      clockOffTime: "11:41:00"
    }
  }, "2026-11-25", now);

  assert.equal(data.hasClockIn, true);
  assert.equal(data.hasOutRecord, false);
  assert.equal(data.targetTime.getHours(), 18);
  assert.equal(data.targetTime.getMinutes(), 30);
  assert.equal(data.remainingMinutes, 390);
});

test("today accepts an exit swipe at or after the target time", () => {
  const now = new Date(2026, 10, 25, 18, 40, 0);
  const data = normalizeAttendanceData({
    date: "2026-11-25",
    clockInTime: "09:30:00",
    clockOffTime: "18:31:00"
  }, "2026-11-25", now);

  assert.equal(data.hasOutRecord, true);
  assert.equal(data.targetReached, true);
  assert.equal(data.currentWorkMs, 9 * 3600000 + 60000);
});

test("historical days use the actual exit swipe even when it is before nine hours", () => {
  const now = new Date(2026, 10, 26, 9, 0, 0);
  const inTime = new Date(2026, 10, 25, 9, 30, 0);
  const outTime = new Date(2026, 10, 25, 13, 54, 0);
  assert.equal(resolveAttendanceCheckout(inTime, outTime, false, now), outTime);
});

test("offClocked false prevents a planned or placeholder time from becoming an exit swipe", () => {
  const now = new Date(2026, 10, 25, 19, 0, 0);
  const data = normalizeAttendanceData({
    date: "2026-11-25",
    clockInTime: "09:30:00",
    clockOffTime: "18:31:00",
    dailyDetail: { shiftDetails: [{ offClocked: false }] }
  }, "2026-11-25", now);

  assert.equal(data.hasOutRecord, false);
});

test("manual normal review only changes the local history classification", () => {
  const date = new Date(2026, 10, 2, 12, 0, 0);
  const record = {
    inTime: new Date(2026, 10, 2, 9, 30, 0).toISOString(),
    outSwipeTime: new Date(2026, 10, 2, 15, 30, 0).toISOString()
  };
  const day = buildAttendanceHistoryDay(date, record, {
    decision: "normal",
    confirmed: true,
    leaveHours: 3
  }, null, new Date(2026, 10, 26, 9, 0, 0));

  assert.equal(day.originalStatus, "工时差 3小时");
  assert.equal(day.status, "请假已核实 · 正常");
  assert.equal(day.state, "normal");
  assert.equal(day.leaveHours, 3);
});

test("remaining duration uses the compact Chinese hour/minute format", () => {
  assert.equal(formatRemainText(80), "1小时20分钟");
  assert.equal(formatRemainText(60), "1小时");
  assert.equal(formatRemainText(25), "25分钟");
});

test("time-driven work progress uses one interval and stops at checkout", () => {
  const start = new Date(2026, 10, 26, 8), h = 3600000;
  const target = new Date(+start + 9*h);
  const data = {ok:true, hasClockIn:true, hasOutRecord:false, inTime:start, targetTime:target};
  assert.equal(attendanceDisplayProgress(data, +start).timer, true);
  assert.equal(attendanceDisplayProgress(data, +start+4.5*h).ratio, 0.5);
  assert.equal(attendanceDisplayProgress(data, +target).ratio, 1);
  assert.equal(attendanceDisplayProgress(data, +target).timer, false);
  assert.equal(attendanceDisplayProgress(data, +target+h).elapsedMs, 10*h);
  const settled = {...data, hasOutRecord:true, latestOutTime:new Date(+target+12*60000)};
  assert.equal(attendanceDisplayProgress(settled, +target+h).elapsedMs, 9*h+12*60000);
  assert.equal(attendanceDisplayProgress(settled, +target+h).running, false);
  assert.equal(attendanceDisplayProgress({...settled,latestOutTime:new Date(+start+8*h)}, +target+h).ratio, 8/9);
  assert.equal(attendanceDisplayProgress({...data,ok:false},+target).timer,false);
  assert.equal(attendanceDisplayProgress({...data,isRestDay:true},+target).timer,false);
  assert.equal(attendanceDisplayProgress(data,+start-1).timer,false);
  assert.equal(attendanceDisplayProgress({...data,targetTime:start},+target).timer,false);
});
