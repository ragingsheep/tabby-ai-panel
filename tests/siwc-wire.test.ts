import { test } from 'node:test'
import assert from 'node:assert/strict'
import { responseInput, responseTools, completedEvents, TOOL_NAMESPACE } from '../src/core/llm/siwc-wire'
const tools = [{name:'read_terminal', description:'Read', parameters:{type:'object'}}]
test('stateless history preserves tool call and output IDs', () => {
    const items = responseInput([{role:'system',content:'safe'}, {role:'assistant', content:null,toolCalls:[{id:'call_1',name:'read_terminal',arguments:'{}'}]}, {role:'tool',name:'read_terminal',toolCallId:'call_1',content:'ok'}])
    assert.equal(items[0].role,'developer'); assert.equal(items[1].namespace,TOOL_NAMESPACE); assert.equal(items[2].call_id,'call_1')
    assert.equal(responseTools(tools)[0].type,'namespace')
})
test('completed tool calls only, reject malformed, unknown or incomplete', () => {
    const response = {status:'completed',output:[{type:'function_call',call_id:'call_1',namespace:TOOL_NAMESPACE,name:'read_terminal',arguments:'{}'}],usage:{input_tokens:8,output_tokens:2}}
    const events = completedEvents(response,tools,new Map())
    assert.deepEqual(events[0],{type:'tool_call',index:0,id:'call_1',name:'read_terminal',argumentsDelta:'{}'})
    assert.throws(()=>completedEvents({...response,status:'incomplete'},tools,new Map()))
    assert.throws(()=>completedEvents({...response,output:[{...response.output[0],arguments:'{'}]},tools,new Map()))
    assert.throws(()=>completedEvents({...response,output:[{...response.output[0],name:'unknown'}]},tools,new Map()))
    assert.throws(()=>completedEvents({...response,output:[response.output[0],response.output[0]]},tools,new Map()))
})
