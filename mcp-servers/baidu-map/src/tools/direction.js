/**
 * 路线规划工具
 * - baidu_map_calculate_route: 路线规划（驾车/步行/公交）
 * - baidu_map_distance_matrix: 距离矩阵
 */

import { z } from 'zod';
import { callBaiduApi } from '../baiduApiClient.js';

/**
 * 注册路线规划相关工具
 * @param {import('@modelcontextprotocol/sdk').McpServer} server
 */
export function registerDirectionTools(server) {
  // baidu_map_calculate_route
  server.tool(
    'baidu_map_calculate_route',
    '计算两点之间的路线，支持驾车、步行、公交三种模式。返回距离、耗时和详细步骤。',
    {
      origin_lat: z.number().describe('起点纬度（BD-09 坐标系）'),
      origin_lng: z.number().describe('起点经度（BD-09 坐标系）'),
      dest_lat: z.number().describe('终点纬度（BD-09 坐标系）'),
      dest_lng: z.number().describe('终点经度（BD-09 坐标系）'),
      mode: z.enum(['driving', 'walking', 'transit']).describe('出行方式：driving 驾车 / walking 步行 / transit 公交'),
      waypoints: z.string().optional().describe('途经点，格式 "lat,lng|lat,lng"，仅 driving 模式支持'),
      region: z.string().optional().describe('城市名称，transit 模式必填，如"北京"'),
      tactics: z.number().int().optional().describe('路线偏好：0=默认，3=不走高速，4=高速优先，5=躲避拥堵'),
    },
    async ({ origin_lat, origin_lng, dest_lat, dest_lng, mode, waypoints, region, tactics }) => {
      const origin = `${origin_lng},${origin_lat}`;
      const destination = `${dest_lng},${dest_lat}`;

      let path;
      const params = {
        origin,
        destination,
        output: 'json',
      };

      if (mode === 'driving') {
        path = '/direction/v2/driving';
        if (waypoints) params.waypoints = waypoints;
        if (tactics != null) params.tactics = tactics;
      } else if (mode === 'walking') {
        path = '/direction/v2/walking';
      } else if (mode === 'transit') {
        path = '/direction/v2/transit';
        if (region) params.region = region;
        // 市内公交策略：0=快速，1=少换乘，2=少步行，3=不坐地铁
        if (tactics != null) params.tactics_incity = tactics;
      } else {
        throw new Error(`不支持的出行方式: ${mode}`);
      }

      const data = await callBaiduApi(path, params);

      const result = data.result || {};
      const routes = result.routes || [];

      const formattedRoutes = routes.map((route, idx) => {
        const steps = [];
        if (route.steps) {
          for (const step of route.steps) {
            steps.push({
              instruction: step.instruction,
              distance: step.distance,
              duration: step.duration,
              path: step.path,
              turn: step.turn,
              road_name: step.road_name,
              step_distance: step.step_distance,
            });
          }
        }
        return {
          route_index: idx,
          distance: route.distance,
          duration: route.duration,
          traffic_condition: route.traffic_condition,
          toll: route.toll,
          steps,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              mode,
              total_distance: result.distance,
              total_duration: result.duration,
              route_count: routes.length,
              routes: formattedRoutes,
            }, null, 2),
          },
        ],
      };
    }
  );

  // baidu_map_distance_matrix
  server.tool(
    'baidu_map_distance_matrix',
    '批量计算多点之间的驾车距离和时间（距离矩阵）。最多支持 5x5 的矩阵。',
    {
      origins: z.string().describe('起点坐标列表，格式 "lat,lng|lat,lng"，最多5个'),
      destinations: z.string().describe('终点坐标列表，格式 "lat,lng|lat,lng"，最多5个'),
    },
    async ({ origins, destinations }) => {
      const params = {
        origins,
        destinations,
        output: 'json',
      };

      const data = await callBaiduApi('/routematrix/v2/driving', params);

      const result = data.result || [];

      const matrix = result.map((row, i) => ({
        origin_index: i,
        elements: row.elements?.map((el, j) => ({
          destination_index: j,
          distance: el.distance ? {
            value: el.distance.value,
            text: el.distance.text,
          } : null,
          duration: el.duration ? {
            value: el.duration.value,
            text: el.duration.text,
          } : null,
          toll: el.toll,
        })) || [],
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              origins_count: origins.split('|').length,
              destinations_count: destinations.split('|').length,
              matrix,
            }, null, 2),
          },
        ],
      };
    }
  );
}

/**
 * 路线规划工具元数据
 */
export const directionTools = [
  {
    name: 'baidu_map_calculate_route',
    description: '计算两点之间的路线，支持驾车、步行、公交三种模式。返回距离、耗时和详细步骤。',
    inputSchema: {
      type: 'object',
      properties: {
        origin_lat: { type: 'number', description: '起点纬度（BD-09 坐标系）' },
        origin_lng: { type: 'number', description: '起点经度（BD-09 坐标系）' },
        dest_lat: { type: 'number', description: '终点纬度（BD-09 坐标系）' },
        dest_lng: { type: 'number', description: '终点经度（BD-09 坐标系）' },
        mode: { type: 'string', enum: ['driving', 'walking', 'transit'], description: '出行方式' },
        waypoints: { type: 'string', description: '途经点，格式 "lat,lng|lat,lng"（仅 driving）' },
        region: { type: 'string', description: '城市名称（transit 模式必填）' },
        tactics: { type: 'number', description: '路线偏好' },
      },
      required: ['origin_lat', 'origin_lng', 'dest_lat', 'dest_lng', 'mode'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  {
    name: 'baidu_map_distance_matrix',
    description: '批量计算多点之间的驾车距离和时间（距离矩阵）。最多支持 5x5。',
    inputSchema: {
      type: 'object',
      properties: {
        origins: { type: 'string', description: '起点坐标列表 "lat,lng|lat,lng"，最多5个' },
        destinations: { type: 'string', description: '终点坐标列表 "lat,lng|lat,lng"，最多5个' },
      },
      required: ['origins', 'destinations'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
];
