const db = wx.cloud.database();

Page({
  data: {
    workerId: '',
    workerName: '',
    binding: false
  },

  onLoad(options) {
    // 接收分享卡片传来的参数
    if (options.worker_id && options.name) {
      this.setData({
        workerId: options.worker_id,
        workerName: decodeURIComponent(options.name)
      });
    } else {
      wx.showToast({ title: '邀请链接无效', icon: 'none' });
    }
  },

  // 工人点击确认绑定
  handleBind() {
    const { workerId, binding } = this.data;
    if (!workerId || binding) return;

    this.setData({ binding: true });
    wx.showLoading({ title: '绑定中...' });

    // 调用云函数进行绑定操作
    wx.cloud.callFunction({
      name: 'bindWorkerWechat',
      data: {
        workerId: workerId
      }
    }).then(res => {
      wx.hideLoading();
      this.setData({ binding: false });
      
      if (res.result && res.result.success) {
        wx.showToast({ title: '绑定成功！', icon: 'success' });
        // 绑定成功后，跳转到员工的首页
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1500);
      } else {
        wx.showToast({ title: res.result.message || '绑定失败', icon: 'none' });
      }
    }).catch(err => {
      console.error('绑定调用失败:', err);
      wx.hideLoading();
      this.setData({ binding: false });
      wx.showToast({ title: '网络错误，请重试', icon: 'none' });
    });
  }
});