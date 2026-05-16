const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function checkAdminPermission(wxContext) {
  const openid = wxContext.OPENID
  const userRes = await db.collection('users').where({ _openid: openid }).get()
  if (userRes.data.length === 0) {
    return { isAdmin: false, message: '用户不存在' }
  }

  const user = userRes.data[0]
  if (user.role !== 'ADMIN') {
    return { isAdmin: false, message: '无权限' }
  }

  return { isAdmin: true, user }
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const { type, workerId, month, message } = event

  const permCheck = await checkAdminPermission(wxContext)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  if (!workerId) {
    return { success: false, message: '缺少员工ID' }
  }

  try {
    const workerRes = await db.collection('workers').doc(workerId).get()
    const worker = workerRes.data

    if (!worker || !worker.openid) {
      return { success: false, message: '该员工未绑定微信账号，无法发送提醒' }
    }

    let templateId = ''
    let data = {}

    if (type === 'ATTENDANCE') {
      templateId = 'YOUR_ATTENDANCE_TEMPLATE_ID'
      data = {
        thing1: { value: worker.name || '员工' },
        thing2: { value: month || '本月' },
        thing3: { value: message || '请尽快填写考勤' },
        time4: { value: new Date().toLocaleString('zh-CN', { hour12: false }) }
      }
    } else if (type === 'ADVANCE') {
      templateId = 'YOUR_ADVANCE_TEMPLATE_ID'
      data = {
        thing1: { value: worker.name || '员工' },
        thing2: { value: message || '管理员已回复您的疑问' },
        time3: { value: new Date().toLocaleString('zh-CN', { hour12: false }) }
      }
    }

    const sendResult = await cloud.openapi.subscribeMessage.send({
      touser: worker.openid,
      templateId,
      page: 'pages/index/index',
      data
    })

    return { success: true, result: sendResult }
  } catch (err) {
    console.error('发送订阅消息失败:', err)
    return { success: false, error: err.message }
  }
}
