// Run: node test_deepseek.mjs (no real Harness messages).
import assert from 'node:assert/strict';
import {dispatch} from './deepseek-main-chat.mjs';
import {apply} from './deepseek-boundary.mjs';

let forwarded = 0, guard, created;
const ctx = {
  agents: {get: id => id === 'session-launcher' ? {session: {header: {cwd: process.cwd()}}} : null},
  sessionController: {prompt(request, signal) {
    forwarded++;
    assert.equal(request.sessionId, 'session-launcher');
    assert.equal(request.mode, 'followup');
    assert.equal(request.content[0].text, 'Polish this.');
    assert(!signal.aborted);
    return {accepted: true};
  }},
};
assert.deepEqual(await dispatch(ctx, {action: 'status'}), {available: true});
const request = {action: 'send', session_id: 'session-launcher', request_id: '1'.repeat(32), cwd: process.cwd(), text: 'Polish this.'};
await assert.rejects(() => dispatch(ctx, {...request, session_id: 'session-other'}));
await assert.rejects(() => dispatch(ctx, {...request, cwd: process.cwd() + '/other'}));
await assert.rejects(() => dispatch(ctx, {...request, request_id: ''}));
assert.equal(forwarded, 0);
assert.deepEqual(await dispatch(ctx, request), {accepted: true});
apply({tools: {guard(value) {guard = value;}}, on(name, callback) {assert.equal(name, 'agent/created'); created = callback;}}, {catalog: false});
assert.match(guard(), /cannot execute tools/);
let restricted = false;
created({agent: {ctx: {tools: {restrict(filter) {assert.deepEqual(filter, {allow: []}); restricted = true;}}}}});
assert(restricted, 'No model-facing tools may be exposed to selection requests.');
console.log('PASS: live-session targeting, workspace validation, followup submission and enforced tool exclusion');
