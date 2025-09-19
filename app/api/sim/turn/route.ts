import { NextRequest, NextResponse } from 'next/server'
import { turn } from '@/lib/llm/providers'

export async function POST(req: NextRequest) {
  try {
    const { goal, history, agent, provider, meta } = await req.json()
    if (!['openai', 'azure-openai'].includes(provider)) throw new Error('Invalid provider')
    const result = await turn({ goal, history, agent, provider, meta })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
