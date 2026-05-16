// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 有效的管理员邀请码列表
const VALID_ADMIN_CODES = [
  'ADMIN_20260314_TEST',
  'ADMIN_DEBUG_MODE'
]

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 支持管理员邀请码机制
  const { inviteCode } = event

  try {
    // 1. 检查 users 集合是否有当前用户（只查询，不自动创建）
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userRes.data.length > 0) {
      const user = userRes.data[0]

      // 老用户：如果提供了邀请码且验证通过，升级为管理员
      if (inviteCode && inviteCode.startsWith('ADMIN_') && VALID_ADMIN_CODES.includes(inviteCode)) {
        await db.collection('users').doc(user._id).update({
          data: {
            role: 'ADMIN',
            name: '管理员'
          }
        })
        user.role = 'ADMIN'
        user.name = '管理员'
      }

      return {
        success: true,
        isNew: false,
        user: user
      }
    }

    // 2. 新用户处理
    // 只有提供了有效邀请码才创建用户（管理员注册）
    if (inviteCode && inviteCode.startsWith('ADMIN_') && VALID_ADMIN_CODES.includes(inviteCode)) {
      const newUser = {
        _openid: openid,
        name: '管理员',
        phone: '',
        role: 'ADMIN',
        createTime: db.serverDate()
      }

      const addRes = await db.collection('users').add({ data: newUser })

      // 返回带有 _id 的用户信息
      return {
        success: true,
        isNew: true,
        user: {
          _id: addRes._id,
          _openid: openid,
          name: '管理员',
          phone: '',
          role: 'ADMIN'
        }
      }
    }

    // 没有有效邀请码的新用户，不创建，返回 isNew: true 让前端跳转登录页
    return {
      success: true,
      isNew: true,
      user: null
    }

  } catch (err) {
    console.error(err)
    return { success: false, error: err.message }
  }
}

// ============================================
// 管理员账号创建说明：
// ============================================
//
// 方法1（推荐）：手动在云开发控制台创建
// 1. 打开云开发控制台 -> 数据库 -> users 集合
// 2. 添加记录：
//    {
//      "_openid": "你的微信openid",
//      "name": "管理员",
//      "phone": "",
//      "role": "ADMIN"
//    }
// 3. 获取 openid：在开发者工具预览时查看云开发控制台的"用户"标签
//
// 方法2：使用邀请码（上线后关闭调试邀请码）
// 1. 在小程序登录页面添加"管理员入口"按钮
// 2. 输入预设的邀请码进行注册
// 3. 注册成功后自动获得 ADMIN 角色
// 4. 正式上线后移除邀请码验证逻辑
// ============================================