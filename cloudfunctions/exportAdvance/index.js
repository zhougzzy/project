const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

// 初始化云环境
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
    // 1. 分页查询借支记录（解决超过1000条的问题）
    const excelData = []
    excelData.push(['工人姓名', '借支日期', '借支金额(元)', '备注说明'])

    let totalCount = 0
    const maxRows = 10000

    let skip = 0
    const limit = 500

    while (true) {
      const result = await db.collection('advances')
        .where({
          date: _.gte(startMonth + '-01').and(_.lte(endMonth + '-31'))
        })
        .orderBy('date', 'desc')
        .skip(skip)
        .limit(limit)
        .get()

      if (result.data.length === 0) break

      result.data.forEach(item => {
        if (totalCount >= maxRows) return
        excelData.push([
          item.workerName || '-',
          item.date || '-',
          item.amount || 0,
          item.remark || ''
        ])
        totalCount++
      })

      if (result.data.length < limit) break
      skip += limit
    }

    // 2. 生成 Excel Buffer
    const buffer = xlsx.build([{ name: '借支明细', data: excelData }])

    // 3. 上传到云存储
    const fileName = `借支明细_${startMonth}至${endMonth}_${Date.now()}.xlsx`
    const uploadRes = await cloud.uploadFile({
      cloudPath: `exports/${fileName}`,
      fileContent: buffer
    })

    return {
      success: true,
      fileID: uploadRes.fileID,
      totalCount,
      note: totalCount >= maxRows ? `已导出前${maxRows}条记录，请缩小查询范围` : undefined
    }

  } catch (err) {
    console.error('导出借支明细失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}