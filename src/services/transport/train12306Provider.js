const https = require('https');

class Train12306Provider {
  constructor() {
    this.cookie = null;
    this.cookieExpiry = 0;
    this.baseUrl = 'https://kyfw.12306.cn';
    this.timeout = 10000; // 10秒超时
  }

  // 刷新 12306 Cookie
  async _refreshCookie() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('12306 cookie timeout')), 8000);
      const req = https.request(`${this.baseUrl}/otn/leftTicket/init`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Connection': 'keep-alive'
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          const setCookie = res.headers['set-cookie'];
          if (setCookie) {
            const cookies = setCookie.map(c => c.split(';')[0]);
            // 新版 12306 需要 RAIL_DEVICEID 和 RAIL_EXPIRATION
            const railDeviceId = cookies.find(c => c.includes('RAIL_DEVICEID'));
            const railExpiration = cookies.find(c => c.includes('RAIL_EXPIRATION'));
            this.cookie = cookies.join('; ');
            this.cookieExpiry = Date.now() + 30 * 60 * 1000; // 30分钟有效
            if (railDeviceId) this.railDeviceId = railDeviceId;
            if (railExpiration) this.railExpiration = railExpiration;
          }
          resolve();
        });
      });
      req.on('error', e => { clearTimeout(timer); reject(e); });
      req.end();
    });
  }

  async _ensureCookie() {
    if (!this.cookie || Date.now() > this.cookieExpiry) await this._refreshCookie();
  }

  // 获取城市代表站 code
  getStationCode(cityName) {
    const { CITY_12306_MAPPING } = require('../../data/city12306Mapping');
    return CITY_12306_MAPPING[cityName] || null;
  }

  // 查询直达车次
  async queryDirectTickets(fromCity, toCity, date, options = {}) {
    const fromCode = this.getStationCode(fromCity);
    const toCode = this.getStationCode(toCity);
    if (!fromCode || !toCode) return { available: false, reason: '城市不在32城范围内' };

    await this._ensureCookie();

    const queryDate = typeof date === 'string' ? date.replace(/-/g, '') : new Date().toISOString().slice(0,10).replace(/-/g, '');
    const url = `${this.baseUrl}/otn/leftTicket/query?leftTicketDTO.train_date=${queryDate}&leftTicketDTO.from_station=${fromCode}&leftTicketDTO.to_station=${toCode}&purpose_codes=ADULT`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { resolve({ available: false, reason: '查询超时' }); }, this.timeout);
      const req = https.request(url, {
        method: 'GET',
        headers: { 'Cookie': this.cookie || '', 'User-Agent': 'Mozilla/5.0' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          try {
            const result = JSON.parse(data);
            if (result.data && result.data.result) {
              const tickets = this._parseTickets(result.data.result, result.data.map);
              resolve({
                source: '12306-live',
                queriedAt: new Date().toISOString(),
                fromCity, toCity, date: queryDate,
                tickets
              });
            } else {
              resolve({ available: false, reason: '无车次数据', queriedAt: new Date().toISOString() });
            }
          } catch (e) {
            resolve({ available: false, reason: '解析失败: ' + e.message, queriedAt: new Date().toISOString() });
          }
        });
      });
      req.on('error', e => { clearTimeout(timer); resolve({ available: false, reason: e.message, queriedAt: new Date().toISOString() }); });
      req.end();
    });
  }

  _parseTickets(results, stationMap) {
    const keys = ['secretStr', 'buttonTextInfo', 'train_no', 'station_train_code', 'station_start_date', 'train_start_time', 'train_end_time', 'total_time', 'start_station_telecode', 'end_station_telecode', 'from_station_telecode', 'to_station_telecode', 'start_station_name', 'end_station_name', 'from_station_name', 'to_station_name', 'arrive_time', 'start_time', 'lishi', 'canWebBuy', 'yp_info', 'location_code', 'from_station_no', 'to_station_no', 'is_support_card', 'controlled_train_flag', 'gg_num', 'gr_num', 'qt_num', 'rw_num', 'rz_num', 'tz_num', 'wz_num', 'yb_num', 'yp_ex', 'yez_num', 'seat_types', 'exchange_train_flag', 'from_station_hidden', 'to_station_hidden'];
    const tickets = [];
    for (const line of results) {
      const fields = line.split('|');
      if (fields.length < 35) continue;
      const ticket = {};
      keys.forEach((key, i) => { ticket[key] = fields[i] || ''; });
      if (!ticket.station_train_code) continue;
      tickets.push({
        trainNo: ticket.station_train_code,
        fromStation: ticket.from_station_name || ticket.start_station_name,
        toStation: ticket.to_station_name || ticket.end_station_name,
        departTime: ticket.start_time,
        arriveTime: ticket.arrive_time,
        duration: ticket.lishi,
        canBuy: ticket.canWebBuy === 'Y',
        prices: this._parsePrices(ticket.yp_info),
        remainTickets: this._parseRemain(ticket)
      });
    }
    return tickets;
  }

  _parsePrices(ypInfo) {
    if (!ypInfo) return {};
    const prices = {};
    // yp_info 格式: price_type1:price1_price_type2:price2_...
    // 12306 票价类型编码: A9=商务座, M=一等座, O=二等座, 1=硬座, 3=硬卧上, 4=软卧上, WZ=无座
    const typeMap = {
      'A9': '商务座', 'swz': '商务座',
      'M': '一等座', 'zy': '一等座', 'yd': '一等座',
      'O': '二等座', 'ze': '二等座', 'ed': '二等座',
      '1': '硬座', 'yz': '硬座',
      '3': '硬卧', 'yw': '硬卧',
      '4': '软卧', 'rw': '软卧',
      'WZ': '无座', 'wz': '无座'
    };
    try {
      const segments = ypInfo.split('_');
      for (const seg of segments) {
        const colonIdx = seg.indexOf(':');
        if (colonIdx === -1) continue;
        const typeCode = seg.substring(0, colonIdx);
        const priceStr = seg.substring(colonIdx + 1);
        const price = parseFloat(priceStr);
        if (!isNaN(price) && price > 0) {
          const label = typeMap[typeCode] || typeCode;
          if (!prices[label] || price < prices[label]) {
            prices[label] = price;
          }
        }
      }
    } catch (e) {
      // 解析失败，返回空对象
    }
    prices.raw = ypInfo;
    return prices;
  }

  _parseRemain(ticket) {
    const remain = {};
    if (ticket.wz_num && ticket.wz_num !== '无' && ticket.wz_num !== '-') remain['无座'] = ticket.wz_num;
    if (ticket.yz_num && ticket.yz_num !== '无' && ticket.yz_num !== '-') remain['硬座'] = ticket.yz_num;
    if (ticket.yw_num && ticket.yw_num !== '无' && ticket.yw_num !== '-') remain['硬卧'] = ticket.yw_num;
    if (ticket.rw_num && ticket.rw_num !== '无' && ticket.rw_num !== '-') remain['软卧'] = ticket.rw_num;
    // 12306 字段名：ze=二等座, zy=一等座, swz=商务座
    if (ticket.ze_num && ticket.ze_num !== '无' && ticket.ze_num !== '-') remain['二等座'] = ticket.ze_num;
    if (ticket.zy_num && ticket.zy_num !== '无' && ticket.zy_num !== '-') remain['一等座'] = ticket.zy_num;
    if (ticket.swz_num && ticket.swz_num !== '无' && ticket.swz_num !== '-') remain['商务座'] = ticket.swz_num;
    return remain;
  }
}

module.exports = { Train12306Provider };
