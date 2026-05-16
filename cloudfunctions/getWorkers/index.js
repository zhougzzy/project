// cloudfunctions/getWorkers/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 权限校验：只有管理员可以获取员工列表
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const isAdmin = userRes.data.length > 0 && userRes.data[0].role === 'ADMIN'
    if (!isAdmin) {
      return { success: false, message: '无权限，只有管理员可查看员工列表' }
    }

    const result = await db.collection('workers').where({
      role: _.neq('ADMIN')
    }).limit(1000).get()

    return {
      success: true,
      data: result.data,
      message: '获取成功'
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      message: err.message
    }
  }
}