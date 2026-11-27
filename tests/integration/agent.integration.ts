import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Subject, NEVER } from 'rxjs'
import { AgentService } from '../../src/core/agent.service'
import { DEFAULT_CONFIG, CONFIG_KEY } from '../../src/types/config'
import { completedEvents, responseInput } from '../../src/core/llm/siwc-wire'
import type { ChatMessage, ChatProvider, ToolSpec, ChatStreamEvent } from '../../src/core/llm/types'

const delay = (ms:number) => new Promise(r=>setTimeout(r,ms))
async function waitFor (check:()=>boolean) {
    const deadline=Date.now()+3000
    while (!check()) {
        if(Date.now()>deadline) throw new Error('Timed out waiting for approval')
        await delay(10)
    }
}
const call = (id:string, terminal='t1', command='echo CI_TEST') => ({
    type:'function_call', namespace:'tabby_terminal', call_id:id, name:'run_command',
    arguments:JSON.stringify({terminal,command,risk_level:'low',explanation:'Synthetic test only'})
})
const complete = (output:any[]=[]) => ({status:'completed',output,usage:{input_tokens:10,output_tokens:5}})
function harness (rounds:any[], mode='ask') {
    const entries = ['local','ssh'].map((kind,i)=>({id:'fake'+i,label:'Host-'+i,descriptor:{kind,host:'test-'+i},tab:null,lastOutputAt:0,outputSeq:0,busyWith:null,readMarker:{row:0},closed:false}))
    const inputs:{host:string,data:string}[]=[]
    const buffers = new Map(entries.map(e=>[e.id,['test@host:~$ ']]))
    const snapshots = new Map<string,any>()
    const requests:any[][]=[]
    const registry:any = {
        changed$:new Subject(), list:()=>entries.filter(e=>!e.closed), byId:(id:string)=>entries.find(e=>e.id===id),
        getActive:()=>entries[0], status:()=> 'idle', lastLine:()=> 'test@host:~$ ',
        ensureReady:async(e:any)=>!e.closed, isAlternateScreen:()=>false,
        reveal:()=>{}, focus:()=>{},
        mark:(e:any)=>({row:buffers.get(e.id)!.length-1}),
        resolve:(_e:any,pos:any)=>({row:pos.row,trimmed:false,reset:false}),
        captureSince:(e:any,pos:any)=>({lines:buffers.get(e.id)!.slice(pos.row),endRow:buffers.get(e.id)!.length,isAlternate:false}),
        captureLast:(e:any,n:number)=>({lines:buffers.get(e.id)!.slice(-n),endRow:buffers.get(e.id)!.length,isAlternate:false}),
        captureScreen:(e:any)=>({lines:buffers.get(e.id)!,endRow:buffers.get(e.id)!.length,isAlternate:false}),
        cursorLine:(e:any)=>buffers.get(e.id)!.at(-1), cursorRow:(e:any)=>buffers.get(e.id)!.length-1,
        sendInput:(e:any,data:string)=>{
            inputs.push({host:e.id,data})
            // Do not execute data. Simulate terminal echo, output and prompt.
            const lines=buffers.get(e.id)!
            lines[lines.length-1]='test@host:~$ '+data.trim()
            lines.push('CI_TEST_'+e.id,'test@host:~$ ')
            e.outputSeq++; e.lastOutputAt=Date.now()
        }
    }
    const config:any={store:{[CONFIG_KEY]:{...DEFAULT_CONFIG,provider:'chatgpt',chatgptModel:'synthetic-model',approvalMode:mode}},ready$:NEVER}
    const store:any={save:(s:any)=>snapshots.set(s.id,structuredClone(s)),load:(id:string)=>structuredClone(snapshots.get(id)),delete:(id:string)=>snapshots.delete(id)}
    const agent = new AgentService(config,registry,store,{getProfiles:async()=>[]} as any,{error:()=>{}} as any,{} as any,{run:(f:any)=>f()} as any)
    let index=0
    const provider:ChatProvider={
        ping:async()=>({ok:true}),
        async *stream(messages:ChatMessage[],tools:ToolSpec[],signal?:AbortSignal):AsyncGenerator<ChatStreamEvent> {
            requests.push(responseInput(messages))
            signal?.throwIfAborted()
            const round=rounds[index++] ?? complete()
            if(round instanceof Error) throw round
            if(round.text) yield {type:'text',delta:round.text}
            for(const event of completedEvents(round,tools,new Map())) yield event
        }
    }
    agent.makeProvider=()=>provider
    return {agent,entries,inputs,requests,snapshots}
}
test('real agent requires approval, runs once, and feeds result into next response', {timeout:10000},async()=>{
    const {agent,inputs,requests}=harness([complete([call('c1')]),{...complete(),text:'Finished'}])
    const turn=agent.send('Run harmless synthetic test')
    try {
        await waitFor(()=>agent.phase==='awaiting_approval')
        assert.equal(inputs.length,0)
        agent.approve('c1'); agent.approve('c1')
        await turn
        assert.deepEqual(inputs,[{host:'fake0',data:'echo CI_TEST\r'}])
        assert.ok(requests[1].some(i=>i.type==='function_call_output'&&i.call_id==='c1'&&i.output.includes('CI_TEST_fake0')))
        assert.equal(agent.phase,'idle')
        assert.equal(agent.error,null)
    } finally {agent.stop();await turn}
})
test('real agent denial never writes to a terminal', {timeout:10000},async()=>{
    const {agent,inputs,requests}=harness([complete([call('c2')]),complete()])
    const turn=agent.send('Propose harmless command')
    try {
        await waitFor(()=>agent.phase==='awaiting_approval')
        agent.deny('c2'); await turn
        assert.equal(inputs.length,0)
        assert.ok(requests[1].some(i=>i.type==='function_call_output'&&i.output.includes('declined')))
    } finally {agent.stop();await turn}
})
test('stop while approval pending cancels command and returns to idle', {timeout:10000},async()=>{
    const {agent,inputs}=harness([complete([call('c3')]),complete()])
    const turn=agent.send('Propose harmless command')
    try {
        await waitFor(()=>agent.phase==='awaiting_approval')
        agent.stop(); agent.approve('c3'); await turn
        assert.equal(inputs.length,0);assert.equal(agent.phase,'idle')
    } finally {agent.stop();await turn}
})
test('multi-host calls are routed to the intended synthetic terminal', {timeout:10000},async()=>{
    const {agent,inputs,requests}=harness([complete([call('c4','t2'),call('c5','t1')]),complete()],'auto_low')
    await agent.send('Compare hosts')
    assert.deepEqual(inputs.map(x=>x.host),['fake1','fake0'])
    const outputs=requests[1].filter(i=>i.type==='function_call_output')
    assert.ok(outputs[0].output.includes('CI_TEST_fake1'))
    assert.ok(outputs[1].output.includes('CI_TEST_fake0'))
})
test('missing terminal does not route command to another host', {timeout:10000},async()=>{
    const {agent,inputs,requests,entries}=harness([complete([call('c6','t2')]),complete()])
    const turn=agent.send('Propose remote command')
    try {
        await waitFor(()=>agent.phase==='awaiting_approval')
        entries[1].closed=true
        agent.approve('c6');await turn
        assert.equal(inputs.length,0)
        assert.ok(requests[1].some(i=>i.type==='function_call_output'&&i.output.includes('Error:')))
    } finally {agent.stop();await turn}
})
test('incomplete response never executes even under auto approval',async()=>{
    const {agent,inputs}=harness([{status:'incomplete',output:[call('c7')]}],'auto_all')
    await agent.send('Synthetic incomplete response')
    assert.equal(inputs.length,0);assert.match(agent.error??'',/did not complete/);assert.equal(agent.phase,'idle')
})
test('provider error recovers and new session does not carry prior conversation',async()=>{
    const {agent,inputs,requests}=harness([new Error('Synthetic network unavailable'),{...complete(),text:'Recovered'}])
    await agent.send('PRIVATE_TEST_CONTEXT')
    assert.match(agent.error??'',/network unavailable/);assert.equal(agent.phase,'idle')
    const oldId=agent.session.id
    await agent.newSession()
    assert.notEqual(agent.session.id,oldId)
    await agent.send('New test')
    assert.equal(inputs.length,0);assert.equal(agent.error,null)
    assert.ok(!JSON.stringify(requests[1]).includes('PRIVATE_TEST_CONTEXT'))
    assert.equal(await agent.openSession(oldId),true)
    assert.ok(agent.session.messages.some(m=>m.role==='user'&&m.content==='PRIVATE_TEST_CONTEXT'))
})
