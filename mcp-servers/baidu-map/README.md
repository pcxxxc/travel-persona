# 百度地图 MCP Server

旅格 Travel Persona 的百度地图 MCP 服务，通过 MCP 协议封装百度地图 Web 服务 API。

## 功能

| 工具名 | 功能 | 百度 API |
|--------|------|----------|
| `baidu_map_geocode` | 地址 → 经纬度 | Geocoding v3 |
| `baidu_map_reverse_geocode` | 经纬度 → 地址 | Reverse Geocoding v3 |
| `baidu_map_search_poi` | 关键词搜索 POI | Place v2 Search |
| `baidu_map_poi_detail` | POI 详情查询 | Place v2 Detail |
| `baidu_map_calculate_route` | 路线规划（驾车/步行/公交） | Direction v2 |
| `baidu_map_distance_matrix` | 距离矩阵 | RouteMatrix v2 |

## 安装

```bash
cd mcp-servers/baidu-map
npm install
```

## 配置

### 环境变量

```bash
# 必填：百度地图开放平台 AK
BAIDU_MAP_AK=your_baidu_map_ak

# 可选：SK 密钥（配置后自动启用 SN 签名，更安全）
BAIDU_MAP_SK=your_baidu_map_sk

# 可选：备用认证 token
BAIDU_MAP_AUTH_TOKEN=
```

### 获取 AK

1. 访问 [百度地图开放平台](https://lbsyun.baidu.com/)
2. 注册开发者账号
3. 创建应用，选择"服务端"类型
4. 获取应用的 AK（Access Key）

> 注意：百度地图 AK 和百度智能云千帆（大模型）的 API Key 是不同的，需要单独申请。

## 使用

### 作为 MCP Server 运行

```bash
BAIDU_MAP_AK=your_ak node src/index.js
```

通过 stdio 与 MCP 客户端通信。

### 在旅格中使用

在项目根目录的 `.env` 中配置：

```bash
MAP_PROVIDER=mcp-baidu
BAIDU_MAP_AK=your_baidu_map_ak
```

启动主服务后，地图相关请求会通过 MCP Server 调用百度地图 API。

### 冒烟测试

```bash
cd mcp-servers/baidu-map
node test/smoke-test.js
```

验证 MCP Server 是否正常启动、工具是否正确注册。

## 坐标系

- MCP Server 返回的坐标为百度 BD-09 坐标系
- 旅格主项目的 `McpMapProvider` 会自动转换为 WGS-84

## 认证模式

| 模式 | 配置 | 安全性 |
|------|------|--------|
| AK 明文 | 仅配置 `BAIDU_MAP_AK` | 低（URL 明文传输） |
| AK + SK 签名 | 配置 `BAIDU_MAP_AK` + `BAIDU_MAP_SK` | 高（SN 签名，SK 不传输） |

## 项目结构

```
mcp-servers/baidu-map/
├── src/
│   ├── index.js          # MCP Server 入口
│   ├── baiduApiClient.js # 百度 API 客户端
│   ├── tools/
│   │   ├── geocoding.js  # 地理编码工具
│   │   ├── placeSearch.js# POI 搜索工具
│   │   └── direction.js  # 路线规划工具
│   └── utils/
│       ├── config.js     # 配置模块
│       └── snSigner.js   # SN 签名计算
├── test/
│   └── smoke-test.js     # 冒烟测试
└── package.json
```
