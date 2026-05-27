# MiniMax-M2.7-highspeed Deep Research Agent

A sophisticated research tool powered by **MiniMax-M2.7-highspeed** with interleaved thinking, **Exa** neural search, and multi-agent orchestration.

## Features

- **MiniMax-M2.7-highspeed Supervisor**: Uses interleaved thinking to maintain reasoning state across multi-step research
- **Intelligent Planning**: Automatically decomposes research queries into optimized subqueries
- **Neural Web Search**: Leverages Exa API for high-quality, AI-powered web search
- **Comprehensive Reports**: Generates detailed research reports with citations and analysis
- **CLI Interface**: Simple command-line interface with interactive and single-query modes

## Architecture

```
+-----------------------------------------------+
|            Supervisor Agent                   |
|  (MiniMax-M2.7-highspeed + Interleaved Think) |
+-----------------------------------------------+
                      |
       +--------------+--------------+
       |              |              |
       v              v              v
+------------+ +-------------+ +-----------+
|  Planning  | | Web Search  | | Synthesis |
|   Agent    | |  Retriever  | |  (M2.7-hs)|
| (M2.7-hs)  | | (M2.7-hs)   | |           |
+------------+ +-------------+ +-----------+
                      |
                      v
               +------------+
               |  Exa API   |
               +------------+
```

### Agent Descriptions

| Agent | Model | Role |
|-------|-------|------|
| **Supervisor** | MiniMax-M2.7-highspeed | Coordinates workflow, synthesizes final report |
| **Planning** | MiniMax-M2.7-highspeed | Generates optimized subqueries |
| **Web Search** | MiniMax-M2.7-highspeed + Exa | Executes searches, organizes findings |

---

## Quick Start

```bash
# Install (downloads pre-compiled binary for your platform)
bash .claude/plugins/m2-brainstorm/install.sh

# Configure API keys
cp .env.example .env
# Edit .env with your keys

# Run
"$HOME/.config/m2-brainstorm/bin/m2-research" -q "Your research query here"
```

---

## Installation

### Prerequisites

- API keys for:
  - Minimax (M2.7-highspeed model)
  - Exa (web search)
