import {
  Button,
  Circle,
  ZStack,
  TimerIntervalLabel,
  HStack,
  Image,
  ProgressView,
  Script,
  Spacer,
  Text,
  VStack,
  Widget
} from "scripting";
import { CONFIG } from "./core/config";
import { getTodaySummary, getAttendanceMonth, getRecentAttendanceDays, isChinaWorkday } from "./core/attendance";
import { formatDateKey, formatShortDuration, formatTime, missingCheckout, checkoutWarningTitle } from "./core/rules";
import { getPreferences } from "./core/store";
import { RefreshAttendanceIntent } from "./app_intents";

const COLORS = {
  navy: {
    bg: "#0B1728", card: "#14263D", surface: "#1B314C", tile: "#213A57",
    text: "#F3F7FD", muted: "#9FB2CA", accent: "#82BCFF", accent2: "#C6EF7B",
    normal: "#65D5AC", warning: "#F2B66D", danger: "#FF8179", line: "#2A415D"
  },
  teal: {
    bg: "#0B2425", card: "#143536", surface: "#1B4443", tile: "#24504C",
    text: "#F0FFFA", muted: "#A2C6BE", accent: "#75DCCB", accent2: "#D0F18B",
    normal: "#69D7B0", warning: "#F1B66D", danger: "#FF8A80", line: "#2B5652"
  },
  slate: {
    bg: "#191C26", card: "#252A36", surface: "#303746", tile: "#394252",
    text: "#F5F6FA", muted: "#B4BAC8", accent: "#B7C6E8", accent2: "#E7D99E",
    normal: "#78D4B5", warning: "#EAC07C", danger: "#FF958D", line: "#41495A"
  }
};

const STYLE_NAMES = { cyber: "赛博", fitness: "运动", minimal: "极简", heatmap: "热力" };

function paletteFor(style, source) {
  if (style !== "minimal") return source;
  return {
    ...source,
    bg: "#E9EEF4", card: "#F8FAFD", surface: "#EDF1F6", tile: "#E5EBF2",
    text: "#17243A", muted: "#718096", accent: "#315FBD", accent2: "#087B5B",
    normal: "#087B5B", warning: "#A96520", danger: "#B34534", line: "#D8E0E9"
  };
}

function widgetBackground(palette) {
  return {
    gradient: [
      { color: palette.bg, location: 0 },
      { color: palette.card, location: 0.52 },
      { color: palette.bg, location: 1 }
    ],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 }
  };
}

function panelBackground(palette) {
  return {
    gradient: [
      { color: palette.card, location: 0 },
      { color: palette.surface, location: 1 }
    ],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 }
  };
}

function progressOf(data) {
  if (!data?.hasClockIn) return 0;
  const elapsed = data.hasOutRecord
    ? data.currentWorkMs
    : Math.max(0, Date.now() - data.inTime.getTime());
  return Math.max(0, Math.min(1, elapsed / (CONFIG.TARGET_HOURS * 3600000)));
}

function elapsedText(data) {
  if (!data?.hasClockIn) return "--";
  return formatShortDuration(data.hasOutRecord
    ? data.currentWorkMs
    : Math.max(0, Date.now() - data.inTime.getTime()));
}

function statusText(data) {
  if (data?.isRestDay) return "休息日";
  if (!data?.ok) return "待同步";
  if (!data.hasClockIn) return "等待上班卡";
  if (data.hasOutRecord) return data.targetReached ? "考勤正常" : "工时不足";
  return missingCheckout(data) ? checkoutWarningTitle(data) : "正在工作";
}

function statusColor(data, palette) {
  if (missingCheckout(data) || (data?.hasOutRecord && !data.targetReached)) return palette.danger;
  if (data?.hasOutRecord && data.targetReached) return palette.normal;
  if (data?.isRestDay) return palette.muted;
  return palette.accent;
}

function Countdown({ data, palette, size = 20 }) {
  const status = data?.isRestDay ? "休息日" : !data?.ok ? "待同步" : !data.hasClockIn ? "待上班" : data.hasOutRecord ? (data.targetReached ? "已完成" : "工时不足") : missingCheckout(data) ? checkoutWarningTitle(data) : "";
  if (status || !data.targetTime) return <Text font={Math.min(size, 15)} fontWeight="semibold" lineLimit={1} minScaleFactor={0.65} foregroundStyle={statusColor(data, palette)}>{status || "待同步"}</Text>;
  return <TimerIntervalLabel from={data.inTime.getTime()} to={data.targetTime.getTime()} countsDown={true} showsHours={true} font={size} fontWeight="semibold" monospacedDigit lineLimit={1} minScaleFactor={0.7} foregroundStyle={palette.text} />;
}

