# 临床路径违规闯关游戏

将临床路径偏离场景设计为可重复桌面推演游戏，医生抽牌决定患者病情演变，在限定步骤内做出符合指南的决策，事后系统化复盘。

## 功能特性

- **临床路径决策树解析器**：解析 JSON 格式的临床路径，支持准入条件节点验证和决策图构建
- **游戏引擎**：支持开始/选择/提交/超时/复盘的完整状态机，关卡生成与计时
- **评分与复盘**：综合正确性、时间、难度计算积分，生成 Markdown 复盘报告
- **多端支持**：CLI 交互界面 + REST API + Web UI
- **排行榜**：按总分、胜率、月度积分排名
- **实时对战**：WebSocket 实时推送计时器，支持多玩家同步
- **数据持久化**：SQLite 本地存储，支持 CSV/JSON 导出

## 快速开始

```bash
# 安装依赖
npm install

# 填充示例数据（创建3个示例玩家和10条历史对局）
npm run seed

# 启动 CLI（交互式命令行游戏）
npm start

# 或启动 API 服务器（同时支持 REST API 和 WebSocket）
npm run api

# 访问 Web UI（API 服务器启动后）
# 浏览器打开 http://localhost:3000
```

## CLI 命令说明

| 命令 | 说明 |
|------|------|
| `npm start` | 启动 CLI 交互界面 |
| `npm start list` | 列出所有可用临床路径 |
| `npm start info <pathId>` | 显示指定路径详情（节点数、难度、准入条件） |
| `npm start start <pathId>` | 开始新对局 |
| `npm start choice <attemptId> <choiceId>` | 提交选择 |
| `npm start score <attemptId>` | 显示历史积分 |
| `npm start replay <attemptId>` | 回放历史对局复盘 |
| `npm start leaderboard` | 查看积分排行 |
| `npm start export-history` | 导出历史记录（CSV/JSON） |

使用 `--player <id>` 参数指定玩家ID，例如：`npm start start acute_appendicitis --player zhang_san`

## API 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/paths` | GET | 获取所有可用临床路径 |
| `/games` | POST | 创建新对局（body: `{pathId, playerId}`） |
| `/games/:id` | GET | 获取对局当前状态 |
| `/games/:id/choice` | POST | 提交选择（body: `{choiceId}`） |
| `/games/:id/replay` | GET | 获取复盘报告 |
| `/leaderboard` | GET | 获取全量积分排行 |
| `/leaderboard/monthly` | GET | 获取月度积分排行（?year=2026&month=5） |
| `/leaderboard/winrate` | GET | 获取胜率排行 |
| `/ws` | WebSocket | 实时计时器推送 |

## 技术栈

Node.js / TypeScript + SQLite + Express + WebSocket

## 项目结构

```
clinical-pathway-drill-game/
├── bin/              # CLI 入口（commander 命令解析）
├── src/
│   ├── api/          # REST API server + WebSocket manager
│   ├── core/         # 核心引擎
│   │   ├── parser.ts         # 临床路径决策树解析器
│   │   ├── game-engine.ts    # 游戏引擎状态机
│   │   ├── scenario-generator.ts  # 关卡生成器
│   │   ├── scoring.ts       # 评分与复盘引擎
│   │   └── leaderboard.ts   # 排行榜引擎
│   ├── db/           # 数据库 Schema、初始化、数据访问
│   └── web/          # Web UI 单页面应用
├── data/
│   ├── pathways/     # 临床路径 JSON 数据
│   └── seed.sql      # 示例数据 SQL
└── __tests__/        # 单元测试 + 集成测试
```

## 游戏规则

临床路径是一种基于证据的诊疗计划，本游戏模拟医生在不确定患者病情演变的情况下做出符合指南的决策。

**准入条件 vs 诊疗建议**：
- **准入条件**：患者进入路径前必须满足的条件，用于判断患者是否符合入组标准
- **诊疗建议**：路径中的推荐决策点，基于患者当前状态的最优选择

**核心概念**：
- **准入条件节点**：展示患者是否符合路径入组条件，错误选择会导致患者无法入组
- **决策节点**：需要医生做出选择的时刻，每个选择有正确/错误之分
- **正确选项**：符合临床指南的诊疗决策
- **时间奖励**：快速决策可获得额外积分
- **难度等级**：easy（60秒）、medium（45秒）、hard（30秒）

**游戏流程**：
1. 选择临床路径（如急性阑尾炎、社区获得性肺炎、急性ST段抬高心肌梗死）
2. 阅读患者主诉和检验结果
3. 在限定时间内做出诊疗决策
4. 系统计算积分并生成复盘报告
5. 可查看排行榜对比历史成绩

## 截图预览

<!-- CLI 交互界面 -->
![CLI 列表](screenshots/cli-list.png)

<!-- Web UI 游戏界面 -->
![Web UI](screenshots/web-game.png)

<!-- 复盘报告 -->
![复盘](screenshots/replay.png)

---

## 支持作者

如果您觉得这个项目对您有帮助，欢迎打赏支持！
Wechat:gdgdmp
![Buy Me a Coffee](buymeacoffee.png)

**Buy me a coffee (crypto)**

| 币种 | 地址 |
|------|------|
| BTC | `bc1qc0f5tv577z7yt59tw8sqaq3tey98xehy32frzd` |
| ETH / USDT | `0x3b7b6c47491e4778157f0756102f134d05070704` |
| SOL | `6Xuk373zc6x6XWcAAuqvbWW92zabJdCmN3CSwpsVM6sd` |