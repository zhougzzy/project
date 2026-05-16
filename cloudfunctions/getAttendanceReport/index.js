// cloudfunctions/getAttendanceReport/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const $ = db.command.aggregate

exports.main = async (event, context) => {
  const { month } = event

  try {
    // 使用聚合操作联表查询
    // 注意：entries 是数组，每项包含 project_id 和 project_name（冗余存储）
    const result = await db.collection('attendance').aggregate()
      .match({ month: month })
      // 关联员工表 (获取员工姓名)
      .lookup({
        from: 'workers',
        localField: 'worker_id',
        foreignField: '_id',
        as: 'worker_info'
      })
      // 展开 entries 数组，每条考勤记录可能有多个工地
      .unwind('$entries')
      // 整理输出格式
      .replaceRoot({
        newRoot: {
          _id: '$_id',
          month: '$month',
          worker_id: '$worker_id',
          worker_name: $.arrayElemAt(['$worker_info.name', 0]),
          project_id: '$entries.project_id',
          project_name: '$entries.project_name',
          days: '$entries.days',
          remark: '$entries.remark',
          submitted_at: '$submitted_at'
        }
      })
      // 按员工姓名排序
      .sort({ worker_name: 1 })
      .end()

    return { success: true, data: result.list }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}