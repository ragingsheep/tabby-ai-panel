import { createChatGPT } from '../vendor/siwc-devkit/packages/local/dist/index.js'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { homedir } from 'node:os'

const available = () => process.platform === 'win32'
function dpapi (encrypt, value) {
    if (!available()) throw new Error('This preview supports Windows credential encryption only.')
    const method = encrypt ? 'Protect' : 'Unprotect'
    const script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::"+method+"($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($r))"
    const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: Buffer.from(value).toString('base64'), encoding: 'utf8', windowsHide: true, maxBuffer: 8*1024*1024, timeout: 30000, stdio: ['pipe','pipe','pipe'] })
    return Buffer.from(result.trim(), 'base64')
}
const client = createChatGPT({ appName: 'Tabby AI Panel (ChatGPT preview)', appId: 'tabby-ai-panel-siwc', redirectPort: 0, storageDir: join(process.env.LOCALAPPDATA || homedir(), 'Tabby AI Panel', 'chatgpt-auth'), credentialEncryption: { id: 'windows-dpapi-current-user-v1', isAvailable: available, encrypt: text => dpapi(true, Buffer.from(text,'utf8')), decrypt: bytes => dpapi(false, bytes).toString('utf8') } })
const send = (type, value) => process.stdout.write(JSON.stringify({type, value})+'\n')
const controller = new AbortController()
let started = false
const input = createInterface({input:process.stdin, crlfDelay:Infinity})
input.on('line', async line => {
    let req
    try { req = JSON.parse(line) } catch { return }
    if (req.cancel) { controller.abort(); client.cancelSignIn(); return }
    if (started) return
    started = true
    try {
        switch (req.op) {
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
        const message = e?.name === 'ChatGPTError' ? code+': '+e.message : (e?.message === 'Model not available for the selected ChatGPT account.' ? e.message : 'ChatGPT operation failed. Check sign-in, model availability, network and Windows credential storage.')
        process.stdout.write(JSON.stringify({type:'error',message})+'\n')
    } finally { input.close(); process.stdin.pause() }
})
input.on('close', () => { if (!started) controller.abort() })
