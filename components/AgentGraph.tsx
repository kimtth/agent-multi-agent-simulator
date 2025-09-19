"use client"
import * as d3 from 'd3'
import { useCallback, useEffect, useRef } from 'react'
import type { AgentDefinition } from '@/lib/types'

export interface AgentGraphProps {
  agents: AgentDefinition[]
  links: { source: number; target: number }[]
  speakingAgentId: number | null
  onAgentClick?: (agent: AgentDefinition) => void
}

export function AgentGraph({ agents, links, speakingAgentId, onAgentClick }: AgentGraphProps) {
  const ref = useRef<SVGSVGElement | null>(null)
  const simRef = useRef<d3.Simulation<any, any> | null>(null)
  const groupRef = useRef<SVGGElement | null>(null)

  const build = useCallback(() => {
    const svg = d3.select(ref.current!)
    svg.selectAll('*').remove()
    const g = svg.append('g')
    groupRef.current = g.node() as SVGGElement
    const width = svg.node()!.clientWidth
    const height = svg.node()!.clientHeight
    const nodeData = agents.map(a => ({ ...a }))
    const linkData = links.map(l => ({ ...l }))
    const link = g.append('g').selectAll('line').data(linkData).enter().append('line')
      .attr('class', 'stroke-slate-400 stroke-[1.5px]')
      .attr('stroke-dasharray', '4 4')
      .attr('style', 'animation: dash 1s linear infinite')
    const node = g.append('g').selectAll('g').data(nodeData).enter().append('g').attr('class', 'cursor-pointer')
    node.append('circle').attr('r', 30).attr('class', d => d.id === speakingAgentId ? 'fill-indigo-500 animate-pulse-speak stroke-white stroke-2' : 'fill-indigo-500 stroke-white stroke-2')
    node.append('text').attr('text-anchor', 'middle').attr('dy', '-0.5em').text(d => emojiForRole(d.role)).attr('class', 'text-xl')
    node.append('text').attr('text-anchor', 'middle').attr('dy', '0.9em').text(d => d.name).attr('class', 'text-[10px] font-medium fill-slate-800')
    node.on('click', (_, d) => onAgentClick?.(d))

    const sim = d3.forceSimulation(nodeData as any)
      .force('link', d3.forceLink(linkData as any).id((d: any) => d.id).distance(150).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', () => {
        link
          .attr('x1', (d: any) => (d.source as any).x)
          .attr('y1', (d: any) => (d.source as any).y)
          .attr('x2', (d: any) => (d.target as any).x)
          .attr('y2', (d: any) => (d.target as any).y)
        node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
      })
    simRef.current = sim
    const drag = d3.drag<SVGGElement, any>()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
    node.call(drag as any)

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 3]).on('zoom', (event) => {
      d3.select(groupRef.current).attr('transform', event.transform.toString())
    })
    svg.call(zoom as any)
  }, [agents, links, speakingAgentId, onAgentClick])

  useEffect(() => { if (ref.current) build(); return () => { simRef.current?.stop() } }, [build])

  return <svg ref={ref} className="w-full h-full" />
}

function emojiForRole(role: string) {
  const r = role.toLowerCase()
  if (/(ceo|leader|director)/.test(r)) return '👑'
  if (/research/.test(r)) return '🔬'
  if (/scientist/.test(r)) return '🧪'
  if (/(engineer|develop|software|code)/.test(r)) return '💻'
  if (/(infra|ops|cloud|server)/.test(r)) return '☁️'
  if (/(hardware|compute)/.test(r)) return '💡'
  if (/(data|database)/.test(r)) return '💾'
  if (/(train|model|llm|ai )/.test(r)) return '🧠'
  if (/(product|manager)/.test(r)) return '📊'
  if (/(market|sales|launch)/.test(r)) return '📢'
  if (/(write|communicat)/.test(r)) return '✍️'
  if (/(coord|plan|strateg)/.test(r)) return '📋'
  if (/(evaluat|test|qa)/.test(r)) return '✅'
  if (/(api|deploy)/.test(r)) return '🚀'
  if (/(financ|fund|budget)/.test(r)) return '💰'
  return '🤖'
}
