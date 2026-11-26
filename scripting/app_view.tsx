import {
  Button,
  TimerIntervalLabel,
  Divider,
  HStack,
  NavigationStack,
  ProgressView,
  ScrollView,
  SecureField,
  Spacer,
  Text,
  TextField,
  VStack,
  Widget,
  useEffect,
  useState
} from "scripting";
import { CONFIG, WIDGET_STYLES, THEMES } from "./core/config";
import {
  getAttendanceMonth,
  getTodaySummary,
  saveAttendanceReview,
  resetAttendanceReview,
  debugSummary,
  isChinaWorkday
} from "./core/attendance";
import { formatDateKey, formatShortDuration, formatTime, missingCheckout, checkoutWarningTitle } from "./core/rules";
import {
  getAccount,
  getPreferences,
  saveAccount,
  savePreferences,
  setMissedCheckoutConfirmed
} from "./core/store";
import {
  handleLeaveCompany,
  handleNearNineHours,
  handleScheduleNineHours,
  cancelUpcomingReminder
} from "./core/reminders";
import { syncAttendanceLiveActivity, endSavedActivity } from "./core/live_activity_service";

const PALETTES = {
  navy: {
    bg: "#0B1728", card: "#14263D", surface: "#1B314C", ink: "#F3F7FD",
    muted: "#9FB2CA", accent: "#82BCFF", normal: "#65D5AC", warning: "#F2B66D",
    danger: "#FF8179", line: "#2A415D"
  },
  teal: {
    bg: "#0B2425", card: "#143536", surface: "#1B4443", ink: "#F0FFFA",
    muted: "#A2C6BE", accent: "#75DCCB", normal: "#69D7B0", warning: "#F1B66D",
    danger: "#FF8A80", line: "#2B5652"
  },
  slate: {
    bg: "#191C26", card: "#252A36", surface: "#303746", ink: "#F5F6FA",
    muted: "#B4BAC8", accent: "#B7C6E8", normal: "#78D4B5", warning: "#EAC07C",
    danger: "#FF958D", line: "#41495A"
  }
};

const STYLE_LABELS = {
  cyber: "赛博控制台",
  fitness: "运动环形",
  minimal: "极简账本",
  heatmap: "月历热力图"
};
const STYLE_SHORT = { cyber: "赛博", fitness: "运动", minimal: "极简", heatmap: "热力" };
const THEME_LABELS = { navy: "深海蓝", teal: "松石绿", slate: "岩灰" };

function Card({ children, palette, compact = false, tone = "normal" }) {
  const colors = palette || PALETTES.navy;
  return <VStack
    spacing={compact ? 8 : 11}
    padding={compact ? 12 : 15}
    background={tone === "hero"
      ? {
          gradient: [
            { color: colors.surface, location: 0 },
            { color: colors.card, location: 1 }
          ],
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 1, y: 1 }
        }
      : colors.card}
    clipShape={{ type: "rect", cornerRadius: 17 }}
    alignment="leading"
    frame={{ maxWidth: "infinity" }}
  >
    {children}
  </VStack>;
}

function SectionTitle({ title, subtitle, palette }) {
  return <VStack spacing={2} alignment="leading">
    <Text font="headline" foregroundStyle={palette?.ink || "primaryLabel"}>{title}</Text>
    {subtitle ? <Text font="caption" foregroundStyle={palette?.muted || "secondaryLabel"}>{subtitle}</Text> : null}
  </VStack>;
}

function StatusBadge({ text, color, palette }) {
  return <VStack
    padding={6}
    background={palette?.surface || "#303746"}
    clipShape={{ type: "rect", cornerRadius: 8 }}
  >
    <Text font="caption2" foregroundStyle={color}>{text}</Text>
  </VStack>;
}

function MetricCell({ label, value, palette, color }) {
  return <VStack
    spacing={4}
    padding={9}
    background={palette.surface}
    clipShape={{ type: "rect", cornerRadius: 11 }}
    frame={{ maxWidth: "infinity" }}
    alignment="leading"
  >
    <Text font="caption2" foregroundStyle={palette.muted}>{label}</Text>
    <Text font="headline" foregroundStyle={color || palette.ink}>{value}</Text>
  </VStack>;
}

