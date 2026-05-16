// pages/manage/manage.js
const app = getApp();

Page({
  data: {
    userRole: null,
    workerInfo: null,
    // 预留给未来显示统计数据（比如：员工总数、进行中的工地数等）
    stats: {
      workerCount: 0,
      projectCount: 0
    }
  },

  onLoad(options) {
    this.setData({
      userRole: app.globalData.userRole,
      workerInfo: app.globalData.workerInfo
    });
  },

  onShow() {
    // 获取用户角色和员工信息
    const userRole = app.globalData.userRole;
    const workerInfo = app.globalData.workerInfo;
    this.setData({ userRole: userRole, workerInfo: workerInfo });
  },

  goToEdit() {
    wx.navigateTo({ url: '/pages/worker-edit/worker-edit' });
  }
});