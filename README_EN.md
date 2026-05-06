# Clinical Pathway Violation Drill Game

A repeatable tabletop drill game where clinical pathway deviations are designed as playable scenarios. Doctors draw cards to determine patient condition progression, make guideline-compliant decisions within limited steps, and systematically review afterward.

## Features

- **Clinical Pathway Decision Tree Parser**: Parses JSON-format clinical pathways, supports eligibility node validation and decision graph construction
- **Game Engine**: Complete state machine supporting start/select/submit/timeout/review, level generation and timer
- **Scoring & Review**: Composite scoring based on correctness, time, and difficulty; generates Markdown review reports
- **Multi-platform**: CLI interactive interface + REST API + Web UI
- **Leaderboard**: Rankings by total score, win rate, and monthly points
- **Real-time Battle**: WebSocket real-time timer push, supports multi-player sync
- **Data Persistence**: SQLite local storage, supports CSV/JSON export

## Quick Start

```bash
# Install dependencies
npm install

# Seed sample data (create 3 example players and 10 historical games)
npm run seed

# Start CLI (interactive command-line game)
npm start

# Or start API server (supports both REST API and WebSocket)
npm run api

# Access Web UI (after API server starts)
# Open http://localhost:3000 in browser
```

## CLI Commands

| Command | Description |
|------|------|
| `npm start` | Start CLI interactive interface |
| `npm start list` | List all available clinical pathways |
| `npm start info <pathId>` | Show details of specified pathway (node count, difficulty, eligibility criteria) |
| `npm start start <pathId>` | Start new game |
| `npm start choice <attemptId> <choiceId>` | Submit choice |
| `npm start score <attemptId>` | Show historical scores |
| `npm start replay <attemptId>` | Replay historical game review |
| `npm start leaderboard` | View score leaderboard |
| `npm start export-history` | Export historical records (CSV/JSON) |

Use `--player <id>` to specify player ID, e.g.: `npm start start acute_appendicitis --player zhang_san`

## API Endpoints

| Endpoint | Method | Description |
|------|------|------|
| `/paths` | GET | Get all available clinical pathways |
| `/games` | POST | Create new game (body: `{pathId, playerId}`) |
| `/games/:id` | GET | Get current game state |
| `/games/:id/choice` | POST | Submit choice (body: `{choiceId}`) |
| `/games/:id/replay` | GET | Get review report |
| `/leaderboard` | GET | Get full score leaderboard |
| `/leaderboard/monthly` | GET | Get monthly score leaderboard (?year=2026&month=5) |
| `/leaderboard/winrate` | GET | Get win rate leaderboard |
| `/ws` | WebSocket | Real-time timer push |

## Tech Stack

Node.js / TypeScript + SQLite + Express + WebSocket

## Project Structure

```
clinical-pathway-drill-game/
├── bin/              # CLI entry point (commander command parsing)
├── src/
│   ├── api/          # REST API server + WebSocket manager
│   ├── core/         # Core engine
│   │   ├── parser.ts         # Clinical pathway decision tree parser
│   │   ├── game-engine.ts    # Game engine state machine
│   │   ├── scenario-generator.ts  # Level generator
│   │   ├── scoring.ts       # Scoring and review engine
│   │   └── leaderboard.ts   # Leaderboard engine
│   ├── db/           # Database schema, initialization, data access
│   └── web/          # Web UI single-page application
├── data/
│   ├── pathways/     # Clinical pathway JSON data
│   └── seed.sql      # Sample data SQL
└── __tests__/        # Unit tests + integration tests
```

## Game Rules

A clinical pathway is an evidence-based care plan. This game simulates doctors making guideline-compliant decisions under uncertainty about patient condition progression.

**Eligibility Criteria vs Treatment Recommendations**:
- **Eligibility Criteria**: Conditions that must be met before a patient enters the pathway, used to determine if the patient meets enrollment criteria
- **Treatment Recommendations**: Recommended decision points in the pathway, optimal choices based on the patient's current state

**Core Concepts**:
- **Eligibility Node**: Shows whether the patient meets pathway enrollment conditions; wrong choices lead to patient non-enrollment
- **Decision Node**: Moments requiring doctor decision-making; each choice can be correct or incorrect
- **Correct Option**: Treatment decision that complies with clinical guidelines
- **Time Bonus**: Faster decisions earn extra points
- **Difficulty Levels**: easy (60s), medium (45s), hard (30s)

**Game Flow**:
1. Select a clinical pathway (e.g., acute appendicitis, community-acquired pneumonia, acute ST-segment elevation myocardial infarction)
2. Read patient chief complaint and test results
3. Make treatment decisions within the time limit
4. System calculates score and generates review report
5. View leaderboard to compare historical scores

## Screenshots

<!-- CLI Interface -->
![CLI List](screenshots/cli-list.png)

<!-- Web UI Game Interface -->
![Web UI](screenshots/web-game.png)

<!-- Review Report -->
![Replay](screenshots/replay.png)

---

## Support the Author

If you find this project helpful, feel free to buy me a coffee! ☕

![Buy Me a Coffee](buymeacoffee.png)

**Buy me a coffee (crypto)**

| Chain | Address |
|-------|---------|
| BTC | `bc1qc0f5tv577z7yt59tw8sqaq3tey98xehy32frzd` |
| ETH / USDT | `0x3b7b6c47491e4778157f0756102f134d05070704` |
| SOL | `6Xuk373zc6x6XWcAAuqvbWW92zabJdCmN3CSwpsVM6sd` |