function TodayTab({ data, palette, loading, onRefresh, statusMessage, isWorkday, onConfirmMissed }) {
  if (!isWorkday) {
    return <VStack spacing={10} alignment="leading">
      <Card palette={palette} tone="hero">
        <Text font="caption" foregroundStyle={palette.muted}>{formatDateKey(new Date())} · 今日</Text>
        <Text font="largeTitle" foregroundStyle={palette.ink}>今天休息</Text>
        <Text font="caption" foregroundStyle={palette.muted}>调休补班日会自动恢复考勤</Text>
        <Button title="刷新" buttonStyle="bordered" action={onRefresh} disabled={loading} />
      </Card>
    </VStack>;
  }

  const progress = !data?.hasClockIn ? 0 : Math.max(0, Math.min(1,
    (data.hasOutRecord ? data.currentWorkMs : Date.now() - data.inTime.getTime()) /
    (CONFIG.TARGET_HOURS * 3600000)
  ));
  const elapsed = data?.hasClockIn
    ? formatShortDuration(data.hasOutRecord ? data.currentWorkMs : Date.now() - data.inTime.getTime())
    : "--";
  const status = !data?.ok ? "等待同步" :
    !data.hasClockIn ? "等待上班卡" :
    data.hasOutRecord ? (data.targetReached ? "考勤正常" : "工时不足") :
    missingCheckout(data) ? checkoutWarningTitle(data) : "正在工作";
  const statusColor = missingCheckout(data) || (data?.hasOutRecord && !data.targetReached)
    ? palette.danger
    : data?.hasOutRecord && data.targetReached ? palette.normal : palette.accent;
  const reminderMinutes = getPreferences().remindMinutes;

  return <VStack spacing={10} alignment="leading">
    <Card palette={palette} tone="hero">
      <HStack>
        <VStack spacing={2} alignment="leading">
          <Text font="caption" foregroundStyle={palette.muted}>{formatDateKey(new Date())} · 今日考勤</Text>
          <Text font="largeTitle" foregroundStyle={missingCheckout(data) ? palette.danger : palette.ink}>{elapsed}</Text>
          <Text font="caption" foregroundStyle={palette.accent}>累计工时 / 目标 {CONFIG.TARGET_HOURS} 小时</Text>
        </VStack>
        <Spacer />
        <VStack spacing={6} alignment="trailing">
          <StatusBadge text={status} color={statusColor} palette={palette} />
          <Button title={loading ? "同步中…" : "刷新"} buttonStyle="bordered" action={onRefresh} disabled={loading} />
        </VStack>
      </HStack>

      <ProgressView value={progress} total={1} tint={missingCheckout(data) ? palette.danger : palette.accent} />

      {data?.hasClockIn && !data.hasOutRecord && data.targetTime
        ? <VStack spacing={4} alignment="leading">
            <Text font="caption" foregroundStyle={palette.muted}>距离可下班</Text>
            {missingCheckout(data)
              ? <VStack spacing={6} alignment="leading">
                  <Text font="title2" foregroundStyle={palette.danger}>{data.missedConfirmed ? "已确认漏卡，请申请补卡" : "工时已满，请检查下班卡"}</Text>
                  <Button title={data.missedConfirmed ? "撤销漏卡确认" : "确认漏卡"} buttonStyle="bordered" action={onConfirmMissed} />
                </VStack>
              : <TimerIntervalLabel from={data.inTime.getTime()} to={data.targetTime.getTime()} countsDown={true} showsHours={true} foregroundStyle={palette.ink} />}
          </VStack>
        : null}

      <Divider />
      <HStack spacing={7}>
        <MetricCell label="上班卡" value={data?.hasClockIn ? formatTime(data.inTime) : "--"} palette={palette} />
        <MetricCell label="预计下班" value={data?.targetTime ? formatTime(data.targetTime) : "--"} palette={palette} />
        <MetricCell label="下班卡" value={data?.hasOutRecord ? formatTime(data.latestOutTime) : "未打"} palette={palette} color={missingCheckout(data) ? palette.danger : palette.ink} />
      </HStack>

      {data?.refreshError
        ? <Text font="caption2" foregroundStyle={palette.warning}>同步失败，显示本机记录：{data.refreshError}</Text>
        : null}
      {!data?.ok ? <Text font="caption" foregroundStyle={palette.danger}>{data?.error || "暂无考勤数据"}</Text> : null}
    </Card>

    <Card palette={palette} compact>
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="headline" foregroundStyle={palette.ink}>提前提醒</Text>
          <Text font="caption" foregroundStyle={palette.muted}>{reminderMinutes ? "提前 " + reminderMinutes + " 分钟" : "未开启"}</Text>
        </VStack>
        <Spacer />
        <Button title="重新安排" buttonStyle="bordered" action={async () => {
          const result = await handleScheduleNineHours();
          console.log(result.message || result.error);
        }} />
      </HStack>
      {statusMessage ? <Text font="caption2" foregroundStyle={palette.muted}>{statusMessage}</Text> : null}
    </Card>
  </VStack>;
}

