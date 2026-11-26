import {
  HStack,
  Image,
  LiveActivity,
  LiveActivityUI,
  LiveActivityUIExpandedCenter,
  LiveActivityUIExpandedBottom,
  Text,
  TimerIntervalLabel,
  VStack,
  type LiveActivityUIBuilder
} from "scripting";

export type AttendanceActivityState = {
  phase: "working" | "ready" | "finished";
  missedConfirmed?: boolean;
  startedAt: number;
  targetAt: number;
  clockInText: string;
  targetText: string;
  statusText: string;
  workedText: string;
};

function ActivityDetails(state: AttendanceActivityState) {
  return (
    <VStack spacing={6} alignment="leading">
      <HStack spacing={6} alignment="center">
        <Image systemName="clock.fill" foregroundStyle={state.phase === "ready" ? "systemRed" : "#7CC7FF"} />
        <Text font="caption" foregroundStyle="secondaryLabel">考勤助手 · {state.statusText}</Text>
      </HStack>
      {state.phase === "working"
        ? <TimerIntervalLabel
            from={state.startedAt}
            to={state.targetAt}
            countsDown={true}
            showsHours={true}
          />
        : <Text font="title2" foregroundStyle={state.phase === "ready" ? "systemRed" : "secondaryLabel"}>
            {state.phase === "ready" ? (state.missedConfirmed ? "已漏卡 · 待补卡" : "⚠ 未打下班卡，请立即打卡") : "今日考勤已结束"}
          </Text>}
      <HStack spacing={12}>
        <VStack spacing={2} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">上班卡</Text>
          <Text font="headline">{state.clockInText}</Text>
        </VStack>
        <VStack spacing={2} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">预计下班</Text>
          <Text font="headline">{state.targetText}</Text>
        </VStack>
        <VStack spacing={2} alignment="leading">
          <Text font="caption2" foregroundStyle="secondaryLabel">累计工时</Text>
          <Text font="headline">{state.workedText}</Text>
        </VStack>
      </HStack>
    </VStack>
  );
}

const builder: LiveActivityUIBuilder<AttendanceActivityState> = (state) => (
  <LiveActivityUI
    content={
      <VStack spacing={8} alignment="leading" activityBackgroundTint={{ light: "clear", dark: "clear" }}>
        <ActivityDetails {...state} />
      </VStack>
    }
    compactLeading={
      <Image systemName="clock.fill" font={13} foregroundStyle={state.phase === "ready" ? "systemRed" : "#7CC7FF"} />
    }
    compactTrailing={
      state.phase === "working"
        ? <TimerIntervalLabel from={state.startedAt} to={state.targetAt} countsDown={true} showsHours={true} font={12} monospacedDigit frame={{ width: 52 }} lineLimit={1} minScaleFactor={0.75} />
        : <Text foregroundStyle={state.phase === "ready" ? "systemRed" : "secondaryLabel"}>{state.phase === "ready" ? (state.missedConfirmed ? "补卡" : "漏卡") : "完成"}</Text>
    }
    minimal={<Image systemName="clock.fill" foregroundStyle={state.phase === "ready" ? "systemRed" : "#7CC7FF"} />}
    keylineTint={state.phase === "ready" ? "systemRed" : "#7CC7FF"}
  >
    <LiveActivityUIExpandedCenter>
      <ActivityDetails {...state} />
    </LiveActivityUIExpandedCenter>
    <LiveActivityUIExpandedBottom>
      <Text font="caption2" foregroundStyle="secondaryLabel">{state.missedConfirmed ? "请按公司流程申请补卡" : "达到目标后请记得完成下班打卡"}</Text>
    </LiveActivityUIExpandedBottom>
  </LiveActivityUI>
);

export const AttendanceCountdownActivity = LiveActivity.register<AttendanceActivityState>(
  "AttendanceCountdown",
  builder
);
