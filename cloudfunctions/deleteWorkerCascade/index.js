// cloudfunctions/deleteWorkerCascade/index.js
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
  const { workerId } = event

  // 1. 权限校验
  const permCheck = await checkAdminPermission(wxContext)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  if (!workerId) {
    return { success: false, message: '缺少工人ID' }
  }

  try {
    // 2. 删除该工人的所有借支记录
    await db.collection('advances').where({
      worker_id: workerId
    }).remove()

    // 3. 删除该工人的所有考勤记录
    await db.collection('attendance').where({
      worker_id: workerId
    }).remove()

    // 4. 删除工人主记录
    await db.collection('workers').doc(workerId).remove()

    return { success: true, msg: '级联删除成功' }
  } catch (e) {
    console.error(e)
    return { success: false, msg: '删除失败', error: e.message }
  }
}