function dayMarker(day) {
  if (day.future) return "";
  if (!day.workday) return "休";
  if (day.state === "normal") return "✓";
  if (day.state === "warning") return "!";
  if (day.state === "abnormal") return "×";
  if (day.state === "active") return "●";
  if (day.future) return "";
  return "·";
}

function CalendarTab({ monthData, selectedDate, onSelect, onPrev, onNext, onSync, onReview, loading, leaveHours, onLeaveHours, palette }) {
  const selected = monthData?.days?.find(day => day.key === selectedDate);
  return <VStack spacing={10} alignment="leading">
    <Card palette={palette}>
      <HStack>
        <Button title="‹" buttonStyle="bordered" action={onPrev} disabled={!monthData?.canPrev} />
        <Spacer />
        <VStack spacing={2} alignment="center">
          <Text font="headline" foregroundStyle={palette.ink}>{monthData?.monthLabel || "考勤月历"}</Text>
          <Text font="caption2" foregroundStyle={palette.muted}>点选日期查看打卡</Text>
        </VStack>
        <Spacer />
        <Button title="›" buttonStyle="bordered" action={onNext} disabled={!monthData?.canNext} />
      </HStack>

      <HStack spacing={3}>
        {["一", "二", "三", "四", "五", "六", "日"].map(day => (
          <VStack frame={{ maxWidth: "infinity" }} alignment="center">
            <Text font="caption2" foregroundStyle={palette.muted}>{day}</Text>
          </VStack>
        ))}
      </HStack>

      {monthData?.weeks?.map(week => (
        <HStack spacing={3}>
          {week.map(day => day
            ? <Button
                title={String(Number(day.key.slice(-2))) + " " + dayMarker(day)}
                buttonStyle={day.key === selectedDate ? "borderedProminent" : "bordered"}
                frame={{ maxWidth: "infinity" }}
                action={() => onSelect(day.key)}
                disabled={!!day.future}
              />
            : <VStack frame={{ maxWidth: "infinity" }}><Text> </Text></VStack>
          )}
        </HStack>
      ))}

      <Divider />
      <HStack spacing={8}>
        <Text font="caption2" foregroundStyle={palette.normal}>● 正常 {monthData?.stats.normal ?? 0}</Text>
        <Spacer />
        <Text font="caption2" foregroundStyle={palette.warning}>● 待核 {monthData?.stats.warnings ?? 0}</Text>
        <Spacer />
        <Text font="caption2" foregroundStyle={palette.muted}>· 待查 {monthData?.stats.pending ?? 0}</Text>
      </HStack>
      <Button title={loading ? "同步中…" : "补查本月"} buttonStyle="bordered" action={onSync} disabled={loading} />
    </Card>

    {selected ? <Card palette={palette} compact>
      <HStack>
        <VStack spacing={2} alignment="leading">
          <Text font="headline" foregroundStyle={palette.ink}>{selected.key}</Text>
          <Text font="caption" foregroundStyle={palette.muted}>{selected.status}</Text>
        </VStack>
        <Spacer />
        <StatusBadge text={selected.status} color={selected.state === "normal" ? palette.normal : selected.state === "warning" ? palette.warning : selected.state === "abnormal" ? palette.danger : palette.accent} palette={palette} />
      </HStack>
      <HStack spacing={7}>
        <MetricCell label="上班" value={selected.clockIn} palette={palette} />
        <MetricCell label="下班" value={selected.clockOut} palette={palette} />
        <MetricCell label="工时" value={selected.worked} palette={palette} />
      </HStack>
      {selected.workday
        ? <VStack spacing={7} alignment="leading">
            <Text font="caption" foregroundStyle={palette.muted}>请假时长（小时）</Text>
            <TextField title="请假小时数" value={leaveHours} onChanged={onLeaveHours} keyboardType="decimalPad" />
            <Button title="按请假时长判断" buttonStyle="bordered" action={() => onReview("auto", selected)} />
            <HStack spacing={6}>
              <Button title="确认正常" buttonStyle="bordered" action={() => onReview("normal", selected)} />
              <Button title="确认异常" buttonStyle="bordered" action={() => onReview("abnormal", selected)} />
              <Button title="恢复原判" buttonStyle="bordered" action={() => onReview("reset", selected)} />
            </HStack>
          </VStack>
        : <Text font="caption2" foregroundStyle={palette.muted}>休息日</Text>}
    </Card> : null}

    {monthData?.stats
      ? <Card palette={palette} compact>
          <SectionTitle title="本月平均" palette={palette} />
          <HStack spacing={7}>
            <MetricCell label="上班" value={monthData.stats.averageIn} palette={palette} />
            <MetricCell label="下班" value={monthData.stats.averageOut} palette={palette} />
            <MetricCell label="工时" value={monthData.stats.averageWorked} palette={palette} />
          </HStack>
        </Card>
      : null}
  </VStack>;
}

