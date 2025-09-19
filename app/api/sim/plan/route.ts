import { NextRequest, NextResponse } from 'next/server'
import { plan } from '@/lib/llm/providers'

export async function POST(req: NextRequest) {
  try {
    const { goal, provider } = await req.json()
    if (!['openai', 'azure-openai'].includes(provider)) throw new Error('Invalid provider')
    const simulationPlan = await plan({ goal, provider })
    return NextResponse.json(simulationPlan)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
