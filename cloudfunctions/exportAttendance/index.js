const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

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
  const { startMonth, endMonth } = event

  // 权限校验
  const permCheck = await checkAdminPermission(wxContext)
  if (!permCheck.isAdmin) {
    return { success: false, message: permCheck.message }
  }

  // 参数校验
  if (!startMonth || !endMonth) {
    return { success: false, message: '请指定起始月份和结束月份' }
  }

  try {
    // 1. 生成月份列表
    const monthList = []
    const [startYear, startMonthNum] = startMonth.split('-').map(Number)
    const [endYear, endMonthNum] = endMonth.split('-').map(Number)

    for (let y = startYear; y <= endYear; y++) {
      for (let m = (y === startYear ? startMonthNum : 1); m <= (y === endYear ? endMonthNum : 12); m++) {
        monthList.push(`${y}-${String(m).padStart(2, '0')}`)
      }
    }

    // 2. 获取所有员工信息（分页获取）
    const workersMap = {}
    let workersSkip = 0
    const workersLimit = 100
    while (true) {
      const workersRes = await db.collection('workers').skip(workersSkip).limit(workersLimit).get()
      workersRes.data.forEach(w => {
        workersMap[w._id] = w.name
      })
      if (workersRes.data.length < workersLimit) break
      workersSkip += workersLimit
    }

    // 3. 分页查询考勤记录（解决超过1000条的问题）
    const excelData = []
    excelData.push(['工人姓名', '考勤月份', '工地名称', '出勤天数', '备注'])

    let totalCount = 0
    const maxRows = 10000 // 限制最大行数，防止Excel过大
    let hasMore = false

    let skip = 0
    const limit = 500 // 每次获取500条，分批处理
    while (!hasMore) {
      const attendanceRes = await db.collection('attendance')
        .where({ month: _.in(monthList) })
        .skip(skip)
        .limit(limit)
        .get()

      if (attendanceRes.data.length === 0) break

      // 处理每条记录
      for (const record of attendanceRes.data) {
        const workerName = workersMap[record.worker_id] || '未知员工'
        const entries = record.entries || []

        for (const entry of entries) {
          if (totalCount >= maxRows) {
            hasMore = true
            break
          }
          excelData.push([
            workerName,
            record.month,
            entry.project_name || '-',
            entry.days || 0,
            entry.remark || ''
          ])
          totalCount++
        }
        if (hasMore) break
      }

      if (attendanceRes.data.length < limit || hasMore) break
      skip += limit
    }

    // 4. 生成 Excel Buffer
    const buffer = xlsx.build([{ name: '考勤明细', data: excelData }])

    // 5. 上传到云存储
    const fileName = `考勤明细_${startMonth}至${endMonth}_${Date.now()}.xlsx`
    const uploadRes = await cloud.uploadFile({
      cloudPath: `exports/${fileName}`,
      fileContent: buffer
    })

    return {
      success: true,
      fileID: uploadRes.fileID,
      totalCount,
      note: hasMore ? `已导出前${maxRows}条记录，请缩小查询范围` : undefined
    }

  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}