export interface AgentDefinition {
  id: number
  name: string
  role: string
  tools: string[]
  knowledge: string[]
}

export interface SimulationPlan {
  agents: AgentDefinition[]
  links: { source: number; target: number }[]
}

export interface TurnMessage {
  agentName: string
  message: string
  timestamp?: string // ISO timestamp (optional for backward compatibility)
}

export interface TurnRequestBody {
  goal: string
  history: TurnMessage[]
  agent: AgentDefinition
  provider?: LLMProviderName
  meta?: { maxTurns?: number; turnIndex?: number; fastMode?: boolean; pattern?: OrchestrationPattern }
}

export interface SavedSimulation {
  version: 1
  timestamp: string
  goal: string
  provider: LLMProviderName
  plan: SimulationPlan | null
  history: TurnMessage[]
  currentAgentId: number | null
  turn: number
  summary?: string | null
  maxTurns: number
  fastMode: boolean
  pattern: OrchestrationPattern
  allowFictitiousTools: boolean // whether planning can generate fictional tools
  usage?: { tokens: number; cost: number } // optional usage snapshot
}

export type LLMProviderName = 'openai' | 'azure-openai'
export type OrchestrationPattern = 'sequential' | 'concurrent' | 'group-chat' | 'handoff' | 'magentic'
