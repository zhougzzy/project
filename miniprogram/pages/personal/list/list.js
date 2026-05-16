const db = wx.cloud.database();

Page({
  data: {
    search: '',
    filter: 'ALL', 
    workers: [], 
    filteredWorkers: [], 
    linkedCount: 0,
    loading: true,
    
    // 用于分享绑定的状态
    shareWorkerId: null, 
    shareWorkerName: '', 
  },

  onShow() {
    this.fetchWorkers();
  },

  fetchWorkers() {
    this.setData({ loading: true });
    
    // 从云数据库 workers 集合获取数据
    db.collection('workers')
      .get()
      .then(res => {
        const workers = res.data;
        const linkedCount = workers.filter(w => w.status === 'LINKED').length;
        
        this.setData({ 
          workers,
          linkedCount,
          loading: false
        });
        
        this.applyFilter();
      })
      .catch(err => {
        console.error('获取员工列表失败:', err);
        wx.showToast({ title: '获取数据失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  onSearchInput(e) {
    this.setData({ search: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  setFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filter: type }, () => {
      this.applyFilter();
    });
  },

  applyFilter() {
    const { workers, search, filter } = this.data;
    
    const filtered = workers.filter(w => {
      const matchSearch = !search || 
        (w.name && w.name.includes(search)) || 
        (w.phone && w.phone.includes(search));
        
      if (!matchSearch) return false;
      
      if (filter === 'LINKED') return w.status === 'LINKED';
      if (filter === 'UNLINKED') return w.status !== 'LINKED';
      return true;
    });
    
    this.setData({ filteredWorkers: filtered });
  },

  goToDetail(e) {
    // 获取云数据库的主键 _id
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ 
      url: `/pages/personal/detail/detail?id=${id}`
    });
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/personal/edit/edit' });
  },

  // ==========================================
  // 导出功能
  // ==========================================
  handleExport() {
    wx.showLoading({ title: '正在生成Excel...', mask: true });

    // 调用云函数生成 Excel
    wx.cloud.callFunction({
      name: 'exportWorkers'
    }).then(res => {
      if (res.result && res.result.success) {
        const fileID = res.result.fileID;

        // 从云存储下载生成的 Excel 文件到本地临时路径
        wx.cloud.downloadFile({
          fileID: fileID,
          success: downloadRes => {
            wx.hideLoading();
            const tempFilePath = downloadRes.tempFilePath;

            wx.openDocument({
              filePath: tempFilePath,
              showMenu: true, // 必须设置为 true，右上角才会有分享菜单
              fileType: 'xlsx', // 明确指定文件类型
              success: function (res) {
                console.log('打开文档成功');
              },
              fail: function (err) {
                console.error('打开文档失败:', err);
                wx.showToast({ title: '打开文件失败', icon: 'none' });
              }
            });
          },
          fail: err => {
            wx.hideLoading();
            wx.showToast({ title: '下载文件失败', icon: 'none' });
            console.error('下载失败:', err);
          }
        });
      } else {
        wx.hideLoading();
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '调用云函数失败', icon: 'none' });
      console.error('云函数调用失败:', err);
    });
  },

  // ==========================================
  // 邀请绑定功能
  // ==========================================
  handleInvite(e) {
    const id = e.currentTarget.dataset.id;
    
    // 从当前列表中找到这个工人，获取他的名字
    const worker = this.data.workers.find(w => w._id === id);
    if (!worker) return;

    this.setData({
      shareWorkerId: worker._id,
      shareWorkerName: worker.name
    });

    // 提示管理员点击右上角分享
    wx.showModal({
      title: '邀请绑定',
      content: `请点击右上角“...”，将邀请卡片发送给【${worker.name}】本人。`,
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#0f172a'
    });
  },

  onShareAppMessage(res) {
    const { shareWorkerId, shareWorkerName } = this.data;

    // 如果管理员没有先点击“邀请绑定”，而是直接点了右上角分享，就分享小程序的首页
    if (!shareWorkerId) {
      return {
        title: '欢迎使用工程记账本',
        path: '/pages/index/index' 
      };
    }

    // 如果管理员点击了“邀请绑定”，则生成专属的邀请卡片
    const sharePath = `/pages/bind/bind?worker_id=${shareWorkerId}&name=${encodeURIComponent(shareWorkerName)}`;

    return {
      title: `邀请您绑定工人账号：${shareWorkerName}`,
      path: sharePath,
      success: () => {
        wx.showToast({ title: '邀请已发送', icon: 'success' });
      }
    };
  }
});