function StyleChoiceRow({ label, settingKey, value, onPreference, palette }) {
  return <VStack spacing={6} alignment="leading">
    <HStack>
      <Text font="subheadline" foregroundStyle={palette.ink}>{label}</Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.accent}>{STYLE_LABELS[value]}</Text>
    </HStack>
    <HStack spacing={5}>
      {WIDGET_STYLES.map(style => (
        <Button
          title={STYLE_SHORT[style]}
          buttonStyle={value === style ? "borderedProminent" : "bordered"}
          frame={{ maxWidth: "infinity" }}
          action={() => onPreference(settingKey, style)}
        />
      ))}
    </HStack>
  </VStack>;
}

function SettingsTab({ preferences, account, onPreference, onSaveAccount, accountDraft, setAccountDraft, palette, onPreview }) {
  return <VStack spacing={10} alignment="leading">
    <Card palette={palette}>
      <SectionTitle title="主题配色" palette={palette} />
      <HStack spacing={6}>
        {THEMES.map(theme => (
          <Button
            title={THEME_LABELS[theme]}
            buttonStyle={preferences.theme === theme ? "borderedProminent" : "bordered"}
            frame={{ maxWidth: "infinity" }}
            action={() => onPreference("theme", theme)}
          />
        ))}
      </HStack>
    </Card>

    <Card palette={palette}>
      <SectionTitle title="小组件样式" subtitle="不同尺寸可分别设置" palette={palette} />
      <StyleChoiceRow label="小号" settingKey="widgetStyleSmall" value={preferences.widgetStyleSmall} onPreference={onPreference} palette={palette} />
      <Divider />
      <StyleChoiceRow label="中号" settingKey="widgetStyleMedium" value={preferences.widgetStyleMedium} onPreference={onPreference} palette={palette} />
      <Divider />
      <StyleChoiceRow label="大号" settingKey="widgetStyleLarge" value={preferences.widgetStyleLarge} onPreference={onPreference} palette={palette} />
      <HStack spacing={5}>
        <Button title="预览小号" buttonStyle="bordered" action={() => onPreview("systemSmall")} />
        <Button title="预览中号" buttonStyle="bordered" action={() => onPreview("systemMedium")} />
        <Button title="预览大号" buttonStyle="bordered" action={() => onPreview("systemLarge")} />
      </HStack>
    </Card>

    <Card palette={palette}>
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="headline" foregroundStyle={palette.ink}>提前下班提醒</Text>
          <Text font="caption" foregroundStyle={palette.muted}>达到目标工时前通知</Text>
        </VStack>
        <Spacer />
        <Text font="caption" foregroundStyle={palette.accent}>{preferences.remindMinutes ? "提前 " + preferences.remindMinutes + " 分钟" : "关闭"}</Text>
      </HStack>
      <HStack spacing={5}>
        {[0, 5, 15, 30, 45, 60].map(minutes => (
          <Button
            title={minutes === 0 ? "关" : minutes + "分"}
            buttonStyle={preferences.remindMinutes === minutes ? "borderedProminent" : "bordered"}
            frame={{ maxWidth: "infinity" }}
            action={() => onPreference("remindMinutes", minutes)}
          />
        ))}
      </HStack>
      <Divider />
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="headline" foregroundStyle={palette.ink}>灵动岛倒计时</Text>
          <Text font="caption" foregroundStyle={palette.muted}>锁屏持续显示可下班时间</Text>
        </VStack>
        <Spacer />
        <Button title={preferences.liveActivityEnabled ? "已开启" : "已关闭"} buttonStyle={preferences.liveActivityEnabled ? "borderedProminent" : "bordered"} action={() => onPreference("liveActivityEnabled", !preferences.liveActivityEnabled)} />
      </HStack>
    </Card>

    <Card palette={palette}>
      <SectionTitle title="企业账号" palette={palette} />
      <TextField title="账号 / 手机号" value={accountDraft.username} onChanged={value => setAccountDraft({ ...accountDraft, username: value })} />
      <SecureField title="密码" value={accountDraft.password} onChanged={value => setAccountDraft({ ...accountDraft, password: value })} />
      <TextField title="设备 ID" value={accountDraft.deviceId} onChanged={value => setAccountDraft({ ...accountDraft, deviceId: value })} />
      <Button title="安全保存" buttonStyle="borderedProminent" action={onSaveAccount} />
      <Text font="caption2" foregroundStyle={palette.muted}>
        {account.configured ? "已配置 · 更换账号会清除旧 Token 和今日快照" : "首次使用请填写完整账号资料"}
      </Text>
    </Card>
  </VStack>;
}

