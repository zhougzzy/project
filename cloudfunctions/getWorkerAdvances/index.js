// cloudfunctions/getWorkerAdvances/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

    // 2. 获取该员工的借支记录
    // 同时匹配 worker_id/workerId、_openid 或 worker_name（员工姓名）
    const advancesRes = await db.collection('advances')
      .where(
        _.or([
          { worker_id: worker._id },
          { workerId: worker._id },
          { _openid: openid },
          { worker_name: worker.name }
        ])
      )
      .orderBy('date', 'desc')
      .get();

    // 格式化日期
    const data = advancesRes.data.map(item => {
      const date = new Date(item.date);
      item.formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return item;
    });

    return {
      success: true,
      data: data,
      workerName: worker.name
    };
  } catch (err) {
    console.error(err);
    return { success: false, error: err };
  }
};