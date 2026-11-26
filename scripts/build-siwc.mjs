import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sdk = path.join(root, 'vendor', 'siwc-devkit')
const pin = '0a36fefeb913055c8c7a1a29b63d82b96b2e841a'
const [major,minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 12)) throw new Error('Node.js 22.12 or later required.')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(cmd,args,cwd=root) { execFileSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32' && cmd===npm}) }
if(!fs.existsSync(path.join(sdk,'.git'))) {
    fs.mkdirSync(path.dirname(sdk),{recursive:true})
    run('git',['clone','https://github.com/openai/sign-in-with-chatgpt-devkit.git','vendor/siwc-devkit'])
    run('git',['checkout','--detach',pin],sdk)
}
const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:sdk,encoding:'utf8'}).trim()
if(actual!==pin) throw new Error('Unexpected DevKit revision; remove vendor/siwc-devkit and rebuild.')
const types=path.join(sdk,'packages/local/src/types.ts'), responses=path.join(sdk,'packages/local/src/responses.ts')
function patch(file,old,value) {
    const s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')
    if(s.includes(value))return
    if(s.split(old).length!==2)throw new Error('SDK patch anchor missing: '+file)
    fs.writeFileSync(file,s.replace(old,value))
}
patch(types,'  onDelta?: (delta: string) => void;',`  onDelta?: (delta: string) => void;
  agentInput?: any[];
  agentTools?: any[];
  agentEffort?: string;
  onAgentEvent?: (event: any) => void;`)
patch(responses,'      input: input.map((message) => ({ role: message.role, content: message.content })),',`      input: options.agentInput ?? input.map((message) => ({ role: message.role, content: message.content })),
      ...(options.agentTools?.length ? { tools: options.agentTools } : {}),
      ...(options.agentEffort ? { reasoning: { effort: options.agentEffort as any } } : {}),
      ...(options.agentInput ? { include: ["reasoning.encrypted_content"] as any } : {}),`)
patch(responses,'      if (!isObject(event)) continue;',`      if (!isObject(event)) continue;
      options.onAgentEvent?.(event);`)
if(!fs.existsSync(path.join(sdk,'node_modules'))) run(npm,['ci','--ignore-scripts'],sdk)
run(npm,['run','build','--workspace','@siwc/local'],sdk)
fs.mkdirSync(path.join(root,'dist'),{recursive:true})
run(npm,['exec','--yes','--package=esbuild@0.25.12','--','esbuild','scripts/siwc-worker.mjs','--bundle','--platform=node','--target=node22','--format=cjs','--outfile=dist/siwc-worker.cjs'])
for(const [src,dest] of [['LICENSE','SIWC-DEVKIT-LICENSE.txt'],['THIRD_PARTY_NOTICES.md','SIWC-THIRD-PARTY-NOTICES.md']]) fs.copyFileSync(path.join(sdk,src),path.join(root,'dist',dest))
