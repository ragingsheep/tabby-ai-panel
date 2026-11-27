import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

test('Worker delegates encryption and exits without waiting for parent stdin EOF', { timeout: 45000 }, async () => {
    const child = spawn(process.execPath, [resolve('dist/siwc-worker.cjs')], { stdio: ['pipe','pipe','pipe'], windowsHide: true })
    let output = ''
    child.stdout.setEncoding('utf8')
    let buffer = ''
    const requests = []
    child.stdout.on('data', text => {
        output += text
        buffer += text
        for (;;) {
            const end = buffer.indexOf('\n')
            if (end < 0) break
            const msg = JSON.parse(buffer.slice(0,end))
            buffer = buffer.slice(end+1)
            if (msg.type !== 'crypto') continue
            const {id,op,value} = msg.value
            requests.push(op)
            // Mock only the IPC protocol; real OS encryption requires Electron.
            const result = op === 'available' ? true : op === 'encrypt' ? Buffer.from(value).toString('base64') : Buffer.from(value,'base64').toString('utf8')
            child.stdin.write(JSON.stringify({cryptoReply:{id,ok:true,value:result}})+'\n')
        }
    })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    try {
        const exit = new Promise((resolve, reject) => {
            child.once('error', reject)
            child.once('close', resolve)
        })
        // Keep stdin open deliberately: this reproduces the original deadlock.
        child.stdin.write(JSON.stringify({op:'selftest'})+'\n')
        let timer
        const code = await Promise.race([exit, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker did not terminate after its result')), 40000) })]).finally(() => clearTimeout(timer))
        assert.equal(code, 0)
        const messages = output.trim().split(/\r?\n/).map(line => JSON.parse(line))
        assert.deepEqual(requests, ['available','encrypt','decrypt'])
        assert.deepEqual(messages.filter(m=>m.type!=='crypto'), [{type:'result',value:{ok:true}},{type:'finished'}])
    } finally {
        child.stdin.end()
        if (child.exitCode === null) child.kill()
    }
})
