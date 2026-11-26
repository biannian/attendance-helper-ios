import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../core/reminders.js",import.meta.url),"utf8").replace(/^import[^\n]*\n/gm,"").replace(/export async function/g,"async function");
function setup({minutes=12,due=true,offset=120,workday=true,clockIn=true,clockOut=false}={}){
 const events=[], cache=new Map(), target=new Date(Date.now()+offset*60000);
 const data={ok:true,hasClockIn:clockIn,hasOutRecord:clockOut,inTime:new Date(target-9*3600000),targetTime:target};
 const actions=new Function("Notification","Storage","TimeIntervalNotificationTrigger","getPreferences","getTodaySummary","isChinaWorkday","formatDateKey","formatRemainTitle","formatTime",source+"\nreturn {handleScheduleNineHours,handleNearNineHours,handleLeaveCompany};")(
 {schedule:async e=>{events.push(e);return true},removePendings:async()=>{}},
 {get:k=>cache.get(k),set:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)},
 class {constructor(v){Object.assign(this,v)}},()=>({remindMinutes:minutes,checkoutReminderEnabled:due}),async()=>data,async()=>workday,()=> "test-day",n=>"remain "+n,()=> "time");
 return {events,actions};
}
test("early exit schedules only future notifications",async()=>{const {events,actions}=setup();await actions.handleLeaveCompany();assert.equal(events.length,2);assert.ok(events.every(e=>e.trigger.timeInterval>60));});
test("repeat refresh does not duplicate reminders",async()=>{const {events,actions}=setup();await actions.handleScheduleNineHours();await actions.handleNearNineHours();assert.equal(events.length,2);});
test("custom lead time is honored",async()=>{const {events,actions}=setup({minutes:17,offset:60});await actions.handleScheduleNineHours();assert.ok(Math.abs(events[0].trigger.timeInterval-43*60)<=2);});
test("both switches off suppress all notifications",async()=>{const {events,actions}=setup({minutes:0,due:false});await actions.handleLeaveCompany();assert.equal(events.length,0);});
test("no punch or completed checkout is silent",async()=>{for(const opt of [{clockIn:false},{clockOut:true}]){const {events,actions}=setup(opt);await actions.handleLeaveCompany();assert.equal(events.length,0);}});
test("overdue alert is deduplicated",async()=>{const {events,actions}=setup({offset:-5});await actions.handleNearNineHours();await actions.handleLeaveCompany();assert.equal(events.length,1);assert.equal(events[0].trigger.timeInterval,1);});
