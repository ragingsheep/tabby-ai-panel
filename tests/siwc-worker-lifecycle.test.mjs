import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

test('Windows worker flushes completed result and exits without waiting for parent stdin EOF', { timeout: 45000 }, async () => {
    const child = spawn(process.execPath, [resolve('dist/siwc-worker.cjs')], { stdio: ['pipe','pipe','pipe'], windowsHide: true })
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', text => { output += text })
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
        assert.deepEqual(messages, [{type:'result',value:{ok:true}},{type:'finished'}])
    } finally {
        child.stdin.end()
        if (child.exitCode === null) child.kill()
    }
})
