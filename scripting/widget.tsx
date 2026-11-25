import {
  Button,
  DateLabel,
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
import { formatDateKey, formatRemainText, formatShortDuration, formatTime } from "./core/rules";
import { getPreferences } from "./core/store";
import {
  CheckAttendanceIntent,
  RefreshAttendanceIntent,
  ScheduleReminderIntent
} from "./app_intents";

const COLORS = {
  navy: { bg: "#101D31", card: "#1B2C45", text: "#F2F6FC", muted: "#A8B8CE", accent: "#8BC4FF", accent2: "#B9F36A" },
  teal: { bg: "#102B2A", card: "#1B3C39", text: "#F0FFFB", muted: "#A5C9C0", accent: "#70D9C8", accent2: "#D1F28A" },
  slate: { bg: "#242631", card: "#343746", text: "#F5F5F8", muted: "#B8BAC6", accent: "#B9C4E3", accent2: "#E4D49B" }
};

function progressOf(data) {
  if (!data?.hasClockIn) return 0;
  const elapsed = data.hasOutRecord
    ? data.currentWorkMs
    : Math.max(0, Date.now() - data.inTime.getTime());
  return Math.max(0, Math.min(1, elapsed / (CONFIG.TARGET_HOURS * 3600000)));
}

function statusText(data) {
  if (!data?.ok) return "暂无考勤数据";
  if (!data.hasClockIn) return "等待上班卡";
  if (data.hasOutRecord) return data.targetReached ? "考勤正常" : "工时不足";
  return data.targetReached ? "已到下班时间" : "正在工作";
}

function Countdown({ data, palette }) {
  if (!data?.hasClockIn || !data.targetTime) {
    return <Text font="title2" foregroundStyle={palette.text}>等待上班卡</Text>;
  }
  if (data.hasOutRecord) {
    return <Text font="title2" foregroundStyle={palette.accent2}>已打下班卡</Text>;
  }
  if (data.targetReached) {
    return <Text font="title2" foregroundStyle={palette.accent2}>已到下班时间</Text>;
  }
  return <VStack spacing={2} alignment="leading">
    <Text font="caption" foregroundStyle={palette.muted}>距离可下班</Text>
    <DateLabel date={data.targetTime} style="timer" />
  </VStack>;
}

function TodayPanel({ data, palette, style }) {
  if (data?.isRestDay) {
    return <VStack spacing={6} alignment="leading"><Text font="caption" foregroundStyle={palette.muted}>今日考勤</Text><Text font="title2" foregroundStyle={palette.text}>今天是休息日</Text><Text font="caption" foregroundStyle={palette.muted}>调休补班日会自动恢复考勤显示</Text></VStack>;
  }
  const progress = progressOf(data);
  const inText = data?.hasClockIn ? formatTime(data.inTime) : "--";
  const outText = data?.hasOutRecord ? formatTime(data.latestOutTime) : "未打";
  const targetText = data?.targetTime ? formatTime(data.targetTime) : "--";

  if (style === "minimal") {
    return <VStack spacing={5} alignment="leading">
      <HStack>
        <Text font="caption" foregroundStyle={palette.muted}>今日考勤</Text>
        <Spacer />
        <Text font="caption" foregroundStyle={palette.accent}>{statusText(data)}</Text>
      </HStack>
      <Text font="largeTitle" foregroundStyle={palette.text}>{data?.hasClockIn ? formatShortDuration(data.hasOutRecord ? data.currentWorkMs : Date.now() - data.inTime.getTime()) : "--"}</Text>
      <Countdown data={data} palette={palette} />
      <HStack>
        <Text font="caption2" foregroundStyle={palette.muted}>上班 {inText}</Text>
        <Spacer />
        <Text font="caption2" foregroundStyle={palette.muted}>下班 {outText}</Text>
      </HStack>
    </VStack>;
  }

  if (style === "cyber") {
    return <VStack spacing={7} alignment="leading">
      <HStack>
        <Image systemName="waveform.path.ecg" foregroundStyle={palette.accent} />
        <Text font="caption" foregroundStyle={palette.accent}>ATTENDANCE LIVE</Text>
        <Spacer />
        <Text font="caption2" foregroundStyle={palette.muted}>{statusText(data)}</Text>
      </HStack>
      <Countdown data={data} palette={palette} />
      <ProgressView value={progress} tint={palette.accent2} />
      <HStack>
        <VStack alignment="leading" spacing={2}>
          <Text font="caption2" foregroundStyle={palette.muted}>上班卡</Text>
          <Text font="headline" foregroundStyle={palette.text}>{inText}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={2}>
          <Text font="caption2" foregroundStyle={palette.muted}>预计下班</Text>
          <Text font="headline" foregroundStyle={palette.text}>{targetText}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="leading" spacing={2}>
          <Text font="caption2" foregroundStyle={palette.muted}>下班卡</Text>
          <Text font="headline" foregroundStyle={palette.text}>{outText}</Text>
        </VStack>
      </HStack>
    </VStack>;
  }

  if (style === "fitness") {
    return <HStack spacing={12} alignment="center">
      <VStack spacing={4} alignment="center">
        <ProgressView value={progress} tint={palette.accent2} />
        <Text font="caption2" foregroundStyle={palette.muted}>{Math.round(progress * 100)}%</Text>
      </VStack>
      <VStack spacing={5} alignment="leading">
        <Text font="caption" foregroundStyle={palette.muted}>工时目标 · {CONFIG.TARGET_HOURS} 小时</Text>
        <Text font="title2" foregroundStyle={palette.text}>{data?.hasClockIn ? formatShortDuration(data.hasOutRecord ? data.currentWorkMs : Date.now() - data.inTime.getTime()) : "--"}</Text>
        <Countdown data={data} palette={palette} />
        <Text font="caption2" foregroundStyle={palette.accent}>{inText} 上班 · {outText} 下班</Text>
      </VStack>
    </HStack>;
  }

  return <VStack spacing={5} alignment="leading">
    <HStack>
      <Text font="caption" foregroundStyle={palette.muted}>今日状态</Text>
      <Spacer />
      <Text font="caption" foregroundStyle={palette.accent}>{statusText(data)}</Text>
    </HStack>
    <Countdown data={data} palette={palette} />
    <ProgressView value={progress} tint={palette.accent} />
    <HStack>
      <Text font="caption2" foregroundStyle={palette.muted}>上班 {inText}</Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.muted}>下班 {outText}</Text>
    </HStack>
  </VStack>;
}

