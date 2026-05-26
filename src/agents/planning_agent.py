"""Planning Agent for generating Exa-optimized research subqueries."""

import json
import anthropic
from typing import Dict, Any, List
from src.utils.config import Config


class PlanningAgent:
    """
    Agent that decomposes research queries into Exa-optimized subqueries.
    Uses MiniMax-M2.7-highspeed via the Anthropic-compatible endpoint.
    """

    def __init__(self):
        """Initialize Planning Agent."""
        self.client = anthropic.Anthropic(
            api_key=Config.MINIMAX_API_KEY,
            base_url=Config.MINIMAX_BASE_URL,
        )
        self.model = Config.MINIMAX_MODEL

        self.system_prompt = """Generate 8-12 comprehensive Exa-optimized subqueries for deep research on the topic.

For thorough coverage, create subqueries across multiple dimensions:
- Core concepts and definitions
- Latest developments and breakthroughs (recent news)
- Historical context and evolution
- Technical implementations and applications
- Expert opinions and analysis
- Academic research and papers
- Industry trends and market analysis
- Future implications and predictions
- Challenges and limitations
- Related technologies and comparisons

Consider the following when creating subqueries:
- Neural search formulation: Use natural language questions and descriptive phrases
- Domain filters: Suggest specific domains when relevant (e.g., arxiv.org for papers, news sites)
- Time periods: Specify time relevance (recent, past_week, past_month, past_year, any)
- Content types: Specify type when relevant (news, research paper, pdf, blog, etc.)
- Priority: Assign priority 1-5 (1=highest priority)

Each subquery should focus on a different aspect of the research topic to ensure comprehensive, multi-dimensional coverage.

Output valid JSON in this exact format:
{
  "subqueries": [
    {
      "query": "descriptive natural language query",
      "type": "auto|news|research paper|pdf|etc",
      "time_period": "recent|past_week|past_month|past_year|any",
      "include_domains": ["example.com"],
      "exclude_domains": ["example.org"],
      "priority": 1
    }
  ]
}

Notes:
- include_domains and exclude_domains are optional (can be null or omitted)
- type should be "auto" unless you have specific content type needs
- Ensure queries are diverse and cover different angles of the topic"""

    def plan(self, research_query: str) -> Dict[str, Any]:
        """
        Generate Exa-optimized subqueries for a research topic.

        Args:
            research_query: The main research question or topic

        Returns:
            Dictionary containing subqueries with optimization parameters
        """
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=3000,
                temperature=0.7,
                system=self.system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": f"Research topic: {research_query}\n\nGenerate Exa-optimized subqueries for comprehensive research on this topic.",
                    },
                ],
            )

            content = "".join(
                block.text for block in response.content
                if hasattr(block, "type") and block.type == "text"
            )

            # Strip markdown code fences if the model wrapped JSON in them
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()

            subqueries_data = json.loads(content)

            return {
                "status": "success",
                "subqueries": subqueries_data.get("subqueries", []),
                "research_query": research_query,
            }

        except json.JSONDecodeError as e:
            return {
                "status": "error",
                "error": f"JSON parsing error: {str(e)}",
                "subqueries": [],
            }
        except anthropic.APIError as e:
            return {
                "status": "error",
                "error": f"API error: {str(e)}",
                "subqueries": [],
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"Unexpected error: {str(e)}",
                "subqueries": [],
            }

    def execute(self, query: str) -> str:
        """
        Execute planning and return formatted results as a string.
        This method is called by the supervisor via tool execution.

        Args:
            query: Research query to plan for

        Returns:
            JSON string containing the planning results
        """
        result = self.plan(query)
        return json.dumps(result, indent=2)