- For pre-compiled binaries: no other dependencies.
- For the `deno run` source fallback (unsupported platforms): [Deno](https://deno.land) 1.x on PATH.

### Setup

1. **Install binaries** (auto-detects platform — Linux x64/arm64, macOS x64/arm64, Windows x64):

```bash
bash .claude/plugins/m2-brainstorm/install.sh
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .claude\plugins\m2-brainstorm\install.ps1
```

The script downloads pre-compiled binaries for your target triple and installs them to `~/.config/m2-brainstorm/bin/`. If your platform isn't in the matrix, it falls back to a `deno run` wrapper against the bundled source.

2. **Configure environment variables**:
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```
MINIMAX_API_KEY=your_minimax_api_key_here
EXA_API_KEY=your_exa_api_key_here
```

---

## Usage

### Interactive Mode

```bash
m2-research
```

Then enter your research queries at the prompt.

### Single Query Mode

```bash
m2-research -q "What are the latest developments in quantum computing?"
```

### Save Report to File

```bash
m2-research -q "AI trends in 2025" --save
```

### Verbose Mode

```bash
m2-research -q "Climate change solutions" --verbose
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-q, --query` | Research query (skips interactive mode) |
| `-s, --save` | Save report to `reports/` folder |
| `-v, --verbose` | Show detailed progress and thinking blocks |

### Interactive Commands

| Command | Description |
|---------|-------------|
| `/save <query>` | Save the report to a file |
| `/verbose <query>` | Show detailed progress |
| `/help` | Show help message |
| `exit`, `quit`, `q` | Exit the program |

---

## How It Works

### 1. Query Planning

The **Planning Agent** decomposes your query into 3-5 optimized subqueries:

```json
{
  "subqueries": [
    {"query": "quantum computing breakthroughs 2025", "type": "news", "priority": 1},
    {"query": "quantum computing applications cryptography", "type": "auto", "priority": 2}
  ]
}
```

### 2. Web Search

The **Web Search Retriever** executes each subquery using Exa:
- Performs neural search for each subquery
- Finds similar content for high-priority results
- Extracts highlights and key information

### 3. Synthesis

The **Supervisor Agent** (MiniMax-M2.7-highspeed):
- Maintains reasoning state via interleaved thinking
- Synthesizes comprehensive report with:
  - Table of contents
  - Key takeaways
  - Executive summary
  - Detailed analysis
  - Cited sources

### 4. Interleaved Thinking

The key innovation: the supervisor preserves ALL content blocks (thinking + text + tool_use) in conversation history. This maintains the reasoning chain across multiple turns for more coherent reports.

---

## Project Structure

```
m2-deep-research/
├── brainstorm.ts              # Brainstorm CLI entry
├── research.ts                # Research CLI entry
├── deno.json                  # Tasks + imports + compiler options
├── .env.example               # Environment template
└── src/
    ├── agents/
    │   ├── supervisor.ts           # Interleaved-thinking agent runner
    │   ├── planning_agent.ts       # Query planning
    │   └── web_search_retriever.ts # Exa search + LLM synthesis
    ├── brainstorm/
    │   ├── cli.ts                  # Brainstorm argparse + main()
    │   ├── dialogue.ts             # Two-persona dialogue + critic integration
    │   ├── critic.ts               # Critic voice (steelman + argdown)
    │   └── argdown_client.ts       # LightweightArgdownClient + DenoArgdownClient
    ├── tools/
    │   └── exa_tool.ts             # Exa API wrapper
    └── utils/
        └── config.ts               # Configuration
```

---

## API Keys

### Getting API Keys

| Service | URL | Purpose |
|---------|-----|---------|
| MiniMax | [platform.minimax.io](https://platform.minimax.io) | All agent reasoning (M2.7-highspeed) |
| Exa | [exa.ai](https://exa.ai) | Neural web search |

---

## Examples

### Technology Research
```bash
m2-research -q "What are the latest breakthroughs in artificial general intelligence?"
```

### Business Intelligence
```bash
m2-research -q "What are the emerging trends in electric vehicle adoption?" --save
```

### Scientific Research
```bash
m2-research -q "What are the most promising approaches to carbon capture technology?" --verbose
```

---

## Customization

### Adjust Report Style
Edit the supervisor's system prompt in `research.ts`.

### Modify Search Parameters
Edit `src/agents/web_search_retriever.ts`:
- `numResults`: Results per query (priority-tiered: 20 for priority ≤ 2, else 15)
- Time-period date filters
- Content type (`news`, `research`, `auto`, `keyword`)

### Rebuild from Source
Use the Deno tasks defined in `deno.json`:

```bash
deno task test               # Run the full test suite
deno task compile:brainstorm # Compile a portable binary
deno task compile:research   # Compile the research CLI
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Missing API keys | Ensure `.env` exists and has all keys set |
| API errors | Verify keys are valid, check rate limits |
| `command not found` | Add `~/.config/m2-brainstorm/bin` to your `PATH`, or call the binary by its full path |
| Source-fallback install fails | Ensure [Deno](https://deno.land) 1.x is on `PATH` |

---

## Performance

- Average query time: **30-60 seconds**
- Factors: number of subqueries (3-5), search complexity, LLM response times

---

## License

MIT License

---

## Acknowledgments

Built with:
- [MiniMax-M2.7-highspeed](https://www.minimax.io/) - Advanced reasoning model
- [Exa](https://exa.ai/) - Neural web search
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) - API client
- [Deno](https://deno.land) - TypeScript runtime + `deno compile` for portable binaries
- [Argdown](https://argdown.org) - Argumentation framework (critic voice)
