import { NextRequest, NextResponse } from 'next/server'
import { summarize } from '@/lib/llm/providers'

export async function POST(req: NextRequest) {
  try {
    const { goal, history, provider } = await req.json()
    if (!['openai', 'azure-openai'].includes(provider)) throw new Error('Invalid provider')
    const markdown = await summarize({ goal, history, provider })
    return NextResponse.json({ markdown })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
