// pages/bind-account/bind-account.js
const db = wx.cloud.database();

Page({
  data: {
    workers: [],
    loading: true,
    selectedWorker: null,
    binding: false
  },

  onLoad() {
    this.checkIfAlreadyBound();
    this.fetchUnboundWorkers();
  },

  // 检查是否已经绑定
  checkIfAlreadyBound() {
    wx.cloud.callFunction({
      name: 'login'
    }).then(res => {
      if (res.result && res.result.user) {
        // 检查是否已绑定
        db.collection('workers').where({
          openid: res.result.user._openid
        }).get().then(workerRes => {
          if (workerRes.data.length > 0 && workerRes.data[0].status === 'LINKED') {
            // 已绑定，跳转回首页
            wx.showToast({ title: '您已绑定', icon: 'none' });
            setTimeout(() => {
              wx.switchTab({ url: '/pages/index/index' });
            }, 1000);
          }
        });
      }
    });
  },

  fetchUnboundWorkers() {
    wx.showLoading({ title: '加载中...' });
    // 查询 status 不等于 LINKED 的员工（即未绑定和已绑定的都显示，让用户选择未绑定的）
    db.collection('workers').where({
      status: db.command.neq('LINKED')
    }).get().then(res => {
      wx.hideLoading();
      this.setData({
        workers: res.data,
        loading: false
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  onWorkerSelect(e) {
    const index = e.detail.value;
    this.setData({ selectedWorker: this.data.workers[index] });
  },

  onWorkerTap(e) {
    const id = e.currentTarget.dataset.id;
    const worker = this.data.workers.find(w => w._id === id);
    this.setData({ selectedWorker: worker });
  },

  handleBind() {
    const { selectedWorker, binding } = this.data;
    if (!selectedWorker || binding) return;

    wx.showModal({
      title: '确认绑定',
      content: `确定要绑定为【${selectedWorker.name}】吗？绑定后不可更改。`,
      success: (res) => {
        if (res.confirm) {
          this.doBind(selectedWorker._id);
        }
      }
    });
  },

  doBind(workerId) {
    this.setData({ binding: true });
    wx.showLoading({ title: '绑定中...' });

    wx.cloud.callFunction({
      name: 'bindWorkerWechat',
      data: { workerId: workerId }
    }).then(res => {
      wx.hideLoading();
      this.setData({ binding: false });

      if (res.result && res.result.success) {
        wx.showToast({ title: '绑定成功！', icon: 'success' });
        setTimeout(() => {
          // 绑定成功后重新加载首页
          wx.reLaunch({ url: '/pages/index/index' });
        }, 1500);
      } else {
        wx.showToast({ title: res.result.message || '绑定失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      this.setData({ binding: false });
      wx.showToast({ title: '网络错误', icon: 'none' });
    });
  }
});
