/**
 * 百度地图 MCP Server 冒烟测试
 *
 * 通过 stdio 启动 MCP Server，发送 JSON-RPC 请求验证：
 * 1. initialize 握手成功
 * 2. tools/list 返回所有工具 schema
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'src', 'index.js');

let requestId = 0;
let serverProcess = null;
let buffer = '';
let pending = null;

function sendRequest(method, params) {
  const id = ++requestId;
  const request = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  serverProcess.stdin.write(request + '\n');

  return new Promise((resolve, reject) => {
    pending = { resolve, reject, id };
    setTimeout(() => {
      if (pending && pending.id === id) {
        pending = null;
        reject(new Error(`请求超时: ${method}`));
      }
    }, 15000);
  });
}

function onStdout(data) {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (pending && parsed.id === pending.id) {
        const p = pending;
        pending = null;
        if (parsed.error) {
          p.reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
        } else {
          p.resolve(parsed.result);
        }
      }
    } catch (e) {
      // 忽略非 JSON 行
    }
  }
}

async function runTests() {
  console.log('=== 百度地图 MCP Server 冒烟测试 ===\n');

  // 1. 启动 server
  console.log('[1/5] 启动 MCP Server...');
  serverProcess = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BAIDU_MAP_AK: 'test-ak-for-smoke',
    },
  });

  if (!serverProcess || !serverProcess.pid) {
    throw new Error('无法启动 MCP Server 进程');
  }

  console.log('  PID:', serverProcess.pid);

  serverProcess.stdout.on('data', onStdout);
  serverProcess.stderr.on('data', (data) => {
    process.stderr.write('[server] ' + data.toString());
  });

  await new Promise(r => setTimeout(r, 1000));

  // 2. initialize 握手
  console.log('\n[2/5] initialize 握手...');
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '1.0.0' },
  });
  console.log('  协议版本:', initResult.protocolVersion);
  console.log('  服务名:', initResult.serverInfo?.name);
  console.log('  版本:', initResult.serverInfo?.version);
  console.log('  ✓ 握手成功');

  // 3. 发送 initialized 通知（notification 不需要 id 和响应）
  serverProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  await new Promise(r => setTimeout(r, 200));

  // 4. tools/list 列出工具
  console.log('\n[3/5] tools/list 列出工具...');
  const toolsResult = await sendRequest('tools/list', {});
  const toolNames = toolsResult.tools.map(t => t.name);
  console.log('  工具数量:', toolNames.length);
  toolNames.forEach(name => console.log('    -', name));

  const expectedTools = [
    'baidu_map_geocode',
    'baidu_map_reverse_geocode',
    'baidu_map_search_poi',
    'baidu_map_poi_detail',
    'baidu_map_calculate_route',
    'baidu_map_distance_matrix',
  ];
  const missingTools = expectedTools.filter(t => !toolNames.includes(t));
  if (missingTools.length > 0) {
    console.log('  ✗ 缺少工具:', missingTools.join(', '));
    process.exit(1);
  }
  console.log('  ✓ 所有预期工具已注册');

  // 5. 工具 schema 验证
  console.log('\n[4/5] 工具 schema 验证...');
  for (const tool of toolsResult.tools) {
    const hasInputSchema = tool.inputSchema && tool.inputSchema.type === 'object';
    const hasDescription = typeof tool.description === 'string' && tool.description.length > 0;
    if (!hasInputSchema) {
      console.log(`  ✗ ${tool.name} 缺少 inputSchema`);
      process.exit(1);
    }
    if (!hasDescription) {
      console.log(`  ✗ ${tool.name} 缺少 description`);
      process.exit(1);
    }
  }
  console.log('  ✓ 所有工具 schema 合法');

  // 6. 清理
  console.log('\n[5/5] 关闭 Server...');
  serverProcess.kill();
  console.log('  ✓ Server 已关闭');

  console.log('\n=== 冒烟测试全部通过 ===');
}

runTests().catch((err) => {
  console.error('\n✗ 测试失败:', err.message);
  if (serverProcess) {
    try { serverProcess.kill(); } catch (e) {}
  }
  process.exit(1);
});
