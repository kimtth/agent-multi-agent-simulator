import OpenAI from 'openai'
import type { AgentDefinition, LLMProviderName, SimulationPlan, TurnMessage, OrchestrationPattern } from '../types'
import { planningPrompt, turnPrompt, nextAgentPrompt, summaryPrompt, GOAL_COMPLETE_TAG } from './prompts'

const MAX_HISTORY_FOR_PROMPT = 10
const MIN_TURNS_BEFORE_GOAL = 3

// Models (e.g. gpt-5 family / some reasoning variants) that do not allow overriding temperature.
function supportsTemperature(model: string) {
  return !/^gpt-5/i.test(model) // extend with || /o3|o4-mini/ if needed
}

interface BaseArgs { goal: string }
export interface PlanArgs extends BaseArgs { }
export interface TurnArgs extends BaseArgs { history: TurnMessage[]; agent: AgentDefinition; meta?: { maxTurns?: number; turnIndex?: number; fastMode?: boolean } }
export interface NextAgentArgs extends BaseArgs { history: TurnMessage[]; agents: AgentDefinition[]; current: TurnMessage; pattern: OrchestrationPattern }
export interface SummaryArgs extends BaseArgs { history: TurnMessage[] }

function buildClient(provider: LLMProviderName) {
  if (provider === 'azure-openai') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview'
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
    if (!endpoint || !apiKey || !deployment) throw new Error('Azure OpenAI env vars missing (AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT).')
    return new OpenAI({
      apiKey,
      baseURL: `${endpoint}/openai/deployments/${deployment}`,
      defaultHeaders: { 'api-key': apiKey },
      // Ensure api-version is appended correctly to every request (?api-version=...)
      defaultQuery: { 'api-version': apiVersion }
    })
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY missing')
  return new OpenAI({ apiKey: key })
}

// Replace previous chatJSON with provider-aware version
async function chatJSON(
  client: OpenAI,
  provider: LLMProviderName,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
) {
  const isAzure = provider === 'azure-openai'
  const base: any = { messages }
  if (!isAzure) {
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'
    base.model = modelName
    if (supportsTemperature(modelName)) base.temperature = 0.3
  }
  try {
    const res = await client.chat.completions.create(base)
    return res.choices[0].message.content || ''
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (base.temperature !== undefined && /Unsupported value: 'temperature'/i.test(msg)) {
      const fallback = { ...base }
      delete fallback.temperature
      const res = await client.chat.completions.create(fallback)
      return res.choices[0].message.content || ''
    }
    throw err
  }
}

export async function plan({ goal, provider }: PlanArgs & { provider: LLMProviderName }): Promise<SimulationPlan> {
  const client = buildClient(provider)
  const content = await chatJSON(client, provider, [
    { role: 'system', content: 'You design concise multi-agent plans.' },
    { role: 'user', content: planningPrompt(goal) }
  ])
  const match = content.match(/```json\s*([\s\S]*?)```/) || content.match(/({[\s\S]*})/)
  if (!match) throw new Error('No JSON in plan response')
  const json = JSON.parse(match[1] || match[0]) as SimulationPlan
  if (!Array.isArray(json.agents) || json.agents.length === 0) throw new Error('Invalid plan: no agents')
  json.links ||= []
  return json
}

export async function turn({ goal, history, agent, provider, meta }: TurnArgs & { provider: LLMProviderName }): Promise<{ message: string; goalComplete: boolean }> {
  const client = buildClient(provider)
  const content = await chatJSON(client, provider, [
    { role: 'system', content: 'You are a collaborative agent. Remain concise.' },
    { role: 'user', content: turnPrompt(goal, history, agent, MAX_HISTORY_FOR_PROMPT, meta) }
  ])
  let txt = content.trim()
  let goalComplete = false
  if (txt.endsWith(GOAL_COMPLETE_TAG)) { goalComplete = true; txt = txt.slice(0, -GOAL_COMPLETE_TAG.length).trim() }
  if (goalComplete && history.length < MIN_TURNS_BEFORE_GOAL) {
    // Ignore premature completion; treat as normal turn.
    goalComplete = false
  }
  if (txt.startsWith(`${agent.name}:`)) txt = txt.slice(agent.name.length + 1).trim()

  // Suppress fictional tool/service creation sentences
  const toolPattern = /(build|create|develop|implement|spin\s*up|prototype|code|deploy)\s+(a|an|the)?\s*(new\s+)?(tool|script|crawler|service|api|framework|agent|plugin)/i
  if (toolPattern.test(txt)) {
    // Remove sentences that contain the pattern
    txt = txt
      .split(/(?<=[.!?])\s+/)
      .filter(s => !toolPattern.test(s))
      .join(' ')
      .trim()
    if (!txt) {
      txt = 'Converging without proposing new tools; focusing on decisions and actionable alignment.'
    } else {
      txt += ' (Converging without creating new tools.)'
    }
  }

  return { message: txt || '(empty)', goalComplete }
}

export async function pickNext({ goal, history, agents, current, provider, pattern }: NextAgentArgs & { provider: LLMProviderName }) {
  const client = buildClient(provider)
  const content = await chatJSON(client, provider, [
    { role: 'system', content: 'Decide the next agent id only.' },
    { role: 'user', content: nextAgentPrompt(goal, agents, history, current, MAX_HISTORY_FOR_PROMPT, pattern) }
  ])
  const id = parseInt(content.trim(), 10)
  if (isNaN(id) || !agents.find(a => a.id === id)) {
    const currentIndex = agents.findIndex(a => a.name === current.agentName)
    return agents[(currentIndex + 1) % agents.length].id
  }
  return id
}

export async function summarize({ goal, history, provider }: SummaryArgs & { provider: LLMProviderName }): Promise<string> {
  const client = buildClient(provider)
  return chatJSON(client, provider, [
    { role: 'system', content: 'You produce clean Markdown summaries.' },
    { role: 'user', content: summaryPrompt(goal, history) }
  ])
}
