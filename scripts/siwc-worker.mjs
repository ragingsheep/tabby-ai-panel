import { createChatGPT } from '../vendor/siwc-devkit/packages/local/dist/index.js'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { homedir } from 'node:os'

// The worker keeps OAuth credentials in its own process. The only encryption
// implementation is Electron's OS-backed safeStorage bridge, supplied by Tabby.
// No PowerShell, shell commands, or plaintext credential fallback.
let nextCryptoId = 0
const pendingCrypto = new Map()
function cryptoRequest (op, value) {
    const id = ++nextCryptoId
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCrypto.delete(id)
            reject(new Error('OS credential encryption request timed out.'))
        }, 15000)
        pendingCrypto.set(id, { resolve, reject, timeout })
        send('crypto', {id, op, value})
    })
}
const client = createChatGPT({
    appName: 'Tabby AI Panel-oAIsub (ChatGPT preview)',
    appId: 'tabby-ai-panel-siwc',
    redirectPort: 0,
    // Separate encryption format, retain the old encrypted file unchanged.
    storageDir: join(process.env.TABBY_SIWC_STORAGE_DIR || join(process.env.LOCALAPPDATA || homedir(), 'Tabby AI Panel'), 'chatgpt-auth-os-v2'),
    openBrowser: async url => { await cryptoRequest('openBrowser', url) },
    credentialEncryption: {
        id: 'electron-safe-storage-v2',
        isAvailable: async () => Boolean(await cryptoRequest('available')),
        encrypt: async text => Buffer.from(await cryptoRequest('encrypt', text), 'base64'),
        decrypt: async bytes => cryptoRequest('decrypt', Buffer.from(bytes).toString('base64'))
    }
})
const send = (type, value) => process.stdout.write(JSON.stringify({type, value})+'\n')
const controller = new AbortController()
let started = false
const input = createInterface({input:process.stdin, crlfDelay:Infinity})
input.on('line', async line => {
    let req
    try { req = JSON.parse(line) } catch { return }
    if (req.cryptoReply) {
        const reply = req.cryptoReply
        const pending = pendingCrypto.get(reply.id)
        if (!pending) return
        pendingCrypto.delete(reply.id)
        clearTimeout(pending.timeout)
        if (reply.ok) pending.resolve(reply.value)
        else pending.reject(new Error('Operating system credential encryption or browser launch failed.'))
        return
    }
    if (req.cancel) {
        controller.abort(); client.cancelSignIn()
        for (const pending of pendingCrypto.values()) { clearTimeout(pending.timeout); pending.reject(new Error('Cancelled')) }
        pendingCrypto.clear()
        return
    }
    if (started) return
    started = true
    try {
        switch (req.op) {
            case 'selftest': {
                if (!await cryptoRequest('available')) throw new Error('OS-backed credential encryption unavailable.')
                const original = 'tabby-siwc-test'
                const ciphertext = await cryptoRequest('encrypt', original)
                const restored = await cryptoRequest('decrypt', ciphertext)
                if (original !== restored) throw new Error('Credential encryption round-trip failed.')
                send('result', {ok:true}); break
            }
            case 'session': send('result', await client.getSession()); break
            case 'profiles': send('result', await client.listProfiles()); break
            case 'signin': send('result', await client.signIn({signal: controller.signal, newProfile: !!req.newProfile, reconsent: !!req.reconsent})); break
            case 'select': send('result', await client.selectProfile(req.id)); break
            case 'disconnect': await client.disconnect(); send('result', true); break
            case 'models': send('result', await client.listModels({signal:controller.signal})); break
            case 'stream': {
                if (!Array.isArray(req.input) || !Array.isArray(req.tools)) throw new Error('Invalid agent request.')
                const catalog = await client.listModels({signal: controller.signal})
                if (!catalog.some(m => m.slug === req.model)) throw new Error('Model not available for the selected ChatGPT account.')
                const effort = ['none','minimal','low','medium','high','xhigh'].includes(req.effort) ? req.effort : undefined
                await client.streamResponse({model:req.model, input:'', signal:controller.signal, agentInput:req.input, agentTools:req.tools, agentEffort:effort, onDelta:delta=>send('text',delta), onAgentEvent:event=>{
                    if(event.type==='response.completed') send('completed',event.response)
                }})
                break
            }
            default: throw new Error('Unsupported application operation.')
        }
    } catch (e) {
        const code = typeof e?.code === 'string' ? e.code : ''
        const message = e?.name === 'ChatGPTError' ? code+': '+e.message : (e?.message === 'Model not available for the selected ChatGPT account.' ? e.message : 'ChatGPT operation failed. Check sign-in, model availability, network and OS-backed credential storage.')
        process.stdout.write(JSON.stringify({type:'error',message})+'\n')
    } finally {
        // The SDK operation has settled (including its credential persistence and lock
        // cleanup). Flush the terminal marker, then exit even if stdin is still open.
        input.close()
        process.stdin.pause()
        process.stdout.write(JSON.stringify({type:'finished'})+'\n', () => process.exit(0))
    }
})
input.on('close', () => { if (!started) controller.abort() })
