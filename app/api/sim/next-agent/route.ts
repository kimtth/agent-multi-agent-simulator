import { NextRequest, NextResponse } from 'next/server'
import { pickNext } from '@/lib/llm/providers'

export async function POST(req: NextRequest) {
  try {
    const { goal, history, agents, current, provider, pattern } = await req.json()
    if (!['openai', 'azure-openai'].includes(provider)) throw new Error('Invalid provider')
    const id = await pickNext({ goal, history, agents, current, provider, pattern })
    return NextResponse.json({ id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
