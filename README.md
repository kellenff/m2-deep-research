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
# Clone and setup
cd deep-research-agent
uv sync

# Configure API keys
cp .env.example .env
# Edit .env with your keys

# Run
uv run python main.py -q "Your research query here"
```

---

## Installation

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv) package manager
- API keys for:
  - Minimax (M2.7-highspeed model)
  - Exa (web search)

### Setup

1. **Install dependencies**:
```bash
cd deep-research-agent
uv sync
```

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
uv run python main.py
```

Then enter your research queries at the prompt.

### Single Query Mode

```bash
uv run python main.py -q "What are the latest developments in quantum computing?"
```

### Save Report to File

```bash
uv run python main.py -q "AI trends in 2025" --save
```

### Verbose Mode

```bash
uv run python main.py -q "Climate change solutions" --verbose
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
deep-research-agent/
├── main.py                    # CLI entry point
├── .env.example               # Environment template
├── pyproject.toml             # Dependencies
└── src/
    ├── agents/
    │   ├── supervisor.py           # MiniMax-M2.7-highspeed supervisor
    │   ├── planning_agent.py       # Query planning
    │   └── web_search_retriever.py # Exa search integration
    ├── tools/
    │   └── exa_tool.py             # Exa API wrapper
    └── utils/
        └── config.py               # Configuration
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
uv run python main.py -q "What are the latest breakthroughs in artificial general intelligence?"
```

### Business Intelligence
```bash
uv run python main.py -q "What are the emerging trends in electric vehicle adoption?" --save
```

### Scientific Research
```bash
uv run python main.py -q "What are the most promising approaches to carbon capture technology?" --verbose
```

---

## Customization

### Adjust Report Style
Edit system prompt in `src/agents/supervisor.py`

### Modify Search Parameters
Edit `src/agents/web_search_retriever.py`:
- `num_results`: Results per query (default: 5-10)
- `time_period`: Date filtering
- `content_type`: Filter by type (news, research, blog)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Missing API keys | Ensure `.env` exists and has all keys set |
| API errors | Verify keys are valid, check rate limits |
| Import errors | Run `uv sync` and use `uv run python main.py` |

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
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-python) - API client
