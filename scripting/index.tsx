import {
  Button,
  DateLabel,
  Divider,
  HStack,
  Image,
  Navigation,
  NavigationStack,
  ProgressView,
  ScrollView,
  Script,
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
  summarizeMonth,
  debugSummary,
  isChinaWorkday
} from "./core/attendance";
import { formatDateKey, formatRemainText, formatShortDuration, formatTime } from "./core/rules";
import {
  getAccount,
  getPreferences,
  saveAccount,
  savePreferences
} from "./core/store";
import {
  handleLeaveCompany,
  handleNearNineHours,
  handleScheduleNineHours
} from "./core/reminders";
import { syncAttendanceLiveActivity } from "./core/live_activity_service";

const PALETTES = {
  navy: { bg: "#F4F6FA", card: "#FFFFFF", ink: "#172033", muted: "#687487", accent: "#315FBD", normal: "#087B5B", warning: "#B86B24" },
  teal: { bg: "#F1F7F5", card: "#FFFFFF", ink: "#173A36", muted: "#64817A", accent: "#167E74", normal: "#087B5B", warning: "#B86B24" },
  slate: { bg: "#F4F4F7", card: "#FFFFFF", ink: "#272B38", muted: "#74798A", accent: "#5A637A", normal: "#087B5B", warning: "#B86B24" }
};

const STYLE_LABELS = {
  cyber: "赛博控制台",
  fitness: "运动环形",
  minimal: "极简工时账本",
  heatmap: "月历热力图"
};

function Card({ children }) {
  return <VStack
    spacing={10}
    padding={14}
    background="#FFFFFF"
    clipShape={{ type: "rect", cornerRadius: 16 }}
    alignment="leading"
    frame={{ maxWidth: "infinity" }}
  >
    {children}
  </VStack>;
}

function SectionTitle({ title, subtitle }) {
  return <VStack spacing={3} alignment="leading">
    <Text font="headline">{title}</Text>
    {subtitle ? <Text font="caption" foregroundStyle="secondaryLabel">{subtitle}</Text> : null}
  </VStack>;
}

function StatusBadge({ text, color }) {
  return <Text font="caption" foregroundStyle={color}>{text}</Text>;
}

function TodayTab({ data, palette, loading, onRefresh, statusMessage, isWorkday }) {
  if (!isWorkday) return <VStack spacing={12} alignment="leading"><Card><Text font="caption" foregroundStyle="secondaryLabel">{formatDateKey(new Date())} · 今日考勤</Text><Text font="title2">今天是休息日</Text><Text font="caption" foregroundStyle="secondaryLabel">法定节假日和周末不显示考勤状态，调休补班日会自动恢复。</Text><Button title="仍然刷新数据" buttonStyle="bordered" action={onRefresh} /></Card></VStack>;
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
    data.targetReached ? "已到下班时间" : "正在工作";

  return <VStack spacing={14} alignment="leading">
    <Card>
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="caption" foregroundStyle="secondaryLabel">{formatDateKey(new Date())} · 今日考勤</Text>
          <Text font="largeTitle">{elapsed}</Text>
          <Text font="caption" foregroundStyle={palette.accent}>累计工时 / 目标 {CONFIG.TARGET_HOURS} 小时</Text>
        </VStack>
        <Spacer />
        <VStack spacing={3} alignment="trailing">
          <StatusBadge text={status} color={data?.hasOutRecord ? palette.normal : palette.accent} />
          <Button title={loading ? "同步中…" : "刷新"} buttonStyle="bordered" action={onRefresh} disabled={loading} />
        </VStack>
      </HStack>
      <ProgressView value={progress} tint={palette.accent} />
      {data?.hasClockIn && !data.hasOutRecord && data.targetTime
        ? <VStack spacing={3} alignment="leading">
            <Text font="caption" foregroundStyle="secondaryLabel">距离可下班</Text>
            {data.targetReached
              ? <Text font="title2" foregroundStyle={palette.normal}>已到下班时间，请打卡</Text>
              : <DateLabel date={data.targetTime} style="timer" />}
          </VStack>
        : null}
      <Divider />
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">上班卡</Text>
          <Text font="headline">{data?.hasClockIn ? formatTime(data.inTime) : "--"}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">预计下班</Text>
          <Text font="headline">{data?.targetTime ? formatTime(data.targetTime) : "--"}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">下班卡</Text>
          <Text font="headline">{data?.hasOutRecord ? formatTime(data.latestOutTime) : "未打"}</Text>
        </VStack>
      </HStack>
      {data?.refreshError
        ? <Text font="caption" foregroundStyle="systemOrange">网络同步失败，当前展示本机快照：{data.refreshError}</Text>
        : null}
      {!data?.ok ? <Text foregroundStyle="systemRed">{data?.error || "暂无考勤数据，请先配置账号"}</Text> : null}
    </Card>
    <Card>
      <SectionTitle title="考勤提醒" subtitle="提醒只在本机安排，不修改企业原始工卡" />
      <HStack>
        <Text>提前下班提醒</Text>
        <Spacer />
        <Text font="caption" foregroundStyle={palette.accent}>{getPreferences().remindMinutes ? "提前 " + getPreferences().remindMinutes + " 分钟" : "已关闭"}</Text>
      </HStack>
      <Button title="重新安排提前提醒" buttonStyle="bordered" action={async () => {
        const result = await handleScheduleNineHours();
        console.log(result.message || result.error);
      }} />
      {statusMessage ? <Text font="caption" foregroundStyle="secondaryLabel">{statusMessage}</Text> : null}
    </Card>
  </VStack>;
}

