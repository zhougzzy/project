// cloudfunctions/bindWorkerWechat/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const workerId = event.workerId

  if (!workerId) {
    return { success: false, message: '缺少工人ID' }
  }

  try {
    // 1. 检查该工人是否已经被绑定
    const workerRes = await db.collection('workers').doc(workerId).get()
    if (!workerRes.data) {
      return { success: false, message: '员工不存在' }
    }
    if (workerRes.data.status === 'LINKED') {
      return { success: false, message: '该账号已被绑定，请勿重复操作' }
    }

    // 2. 检查当前微信是否已经绑定过其他工人账号
    const existRes = await db.collection('workers').where({ openid: openid }).get()
    if (existRes.data.length > 0) {
      return { success: false, message: '您的微信已绑定过其他账号' }
    }

    // 3. 执行绑定
    await db.collection('workers').doc(workerId).update({
      data: {
        openid: openid,
        status: 'LINKED',
        bindTime: db.serverDate()
      }
    })

    return { success: true, message: '绑定成功' }

  } catch (err) {
    console.error(err)
    return { success: false, message: '数据库操作失败' }
  }
}