function MetricCell({ label, value, palette, highlight = false }) {
  return <VStack spacing={1} alignment="center" frame={{maxWidth:"infinity",minHeight:29}} background={palette.surface} clipShape={{type:"rect",cornerRadius:7}}>
    <Text font={9} lineLimit={1} foregroundStyle={palette.muted}>{label}</Text>
    <Text font={13} fontWeight="semibold" monospacedDigit lineLimit={1} minScaleFactor={0.7} foregroundStyle={highlight ? palette.accent2 : palette.text}>{value}</Text>
  </VStack>;
}

function Rings({ data, palette, size=45 }) {
  const work = progressOf(data);
  const punch = ((data?.hasClockIn ? 1 : 0) + (data?.hasOutRecord ? 1 : 0))/2;
  return <ZStack frame={{width:size,height:size}}>
    {[{n:size-5,p:work,c:palette.accent2},{n:size-17,p:punch,c:palette.accent}].map(r => <ZStack frame={{width:r.n,height:r.n}}>
      <Circle stroke={{shapeStyle:palette.line,strokeStyle:{lineWidth:4}}} frame={{width:r.n,height:r.n}} />
      {r.p>0 ? <Circle trim={{from:0,to:r.p}} stroke={{shapeStyle:r.c,strokeStyle:{lineWidth:4,lineCap:"round"}}} frame={{width:r.n,height:r.n}} /> : null}
    </ZStack>)}
    <Text font={9} fontWeight="semibold" foregroundStyle={palette.text}>{Math.round(work*100)}%</Text>
  </ZStack>;
}

function TodayPanel({ data, palette, style, compact = false, small = false, showRefresh = false }) {
  const inText = data?.hasClockIn ? formatTime(data.inTime) : "--";
  const outText = data?.hasOutRecord ? formatTime(data.latestOutTime) : "未打";
  const targetText = data?.targetTime ? formatTime(data.targetTime) : "--";
  const danger = missingCheckout(data) || (data?.hasOutRecord && !data.targetReached);
  const progress = progressOf(data);
  if (small) return <VStack spacing={4} alignment="leading" frame={{maxWidth:"infinity"}}>
    <HStack spacing={3}>
      <Text font={10} lineLimit={1} foregroundStyle={palette.muted}>今日考勤</Text><Spacer />
      <Text font={9} lineLimit={1} minScaleFactor={0.65} foregroundStyle={statusColor(data,palette)}>{danger ? "待打卡" : data?.hasOutRecord ? "已完成" : data?.isRestDay ? "休息" : data?.hasClockIn ? "进行中" : "待同步"}</Text>
    </HStack>
    <Spacer />
    {style==="fitness" && data?.hasClockIn ? <HStack spacing={5}>
      <Rings data={data} palette={palette} size={38} />
      <VStack spacing={1} alignment="leading">
        <Text font={9} foregroundStyle={palette.muted}>距可下班</Text>
        <Countdown data={data} palette={palette} size={15} />
        <Text font={9} lineLimit={1} foregroundStyle={palette.accent2}>{elapsedText(data)}</Text>
      </VStack>
    </HStack> : <VStack spacing={1} alignment="leading">
      <Text font={9} foregroundStyle={palette.muted}>距可下班</Text>
      <Countdown data={data} palette={palette} size={23} />
      <Text font={10} lineLimit={1} foregroundStyle={palette.muted}>累计 {elapsedText(data)}</Text>
    </VStack>}
    <ProgressView value={progress} tint={danger?palette.danger:palette.accent2} />
    <Spacer />
    <HStack spacing={3}>
      <MetricCell label="上班" value={inText} palette={palette} />
      <MetricCell label="下班" value={outText} palette={palette} highlight={danger} />
    </HStack>
  </VStack>;
  return <VStack spacing={4} padding={compact?5:6} background={panelBackground(palette)} clipShape={{type:"rect",cornerRadius:10}} alignment="leading">
    <HStack spacing={4}>
      <Text font={11} foregroundStyle={palette.muted}>今日考勤</Text><Spacer />
      <Text font={10} lineLimit={1} foregroundStyle={statusColor(data,palette)}>{statusText(data)}</Text>
      {showRefresh ? <Button buttonStyle="plain" intent={RefreshAttendanceIntent(undefined)}><Image systemName="arrow.clockwise" font={11} foregroundStyle={palette.accent} /></Button> : null}
    </HStack>
    <HStack spacing={8}>
      {style==="fitness" ? <Rings data={data} palette={palette} size={compact?38:48} /> : null}
      <VStack spacing={1} alignment="leading">
        <Text font={9} foregroundStyle={palette.muted}>累计工时</Text>
        <Text font={compact?18:22} fontWeight="semibold" lineLimit={1} minScaleFactor={0.7} foregroundStyle={palette.text}>{elapsedText(data)}</Text>
      </VStack>
      <Spacer />
      <VStack spacing={1} alignment="trailing">
        <Text font={9} foregroundStyle={palette.muted}>距可下班</Text>
        <Countdown data={data} palette={palette} size={compact?18:22} />
      </VStack>
    </HStack>
    {style!=="fitness" ? <ProgressView value={progress} tint={danger?palette.danger:palette.accent} /> : null}
    <HStack spacing={4}>
      <MetricCell label="上班" value={inText} palette={palette} />
      <MetricCell label="可下班" value={targetText} palette={palette} highlight />
      <MetricCell label="下班" value={outText} palette={palette} />
    </HStack>
  </VStack>;
}

