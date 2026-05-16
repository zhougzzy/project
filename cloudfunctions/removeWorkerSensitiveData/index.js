const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const MAX_LIMIT = 100

async function checkAdminPermission(openid) {
  const userRes = await db.collection('users').where({ _openid: openid }).get()
  if (userRes.data.length === 0) {
    return { isAdmin: false, message: '用户不存在' }
  }

  const user = userRes.data[0]
  if (user.role !== 'ADMIN') {
    return { isAdmin: false, message: '无权限，只有管理员可执行此操作' }
  }

  return { isAdmin: true }
}

function hasSensitiveFields(worker) {
  return ['id_number', 'bank_card_number', 'bank_name']
    .some(field => Object.prototype.hasOwnProperty.call(worker, field))
}

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const permCheck = await checkAdminPermission(wxContext.OPENID)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  try {
    const countRes = await db.collection('workers').count()
    const total = countRes.total
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    let updatedCount = 0

    for (let i = 0; i < batchTimes; i++) {
      const batchRes = await db.collection('workers')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .get()

      for (const worker of batchRes.data) {
        if (!hasSensitiveFields(worker)) continue

        await db.collection('workers').doc(worker._id).update({
          data: {
            id_number: _.remove(),
            bank_card_number: _.remove(),
            bank_name: _.remove(),
            updateTime: db.serverDate()
          }
        })
        updatedCount += 1
      }
    }

    return {
      success: true,
      message: '已清理 workers 集合中的身份证、银行卡号和开户行字段',
      updatedCount
    }
  } catch (err) {
    console.error('removeWorkerSensitiveData failed:', err)
    return {
      success: false,
      message: err.message || '清理失败'
    }
  }
}
