# 考勤助手 · Scripting App 版本（V11）

这是 attendance-helper-ios 的 Scripting App 迁移版。原 Scriptable 版本继续保留在仓库的 `scriptable/` 目录，两者并行维护、数据互不覆盖。

> 当前分支为迁移预览版。代码已按 Scripting 官方 API 拆分并完成静态规则测试；尚未在真实 iPhone / Scripting App 环境完成端到端验证。请先用测试账号验证登录、打卡接口、组件与 Live Activity，再作为日常考勤工具使用。

## 1. 安装与更新

### 推荐：独立 ZIP 预览通道

- 发布页：https://github.com/biannian/attendance-helper-ios/releases/tag/scripting-preview
- 固定 ZIP 下载地址（首次工作流成功发布后生效）：

  `https://github.com/biannian/attendance-helper-ios/releases/download/scripting-preview/AttendanceHelper-Scripting.zip`

1. 从 App Store 安装并打开 Scripting。
2. 选择远程脚本导入，粘贴上述 ZIP 直链（不是 Release 网页）。
3. 如果远程下载受限，尝试在 Safari 下载 ZIP 到「文件」，再从 Scripting 导入本地归档。
4. 打开「考勤助手」，先在「配置」中重新填写账号、密码和设备 ID。
5. 在脚本设置中保留上述固定 ZIP 地址作为远程源，可手动检查更新；如需自动检查，建议每小时一次，并按需打开全局自动应用更新开关。

建议在真机验证完成前关闭自动应用更新，先手动确认预览版变更。iOS 调度不会保证精确的更新时间。

### 备用：GitHub 子目录导入

`https://github.com/biannian/attendance-helper-ios/tree/scripting-migration/scripting`

完整导入目录，不要仅复制入口文件。

### 发布维护

`.github/workflows/scripting-release.yml` 在迁移分支的相关提交后自动执行规则与参数测试、构建并校验 ZIP，再更新独立的 `scripting-preview` 预发布通道。该通道的 tag 是固定渠道标识，不代表最新安装包对应的源码提交；实际提交 SHA 记录于 Release 说明。ZIP 根目录包含 `script.json`、所有运行入口和 core 模块，不包含测试、README、Git 元数据或本机账号文件。新增运行时文件时需同步更新工作流的打包白名单；功能版本更新时同步调整 `script.json` 和 `package.json` 版本。工作流同时生成 SHA-256 校验文件；测试失败不发布。

该流程不修改 Scriptable 发布，也不将预览版设为仓库的 latest release。不要在脚本中写入 GitHub Token、企业账号或密码。

## 2. 与旧版 Scriptable 的数据隔离

Scripting 和 Scriptable 是两个独立 App，系统 Keychain / 本地存储命名空间不同，不能直接读取另一款 App 的钥匙串。

因此第一次迁移需要重新输入：
- 企业账号 / 手机号
- 登录密码
- 设备 ID

新版本将账号、密码、Bearer Token 保存到 Scripting 的 Keychain。考勤快照、年度节假日缓存、核查结果和偏好设置保存在 Scripting 的 Storage。账号、密码、Token 不提交到 GitHub。

更换账号时会清除当前 Token、今日快照和提醒状态；历史与核查记录按账号命名空间隔离。

## 3. 功能结构

- `core/api.js`：登录、AES-256-CBC 密码加密、Bearer Token 更新、团队选择、考勤接口和新设备短信验证。
- `core/rules.js`：打卡解析、9 小时工时、目标时间、今日临时离场过滤、历史考勤状态和请假核算。
- `core/attendance.js`：今日摘要、本机快照、月历补查、节假日缓存、月度平均统计和本机异常核查。
- `core/reminders.js`：离开公司检查、提前下班提醒和定时工时检查。
- `core/live_activity_service.js`：创建、更新和结束考勤 Live Activity。
- `live_activity.tsx`：锁屏与灵动岛 UI。计时由系统时间标签推进，不依赖 JavaScript 每秒轮询。
- `widget.tsx`：小号、中号、大号组件和四种主题。
- `index.tsx`：正常 App 启动入口；`app_view.tsx`：今日、月历、配置和工具管理界面，供 App 和前台 Intent 共用。
- `app_intents.tsx`：组件刷新、提醒安排和工时检查的 App Intents。

## 4. 考勤规则

保留 Scriptable 版本的核心判定：
1. 目标工时为 9 小时，从当天第一张上班卡开始计算。
2. 当天目标时间前的门禁离场刷脸不作为下班卡，倒计时继续。
3. 当天只有目标时间起至当前时刻之间的离场记录才认定为下班卡。
4. 历史日期按接口返回的实际上下班卡计算，不套用当天的临时离场过滤。
5. 无上班卡、无有效下班卡、工时不足和正常状态分别展示。
6. 节假日 / 调休使用 Timor 节假日接口；接口不可用时按周一至周五回退。
7. 请假时长只影响本机应出勤时长与核查展示，不修改企业服务器的原始考勤记录。
8. 人工确认正常、确认异常和恢复原判均只保存在本机，并按账号和日期隔离。

## 5. 灵动岛 / 锁屏实时活动