function dayColors(day, palette, todayKey) {
  if (!day) return { bg: "clear", fg: palette.muted, mark: "" };
  if (day.future) return { bg: palette.tile, fg: palette.muted, mark: "" };
  if (!day.workday) return { bg: palette.tile, fg: palette.muted, mark: "休" };
  if (day.state === "active") return { bg: palette.accent, fg: palette.bg, mark: "今" };
  if (day.state === "normal") return { bg: "#1E4B42", fg: "#8DE2C2", mark: "✓" };
  if (day.state === "warning") return { bg: "#563D2B", fg: "#F4C27C", mark: "!" };
  if (day.state === "abnormal") return { bg: "#542D32", fg: "#FF9C95", mark: "×" };
  return { bg: palette.surface, fg: palette.muted, mark: "·" };
}

function DayCell({ day, palette, todayKey }) {
  const colors = dayColors(day, palette, todayKey);
  return <VStack spacing={0} frame={{maxWidth:"infinity",minHeight:17}} background={colors.bg} clipShape={{type:"rect",cornerRadius:5}} alignment="center">
    <Text font={10} fontWeight={day?.key===todayKey?"bold":"regular"} lineLimit={1} foregroundStyle={colors.fg}>{day ? Number(day.key.slice(-2)) : " "}</Text>
  </VStack>;
}

function Heatmap({ monthData, palette }) {
  if (!monthData) return <Text font={10} foregroundStyle={palette.muted}>月历缓存尚未建立</Text>;
  const todayKey = formatDateKey(new Date());
  return <VStack spacing={3} padding={5} background={palette.card} clipShape={{type:"rect",cornerRadius:10}} alignment="leading">
    <HStack><Text font={13} fontWeight="semibold" foregroundStyle={palette.text}>{monthData.monthLabel}</Text><Spacer /><Text font={10} foregroundStyle={palette.normal}>达标 {monthData.stats.normal} 天</Text></HStack>
    <HStack spacing={3}>{["一","二","三","四","五","六","日"].map(label => <Text font={9} frame={{maxWidth:"infinity"}} foregroundStyle={palette.muted}>{label}</Text>)}</HStack>
    {monthData.weeks.map(week => <HStack spacing={3}>{week.map(day => <DayCell day={day} palette={palette} todayKey={todayKey} />)}</HStack>)}
    <HStack spacing={8}><Text font={9} foregroundStyle={palette.normal}>● 正常</Text><Text font={9} foregroundStyle={palette.warning}>● 待核</Text><Text font={9} foregroundStyle={palette.accent}>● 进行中</Text></HStack>
  </VStack>;
}

function RecentDays({ days, palette }) {
  return <VStack
    spacing={4}
    padding={5}
    background={palette.card}
    clipShape={{ type: "rect", cornerRadius: 15 }}
    alignment="leading"
  >
    <HStack>
      <Text font={12} foregroundStyle={palette.text}>近 7 天</Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.muted}>每日状态</Text>
    </HStack>
    <HStack spacing={5}>
      {days.map(day => {
        const colors = dayColors(day, palette, formatDateKey(new Date()));
        return <VStack
          spacing={2}
          padding={3}
          background={colors.bg}
          clipShape={{ type: "rect", cornerRadius: 8 }}
          frame={{ maxWidth: "infinity" }}
          alignment="center"
        >
          <Text font={10} foregroundStyle={colors.fg}>{day.key.slice(8, 10)}</Text>
          <Text font="headline" foregroundStyle={colors.fg}>{colors.mark || "·"}</Text>
        </VStack>;
      })}
    </HStack>
  </VStack>;
}

