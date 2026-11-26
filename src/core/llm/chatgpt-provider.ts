import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { createInterface } from 'readline'
import { ChatMessage, ChatProvider, ChatStreamEvent, ToolSpec } from './types'
import { ModelInfo } from './models'
import { completedEvents, responseInput, responseTools } from './siwc-wire'

const active = new Set<ChildProcessWithoutNullStreams>()
let generation = 0
export function accountGeneration (): number { return generation }
export function cancelChatGPTRequests (): void {
    generation++
    for (const child of active) if (child.stdin.writable) child.stdin.write('{"cancel":true}\n')
}

type WorkerMessage = { type: string, value?: any, message?: string }
async function* worker (request: object, signal?: AbortSignal): AsyncGenerator<WorkerMessage> {
    if (signal?.aborted) throw new Error('Cancelled')
    const child = spawn('node', [join(__dirname, 'siwc-worker.cjs')], { windowsHide: true, shell: false, stdio: 'pipe' })
    active.add(child)
    const queue: WorkerMessage[] = []
    let ended = false, error: Error | undefined, wake: (() => void) | undefined
    const notify = () => { const fn = wake; wake = undefined; fn?.() }
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.on('error', () => { error = new Error('Cannot launch Node.js. Install Node.js 22.12+ and restart Tabby.'); ended = true; notify() })
    child.on('close', code => { if (code && !error) error = new Error('ChatGPT worker exited (' + code + ').'); ended = true; notify() })
    lines.on('line', line => {
        try { queue.push(JSON.parse(line)); notify() } catch { error = new Error('Invalid ChatGPT worker response.'); child.kill(); notify() }
    })
    const cancel = () => { if (child.stdin.writable) child.stdin.write('{"cancel":true}\n') }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
        child.stdin.write(JSON.stringify(request) + '\n')
        if (signal?.aborted) cancel()
        while (!ended || queue.length) {
            if (error) throw error
            if (!queue.length) { await new Promise<void>(resolve => { wake = resolve }); continue }
            const item = queue.shift()!
            if (item.type === 'error') throw new Error(item.message || 'ChatGPT request failed.')
            if (signal?.aborted) throw new Error('Cancelled')
            yield item
        }
        if (error) throw error
    } finally {
        signal?.removeEventListener('abort', cancel)
        cancel()
        child.stdin.end()
        active.delete(child)
        lines.close()
    }
}

export async function accountAction (op: 'session' | 'profiles' | 'signin' | 'select' | 'disconnect' | 'models', options: object = {}): Promise<any> {
    let result: any, received = false
    for await (const item of worker({ op, ...options })) if (item.type === 'result') { result = item.value; received = true }
    if (!received) throw new Error('ChatGPT worker returned no result.')
    return result
}

export class ChatGPTProvider implements ChatProvider {
    private reasoning = new Map<string, any[]>()
    private generation = accountGeneration()
    constructor (private model: string, private effort: string = 'default') {}
    async listModels (): Promise<ModelInfo[]> {
        const list = await accountAction('models')
        return list.map((m: any) => ({ id: m.slug, name: m.displayName }))
    }
    async ping (): Promise<{ ok: true, models: string[] }> {
        return { ok: true, models: (await this.listModels()).map(m => m.id) }
    }
    async* stream (messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
        if (!this.model.trim()) throw new Error('Select a ChatGPT model in AI Panel settings.')
        if (this.generation !== accountGeneration()) throw new Error('ChatGPT account changed. Start a new turn.')
        let completed: any
        for await (const item of worker({ op: 'stream', model: this.model, effort: this.effort, input: responseInput(messages, this.reasoning), tools: responseTools(tools) }, signal)) {
            if (item.type === 'text') yield { type: 'text', delta: item.value }
            if (item.type === 'completed') completed = item.value
        }
        if (signal?.aborted || this.generation !== accountGeneration()) throw new Error('ChatGPT request cancelled.')
        for (const event of completedEvents(completed, tools, this.reasoning)) yield event
    }
}
