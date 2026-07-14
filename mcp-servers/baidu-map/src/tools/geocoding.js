/**
 * 地理编码工具
 * - baidu_map_geocode: 地址 → 经纬度
 * - baidu_map_reverse_geocode: 经纬度 → 结构化地址
 */

import { z } from 'zod';
import { callBaiduApi } from '../baiduApiClient.js';

/**
 * 注册地理编码相关工具
 * @param {import('@modelcontextprotocol/sdk').McpServer} server
 */
export function registerGeocodingTools(server) {
  // baidu_map_geocode
  server.tool(
    'baidu_map_geocode',
    '将地址文本转换为经纬度坐标（地理编码）。支持指定城市提高精度。返回 BD-09 坐标系坐标。',
    {
      address: z.string().min(1).describe('地址文本，如"大理市古城南门"'),
      city: z.string().optional().describe('所在城市，用于提高解析精度，如"大理"'),
    },
    async ({ address, city }) => {
      const params = { address, output: 'json' };
      if (city) params.city = city;

      const data = await callBaiduApi('/geocoding/v3/', params);

      const result = data.result || {};
      const location = result.location || {};

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              lat: location.lat,
              lng: location.lng,
              precise: result.precise,
              confidence: result.confidence,
              level: result.level,
              formatted_address: result.formatted_address || address,
            }, null, 2),
          },
        ],
      };
    }
  );

  // baidu_map_reverse_geocode
  server.tool(
    'baidu_map_reverse_geocode',
    '将经纬度坐标转换为结构化地址（逆地理编码）。输入 BD-09 坐标系坐标。',
    {
      lat: z.number().describe('纬度（BD-09 坐标系）'),
      lng: z.number().describe('经度（BD-09 坐标系）'),
    },
    async ({ lat, lng }) => {
      const params = {
        location: `${lat},${lng}`,
        output: 'json',
        extensions_poi: 1,
      };

      const data = await callBaiduApi('/reverse_geocoding/v3/', params);

      const result = data.result || {};
      const addrComp = result.addressComponent || {};

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              formatted_address: result.formatted_address,
              addressComponent: {
                province: addrComp.province,
                city: addrComp.city,
                district: addrComp.district,
                township: addrComp.township,
                street: addrComp.street,
                street_number: addrComp.street_number,
                adcode: addrComp.adcode,
                country: addrComp.country,
              },
              poiCount: result.poiRegions?.length || 0,
              sematic_description: result.sematic_description,
            }, null, 2),
          },
        ],
      };
    }
  );
}

/**
 * 地理编码工具元数据
 */
export const geocodingTools = [
  {
    name: 'baidu_map_geocode',
    description: '将地址文本转换为经纬度坐标（地理编码）。支持指定城市提高精度。',
    inputSchema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: '地址文本' },
        city: { type: 'string', description: '所在城市' },
      },
      required: ['address'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  {
    name: 'baidu_map_reverse_geocode',
    description: '将经纬度坐标转换为结构化地址（逆地理编码）。',
    inputSchema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: '纬度' },
        lng: { type: 'number', description: '经度' },
      },
      required: ['lat', 'lng'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
];
