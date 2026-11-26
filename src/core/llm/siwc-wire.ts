import type { ChatMessage, ChatStreamEvent, ToolSpec } from './types'

export const TOOL_NAMESPACE = 'tabby_terminal'

export function responseInput (messages: ChatMessage[], reasoning = new Map<string, any[]>()): any[] {
    const out: any[] = []
    for (const m of messages) {
        if (m.role === 'system') out.push({ role: 'developer', content: m.content })
        else if (m.role === 'user') out.push({ role: 'user', content: m.content })
        else if (m.role === 'tool') out.push({ type: 'function_call_output', call_id: m.toolCallId, output: m.content })
        else {
            const first = m.toolCalls?.[0]?.id
            if (first && reasoning.has(first)) out.push(...reasoning.get(first)!)
            if (m.content) out.push({ role: 'assistant', content: m.content })
            for (const t of m.toolCalls ?? []) out.push({ type: 'function_call', namespace: TOOL_NAMESPACE, call_id: t.id, name: t.name, arguments: t.arguments || '{}' })
        }
    }
    return out
}

export function responseTools (tools: ToolSpec[]): any[] {
    return tools.length ? [{ type: 'namespace', name: TOOL_NAMESPACE, description: 'Tabby terminal tools; execution is subject to the existing approval policy.', tools: tools.map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })) }] : []
}

export function completedEvents (response: any, tools: ToolSpec[], reasoning: Map<string, any[]>): ChatStreamEvent[] {
    if (response?.status !== 'completed' || !Array.isArray(response.output)) throw new Error('ChatGPT response did not complete.')
    const calls = response.output.filter((i: any) => i.type === 'function_call')
    const names = new Set(tools.map(t => t.name))
    const ids = new Set<string>()
    const result: ChatStreamEvent[] = calls.map((c: any, index: number) => {
        if (typeof c.call_id !== 'string' || !c.call_id || ids.has(c.call_id) || !names.has(c.name) || (c.namespace && c.namespace !== TOOL_NAMESPACE) || typeof c.arguments !== 'string' || c.status === 'incomplete') throw new Error('Invalid or unexpected ChatGPT tool call; no command executed.')
        ids.add(c.call_id)
        const parsed = JSON.parse(c.arguments)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid tool arguments.')
        return { type: 'tool_call', index, id: c.call_id, name: c.name, argumentsDelta: c.arguments }
    })
    if (calls.length) {
        const items = response.output.filter((i: any) => i.type === 'reasoning' && typeof i.encrypted_content === 'string')
        if (items.length) reasoning.set(calls[0].call_id, items)
    }
    if (response.usage) result.push({ type: 'usage', prompt: response.usage.input_tokens ?? 0, completion: response.usage.output_tokens ?? 0 })
    result.push({ type: 'done', finishReason: calls.length ? 'tool_calls' : 'stop' })
    return result
}
