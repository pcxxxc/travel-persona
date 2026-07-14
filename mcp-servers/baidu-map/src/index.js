/**
 * 百度地图 MCP Server
 *
 * 提供百度地图 Web 服务 API 的 MCP 封装，支持：
 * - 地理编码 / 逆地理编码
 * - POI 搜索 / POI 详情
 * - 路线规划（驾车/步行/公交）
 * - 距离矩阵
 *
 * 传输方式：Stdio（标准输入输出）
 * 认证方式：BAIDU_MAP_AK（必填）+ BAIDU_MAP_SK（可选，启用签名）
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { validateConfig, getAuthMode } from './utils/config.js';
import { registerGeocodingTools, geocodingTools } from './tools/geocoding.js';
import { registerPlaceSearchTools, placeSearchTools } from './tools/placeSearch.js';
import { registerDirectionTools, directionTools } from './tools/direction.js';

// 注意：所有日志必须输出到 stderr，禁止 stdout（会破坏 JSON-RPC 协议流）
const log = (...args) => console.error('[baidu-map-mcp]', ...args);

async function main() {
  try {
    // 校验配置
    const authMode = validateConfig();
    log(`启动中... 认证模式: ${authMode}`);

    // 创建 MCP Server
    const server = new McpServer({
      name: 'baidu-map-mcp',
      version: '1.0.0',
    }, {
      capabilities: {
        tools: {},
      },
    });

    // 注册工具
    registerGeocodingTools(server);
    registerPlaceSearchTools(server);
    registerDirectionTools(server);

    // 汇总工具元数据（用于 tools/list）
    const allTools = [
      ...geocodingTools,
      ...placeSearchTools,
      ...directionTools,
    ];

    log(`已注册 ${allTools.length} 个工具`);

    // 连接 stdio 传输
    const transport = new StdioServerTransport();
    await server.connect(transport);

    log('MCP Server 启动成功，等待请求...');
  } catch (error) {
    log('启动失败:', error.message);
    process.exit(1);
  }
}

main();
