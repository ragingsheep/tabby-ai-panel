import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
const temp=mkdtempSync(join(tmpdir(),'tabby-agent-tests-'))
const output=join(temp,'agent.test.cjs')
const stub=resolve('tests/integration/tabby-stub.ts')
try {
    const npm=process.platform==='win32'?'npm.cmd':'npm'
    // Use forward slashes for Windows alias paths; keep all arguments static.
    const alias=stub.replaceAll('\\','/')
    execFileSync(npm,['exec','--yes','--package=esbuild@0.25.12','--','esbuild','tests/integration/agent.integration.ts','--bundle','--platform=node','--target=node22','--format=cjs','--loader:.md=text','--alias:@angular/core='+alias,'--alias:tabby-core='+alias,'--alias:tabby-terminal='+alias,'--outfile='+output],{stdio:'inherit',shell:process.platform==='win32'})
    execFileSync(process.execPath,['--test',output],{stdio:'inherit'})
} finally {rmSync(temp,{recursive:true,force:true})}
