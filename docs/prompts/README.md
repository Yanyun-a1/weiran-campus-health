# AI 对话历史 Prompt 快照总览

> 赛项 2.1 要求「须包含至少 3 个核心功能迭代时与 AI 交互的完整 Prompt 链（包含你的 Prompt 提问、AI 的修改建议、以及你如何引导 AI 修复 Bug 的过程）」。
> 本目录提供 **5 条**完整链条，均从真实会话记录导出，未加工、未补写。

## 快照清单与 commit 映射

| 轮次 | commit | 主题 | 快照文件 | 链条类型 |
|---|---|---|---|---|
| v6 | `c319ef8` | 小球被拉成椭圆 → 废掉 CSS 3D、改为 JS 逐帧投影 | [chain-01-orbit-projection.md](chain-01-orbit-projection.md) | 缺陷根因诊断与架构重构 |
| v14 | `096cd72` | 桌面左右分屏 + 手机底部抽屉，且核心算法零改动 | [chain-02-split-drawer.md](chain-02-split-drawer.md) | 上下文管理与「不可改」约束 |
| v15 | `467ad9f` | 气泡排版改完仍显示旧样式 → 定位为线上版本与缓存 | [chain-03-bubble-cache.md](chain-03-bubble-cache.md) | 用户反馈 → AI 诊断 → 修复闭环 |
| v23 | `c15ae64` | 预约改真实时间驱动 → AI 主动捕获空指针与文案重复 | [chain-04-realtime-booking.md](chain-04-realtime-booking.md) | 测试暴露真缺陷、拒绝放宽断言 |
| v28 | `6b11cef` | 17 条验收标准 → 几何探针先行 → 本地/线上各 50/50 | [chain-05-v28-geometry.md](chain-05-v28-geometry.md) | 四段式 Prompt、探针先测后定断言、双环境复跑 |

## 证据结构

每份快照固定五段：① 用户原始 Prompt 逐字全文 → ② AI 文本回复原文（按时间顺序）→ ③ 缺陷背景与人的引导动作 → ④ 落地产物与验收实测 → ⑤ 复现命令。

原始消息级摘录见 `raw-excerpt.jsonl`（每行一个 JSON：chain / role / ts / time / text），仅含 user 与 assistant 文本消息，已剥离宿主注入的上下文块，并经密钥与口令正则自检。

## 失败分类机制（为什么「修断言」不等于「改代码」）

| 失败类型 | 实例 | 处理方式 |
|---|---|---|
| 断言写错 | v21 的 26/27：脚本把 `isClear` 读成 `color`，采集写的是 `bg` | 只修断言，产品代码不动 |
| 断言写错 | v26：↑ 作为 flex 子项 computed 为 `block` 而非 `inline-block` | 放宽断言并补真实 transform 采样 |
| 代码真缺陷 | v23：`updateStatus()` 因 `#modeHint` 已移除而抛空指针 | 补空守卫，改产品代码 |
| 代码真缺陷 | v27：抽屉收起 320ms 过渡期间 `place()` 误判球壳 rect，文案未恢复 | CSS 即时显隐 + 380ms 延时重算 |
| 环境差异 | 线上分享链接会话校验导致静态资源 403；URL 参数被抹除致冻结时钟失效 | 带会话复核 / 改写 sessionStorage 钩子 |

## 历史口径声明

仓库**版本演进链的 27 个 commit** 系**依据逐轮真实留存的验收脚本、日志、截图、版本说明与一手工作日志重建**（另 1 个为省赛材料补录 commit），提交日期取自各轮验收脚本的真实文件时间，**不是开发当时逐次实时产生的提交**，未伪造时间戳。v3–v10 有完整代码快照；v11–v27 当时未留存完整快照，聚合文件在 v28 统一落地，未编造中间态代码。详见 `README.md` 与 `SUBMISSION.md`。
