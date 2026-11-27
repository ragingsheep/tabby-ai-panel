import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chooseChatGPTModel } from '../src/core/llm/models'

const models = [{ id: 'first' }, { id: 'second' }, { id: 'no-tools', tools: false }]
test('subscription model selection chooses an available default and preserves a valid selection', () => {
    assert.equal(chooseChatGPTModel('', models), 'first')
    assert.equal(chooseChatGPTModel('second', models), 'second')
    assert.equal(chooseChatGPTModel('removed', models), 'first')
    assert.equal(chooseChatGPTModel('no-tools', models), 'first')
    assert.equal(chooseChatGPTModel('', []), '')
    assert.equal(chooseChatGPTModel('', [{ id: 'no-tools', tools: false }]), '')
})
