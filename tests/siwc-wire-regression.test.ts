import {test} from 'node:test'
import assert from 'node:assert/strict'
import {completedEvents,responseInput,TOOL_NAMESPACE} from '../src/core/llm/siwc-wire'
const tools=[{name:'read_terminal',description:'Read',parameters:{type:'object'}}]
const call=(id:string)=>({type:'function_call',namespace:TOOL_NAMESPACE,call_id:id,name:'read_terminal',arguments:'{"terminal":"t1"}'})
test('multiple calls and encrypted reasoning replay in the same turn',()=>{
    const memory=new Map<string,any[]>()
    const reasoning={type:'reasoning',id:'rs_mock',encrypted_content:'opaque-test-value'}
    const events=completedEvents({status:'completed',output:[reasoning,call('a'),call('b')],usage:{input_tokens:50,output_tokens:20}},tools,memory)
    assert.deepEqual(events.map(e=>e.type),['tool_call','tool_call','usage','done'])
    const items=responseInput([{role:'assistant',content:null,toolCalls:[{id:'a',name:'read_terminal',arguments:'{}'},{id:'b',name:'read_terminal',arguments:'{}'}]},{role:'tool',toolCallId:'a',name:'read_terminal',content:'first'},{role:'tool',toolCallId:'b',name:'read_terminal',content:'second'}],memory)
    assert.deepEqual(items.map(i=>i.type),['reasoning','function_call','function_call','function_call_output','function_call_output'])
    assert.deepEqual(items.slice(-2).map(i=>i.call_id),['a','b'])
})
test('bad second tool call rejects the entire response before any tool events are returned',()=>{
    for(const invalid of [{...call('b'),namespace:'other'},{...call('b'),arguments:'[]'},{...call('b'),arguments:'null'},{...call('b'),status:'incomplete'},{...call('a')}]) {
        assert.throws(()=>completedEvents({status:'completed',output:[call('a'),invalid]},tools,new Map()))
    }
})
test('plain reply completes without tools',()=>{
    assert.deepEqual(completedEvents({status:'completed',output:[]},[],new Map()),[{type:'done',finishReason:'stop'}])
})