function DayCell({ day, palette, selected }) {
  if (!day) return <Text font="caption2"> </Text>;
  if (day.future) return <Text font="caption2" foregroundStyle={palette.muted}>{Number(day.key.slice(-2))}</Text>;
  const color = day.state === "normal" ? "#55C69B" :
    day.state === "warning" ? "#F0A45D" :
    day.state === "active" ? palette.accent : palette.muted;
  return <VStack spacing={2} alignment="center" padding={3} background={selected ? palette.card : "clear"}>
    <Text font="caption" foregroundStyle={color}>{Number(day.key.slice(-2))}</Text>
    <Text font="caption2" foregroundStyle={color}>{day.workday ? (day.state === "normal" ? "✓" : day.state === "warning" ? "!" : day.state === "active" ? "●" : "·") : "休"}</Text>
  </VStack>;
}

function Heatmap({ monthData, palette }) {
  if (!monthData) return <Text font="caption" foregroundStyle={palette.muted}>月历缓存尚未建立</Text>;
  return <VStack spacing={4} alignment="leading">
    <HStack>
      <Text font="headline" foregroundStyle={palette.text}>{monthData.monthLabel}</Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.muted}>正常 {monthData.stats.normal} 天</Text>
    </HStack>
    <HStack spacing={2}>
      {["一","二","三","四","五","六","日"].map(label => <Text font="caption2" foregroundStyle={palette.muted}>{label}</Text>)}
    </HStack>
    {monthData.weeks.map(week => (
      <HStack spacing={2}>
        {week.map(day => <VStack frame={{ maxWidth: "infinity" }}><DayCell day={day} palette={palette} /></VStack>)}
      </HStack>
    ))}
    <HStack spacing={8}>
      <Text font="caption2" foregroundStyle="#55C69B">● 正常</Text>
      <Text font="caption2" foregroundStyle="#F0A45D">● 待核查</Text>
      <Text font="caption2" foregroundStyle={palette.accent}>● 进行中</Text>
    </HStack>
  </VStack>;
}

