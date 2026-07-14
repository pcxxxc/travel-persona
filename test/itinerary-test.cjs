'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const plansRouter = require('../src/api/v1/plans');

async function run() {
  const originalProvider = process.env.AGENT_PROVIDER;
  process.env.AGENT_PROVIDER = 'mock';

  const app = express();
  app.use(express.json());
  app.use('/api/v1/plans', plansRouter);

  // 1. 测试缺少必填字段返回 400
  const badReq = await request(app)
    .post('/api/v1/plans/itinerary')
    .send({ days: 0, pois: [] })
    .expect(400);
  assert.strictEqual(badReq.body.code, 'TP-1006');
  assert.ok(badReq.body.userMessage.includes('cityId') || badReq.body.userMessage.includes('days') || badReq.body.userMessage.includes('pois'));

  // 2. 测试正常请求返回 200 且结构正确
  const res = await request(app)
    .post('/api/v1/plans/itinerary')
    .send({
      cityId: 'beijing',
      cityName: '北京',
      days: 3,
      budget: 3000,
      interests: ['历史', '美食'],
      avoid: ['排队'],
      mood: '放松',
      companion: 'couple',
      pois: [
        { name: '故宫博物院', type: '景点', lat: 39.9163, lng: 116.3972 },
        { name: '天坛公园', type: '景点', lat: 39.8822, lng: 116.4066 },
        { name: '全聚德', type: '餐饮', lat: 39.9, lng: 116.4 }
      ]
    })
    .expect(200);

  const body = res.body;

  // JSON 可解析（supertest 已解析，这里验证结构）
  assert.ok(body, '响应体存在');
  assert.ok(Array.isArray(body.days), 'days 必须是数组');
  assert.strictEqual(body.days.length, 3, 'days 长度应为 3');

  // 验证每天的字段
  body.days.forEach(function (day, idx) {
    assert.strictEqual(typeof day.day, 'number', 'day.day 必须是数字');
    assert.ok(day.date, 'day.date 必须存在');
    assert.ok(day.theme, 'day.theme 必须存在');
    assert.ok(Array.isArray(day.schedule), 'day.schedule 必须是数组');
    assert.strictEqual(typeof day.dayBudget, 'number', 'day.dayBudget 必须是数字');
    assert.ok(day.dayTransport, 'day.dayTransport 必须存在');

    // 验证 schedule 项
    day.schedule.forEach(function (item) {
      assert.ok(item.time, 'schedule.time 必须存在');
      assert.ok(item.activity, 'schedule.activity 必须存在');
      assert.ok(item.type, 'schedule.type 必须存在');
      assert.strictEqual(typeof item.budget, 'number', 'schedule.budget 必须是数字');
      assert.ok(item.tips, 'schedule.tips 必须存在');
      if (item.lat != null) assert.strictEqual(typeof item.lat, 'number');
      if (item.lng != null) assert.strictEqual(typeof item.lng, 'number');
    });
  });

  // 验证顶层字段
  assert.strictEqual(typeof body.totalBudget, 'number', 'totalBudget 必须是数字');
  assert.ok(body.transportTips, 'transportTips 必须存在');
  assert.ok(body.budgetBreakdown && typeof body.budgetBreakdown === 'object', 'budgetBreakdown 必须是对象');

  // 验证 budgetBreakdown 包含预期分类
  const breakdownKeys = Object.keys(body.budgetBreakdown);
  assert.ok(breakdownKeys.length > 0, 'budgetBreakdown 至少有一项');
  breakdownKeys.forEach(function (k) {
    assert.strictEqual(typeof body.budgetBreakdown[k], 'number', 'budgetBreakdown.' + k + ' 必须是数字');
  });

  if (originalProvider === undefined) delete process.env.AGENT_PROVIDER;
  else process.env.AGENT_PROVIDER = originalProvider;
}

run()
  .then(() => console.log('Itinerary tests passed.'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
