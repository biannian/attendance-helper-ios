# attendance-helper-ios

Scriptable 今日打卡小组件 + 快捷指令提醒（`scriptable/AttendanceHelper.js`）。

## 模式

| 参数 | 说明 |
|------|------|
| `widget` | 桌面小组件 / 预览 |
| `leave` | 离开公司：按工时判定考勤是否正常，并识别是否漏打下班卡 |
| `schedule9` | 工作日预约快满 9 小时提醒 |
| `near9` | 定时检查快满 / 已满，已满时同步判定下班卡 |
| `debug` | 查看解析结果与考勤判定 |

## 考勤判定规则

1. **未打上班卡** → 异常  
2. **工时未满 9 小时** → 考勤异常（工时不足）  
3. **工时已满且无离场记录** → 漏打下班卡  
4. **工时已满、离场记录超过 `OUT_FRESH_MINUTES`（默认 20 分钟）** → 疑似漏打下班卡（可能是临时离场）  
5. **工时已满且有新鲜离场、离场时工时已满** → 考勤正常  

可在 `CONFIG.OUT_FRESH_MINUTES` / `CONFIG.TARGET_HOURS` 调整阈值。