function ToolsTab({ onRun, onDebug, onPreview, palette }) {
  return <VStack spacing={10} alignment="leading">
    <Card palette={palette}>
      <SectionTitle title="快捷操作" palette={palette} />
      <HStack spacing={6}>
        <Button title="离开公司检查" buttonStyle="bordered" action={() => onRun("leave")} />
        <Button title="安排提醒" buttonStyle="bordered" action={() => onRun("schedule9")} />
      </HStack>
      <HStack spacing={6}>
        <Button title="检查 9 小时" buttonStyle="bordered" action={() => onRun("near9")} />
        <Button title="查看诊断" buttonStyle="bordered" action={onDebug} />
      </HStack>
    </Card>
    <Card palette={palette}>
      <SectionTitle title="小组件预览" palette={palette} />
      <HStack spacing={6}>
        <Button title="小号" buttonStyle="bordered" action={() => onPreview("systemSmall")} />
        <Button title="中号" buttonStyle="bordered" action={() => onPreview("systemMedium")} />
        <Button title="大号" buttonStyle="bordered" action={() => onPreview("systemLarge")} />
      </HStack>
    </Card>
    <Card palette={palette}>
      <SectionTitle title="快捷指令" palette={palette} />
      <Text font="caption" foregroundStyle={palette.muted}>刷新 · 离开检查 · 安排提醒 · 工时检查 · 诊断 · 管理</Text>
    </Card>
  </VStack>;
}

