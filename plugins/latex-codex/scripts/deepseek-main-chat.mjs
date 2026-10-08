// Optional user-profile plugin. Uses a local pipe, never exposes Harness credentials.
import net from 'node:net';
import {createHash} from 'node:crypto';
import {homedir} from 'node:os';
import {resolve, join} from 'node:path';
import {chmod} from 'node:fs/promises';

export const name = 'latex-main-chat-bridge';
export const inject = ['sessionController', 'agents'];
export function bridgePath(home = process.env.DSH_HOME || join(homedir(), '.dsh'), platform = process.platform) {
  const expanded = home.replace(/^~(?=$|[\\/])/, homedir());
  const root = resolve(expanded);
  if (platform !== 'win32') return join(root, 'latex-main-chat.sock');
  const hash = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
  return `\\\\.\\pipe\\latex-deepseek-${hash}`;
}

export async function dispatch(ctx, request) {
  if (request.action === 'status') return {available: true};
  if (request.action !== 'send' || typeof request.session_id !== 'string'
      || !/^[0-9a-f]{32}$/.test(request.request_id) || typeof request.text !== 'string'
      || !request.text.trim() || request.text.length > 1_000_000 || typeof request.cwd !== 'string') {
    throw new Error('Invalid main-chat request.');
  }
  // Address only the exact live session that launched this editor. Never resume or choose a recent chat.
  const agent = ctx.agents.get(request.session_id);
  if (!agent || !agent.session.header.cwd) throw new Error('The launching DeepSeek chat is not active.');
  const canonical = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value);
  if (canonical(agent.session.header.cwd) !== canonical(request.cwd)) throw new Error('The launching workspace does not match.');
  return ctx.sessionController.prompt({sessionId: request.session_id, requestId: request.request_id,
    mode: 'followup', content: [{type: 'text', text: request.text}]}, new AbortController().signal);
}

export function apply(ctx) {
  const connections = new Set();
  const server = net.createServer(socket => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(10000, () => socket.destroy());
    let data = '', handled = false;
    socket.setEncoding('utf8');
    socket.on('data', async chunk => {
      if (handled) return;
      data += chunk;
      if (Buffer.byteLength(data) > 2_000_000) { handled = true; socket.destroy(); return; }
      if (!data.includes('\n')) return;
      handled = true;
      try {
        const result = await dispatch(ctx, JSON.parse(data.slice(0, data.indexOf('\n'))));
        socket.end(JSON.stringify(result) + '\n');
      } catch (error) {
        socket.end(JSON.stringify({error: error.message}) + '\n');
      }
    });
  });
  server.on('error', () => {});
  ctx.on('dispose', () => { for (const socket of connections) socket.destroy(); server.close(); });
  const path = bridgePath();
  server.listen(path, async () => { if (process.platform !== 'win32') await chmod(path, 0o600); });
}