function CalendarTab({ monthData, selectedDate, onSelect, onPrev, onNext, onSync, onReview, loading, leaveHours, onLeaveHours }) {
  const selected = monthData?.days?.find(day => day.key === selectedDate);
  return <VStack spacing={12} alignment="leading">
    <Card>
      <HStack>
        <Button title="‹" buttonStyle="bordered" action={onPrev} disabled={!monthData?.canPrev} />
        <Spacer />
        <Text font="headline">{monthData?.monthLabel || "考勤月历"}</Text>
        <Spacer />
        <Button title="›" buttonStyle="bordered" action={onNext} disabled={!monthData?.canNext} />
      </HStack>
      <HStack>
        {["一","二","三","四","五","六","日"].map(day => (
          <VStack frame={{ maxWidth: "infinity" }}>
            <Text font="caption2" foregroundStyle="secondaryLabel">{day}</Text>
          </VStack>
        ))}
      </HStack>
      {monthData?.weeks?.map(week => (
        <HStack spacing={3}>
          {week.map(day => day
            ? <Button
                title={String(Number(day.key.slice(-2))) + (day.state === "normal" ? " ✓" : day.state === "warning" ? " !" : day.state === "active" ? " ●" : day.workday ? " ·" : " 休")}
                buttonStyle={day.key === selectedDate ? "borderedProminent" : "bordered"}
                frame={{ maxWidth: "infinity" }}
                action={() => onSelect(day.key)}
              />
            : <VStack frame={{ maxWidth: "infinity" }}><Text> </Text></VStack>
          )}
        </HStack>
      ))}
      <Divider />
      <HStack>
        <Text font="caption" foregroundStyle="systemGreen">正常 {monthData?.stats.normal ?? 0}</Text>
        <Spacer />
        <Text font="caption" foregroundStyle="systemOrange">待核查 {monthData?.stats.warnings ?? 0}</Text>
        <Spacer />
        <Text font="caption" foregroundStyle="secondaryLabel">待查 {monthData?.stats.pending ?? 0}</Text>
      </HStack>
      <Button title={loading ? "补查中…" : "补查本月缺失记录"} buttonStyle="bordered" action={onSync} disabled={loading} />
    </Card>

    {selected ? <Card>
      <SectionTitle title={selected.key + " · " + selected.status} subtitle={selected.originalStatus ? "系统原判：" + selected.originalStatus : selected.label} />
      <HStack>
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">上班卡</Text>
          <Text font="headline">{selected.clockIn}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">下班卡</Text>
          <Text font="headline">{selected.clockOut}</Text>
        </VStack>
        <Spacer />
        <VStack spacing={3} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">工时</Text>
          <Text font="headline">{selected.worked}</Text>
        </VStack>
      </HStack>
      {selected.workday
        ? <VStack spacing={6} alignment="leading">
            <Text font="caption" foregroundStyle="secondaryLabel">已批准请假时长（小时）</Text>
            <TextField title="请假小时数" value={leaveHours} onChanged={onLeaveHours} keyboardType="decimalPad" />
            <Text font="caption" foregroundStyle="secondaryLabel">人工核查（只影响本机判定）</Text>
            <HStack>
              <Button title="确认正常" buttonStyle="bordered" action={() => onReview("normal", selected)} />
              <Button title="确认异常" buttonStyle="bordered" action={() => onReview("abnormal", selected)} />
              <Button title="恢复原判" buttonStyle="bordered" action={() => onReview("auto", selected)} />
            </HStack>
          </VStack>
        : <Text font="caption" foregroundStyle="secondaryLabel">休息日无需核查</Text>}
    </Card> : null}
    {monthData?.stats
      ? <Card>
          <SectionTitle title="月度统计" subtitle="只统计已有有效工卡的工作日" />
          <HStack>
            <VStack spacing={3}><Text font="caption2" foregroundStyle="secondaryLabel">平均上班</Text><Text font="headline">{monthData.stats.averageIn}</Text></VStack>
            <Spacer />
            <VStack spacing={3}><Text font="caption2" foregroundStyle="secondaryLabel">平均下班</Text><Text font="headline">{monthData.stats.averageOut}</Text></VStack>
            <Spacer />
            <VStack spacing={3}><Text font="caption2" foregroundStyle="secondaryLabel">平均工时</Text><Text font="headline">{monthData.stats.averageWorked}</Text></VStack>
          </HStack>
        </Card>
      : null}
  </VStack>;
}

