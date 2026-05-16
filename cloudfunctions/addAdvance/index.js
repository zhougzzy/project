// cloudfunctions/addAdvance/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 权限校验辅助函数
async function checkAdminPermission(wxContext) {
  const openid = wxContext.OPENID
  const userRes = await db.collection('users').where({ _openid: openid }).get()
  if (userRes.data.length === 0) {
    return { isAdmin: false, message: '用户不存在' }
  }
  const user = userRes.data[0]
  if (user.role !== 'ADMIN') {
    return { isAdmin: false, message: '无权限，只有管理员可执行此操作' }
  }
  return { isAdmin: true, user }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { worker_id, worker_name, amount, date, method, remark } = event

  // 1. 权限校验
  const permCheck = await checkAdminPermission(wxContext)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  // 2. 参数校验
  if (!worker_id || !worker_name || !amount || !date || !method) {
    return { success: false, message: '缺少必要参数' }
  }
  if (isNaN(Number(amount)) || Number(amount) <= 0) {
    return { success: false, message: '金额必须为正数' }
  }

  try {
    const result = await db.collection('advances').add({
      data: {
        worker_id,
        worker_name,
        amount: Number(amount),
        date,
        method,
        remark: remark || '',
        status: 'PAID',
        created_at: db.serverDate()
      }
    })
    return { success: true, id: result._id }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}