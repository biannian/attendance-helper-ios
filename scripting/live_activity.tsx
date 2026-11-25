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
        <Image systemName="clock.fill" foregroundStyle="#7CC7FF" />
        <Text font="caption" foregroundStyle="secondaryLabel">考勤助手 · {state.statusText}</Text>
      </HStack>
      {state.phase === "working"
        ? <TimerIntervalLabel
            from={state.startedAt}
            to={state.targetAt}
            countsDown={true}
            showsHours={true}
          />
        : <Text font="title2" foregroundStyle={state.phase === "ready" ? "systemGreen" : "secondaryLabel"}>
            {state.phase === "ready" ? "已到下班时间" : "今日考勤已结束"}
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
      <HStack spacing={4}>
        <Image systemName="clock.fill" foregroundStyle="#7CC7FF" />
        <Text>考勤</Text>
      </HStack>
    }
    compactTrailing={
      state.phase === "working"
        ? <TimerIntervalLabel from={state.startedAt} to={state.targetAt} countsDown={true} showsHours={true} />
        : <Text>{state.phase === "ready" ? "可下班" : "完成"}</Text>
    }
    minimal={<Image systemName="clock.fill" foregroundStyle="#7CC7FF" />}
    keylineTint="#7CC7FF"
  >
    <LiveActivityUIExpandedCenter>
      <ActivityDetails {...state} />
    </LiveActivityUIExpandedCenter>
    <LiveActivityUIExpandedBottom>
      <Text font="caption2" foregroundStyle="secondaryLabel">达到目标后请记得完成下班打卡</Text>
    </LiveActivityUIExpandedBottom>
  </LiveActivityUI>
);

export const AttendanceCountdownActivity = LiveActivity.register<AttendanceActivityState>(
  "AttendanceCountdown",
  builder
);