1. 在 iOS 设置中允许 Scripting 的实时活动；首次启动时如果系统询问，请选择允许。
2. 在考勤助手配置中打开「灵动岛实时倒计时」。
3. 今日同步成功且有有效上班卡时，自动启动 Live Activity。
4. 锁屏与灵动岛使用系统 TimerIntervalLabel 显示目标下班时间倒计时，脚本退出后活动仍可显示。
5. 到达目标时间后显示「已到下班时间」；检测到有效下班卡后结束活动。
6. 如果活动被用户手动关闭，下一次刷新会重新检查并按考勤状态决定是否启动。

注意：Live Activity 的视图是静态快照，系统时间标签负责推进计时；状态文案和实际打卡状态需要在下一次同步后更新。系统不会保证每秒运行脚本，也不应通过每秒网络请求刷新活动。

## 6. 小组件和管理页

- 小号、中号、大号支持 Cyber、Fitness、Minimal、Heatmap 四种布局。
- 不同尺寸可以独立选择主题；主题名称不会显示在组件上。
- 中号显示今日考勤和近 7 天记录；大号热力图展示月历，其他主题展示今日、近期和月度统计。
- 管理页提供今日工时、倒计时、月历、月度统计、异常核查、请假小时数、主题、提醒、账号和预览。
- 组件点击刷新按钮使用 AppIntent，不要求常驻 JavaScript 进程。

## 7. 快捷指令

Scripting 脚本名为 `AttendanceHelper`。可在快捷指令中使用 URL：

```text
scripting://run/AttendanceHelper?action=refresh
```

支持动作：

| 参数 | 功能 |
|---|---|
| `manage` | 打开管理页面 |
| `refresh` | 拉取今日考勤、更新快照和 Live Activity |
| `leave` | 离开公司检查并发送通知 |
| `schedule9` | 按配置安排提前下班提醒 |
| `near9` | 检查是否达到目标工时 |
| `week` | 打开月历页 |
| `account` | 打开账号配置页 |
| `debug` | 返回接口解析和考勤判定信息 |
| `update` | 提示在 Scripting 脚本设置中检查远程源更新 |

自动化仍由 iOS 快捷指令触发。建议沿用早上刷新、工作日定时检查等已有节奏；iOS 不保证精确到分钟执行自动化。

### 快捷指令识别与启动诊断

- 查看管理页：使用 Scripting 的「在 App 中运行脚本」，选择 AttendanceHelper，传入文本 `manage`；`week` 打开月历。
- 自动刷新、离开检查和提醒：使用「运行脚本」后台动作，传入 `refresh`、`leave`、`schedule9`、`near9`，这些动作不会呈现管理界面。
- 如需验证前台 Intent 界面，使用「在 App 中运行脚本」，传入 `diagnostic`。若仍无法显示，检查编辑器日志。
- 也可直接使用快捷指令的「打开 URL」打开 `scripting://run/AttendanceHelper?action=manage`，它走正常 App 入口而非 Intent。

首次导入或更新后，请打开脚本编辑器，点击顶部项目名称，进入 Intent Settings，确认 Text（文本）已勾选。回到快捷指令，添加 Scripting 的 Run Script（运行脚本）动作，再选择 AttendanceHelper / 考勤助手。若列表仍未刷新，重新打开两个 App。不要删除已有脚本或清空钥匙串。

如果运行白屏，可通过 Safari 或快捷指令的打开 URL 动作调用 `scripting://run/AttendanceHelper?diagnostic=ui`，测试基础界面。若仍白屏，请从编辑器运行并查看报错；分享前移除账号、密码、Token 等信息。

### 快捷指令原参数兼容

使用 Scripting 的「运行脚本」动作选择 AttendanceHelper，传入文本 `refresh`、`leave`、`schedule9` 或 `near9`。首次配置建议在 App 内完成；兼容旧四行文本（动作、账号、密码、设备 ID），但不建议将密码长期保存在快捷指令。后台新设备验证须回到 App 前台完成。

### 锁屏组件与刷新策略

增加矩形、圆形、行内锁屏专用布局（具体可选尺寸以 iOS 和 Scripting 支持情况为准）。工作日 08:00–11:00 未打卡时建议每 10 分钟刷新，工作中最多每 30 分钟或到达目标时间刷新，其他时段等待次日 08:00。iOS 可能延后。组件参数 `today` / `stats` 已接入基础布局，仍需真机校验完整视觉差异。

## 8. 本地测试

在仓库根目录运行：

```bash
cd scripting
npm test
```

测试覆盖今日临时离场过滤、目标时间后的有效下班卡、历史工卡、接口下班标记、人工核查和剩余时长格式。

## 9. 当前验证边界

本仓库迁移版不含用户凭据。以下内容必须在真实设备上验证：
- Scripting 当前版本是否接受此脚本包和所有 TSX 组件属性。
- 企业登录、AES 密码加密、新设备滑块与短信验证。
- 考勤接口返回结构与节假日接口。
- Scripting Keychain、Storage 在 App、Widget 和 App Intent 环境的权限表现。
- Live Activity 创建权限、锁屏 / 灵动岛渲染及活动结束。
- iPhone 小号、中号、大号的实际布局和自动刷新策略。

如遇问题，请保留错误信息和 Scripting 版本；不要上传账号密码、Token、短信验证码或包含这些内容的日志。
