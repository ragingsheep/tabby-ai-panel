// Electron main-process safeStorage through Tabby's existing remote bridge.
// No plaintext-on-disk fallback. Linux basic_text is not secure storage.
// The worker communicates only over its private child-process pipes.
export async function osCredentialOperation (op: string, value?: unknown): Promise<string | boolean> {
    const remote = require('@electron/remote')
    const storage = remote.safeStorage
    const available = () => {
        if (!storage || !storage.isEncryptionAvailable()) return false
        if (process.platform === 'linux') {
            if (typeof storage.getSelectedStorageBackend !== 'function') return false
            const backend = storage.getSelectedStorageBackend()
            if (!backend || backend === 'basic_text' || backend === 'unknown') return false
        }
        return true
    }
    if (op === 'available') return available()
    if (op === 'openBrowser') {
        if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid browser request')
        const url = new URL(value)
        if (url.protocol !== 'https:' || url.username || url.password || !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(url.hostname)) throw new Error('Unexpected authentication URL')
        await require('electron').shell.openExternal(url.toString())
        return true
    }
    if (!available()) throw new Error('OS-backed secure credential storage is unavailable.')
    if (typeof value !== 'string' || value.length > 4 * 1024 * 1024) throw new Error('Invalid credential request')
    if (op === 'encrypt') return Buffer.from(storage.encryptString(value)).toString('base64')
    if (op === 'decrypt') return storage.decryptString(Buffer.from(value, 'base64'))
    throw new Error('Unsupported credential operation')
}
