// cloudfunctions/getAttendanceSummary/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { month } = event // 传入格式如 '2024-05'

  try {
    // 1. 获取总人数
    const { total: totalWorkers } = await db.collection('workers').count()

    // 2. 获取该月已提交考勤的去重人数 (使用聚合查询)
    const { list } = await db.collection('attendance').aggregate()
      .match({ month: month })
      .group({ _id: '$worker_id' })
      .count('submittedCount')
      .end()
    
    const submittedCount = list.length > 0 ? list[0].submittedCount : 0

    return {
      total: totalWorkers,
      submitted: submittedCount,
      pending: totalWorkers - submittedCount
    }
  } catch (err) {
    console.error(err)
    return { total: 0, submitted: 0, pending: 0 }
  }
}