function SettingsTab({ preferences, account, onPreference, onSaveAccount, accountDraft, setAccountDraft, palette }) {
  const styleRows = [
    ["widgetStyleSmall", "小号组件"],
    ["widgetStyleMedium", "中号组件"],
    ["widgetStyleLarge", "大号组件"]
  ];
  const styleIndex = value => Math.max(0, WIDGET_STYLES.indexOf(value));
  const cycleStyle = (key) => {
    const current = styleIndex(preferences[key]);
    onPreference(key, WIDGET_STYLES[(current + 1) % WIDGET_STYLES.length]);
  };
  return <VStack spacing={12} alignment="leading">
    <Card>
      <SectionTitle title="考勤配置" subtitle="设置保存在 Scripting 本机存储中" />
      <HStack>
        <Text>主题配色</Text><Spacer />
        {THEMES.map(theme => <Button title={theme === "navy" ? "深海蓝" : theme === "teal" ? "松石绿" : "岩灰"} buttonStyle={preferences.theme === theme ? "borderedProminent" : "bordered"} action={() => onPreference("theme", theme)} />)}
      </HStack>
      <Divider />
      <Text>提前下班提醒</Text>
      <HStack>
        {[0,5,15,30,45,60].map(minutes => <Button title={minutes === 0 ? "关闭" : minutes + "分"} buttonStyle={preferences.remindMinutes === minutes ? "borderedProminent" : "bordered"} action={() => onPreference("remindMinutes", minutes)} />)}
      </HStack>
      <Divider />
      <HStack>
        <Text>灵动岛实时倒计时</Text><Spacer />
        <Button title={preferences.liveActivityEnabled ? "已开启" : "已关闭"} buttonStyle="bordered" action={() => onPreference("liveActivityEnabled", !preferences.liveActivityEnabled)} />
      </HStack>
      <Text font="caption" foregroundStyle="secondaryLabel">需要在 iOS 设置中允许 Scripting 的实时活动。上班卡同步成功后自动启动，检测到下班卡后结束。</Text>
    </Card>
    <Card>
      <SectionTitle title="小组件样式" subtitle="每种尺寸可以独立选择布局" />
      {styleRows.map(([key, label]) => (
        <HStack>
          <Text>{label}</Text><Spacer />
          <Text font="caption" foregroundStyle={palette.accent}>{STYLE_LABELS[preferences[key]]}</Text>
          <Button title="更换" buttonStyle="bordered" action={() => cycleStyle(key)} />
        </HStack>
      ))}
      <HStack>
        <Button title="预览小号" buttonStyle="bordered" action={() => Widget.preview({ family: "systemSmall" })} />
        <Button title="预览中号" buttonStyle="bordered" action={() => Widget.preview({ family: "systemMedium" })} />
        <Button title="预览大号" buttonStyle="bordered" action={() => Widget.preview({ family: "systemLarge" })} />
      </HStack>
    </Card>
    <Card>
      <SectionTitle title="企业账号" subtitle="账号、密码、设备 ID 和 Token 只保存在 Scripting Keychain" />
      <TextField title="账号 / 手机号" value={accountDraft.username} onChanged={value => setAccountDraft(current => ({ ...current, username: value }))} />
      <SecureField title="密码" value={accountDraft.password} onChanged={value => setAccountDraft(current => ({ ...current, password: value }))} />
      <TextField title="设备 ID" value={accountDraft.deviceId} onChanged={value => setAccountDraft(current => ({ ...current, deviceId: value }))} />
      <Button title="安全保存账号" buttonStyle="borderedProminent" action={onSaveAccount} />
      <Text font="caption2" foregroundStyle="secondaryLabel">
        {account.configured ? "当前账号已配置。更换账号会清除旧 Token 和今日快照。" : "首次使用需要填写完整账号资料。"}
      </Text>
    </Card>
  </VStack>;
}

