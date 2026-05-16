// app.js
App({
  onLaunch() {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'record-work1-8gqazy23438ed204',
        traceUser: true,
      });
    }
  },
  globalData: {
    userInfo: null,
    userRole: null, // 'ADMIN' 或 'WORKER'
    workerInfo: null // 员工信息
  }
})
