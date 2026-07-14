/**
 * 路线规划工具
 * - baidu_map_calculate_route: 路线规划（驾车/步行/公交）
 * - baidu_map_distance_matrix: 距离矩阵
 */

import { z } from 'zod';
import { callBaiduApi } from '../baiduApiClient.js';

function collectTransitVehicles(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectTransitVehicles(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (value.vehicle_info && typeof value.vehicle_info === 'object') {
    const info = value.vehicle_info;
    const detail = info.detail && typeof info.detail === 'object' ? info.detail : {};
    output.push({
      type: Number(info.type) || 0,
      name: detail.name || '',
      price: Number(detail.price) || 0,
      departureStation: detail.departure_station || detail.start_info?.start_name || '',
      arrivalStation: detail.arrive_station || detail.end_info?.end_name || '',
      departureTime: detail.departure_time || detail.start_info?.start_time || '',
      arrivalTime: detail.arrive_time || detail.end_info?.end_time || ''
    });
  }
  ['steps', 'schemes', 'sub_steps'].forEach(key => {
    if (value[key]) collectTransitVehicles(value[key], output);
  });
  return output;
}

function formatRoute(route, index, mode) {
  const vehicles = mode === 'transit' ? collectTransitVehicles(route.steps || []) : [];
  const intercityVehicles = vehicles.filter(vehicle => [1, 2, 6].includes(vehicle.type));
  return {
    route_index: index,
    distance: Number(route.distance) || 0,
    duration: Number(route.duration) || 0,
    arrive_time: route.arrive_time || '',
    price: Number(route.price) || intercityVehicles.reduce((sum, vehicle) => sum + vehicle.price, 0),
    transfers: Math.max(0, intercityVehicles.length - 1),
    vehicles,
    traffic_condition: route.traffic_condition,
    toll: route.toll,
    steps: (route.steps || []).map(step => ({
      instruction: step.instructions || step.instruction || '',
      distance: Number(step.distance) || 0,
      duration: Number(step.duration) || 0,
      path: step.path,
      turn: step.turn,
      road_name: step.road_name,
      step_distance: step.step_distance
    }))
  };
}

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
      tactics_intercity: z.number().int().optional().describe('跨城交通策略'),
      trans_type_intercity: z.number().int().optional().describe('跨城交通工具类型'),
      departure_date: z.string().optional().describe('出发日期，YYYY-MM-DD'),
      departure_time: z.string().optional().describe('出发时间段'),
      page_size: z.number().int().min(1).max(10).optional().describe('返回方案数量'),
    },
    async ({ origin_lat, origin_lng, dest_lat, dest_lng, mode, waypoints, region, tactics, tactics_intercity, trans_type_intercity, departure_date, departure_time, page_size }) => {
      const origin = `${origin_lat},${origin_lng}`;
      const destination = `${dest_lat},${dest_lng}`;

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
        if (tactics != null) params.tactics_incity = tactics;
        if (tactics_intercity != null) params.tactics_intercity = tactics_intercity;
        if (trans_type_intercity != null) params.trans_type_intercity = trans_type_intercity;
        if (departure_date) params.departure_date = String(departure_date).replace(/-/g, '');
        if (departure_time) params.departure_time = departure_time;
        if (page_size != null) params.page_size = page_size;
        params.coord_type = 'bd09ll';
        params.ret_coordtype = 'bd09ll';
      } else {
        throw new Error(`不支持的出行方式: ${mode}`);
      }

      const data = await callBaiduApi(path, params);

      const result = data.result || {};
      const routes = result.routes || [];

      const formattedRoutes = routes.map((route, idx) => formatRoute(route, idx, mode));

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
        tactics_intercity: { type: 'number', description: '跨城交通策略' },
        trans_type_intercity: { type: 'number', description: '跨城交通工具类型' },
        departure_date: { type: 'string', description: '出发日期，YYYY-MM-DD' },
        departure_time: { type: 'string', description: '出发时间段' },
        page_size: { type: 'number', description: '返回方案数量' },
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
