/**
 * 云函数调用封装 - 支持错误重试
 * 使用方法：
 *   const result = await callCloudFunction('login', {})
 *   const result = await callCloudFunction('submitAttendance', { worker_id: 'xxx', month: '2026-03', entries: [] })
 */

const MAX_RETRIES = 2 // 最大重试次数
const RETRY_DELAY = 1000 // 重试延迟（毫秒）

/**
 * 带重试的云函数调用
 * @param {string} name - 云函数名称
 * @param {object} data - 传递给云函数的数据
 * @param {number} retries - 剩余重试次数
 * @returns {Promise}
 */
function callCloudFunction(name, data, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        if (res.errMsg.includes('ok')) {
          // 云函数执行成功
          resolve(res.result)
        } else {
          // 云函数执行失败
          reject(new Error(res.errMsg))
        }
      },
      fail: (err) => {
        console.error(`云函数 ${name} 调用失败:`, err)
        if (retries > 0) {
          console.log(`正在重试... (剩余 ${retries} 次)`)
          setTimeout(() => {
            callCloudFunction(name, data, retries - 1)
              .then(resolve)
              .catch(reject)
          }, RETRY_DELAY)
        } else {
          reject(err)
        }
      }
    })
  })
}

/**
 * 带弹窗提示的云函数调用（适用于用户操作）
 * @param {string} name - 云函数名称
 * @param {object} data - 传递给云函数的数据
 * @param {string} loadingText - 加载提示文字
 * @returns {Promise}
 */
async function callCloudFunctionWithLoading(name, data, loadingText = '加载中...') {
  wx.showLoading({ title: loadingText, mask: true })
  try {
    const result = await callCloudFunction(name, data)
    wx.hideLoading()
    return result
  } catch (err) {
    wx.hideLoading()
    wx.showToast({
      title: err.message || '操作失败，请重试',
      icon: 'none'
    })
    throw err
  }
}

/**
 * 带权限检查的云函数调用
 * @param {string} name - 云函数名称
 * @param {object} data - 传递给云函数的数据
 * @returns {Promise}
 */
async function callCloudFunctionWithAuth(name, data) {
  try {
    const result = await callCloudFunction(name, data)
    if (result && result.success === false) {
      wx.showToast({
        title: result.message || '操作失败',
        icon: 'none'
      })
    }
    return result
  } catch (err) {
    wx.showToast({
      title: '网络错误，请重试',
      icon: 'none'
    })
    throw err
  }
}

// 导出到全局
module.exports = {
  callCloudFunction,
  callCloudFunctionWithLoading,
  callCloudFunctionWithAuth,
  MAX_RETRIES,
  RETRY_DELAY
}