function ToolsTab({ onRun, onDebug, onPreview }) {
  return <VStack spacing={12} alignment="leading">
    <Card>
      <SectionTitle title="考勤工具" subtitle="兼容原有快捷指令动作" />
      <Button title="离开公司检查" buttonStyle="bordered" action={() => onRun("leave")} />
      <Button title="预约提前下班提醒" buttonStyle="bordered" action={() => onRun("schedule9")} />
      <Button title="检查是否达到 9 小时" buttonStyle="bordered" action={() => onRun("near9")} />
      <Button title="查看接口解析与考勤判定" buttonStyle="bordered" action={onDebug} />
    </Card>
    <Card>
      <SectionTitle title="小组件预览" subtitle="选择对应尺寸，在 Scripting 中查看真实渲染" />
      <HStack>
        <Button title="小号" buttonStyle="bordered" action={() => onPreview("systemSmall")} />
        <Button title="中号" buttonStyle="bordered" action={() => onPreview("systemMedium")} />
        <Button title="大号" buttonStyle="bordered" action={() => onPreview("systemLarge")} />
      </HStack>
    </Card>
    <Card>
      <SectionTitle title="快捷指令" subtitle="通过 scripting://run/AttendanceHelper?action=refresh 调用" />
      <Text font="caption">refresh · leave · schedule9 · near9 · debug · manage</Text>
    </Card>
  </VStack>;
}

