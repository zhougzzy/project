// cloudfunctions/getProjects/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 获取所有状态为 ACTIVE 或 IN_PROGRESS 的项目
    const result = await db.collection('projects').where({
      status: _.in(['ACTIVE', 'IN_PROGRESS'])
    }).orderBy('createTime', 'desc').limit(1000).get()

    return { success: true, data: result.data }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}