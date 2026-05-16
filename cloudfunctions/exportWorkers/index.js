const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 100

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

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const permCheck = await checkAdminPermission(wxContext)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  try {
    const countResult = await db.collection('workers').count()
    const total = countResult.total

    if (total === 0) {
      return { success: false, message: '暂无员工数据' }
    }

    const batchTimes = Math.ceil(total / MAX_LIMIT)
    const tasks = []

    for (let i = 0; i < batchTimes; i++) {
      tasks.push(db.collection('workers').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get())
    }

    const results = await Promise.all(tasks)
    const workers = results.reduce((acc, cur) => acc.concat(cur.data), [])
    const maxRows = 10000
    const actualWorkers = workers.slice(0, maxRows)

    const alldata = []
    alldata.push(['姓名', '电话'])

    actualWorkers.forEach(worker => {
      alldata.push([
        worker.name || '未填写',
        worker.phone || '未填写'
      ])
    })

    const buffer = xlsx.build([{ name: '员工信息表', data: alldata }])
    const cloudPath = `exports/员工信息表_${Date.now()}.xlsx`
    const uploadRes = await cloud.uploadFile({
      cloudPath,
      fileContent: buffer
    })

    return {
      success: true,
      fileID: uploadRes.fileID,
      totalCount: actualWorkers.length,
      note: workers.length > maxRows ? `已导出前${maxRows}条记录` : undefined
    }
  } catch (err) {
    console.error('导出失败:', err)
    return { success: false, error: err.message }
  }
}
