import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { join } from 'path'
import { createInterface } from 'readline'
import { existsSync } from 'fs'
import { osCredentialOperation } from './os-credential-bridge'
import { ChatMessage, ChatProvider, ChatStreamEvent, ToolSpec } from './types'
import { ModelInfo } from './models'
import { completedEvents, responseInput, responseTools } from './siwc-wire'

const active = new Set<ChildProcessWithoutNullStreams>()
let generation = 0
export function accountGeneration (): number { return generation }
export function cancelChatGPTRequests (): void {
    generation++
    for (const child of active) if (child.stdin.writable && !child.stdin.writableEnded) child.stdin.write('{"cancel":true}\n')
}

type WorkerMessage = { type: string, value?: any, message?: string }
async function* worker (request: object, signal?: AbortSignal): AsyncGenerator<WorkerMessage> {
    if (signal?.aborted) throw new Error('Cancelled')
    const bundledNode = join(__dirname, 'node.exe')
    const remote = require('@electron/remote')
    const storageDir = remote.app.getPath('userData')
    const child = spawn(existsSync(bundledNode) ? bundledNode : 'node', [join(__dirname, 'siwc-worker.cjs')], {
        windowsHide: true, shell: false, stdio: 'pipe',
        env: { ...process.env, TABBY_SIWC_STORAGE_DIR: storageDir }
    })
    active.add(child)
    const queue: WorkerMessage[] = []
    let ended = false, finished = false, error: Error | undefined, wake: (() => void) | undefined
    const notify = () => { const fn = wake; wake = undefined; fn?.() }
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.on('error', () => { error = new Error('Cannot launch Node.js. Install Node.js 22.12+ and restart Tabby.'); ended = true; notify() })
    child.on('close', code => { if (code && !error) error = new Error('ChatGPT worker exited (' + code + ').'); ended = true; notify() })
    lines.on('line', line => {
        try {
            const item: WorkerMessage = JSON.parse(line)
            if (item.type === 'crypto') {
                const value = item.value
                if (!value || !Number.isSafeInteger(value.id) || value.id <= 0) throw new Error('Invalid credential bridge request')
                void osCredentialOperation(value.op, value.value).then(
                    result => {
                        if (child.stdin.writable && !child.stdin.writableEnded) child.stdin.write(JSON.stringify({ cryptoReply: { id: value.id, ok: true, value: result } }) + '\n')
                    },
                    () => {
                        if (child.stdin.writable && !child.stdin.writableEnded) child.stdin.write(JSON.stringify({ cryptoReply: { id: value.id, ok: false } }) + '\n')
                    }
                )
            } else if (item.type === 'finished') {
                finished = true
                // The child is waiting on our stdin. Close it on the explicit completion
                // marker rather than waiting for process exit first.
                child.stdin.end()
            } else queue.push(item)
            notify()
        } catch { error = new Error('Invalid ChatGPT worker response.'); child.kill(); notify() }
    })
    const cancel = () => { if (child.stdin.writable && !child.stdin.writableEnded) child.stdin.write('{"cancel":true}\n') }
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
        if (!finished) throw new Error('ChatGPT worker ended without completing the operation.')
    } finally {
        signal?.removeEventListener('abort', cancel)
        cancel()
        if (!child.stdin.writableEnded) child.stdin.end()
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