function AppView({ initialTab = "today" }) {
  const [tab, setTab] = useState(initialTab);
  const [today, setToday] = useState(null);
  const [todayIsWorkday, setTodayIsWorkday] = useState(true);
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthData, setMonthData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(formatDateKey(new Date()));
  const [preferences, setPreferences] = useState(getPreferences());
  const [account, setAccount] = useState(getAccount());
  const [accountDraft, setAccountDraft] = useState({
    username: account.username,
    password: account.password,
    deviceId: account.deviceId
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [leaveHours, setLeaveHours] = useState("0");
  const [debugText, setDebugText] = useState("");

  async function refreshToday() {
    setLoading(true);
    try {
      const workday = await isChinaWorkday(new Date());
      setTodayIsWorkday(workday);
      const data = await getTodaySummary({ force: true });
      setToday(data);
      if (data.ok) {
        const live = await syncAttendanceLiveActivity(data);
        setMessage(live.message || "同步完成");
        if (workday && preferences.remindMinutes > 0 && data.hasClockIn && !data.hasOutRecord) {
          await handleScheduleNineHours();
        }
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
    setLoading(true);
    try {
      const result = await getAttendanceMonth(date, { sync: true });
      setMonthData(result);
      if (!result.days.some(day => day.key === selectedDate)) {
        setSelectedDate(result.todayKey);
      }
    } catch (error) {
      setMessage("月历加载失败：" + String(error?.message || error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshToday();
    loadMonth(new Date());
  }, []);

  async function changePreference(key, value) {
    const previous = preferences;
    const next = savePreferences({ ...preferences, [key]: value });
    setPreferences(next);
    if (key === "remindMinutes" && next.remindMinutes !== previous.remindMinutes) {
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
      const saved = saveAccount(accountDraft);
      setAccount(saved);
      setAccountDraft({ ...accountDraft, password: saved.password });
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
      if (decision === "auto" && hours === 0) resetAttendanceReview(day.key);
      else saveAttendanceReview(day.key, decision, hours);
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
    <ScrollView navigationTitle="考勤助手" navigationBarTitleDisplayMode="large">
      <VStack spacing={14} padding={14} alignment="leading" background={palette.bg}>
        <HStack spacing={6}>
          <Button title="今日" buttonStyle={tab === "today" ? "borderedProminent" : "bordered"} action={() => setTab("today")} />
          <Button title="月历" buttonStyle={tab === "calendar" ? "borderedProminent" : "bordered"} action={() => setTab("calendar")} />
          <Button title="配置" buttonStyle={tab === "settings" ? "borderedProminent" : "bordered"} action={() => setTab("settings")} />
          <Button title="工具" buttonStyle={tab === "tools" ? "borderedProminent" : "bordered"} action={() => setTab("tools")} />
        </HStack>

        {tab === "today"
          ? <TodayTab data={today} palette={palette} loading={loading} onRefresh={refreshToday} statusMessage={message} isWorkday={todayIsWorkday} />
          : tab === "calendar"
            ? <CalendarTab
                monthData={monthData}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                onPrev={() => navigateMonth(-1)}
                onNext={() => navigateMonth(1)}
                onSync={() => loadMonth(monthDate)}
                onReview={reviewDay}
                loading={loading}
                leaveHours={leaveHours}
                onLeaveHours={setLeaveHours}
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
                />
              : <VStack spacing={12}>
                  <ToolsTab onRun={runTool} onDebug={showDebug} onPreview={preview} />
                  {debugText ? <Card><SectionTitle title="Debug" /><Text font="caption" monospaced>{debugText}</Text></Card> : null}
                </VStack>}

        {message ? <Text font="caption" foregroundStyle="secondaryLabel">{message}</Text> : null}
        <Text font="caption2" foregroundStyle="tertiaryLabel">考勤核查仅修改本机记录，不会更改企业原始工卡。</Text>
      </VStack>
    </ScrollView>
  </NavigationStack>;
}

async function runAction(action) {
  if (action === "refresh" || action === "widget") {
    const workday = await isChinaWorkday(new Date());
    const data = await getTodaySummary({ force: true });
    if (data.ok && workday) {
      await syncAttendanceLiveActivity(data);
      if (getPreferences().remindMinutes > 0 && data.hasClockIn && !data.hasOutRecord) {
        await handleScheduleNineHours();
      }
    }
    Widget.reloadAll();
    return data;
  }
  if (action === "leave") return handleLeaveCompany();
  if (action === "schedule9") return handleScheduleNineHours();
  if (action === "near9") return handleNearNineHours();
  if (action === "debug") return debugSummary(await getTodaySummary({ force: true }));
  if (action === "update") return "请在 Scripting 的脚本设置中检查远程仓库更新";
  return null;
}

async function main() {
  const action = String(Script.queryParameters?.action || Script.widgetParameter || "manage").toLowerCase();
  if (action !== "manage" && action !== "week" && action !== "account") {
    const result = await runAction(action);
    Script.exit(result);
    return;
  }
  await Navigation.present({ element: <AppView initialTab={action === "week" ? "calendar" : action === "account" ? "settings" : "today"} /> });
  Script.exit();
}

main().catch(error => {
  console.error("考勤助手启动失败", error);
  Script.exit({ ok: false, error: String(error?.message || error) });
});