export function AppView({ initialTab = "today" }) {
  const [tab, setTab] = useState(initialTab === "today" && !getAccount().configured ? "settings" : initialTab);
  const [today, setToday] = useState(null);
  const [todayIsWorkday, setTodayIsWorkday] = useState(true);
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthData, setMonthData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [preferences, setPreferences] = useState(getPreferences());
  const initialAccount = getAccount();
  const [account, setAccount] = useState({
    username: initialAccount.username,
    deviceId: initialAccount.deviceId,
    configured: initialAccount.configured
  });
  const [accountDraft, setAccountDraft] = useState({
    username: account.username,
    password: "",
    deviceId: account.deviceId
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [leaveHours, setLeaveHours] = useState("0");
  const [debugText, setDebugText] = useState("");

  async function confirmMissed() {
    if (!missingCheckout(today)) return;
    const next = !today.missedConfirmed;
    setMissedCheckoutConfirmed(today.date, next);
    const updated = { ...today, missedConfirmed: next };
    setToday(updated);
    setMessage(next ? "已标记待补卡" : "已撤销漏卡确认");
    try { await syncAttendanceLiveActivity(updated); } catch (_) {}
    Widget.reloadAll();
    await loadMonth(monthDate);
  }

  async function refreshToday() {
    if (!getAccount().configured) { setMessage("请先配置账号"); return; }
    setLoading(true);
    try {
      const workday = await isChinaWorkday(new Date());
      setTodayIsWorkday(workday);
      const data = await getTodaySummary({ force: true });
      setToday(data);
      if (data.ok) {
        const live = await syncAttendanceLiveActivity(data);
        setMessage(live.message || "同步完成");
        if (workday && data.hasClockIn) await handleScheduleNineHours();
      } else {
        setMessage(data.error || "同步失败");
      }
      Widget.reloadAll();
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  async function loadMonth(date = monthDate) {
    if (!getAccount().configured) { setMessage("请先配置账号"); return; }
    setLoading(true);
    try {
      const result = await getAttendanceMonth(date, { sync: true });
      setMonthData(result);
      if (!result.days.some(day => day.key === selectedDate)) setSelectedDate(result.todayKey);
    } catch (error) {
      setMessage("月历加载失败：" + String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!account.configured) return;
    void (async () => { await refreshToday(); await loadMonth(new Date()); })();
  }, []);

  async function changePreference(key, value) {
    const previous = preferences;
    const next = savePreferences({ ...preferences, [key]: value });
    setPreferences(next);
    if (key === "remindMinutes" && next.remindMinutes !== previous.remindMinutes) {
      await cancelUpcomingReminder();
      Storage.remove("attendance-helper-schedule9-" + formatDateKey(new Date()));
      const result = await handleScheduleNineHours();
      setMessage(result.message || result.error || "提醒配置已更新");
    }
    if (key === "liveActivityEnabled" && !value) {
      await syncAttendanceLiveActivity({ ok: false });
    } else if (key === "liveActivityEnabled" && value && today?.ok) {
      await syncAttendanceLiveActivity(today);
    }
    Widget.reloadAll();
  }

  async function saveAccountAction() {
    try {
      if (loading) return;
      const old = getAccount();
      const candidate = {
        ...accountDraft,
        password: accountDraft.password || (accountDraft.username.trim() === old.username ? old.password : "")
      };
      if (!candidate.username.trim() || !candidate.password || !candidate.deviceId.trim()) {
        throw new Error("请填写完整账号资料");
      }
      if (candidate.username.trim() !== old.username || candidate.password !== old.password || candidate.deviceId.trim() !== old.deviceId) {
        await endSavedActivity("账号已切换");
        await cancelUpcomingReminder();
        setToday(null);
        setMonthData(null);
        setDebugText("");
      }
      const saved = saveAccount(candidate);
      setAccount({ username: saved.username, deviceId: saved.deviceId, configured: saved.configured });
      setAccountDraft({ ...accountDraft, password: "" });
      setMessage("账号已安全保存");
      await refreshToday();
    } catch (error) {
      setMessage(String(error?.message || error));
    }
  }

  async function runTool(action) {
    setLoading(true);
    try {
      let result;
      if (action === "leave") result = await handleLeaveCompany();
      else if (action === "schedule9") result = await handleScheduleNineHours();
      else if (action === "near9") result = await handleNearNineHours();
      setMessage(result?.message || result?.error || "操作完成");
      await refreshToday();
    } catch (error) {
      setMessage(String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  async function reviewDay(decision, day) {
    try {
      const hours = Math.max(0, Math.min(CONFIG.TARGET_HOURS, Number(leaveHours) || 0));
      if (decision === "reset") {
        resetAttendanceReview(day.key);
        setLeaveHours("0");
      } else {
        saveAttendanceReview(day.key, decision, hours);
      }
      setMessage(decision === "normal" ? "已确认正常" : decision === "abnormal" ? "已确认异常" : "已恢复系统原判");
      await loadMonth(monthDate);
      Widget.reloadAll();
    } catch (error) {
      setMessage(String(error?.message || error));
    }
  }

  async function navigateMonth(offset) {
    const next = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
    if (next > new Date(new Date().getFullYear(), new Date().getMonth(), 1)) return;
    setMonthDate(next);
    setSelectedDate(formatDateKey(next));
    await loadMonth(next);
  }

  async function showDebug() {
    const data = await getTodaySummary({ force: true });
    setDebugText(debugSummary(data));
    setTab("tools");
  }

  async function preview(family) {
    await Widget.preview({ family });
  }

  const palette = PALETTES[preferences.theme] || PALETTES.navy;

  return <NavigationStack>
    <ScrollView navigationTitle="考勤助手" navigationBarTitleDisplayMode="inline">
      <VStack spacing={11} padding={13} alignment="leading" background={{
        gradient: [
          { color: palette.bg, location: 0 },
          { color: palette.card, location: 0.55 },
          { color: palette.bg, location: 1 }
        ],
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 1, y: 1 }
      }} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={5} padding={4} background={palette.card} clipShape={{ type: "rect", cornerRadius: 13 }}>
          {[
            ["today", "今日"],
            ["calendar", "月历"],
            ["settings", "设置"],
            ["tools", "更多"]
          ].map(item => (
            <Button
              title={item[1]}
              buttonStyle={tab === item[0] ? "borderedProminent" : "bordered"}
              frame={{ maxWidth: "infinity" }}
              action={() => setTab(item[0])}
            />
          ))}
        </HStack>

        {tab === "today"
          ? <TodayTab data={today} palette={palette} loading={loading} onRefresh={refreshToday} statusMessage={message} isWorkday={todayIsWorkday} onConfirmMissed={confirmMissed} />
          : tab === "calendar"
            ? <CalendarTab
                monthData={monthData}
                selectedDate={selectedDate}
                onSelect={key => {
                  setSelectedDate(key);
                  setLeaveHours(String(monthData?.days?.find(day => day.key === key)?.leaveHours || 0));
                }}
                onPrev={() => navigateMonth(-1)}
                onNext={() => navigateMonth(1)}
                onSync={() => loadMonth(monthDate)}
                onReview={reviewDay}
                loading={loading}
                leaveHours={leaveHours}
                onLeaveHours={setLeaveHours}
                palette={palette}
              />
            : tab === "settings"
              ? <SettingsTab
                  preferences={preferences}
                  account={account}
                  onPreference={changePreference}
                  onSaveAccount={saveAccountAction}
                  accountDraft={accountDraft}
                  setAccountDraft={setAccountDraft}
                  palette={palette}
                  onPreview={preview}
                />
              : <VStack spacing={10}>
                  <ToolsTab onRun={runTool} onDebug={showDebug} onPreview={preview} palette={palette} />
                  {debugText
                    ? <Card palette={palette}><SectionTitle title="诊断信息" palette={palette} /><Text font="caption" monospaced foregroundStyle={palette.muted}>{debugText}</Text></Card>
                    : null}
                </VStack>}

        {message ? <Text font="caption2" foregroundStyle={palette.muted}>{message}</Text> : null}
        <Text font="caption2" foregroundStyle={palette.muted}>iGroup · 考勤助手</Text>
      </VStack>
    </ScrollView>
  </NavigationStack>;
}
