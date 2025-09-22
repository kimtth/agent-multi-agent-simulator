"use client"
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { AgentGraph } from '@/components/AgentGraph'
import type { SimulationPlan, TurnMessage, SavedSimulation } from '@/lib/types'
import { BrainCircuit, Wand2 } from 'lucide-react'
import { InformationCircleIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'

type SimState = 'Idle' | 'Planning' | 'Running' | 'SelectingNext' | 'Summarizing' | 'Finished' | 'Error'
type OrchestrationPattern = 'sequential' | 'concurrent' | 'group-chat' | 'handoff' | 'magentic'

export default function Page() {
  const [goal, setGoal] = useState('Analyze the economic impact of Donald Trump’s tariffs on Japan.')
  const [provider, setProvider] = useState<'openai' | 'azure-openai'>('azure-openai')
  const [plan, setPlan] = useState<SimulationPlan | null>(null)
  const [state, setState] = useState<SimState>('Idle')
  const [history, setHistory] = useState<TurnMessage[]>([])
  const [currentAgentId, setCurrentAgentId] = useState<number | null>(null)
  const [currentMessage, setCurrentMessage] = useState('')
  const [turn, setTurn] = useState(0)
  const [summary, setSummary] = useState<string | null>(null)
  const [fastMode, setFastMode] = useState(true)
  const [maxTurns, setMaxTurns] = useState(20)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [showSummaryDialog, setShowSummaryDialog] = useState(false)
  const [showCurrentDialog, setShowCurrentDialog] = useState(false) // dialog for current message
  const [pattern, setPattern] = useState<OrchestrationPattern>('group-chat')
  const [allowFictitiousTools, setAllowFictitiousTools] = useState(false) // NEW
  const [usage, setUsage] = useState<{ tokens: number; cost: number } | null>(null) // NEW approximate usage
  const stopRef = useRef(false)
  const turnAbortController = useRef<AbortController | null>(null)
  const summaryInProgressRef = useRef(false)

  useEffect(() => { stopRef.current = ['Finished','Idle','Error'].includes(state) }, [state])
  useEffect(() => {
    if (summary) setShowSummaryDialog(true)
  }, [summary])

  const start = useCallback(async () => {
    setSummary(null)
    setHistory([])
    setPlan(null)
    setState('Planning')
    stopRef.current = false
    summaryInProgressRef.current = false
    // if a previous controller exists, abort it
    turnAbortController.current?.abort()
    try {
      const res = await fetch('/api/sim/plan', {
        method: 'POST',
        body: JSON.stringify({ goal, provider, allowFictitiousTools }) // include flag
      })
      const json = await res.json(); if (!res.ok) throw new Error(json.error)
      setPlan(json); setState('Running'); setCurrentAgentId(json.agents[0].id); setTurn(0)
    } catch (e) { console.error(e); setState('Error') }
  }, [goal, provider, allowFictitiousTools])

  useEffect(() => {
    if (!plan || currentAgentId == null || stopRef.current || state !== 'Running') return
    ;(async () => {
      // abort any previous in-flight turn
      turnAbortController.current?.abort()
      const aborter = new AbortController()
      turnAbortController.current = aborter
      try {
        const agent = plan.agents.find(a => a.id === currentAgentId)!
        setCurrentMessage('')
        const res = await fetch('/api/sim/turn', {
          method: 'POST',
          body: JSON.stringify({ goal, history, agent, provider, meta: { maxTurns, turnIndex: history.length, fastMode } }),
          signal: aborter.signal
        })
        if (stopRef.current || aborter.signal.aborted) return
        if (!res.ok) { setState('Error'); return }
        const json = await res.json()
        if (stopRef.current) return
        setCurrentMessage(json.message)
        const msg: TurnMessage = { agentName: agent.name, message: json.message }
        setHistory(h => [...h, msg])
        if (stopRef.current) return
        if (json.goalComplete || (maxTurns > 0 && history.length + 1 >= maxTurns)) {
          if (!summaryInProgressRef.current) {
            summaryInProgressRef.current = true
            setState('Summarizing')
            await generateSummary([...history, msg])
          }
          return
        }
        setState('SelectingNext')
        const agentsArr = plan.agents
        const managerId = agentsArr[0]?.id
        let nextId: number | null = null
        if (pattern === 'sequential') {
          const idx = agentsArr.findIndex(a => a.id === currentAgentId)
          nextId = agentsArr[(idx + 1) % agentsArr.length].id
        } else if (pattern === 'concurrent') {
          // Same as sequential for now (placeholder for future parallel batching)
          const idx = agentsArr.findIndex(a => a.id === currentAgentId)
          nextId = agentsArr[(idx + 1) % agentsArr.length].id
        } else if (pattern === 'magentic') {
          if (currentAgentId !== managerId) {
            // Hand control back to manager
            nextId = managerId
          } else {
            // Manager chooses a specialist
            const nr = await fetch('/api/sim/next-agent', {
              method: 'POST',
              body: JSON.stringify({ goal, history: [...history, msg], agents: agentsArr, current: msg, provider, pattern })
            })
            if (!nr.ok) { setState('Error'); return }
              const njson = await nr.json()
            nextId = njson.id === managerId && agentsArr.length > 1
              ? (agentsArr[1].id) // fallback to first non-manager if model loops
              : njson.id
          }
        } else if (pattern === 'handoff' || pattern === 'group-chat') {
          const nr = await fetch('/api/sim/next-agent', {
            method: 'POST',
            body: JSON.stringify({ goal, history: [...history, msg], agents: agentsArr, current: msg, provider, pattern })
          })
          if (!nr.ok) { setState('Error'); return }
          const njson = await nr.json()
          nextId = njson.id
        } else {
          nextId = null
        }
        if (nextId == null) { setState('Finished'); return }
        setTurn(t => t + 1)
        setState('Running')
        setCurrentAgentId(nextId)
      } catch (e) {
        if (stopRef.current) return
        if ((e as any)?.name === 'AbortError') return
        setState('Error')
      }
    })()
  }, [currentAgentId, plan, state, provider, goal, history, maxTurns, fastMode, pattern])

  const stop = async () => {
    stopRef.current = true
    turnAbortController.current?.abort()
    if ((state === 'Running' || state === 'SelectingNext' || state === 'Planning') && !summaryInProgressRef.current) {
      summaryInProgressRef.current = true
      setState('Summarizing')
      await generateSummary(history)
    } else {
      setState('Finished')
    }
  }

  async function generateSummary(hist: TurnMessage[]) {
    if (stopRef.current && summaryInProgressRef.current && summary) return
    try {
      const sr = await fetch('/api/sim/summary', { method: 'POST', body: JSON.stringify({ goal, history: hist, provider }) })
      if (!sr.ok) { if (!stopRef.current) setState('Error'); return }
      const sjson = await sr.json()
      setSummary(sjson.markdown)
      // --- approximate token usage (very rough: chars/4) ---
      const estimateTokens = (txt: string) => Math.max(1, Math.ceil(txt.replace(/\s+/g,' ').trim().length / 4))
      const historyText = hist.map(h => `${h.agentName}: ${h.message}`).join('\n')
      const totalText = `${goal}\n${historyText}\n${sjson.markdown}`
      const tokens = estimateTokens(totalText)
      const COST_PER_1K = provider === 'azure-openai' ? 0.002 : 0.002 // placeholder flat rate
      const cost = (tokens / 1000) * COST_PER_1K
      setUsage({ tokens, cost })
      // --- end usage calc ---
      setState('Finished')
    } catch {
      if (!stopRef.current) setState('Error')
    }
  }

  const agentMessageCounts = plan?.agents.reduce((acc, a) => { acc[a.id] = history.filter(h => h.agentName === a.name).length; return acc }, {} as Record<number, number>) || {}

  function buildSnapshot(): SavedSimulation {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      goal,
      provider,
      plan, // may be null
      history,
      currentAgentId,
      turn,
      summary,
      maxTurns,
      fastMode,
      pattern,
      allowFictitiousTools, // existing
      usage: usage ? { tokens: usage.tokens, cost: usage.cost } : undefined, // NEW
    }
  }
  function exportJSON() {
    if (!plan) return
    const blob = new Blob([JSON.stringify(buildSnapshot(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'simulation-export.json'
    a.click()
  }
  function onFileLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { loadFromObject(JSON.parse(String(reader.result))) } catch { /* ignore */ } }
    reader.readAsText(file)
  }
  function loadFromObject(obj: SavedSimulation & { pattern?: OrchestrationPattern }) {
    if (!obj || obj.version !== 1) return
    setGoal(obj.goal)
    setProvider(obj.provider)
    setPlan(obj.plan || null)
    setHistory(obj.history)
    setCurrentAgentId(obj.currentAgentId)
    setTurn(obj.turn)
    setSummary(obj.summary || null)
    setMaxTurns(obj.maxTurns || 20)
    setFastMode(!!obj.fastMode)
    setPattern(obj.pattern || 'group-chat')
    setAllowFictitiousTools(!!(obj as any).allowFictitiousTools)
    setUsage(obj.usage ? { tokens: obj.usage.tokens, cost: obj.usage.cost } : null) 
    // derive state
    if (obj.summary) setState('Finished')
    else if (obj.plan) setState('Running')
    else setState('Idle')
  }

  function downloadSummaryHTML() {
    if (!summary) return
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Simulation Summary</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:860px;margin:40px auto;padding:0 16px;line-height:1.5;} code{background:#f1f5f9;padding:2px 4px;border-radius:4px;font-size:.9em;} h1,h2,h3{margin-top:1.4em;} hr{margin:2em 0;border:none;border-top:1px solid #e2e8f0;}</style>
</head><body>${mdToHTML(summary)}</body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'simulation-summary.html'
    a.click()
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden p-4 md:p-6 lg:p-8 gap-4">
      <header className="shrink-0 text-center">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2 justify-center"><BrainCircuit className="w-8 h-8 text-indigo-600" />Visual Agent: Interactive Multi-Agent Lab</h1>
        <p className="text-slate-600 mt-1 text-sm flex items-center gap-1 justify-center"><InformationCircleIcon className="w-4 h-4" />Visualize agents, drag, zoom.</p>
      </header>
      <div className="flex flex-col lg:flex-row gap-6 h-[42%] min-h-0">
        <aside className="lg:w-1/4 bg-white p-4 rounded-xl shadow border border-slate-200 flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold mb-3 shrink-0">Dashboard</h2>
          <div className="space-y-4 text-sm pr-1 flex-grow overflow-y-auto min-h-0">
            <div><h3 className="font-semibold text-slate-600 mb-1">Goal:</h3><p className="text-slate-500 break-words text-xs">{goal || 'Not set'}</p></div>
            <div><h3 className="font-semibold text-slate-600 mb-1">State:</h3><p className="font-medium text-slate-700">{state}</p></div>
            <div><h3 className="font-semibold text-slate-600 mb-1">Progress:</h3><p>Turn {turn + 1}</p></div>
            <div>
              <h3 className="font-semibold text-slate-600 mb-1">Agents:</h3>
              <ul className="space-y-2 text-xs">
                {plan?.agents.map(a => (
                  <li key={a.id} className="border-b pb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${a.id === currentAgentId && state==='Running' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500 truncate">({a.role})</span>
                      <span className="ml-auto text-indigo-600 font-semibold">[{agentMessageCounts[a.id]||0}]</span>
                    </div>
                    <div className="pl-4 text-[10px] text-slate-600">
                      {a.tools.length>0 && <div><strong>Tools:</strong> {a.tools.join(', ')}</div>}
                      {a.knowledge.length>0 && <div><strong>Knowledge:</strong> {a.knowledge.join(', ')}</div>}
                    </div>
                  </li>
                )) || <li className="text-slate-400">No agents yet...</li>}
              </ul>
            </div>
            {summary && state==='Finished' && usage && (
              <>
                <div>
                  <h3 className="font-semibold text-slate-600 mb-1">Tokens:</h3>
                  <p className="text-xs text-slate-500">
                    {usage.tokens.toLocaleString()} <span className="opacity-60">(heuristic chars/4)</span>
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-600 mb-1">Cost (est):</h3>
                  <p className="text-xs text-slate-500">${usage.cost.toFixed(4)}</p>
                </div>
              </>
            )}
          </div>
        </aside>
        <section className="flex-grow bg-white rounded-xl shadow border border-slate-200 relative flex flex-col overflow-hidden">
          {/* graph stays full area; no scroll needed */}
          <div className="absolute inset-0">
            {plan ? (
              <AgentGraph agents={plan.agents} links={plan.links} speakingAgentId={state==='Running'? currentAgentId : null} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">Start the simulation to visualize agents.</div>
            )}
          </div>
          {state === 'Planning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
              <div className="w-6 h-6 border-4 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-slate-600 mt-2 flex items-center gap-1"><Wand2 className="w-4 h-4" />Planning agents...</p>
            </div>
          )}
        </section>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[50%] min-h-0">
        <aside className="bg-white p-4 rounded-xl shadow border border-slate-200 flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold mb-3 shrink-0">Setup</h2>
          <div className="space-y-3 pr-1 flex-grow overflow-y-auto min-h-0">
            <div>
              <label className="block text-xs font-medium mb-1">Goal Prompt</label>
              <textarea className="w-full px-3 py-5 rounded-lg border border-slate-300 text-sm resize-none" rows={2} value={goal} onChange={e=>setGoal(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Provider</label>
              <select value={provider} onChange={e=>setProvider(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                <option value="openai">OpenAI</option>
                <option value="azure-openai">Azure OpenAI</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Pattern</label>
              <select
                value={pattern}
                onChange={e=>setPattern(e.target.value as OrchestrationPattern)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                disabled={state!=='Idle' && state!=='Finished' && state!=='Error'}
              >
                <option value="group-chat">Group Chat (debate)</option>
                <option value="sequential">Sequential (pipeline)</option>
                <option value="concurrent">Concurrent (round-robin)</option>
                <option value="handoff">Handoff (capability routing)</option>
                <option value="magentic">Magentic (manager planner)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max Turns</label>
              <input type="number" min={3} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                     value={maxTurns} onChange={e=>setMaxTurns(Number(e.target.value)||0)} />
            </div>
            <div className="flex items-center gap-6"> {/* replaced single checkbox row */}
              <div className="flex items-center gap-2">
                <input id="fastMode" type="checkbox" checked={fastMode} onChange={e=>setFastMode(e.target.checked)} />
                <label htmlFor="fastMode" className="text-xs font-medium">Fast Discussion Mode</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="fictTools"
                  type="checkbox"
                  checked={allowFictitiousTools}
                  onChange={e=>setAllowFictitiousTools(e.target.checked)}
                  disabled={state !== 'Idle' && state !== 'Finished' && state !== 'Error'}
                />
                <label htmlFor="fictTools" className="text-xs font-medium">Fictitious Tools</label>
              </div>
            </div>
            <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
              {state === 'Running' || state === 'SelectingNext' ? (
                <Button onClick={stop} className="w-full col-span-2">
                  <StopIcon className="w-4 h-4" /> Stop Simulation
                </Button>
              ) : (
                <Button disabled={state==='Planning'} onClick={start} className="w-full col-span-2">
                  <PlayIcon className="w-4 h-4" /> Start Simulation
                </Button>
              )}
              {/* Row 2: JSON export / import */}
              <Button type="button" variant="outline" onClick={exportJSON}>Export</Button>
              <input id="sim-import" type="file" accept="application/json" className="hidden" onChange={onFileLoad} />
              <Button type="button" variant="outline" onClick={() => document.getElementById('sim-import')?.click()}>Import</Button>
            </div>
            {lastSaved && <p className="text-[10px] text-emerald-600 mt-1">Saved {lastSaved}</p>}
            <p className="text-[10px] text-slate-500">Provider credentials are read from server environment variables.</p>
          </div>
        </aside>
        <section className="bg-white p-4 rounded-xl shadow border border-slate-200 flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold mb-3 shrink-0">Conversation Log</h2>
          <div className="flex-grow space-y-2 pr-1 text-sm overflow-y-auto min-h-0">
            {history.length===0 && <p className="text-slate-400">Conversation log will appear here...</p>}
            {history.map((h,i)=>(<div key={i} className="p-2 bg-slate-100 rounded-md border border-slate-200"><span className="font-semibold text-indigo-700">{h.agentName}:</span> {h.message}</div>))}
          </div>
        </section>
        <aside className="bg-white p-4 rounded-xl shadow border border-slate-200 flex flex-col overflow-hidden">
          <h2 className="text-lg font-semibold mb-3 shrink-0">Current Message</h2>
                    <div className="flex-grow text-sm space-y-2 overflow-y-auto min-h-0">
            {state==='Summarizing' && <p className="text-slate-500">Generating summary...</p>}
            {summary ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-indigo-700">Summary</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={()=>setShowSummaryDialog(true)}
                  >
                    Pop Out
                  </Button>
                </div>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: mdToHTML(summary) }} />
              </div>
            ) : currentAgentId && (state==='Running' || state==='SelectingNext') ? (
              <div className="space-y-2">
                <div className="font-semibold text-indigo-700 flex items-center justify-between">
                  <span>{plan?.agents.find(a=>a.id===currentAgentId)?.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={()=>setShowCurrentDialog(true)}
                  >
                    Pop Out
                  </Button>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap break-words">{currentMessage||'...thinking'}</p>
              </div>
            ) : <p className="text-slate-500">Waiting for agent...</p>}
          </div>
        </aside>
      </div>

      {summary && showSummaryDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={()=>setShowSummaryDialog(false)} />
          <div className="relative z-50 w-full max-w-2xl max-h-[80vh] bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col">
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <h3 className="font-semibold text-slate-800 text-sm flex-1">Simulation Summary</h3>
              <Button size="sm" variant="outline" onClick={downloadSummaryHTML}>Download HTML</Button>
              <Button size="sm" variant="ghost" onClick={()=>setShowSummaryDialog(false)}>Close</Button>
            </div>
            <div className="p-5 overflow-y-auto text-sm leading-relaxed">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: mdToHTML(summary) }} />
            </div>
          </div>
        </div>
      )}

      {showCurrentDialog && !summary && (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={()=>setShowCurrentDialog(false)}
          />
          <div className="relative z-40 w-full max-w-xl max-h-[75vh] bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col">
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <h3 className="font-semibold text-slate-800 text-sm flex-1">
                Current Message • {plan?.agents.find(a=>a.id===currentAgentId)?.name || 'Agent'}
              </h3>
              <Button size="sm" variant="ghost" onClick={()=>setShowCurrentDialog(false)}>Close</Button>
            </div>
            <div className="p-5 overflow-y-auto text-sm leading-relaxed">
              <p className="whitespace-pre-wrap break-words text-slate-700">{currentMessage || '...thinking'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function mdToHTML(md: string) {
  return md
    .replace(/^### (.*$)/gim,'<h3>$1</h3>')
    .replace(/^## (.*$)/gim,'<h2>$1</h2>')
    .replace(/^# (.*$)/gim,'<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/gim,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim,'<em>$1</em>')
    .replace(/`([^`]+)`/gim,'<code>$1</code>')
    .replace(/\n{2,}/g,'<br/>')
}
