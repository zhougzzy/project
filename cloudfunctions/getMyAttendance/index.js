// cloudfunctions/getMyAttendance/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 1. 通过 openid 查找绑定的员工
    const workerRes = await db.collection('workers').where({
      openid: openid,
      status: 'LINKED'
    }).get();

    if (workerRes.data.length === 0) {
      return { success: false, message: '未绑定员工账号', data: [] };
    }

    const worker = workerRes.data[0];

    // 2. 获取该员工的考勤记录
    const result = await db.collection('attendance')
      .where({
        worker_id: worker._id
      })
      .orderBy('submitted_at', 'desc')
      .limit(50)
      .get();

    // 按月份去重，保留最新的一条记录
    const monthMap = new Map();
    result.data.forEach(record => {
      const month = record.month;
      if (!monthMap.has(month)) {
        monthMap.set(month, record);
      }
    });

    // 转换为数组并按月份降序排序
    const uniqueData = Array.from(monthMap.values()).sort((a, b) => {
      return b.month.localeCompare(a.month);
    });

    // 处理返回数据
    const processedData = uniqueData.map(record => {
      const entries = record.entries || [];
      // 计算总天数
      const totalDays = entries.reduce((sum, entry) => sum + (entry.days || 0), 0);
      return {
        _id: record._id,
        month: record.month,
        totalDays: totalDays,
        entries: entries,
        submitted_at: record.submitted_at
      };
    });

    return { success: true, data: processedData };
  } catch (err) {
    console.error(err);
    return { success: false, error: err };
  }
};