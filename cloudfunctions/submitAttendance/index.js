// cloudfunctions/submitAttendance/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 权限校验：员工只能提交自己的考勤，管理员可以提交所有员工的考勤
async function checkAttendancePermission(wxContext, worker_id) {
  const openid = wxContext.OPENID

  // 检查用户是否为管理员
  const userRes = await db.collection('users').where({ _openid: openid }).get()
  if (userRes.data.length > 0 && userRes.data[0].role === 'ADMIN') {
    return { hasPermission: true, isAdmin: true }
  }

  // 非管理员：检查是否在提交自己的考勤
  const workerRes = await db.collection('workers').where({ openid: openid }).get()
  if (workerRes.data.length > 0) {
    const myWorkerId = workerRes.data[0]._id
    if (myWorkerId === worker_id) {
      return { hasPermission: true, isAdmin: false }
    }
  }

  return { hasPermission: false, message: '无权限提交此员工的考勤' }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { worker_id, month, entries } = event

  // 1. 参数校验
  if (!worker_id || !month) {
    return { success: false, error: '缺少必要参数：worker_id 和 month' }
  }

  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    return { success: false, error: '请提供考勤记录' }
  }

  // 2. 校验月份格式 (YYYY-MM)
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/
  if (!monthRegex.test(month)) {
    return { success: false, error: '月份格式错误，请使用 YYYY-MM 格式' }
  }

  // 3. 校验 entries 数组中每项的必填字段
  const [year, monthStr] = month.split('-');
  const daysInMonth = new Date(Number(year), Number(monthStr), 0).getDate();
  for (const entry of entries) {
    if (!entry.project_name) {
      return { success: false, error: '每个考勤记录必须填写工地名称' }
    }
    if (entry.days === undefined || entry.days === null || isNaN(Number(entry.days))) {
      return { success: false, error: '请填写有效的出勤天数' }
    }
    const days = Number(entry.days)
    if (days < 0 || days > daysInMonth) {
      return { success: false, error: `出勤天数不能超过当月天数 ${daysInMonth} 天` }
    }
  }

  // 4. 权限校验
  const permCheck = await checkAttendancePermission(wxContext, worker_id)
  if (!permCheck.hasPermission) {
    return { success: false, error: permCheck.message }
  }

  try {
    // 5. 先删除该员工该月已有的考勤记录 (防止重复提交)
    await db.collection('attendance').where({
      worker_id: worker_id,
      month: month
    }).remove()

    // 6. 插入新记录，将多个工地的考勤信息存储在一个数组中
    await db.collection('attendance').add({
      data: {
        worker_id: worker_id,
        month: month,
        entries: entries.map(entry => ({
          project_id: entry.project_id,
          project_name: entry.project_name,
          days: Number(entry.days),
          remark: entry.remark || ''
        })),
        submitted_at: db.serverDate(),
        _openid: openid
      }
    })

    return { success: true }
  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}