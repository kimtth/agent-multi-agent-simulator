import type { AgentDefinition } from '../types'
import type { TurnMessage } from '../types'

export const GOAL_COMPLETE_TAG = '[GOAL_COMPLETE]'

export function planningPrompt(goal: string) {
  return `Goal: "${goal}".
Design a concise set of 4-10 collaborating discussion agents ONLY.
Return ONLY valid JSON:
{ "agents": [ { "id": 1, "name": "...", "role": "...", "tools": [], "knowledge": [] }, ... ],
  "links": [ { "source": 1, "target": 2 } ] }
Rules:
- Do NOT invent or reference any real or fictional external tools, APIs, services, scripts, crawlers, frameworks.
- tools and knowledge arrays must be empty ([]); they are placeholders only.
- Every agent must have at least one link (undirected semantics).
- Keep names short and roles distinct.
JSON only.`
}

export function turnPrompt(
  goal: string,
  history: TurnMessage[],
  agent: AgentDefinition,
  maxHistory: number,
  meta?: { maxTurns?: number; turnIndex?: number; fastMode?: boolean }
) {
  const last = history.slice(-maxHistory).map(h => `${h.agentName}: ${h.message}`).join('\n') || '(None)'
  const { maxTurns, turnIndex = history.length, fastMode } = meta || {}
  let convergence = ''
  if (maxTurns && maxTurns > 0) {
    const ratio = (turnIndex + 1) / maxTurns
    if (ratio >= 0.9) convergence = 'Hard converge NOW. Provide final decisions and prepare for completion.'
    else if (ratio >= 0.7) convergence = 'Begin converging. Reduce exploration; consolidate decisions.'
    else if (ratio >= 0.5) convergence = 'Midpoint: shift toward synthesis, avoid repeating points.'
  }
  const speed = fastMode ? 'Ultra concise (<=50 words).' : 'Concise (<=110 words).'
  return `Goal: "${goal}"
You are Agent ${agent.id}: ${agent.name} (${agent.role}).

Strict rules:
- DO NOT propose building, creating, coding, implementing, spinning up, or deploying ANY tool, script, crawler, API, service, framework, agent, plugin, or automation.
- NO fictional tooling. Operate ONLY via reasoning and dialogue.
- If you feel a tool would help, instead summarize current status or outline clear next decisions.
- Avoid repetition. Advance convergence.
${convergence}
${speed}

History (last ${maxHistory}):
${last}

When (and only when) the goal is genuinely satisfied, append ${GOAL_COMPLETE_TAG} at the END (after at least 3 total turns).
Response (no prefacing with your name):`
}

export function nextAgentPrompt(goal: string, agents: AgentDefinition[], history: TurnMessage[], current: TurnMessage, maxHistory: number) {
  const agentList = agents.map(a => `- ID: ${a.id}, Name: ${a.name}, Role: ${a.role}`).join('\n')
  const last = history.slice(-maxHistory).map(h => `${h.agentName}: ${h.message}`).join('\n')
  return `Goal: "${goal}"\nAgents:\n${agentList}\nHistory (last ${maxHistory}):\n${last}\nLatest: "${current.agentName}: ${current.message}"\nWhich agent ID should speak next? Respond ONLY with the numerical ID.`
}

export function summaryPrompt(goal: string, history: TurnMessage[]) {
  const lines = history.map(h => `${h.agentName}: ${h.message}`).join('\n')
  return `Goal: "${goal}"\nHistory:\n${lines}\n\nProvide a comprehensive Markdown summary (key points, decisions, outcome).`
}