function RecentDays({ days, palette }) {
  return <VStack spacing={5} alignment="leading">
    <Text font="headline" foregroundStyle={palette.text}>近 7 天</Text>
    <HStack spacing={4}>
      {days.map(day => (
        <VStack spacing={3} alignment="center" frame={{ maxWidth: "infinity" }}>
          <Text font="caption2" foregroundStyle={palette.muted}>{day.key.slice(5).replace("-", "/")}</Text>
          <Text font="headline" foregroundStyle={day.state === "normal" ? "#55C69B" : day.state === "warning" ? "#F0A45D" : palette.accent}>
            {day.workday ? (day.state === "normal" ? "✓" : day.state === "warning" ? "!" : "·") : "休"}
          </Text>
        </VStack>
      ))}
    </HStack>
  </VStack>;
}

function WidgetView({ data, monthData, recent, style, palette, family }) {
  const large = family === "systemLarge";
  const small = family === "systemSmall";
  const background = style === "minimal" ? "#F4F5F7" : palette.bg;
  const textPalette = style === "minimal"
    ? { ...palette, bg: "#F4F5F7", card: "#FFFFFF", text: "#172033", muted: "#687487", accent: "#315FBD", accent2: "#087B5B" }
    : palette;

  return <VStack
    spacing={small ? 5 : 8}
    padding={small ? 8 : 12}
    background={background}
    frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
    alignment="leading"
  >
    <TodayPanel data={data} palette={textPalette} style={style} />
    {!small
      ? <Button
          title="刷新考勤"
          buttonStyle="bordered"
          intent={RefreshAttendanceIntent(undefined)}
        />
      : null}
    {large && style === "heatmap"
      ? <Heatmap monthData={monthData} palette={textPalette} />
      : large
        ? <VStack spacing={8}>
            <RecentDays days={recent} palette={textPalette} />
            <HStack>
              <Text font="caption2" foregroundStyle={textPalette.muted}>本月达标 {monthData?.stats.normal ?? "—"} 天</Text>
              <Spacer />
              <Text font="caption2" foregroundStyle={textPalette.muted}>待核查 {monthData?.stats.warnings ?? "—"} 天</Text>
            </HStack>
          </VStack>
        : !small
          ? <RecentDays days={recent} palette={textPalette} />
          : null}
    {small
      ? <Text font="caption2" foregroundStyle={textPalette.muted}>上班 {data?.hasClockIn ? formatTime(data.inTime) : "--"}</Text>
      : null}
  </VStack>;
}

async function main() {
  const family = Widget.family || "systemMedium";
  const preferences = getPreferences();
  const style = family === "systemSmall" || family === "accessoryCircular"
    ? preferences.widgetStyleSmall
    : family === "systemLarge" || family === "accessoryRectangular"
      ? preferences.widgetStyleLarge
      : preferences.widgetStyleMedium;
  const palette = COLORS[preferences.theme] || COLORS.navy;
  const workday = await isChinaWorkday(new Date());
  const data = workday ? await getTodaySummary() : { ok: true, isRestDay: true };
  const monthData = family === "systemLarge"
    ? await getAttendanceMonth(new Date(), { sync: false, offline: true })
    : null;
  const recent = getRecentAttendanceDays(7);
  Widget.present(
    <WidgetView data={data} monthData={monthData} recent={recent} style={style} palette={palette} family={family} />,
    { policy: "after", date: new Date(Date.now() + 20 * 60000) }
  );
  Script.exit();
}

main().catch(error => {
  console.error("考勤小组件运行失败", error);
  Widget.present(<VStack padding={12}><Text font="headline">考勤助手</Text><Text>{String(error?.message || error)}</Text></VStack>);
  Script.exit();
});
