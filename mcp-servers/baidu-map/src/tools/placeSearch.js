/**
 * POI 搜索工具
 * - baidu_map_search_poi: 关键词搜索 POI
 * - baidu_map_poi_detail: POI 详情查询
 */

import { z } from 'zod';
import { callBaiduApi } from '../baiduApiClient.js';

/**
 * 注册 POI 搜索相关工具
 * @param {import('@modelcontextprotocol/sdk').McpServer} server
 */
export function registerPlaceSearchTools(server) {
  // baidu_map_search_poi
  server.tool(
    'baidu_map_search_poi',
    '按关键词搜索 POI 地点，支持城市范围限定。返回 POI 列表，包含名称、坐标、地址、类型等信息。',
    {
      query: z.string().min(1, '搜索关键词不能为空').describe('搜索关键词，如"故宫博物院"、"咖啡馆"'),
      city: z.string().optional().describe('城市限定，如"北京"、"大理"'),
      page_size: z.number().int().min(1).max(20).default(20).describe('每页返回数量，默认20，最大20'),
      page_num: z.number().int().min(0).default(0).describe('页码，从0开始'),
    },
    async ({ query, city, page_size, page_num }) => {
      const params = {
        query,
        output: 'json',
        page_size,
        page_num,
        scope: 2,
      };
      if (city) {
        params.region = city;
        params.city_limit = true;
      }

      const data = await callBaiduApi('/place/v2/search', params);

      const results = (data.results || []).map(item => ({
        uid: item.uid,
        name: item.name,
        location: {
          lat: item.location?.lat,
          lng: item.location?.lng,
        },
        address: item.address,
        telephone: item.telephone,
        detail_info: {
          type: item.detail_info?.type,
          tag: item.detail_info?.tag,
          detail_url: item.detail_info?.detail_url,
          price: item.detail_info?.price,
          overall_rating: item.detail_info?.overall_rating,
          image_num: item.detail_info?.image_num,
          comment_num: item.detail_info?.comment_num,
          favorite_num: item.detail_info?.favorite_num,
        },
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              total: data.total || results.length,
              page_size,
              page_num,
              results,
            }, null, 2),
          },
        ],
      };
    }
  );

  // baidu_map_poi_detail
  server.tool(
    'baidu_map_poi_detail',
    '根据 POI 的 uid 查询详细信息，包括营业时间、评分、价格、电话等。',
    {
      uid: z.string().min(1, 'POI uid 不能为空').describe('POI 唯一标识，从 search_poi 获取'),
      scope: z.number().int().min(1).max(2).default(2).describe('返回内容详略级别，1=基本信息，2=详细信息'),
    },
    async ({ uid, scope }) => {
      const params = {
        uid,
        scope,
        output: 'json',
      };

      const data = await callBaiduApi('/place/v2/detail', params);

      const result = data.result || {};

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              uid: result.uid,
              name: result.name,
              location: result.location ? {
                lat: result.location.lat,
                lng: result.location.lng,
              } : null,
              address: result.address,
              province: result.province,
              city: result.city,
              area: result.area,
              telephone: result.telephone,
              detail_info: {
                type: result.detail_info?.type,
                tag: result.detail_info?.tag,
                detail_url: result.detail_info?.detail_url,
                price: result.detail_info?.price,
                shop_hours: result.detail_info?.shop_hours,
                overall_rating: result.detail_info?.overall_rating,
                taste_rating: result.detail_info?.taste_rating,
                service_rating: result.detail_info?.service_rating,
                environment_rating: result.detail_info?.environment_rating,
                hygiene_rating: result.detail_info?.hygiene_rating,
                technology_rating: result.detail_info?.technology_rating,
                image_num: result.detail_info?.image_num,
                comment_num: result.detail_info?.comment_num,
                favorite_num: result.detail_info?.favorite_num,
                checkin_num: result.detail_info?.checkin_num,
              },
            }, null, 2),
          },
        ],
      };
    }
  );
}

/**
 * POI 搜索工具元数据
 */
export const placeSearchTools = [
  {
    name: 'baidu_map_search_poi',
    description: '按关键词搜索 POI 地点，支持城市范围限定。返回 POI 列表，包含名称、坐标、地址、类型等信息。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词，如"故宫博物院"、"咖啡馆"' },
        city: { type: 'string', description: '城市限定，如"北京"、"大理"' },
        page_size: { type: 'number', description: '每页返回数量，默认20，最大20' },
        page_num: { type: 'number', description: '页码，从0开始' },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
  {
    name: 'baidu_map_poi_detail',
    description: '根据 POI 的 uid 查询详细信息，包括营业时间、评分、价格、电话等。',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'POI 唯一标识，从 search_poi 获取' },
        scope: { type: 'number', description: '返回内容详略级别，1=基本信息，2=详细信息' },
      },
      required: ['uid'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
  },
];