function WidgetView({ data, monthData, recent, style, palette, family, layout }) {
  const large = family === "systemLarge" || family.startsWith("systemExtraLarge");
  const small = family === "systemSmall";
  const colors = paletteFor(style, palette);
  if (family.startsWith("accessory")) return <Accessory data={data} family={family} />;

  const statsOnly = layout === "stats" && !large && !small;
  return <VStack
    spacing={small ? 3 : 5}
    padding={small ? 3 : 4}
    background={widgetBackground(colors)}
    frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    alignment="leading"
  >
    {statsOnly
      ? <RecentDays days={recent} palette={colors} />
      : <TodayPanel data={data} palette={colors} style={style} compact={large || small} small={small} showRefresh={!small && !large} />}

    {large ? <Spacer /> : null}
    {large
      ? style === "heatmap"
        ? <Heatmap monthData={monthData} palette={colors} />
        : <VStack spacing={7}>
            <RecentDays days={recent} palette={colors} />
            <HStack padding={10} background={colors.card} clipShape={{ type: "rect", cornerRadius: 13 }}>
              <VStack spacing={2} alignment="leading">
                <Text font="caption2" foregroundStyle={colors.muted}>本月达标</Text>
                <Text font="title2" foregroundStyle={colors.normal}>{monthData?.stats.normal ?? "—"} 天</Text>
              </VStack>
              <Spacer />
              <VStack spacing={2} alignment="trailing">
                <Text font="caption2" foregroundStyle={colors.muted}>待核查</Text>
                <Text font="title2" foregroundStyle={colors.warning}>{monthData?.stats.warnings ?? "—"} 天</Text>
              </VStack>
            </HStack>
          </VStack>
      : null}
  </VStack>;
}

function Accessory({ data, family }) {
  const status = data?.isRestDay ? "休息日" : !data?.ok ? "待刷新" : !data.hasClockIn ? "待上班" : data.hasOutRecord ? "已打卡" : missingCheckout(data) ? (data.missedConfirmed ? "待补卡" : "漏打卡") : null;
  const countdown = status
    ? <Text font="caption" foregroundStyle={missingCheckout(data) ? "#EF4444" : "primaryLabel"}>{status}</Text>
    : <TimerIntervalLabel from={data.inTime.getTime()} to={data.targetTime.getTime()} countsDown={true} showsHours={true} />;
  if (family === "accessoryInline") return <HStack><Image systemName="clock" />{countdown}</HStack>;
  if (family === "accessoryCircular") return <VStack spacing={1}><Image systemName="clock" />{countdown}</VStack>;
  return <VStack alignment="leading" spacing={2}>
    <Text font="caption">今日考勤</Text>
    {countdown}
    <Text font="caption2">上班 {data?.inTime ? formatTime(data.inTime) : "--"} · 可下班 {data?.targetTime ? formatTime(data.targetTime) : "--"}</Text>
  </VStack>;
}

function nextRefresh(data, family) {
  const now = new Date(), start = new Date(now), end = new Date(now), tomorrow = new Date(now);
  start.setHours(8, 0, 0, 0);
  end.setHours(11, 0, 0, 0);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  if (data?.isRestDay) return tomorrow;
  if (data?.ok && data.hasClockIn && !data.targetReached && !data.hasOutRecord) {
    return new Date(Math.max(now.getTime() + 1000, Math.min(data.targetTime.getTime(), now.getTime() + 30 * 60000)));
  }
  if (missingCheckout(data)) {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return new Date(Math.min(now.getTime() + 10 * 60000, midnight.getTime()));
  }
  if (data?.ok && data.hasClockIn) return tomorrow;
  if (now < start) return start;
  return now < end ? new Date(now.getTime() + 10 * 60000) : tomorrow;
}

async function main() {
  const family = Widget.family || "systemMedium";
  let layout = String(Widget.parameter || "").toLowerCase();
  try {
    const parsed = JSON.parse(layout);
    layout = typeof parsed === "string" ? parsed : parsed.layout || "";
  } catch (_) {}
  const preferences = getPreferences();
  const style = family === "systemSmall" || family === "accessoryCircular"
    ? preferences.widgetStyleSmall
    : family === "systemLarge" || family.startsWith("systemExtraLarge") || family === "accessoryRectangular"
      ? preferences.widgetStyleLarge
      : preferences.widgetStyleMedium;
  const palette = COLORS[preferences.theme] || COLORS.navy;
  const workday = await isChinaWorkday(new Date());
  const data = workday ? await getTodaySummary() : { ok: true, isRestDay: true };
  const monthData = family === "systemLarge" || family.startsWith("systemExtraLarge")
    ? await getAttendanceMonth(new Date(), { sync: false, offline: true })
    : null;
  const recent = getRecentAttendanceDays(layout === "stats" && (family === "systemLarge" || family.startsWith("systemExtraLarge")) ? 14 : 7);
  Widget.present(
    <WidgetView data={data} monthData={monthData} recent={recent} style={style} palette={palette} family={family} layout={layout} />,
    { policy: "after", date: nextRefresh(data, family) }
  );
  Script.exit();
}

main().catch(error => {
  console.error("考勤小组件运行失败", error);
  Widget.present(
    <VStack padding={12} background="#0B1728">
      <Text font="headline" foregroundStyle="#F3F7FD">考勤助手</Text>
      <Text foregroundStyle="#FF8179">{String(error?.message || error)}</Text>
    </VStack>
  );
  Script.exit();
});
