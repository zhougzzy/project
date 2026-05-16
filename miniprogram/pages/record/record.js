// 初始化云数据库
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    totalAmount: '0.00',
    records: [],
    filteredRecords: [],
    searchQuery: '',
    userRole: null,
    // 员工端数据
    loading: false,
    advances: [],
    workerTotal: '0.00',
    // 详情弹窗
    showDetailModal: false,
    currentRecord: null,

    // 修改功能
    isEditing: false,
    editData: {
      amount: '',
      date: '',
      method: '',
      remark: ''
    },
    methodOptions: ['现金', '微信', '支付宝', '银行卡', '其他']
  },

  onLoad() {
    this.setData({ userRole: app.globalData.userRole });
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.setData({ userRole: app.globalData.userRole });

    if (app.globalData.userRole === 'WORKER') {
      this.fetchWorkerAdvances();
    } else {
      this.fetchRecords();
    }
  },

  // --- 员工端：获取我的借支记录 ---
  fetchWorkerAdvances() {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'getWorkerAdvances'
    }).then(res => {
      if (res.result && res.result.success) {
        const advances = res.result.data || [];
        const total = advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        this.setData({
          advances: advances,
          workerTotal: total.toFixed(2),
          loading: false
        });
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '获取失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      console.error('获取借支记录失败', err);
      this.setData({ loading: false });
    });
  },

  // --- 管理员端：获取所有借支记录 ---
  fetchRecords() {
    wx.showNavigationBarLoading(); // 在标题栏显示加载动画

    // 查询 advances 集合
    db.collection('advances')
      .orderBy('date', 'desc')       // 优先按日期倒序（最新的日期在最前）
      .orderBy('createTime', 'desc') // 如果同一天，按创建时间倒序
      .get()
      .then(res => {
        wx.hideNavigationBarLoading();

        this.setData({
          records: res.data
        }, () => {
          // 数据获取成功后，执行一次过滤和总额计算
          this.filterRecords();
        });
      })
      .catch(err => {
        wx.hideNavigationBarLoading();
        console.error('获取借支记录失败:', err);
        wx.showToast({ title: '获取记录失败', icon: 'none' });
      });
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value }, () => {
      this.filterRecords();
    });
  },

  // 过滤记录并计算总额
  filterRecords() {
    const query = this.data.searchQuery.trim();
    let filtered = this.data.records;

    // 如果有搜索词，按工人姓名过滤
    if (query) {
      filtered = filtered.filter(r => r.workerName && r.workerName.includes(query));
    }

    // 计算过滤后的总额
    let total = 0;
    filtered.forEach(r => {
      total += parseFloat(r.amount || 0);
    });

    this.setData({
      filteredRecords: filtered,
      totalAmount: total.toFixed(2)
    });
  },

  onAddRecord() {
    wx.navigateTo({ url: '/pages/recordAdd/recordAdd' });
  },

  // 点击记录查看详情
  onRecordTap(e) {
    const record = e.currentTarget.dataset.record;

    this.setData({
      currentRecord: record,
      showDetailModal: true
    });
  },

  // 关闭详情弹窗
  hideDetailModal() {
    this.setData({
      showDetailModal: false,
      currentRecord: null,
      isEditing: false
    });
  },

  // 阻止事件冒泡
  stopPropagation() {},

  // 开始编辑
  startEdit() {
    const { currentRecord } = this.data;
    this.setData({
      isEditing: true,
      editData: {
        amount: currentRecord.amount,
        date: currentRecord.date,
        method: currentRecord.method || '现金',
        remark: currentRecord.remark || ''
      }
    });
  },

  // 取消编辑
  cancelEdit() {
    this.setData({
      isEditing: false,
      editData: {
        amount: '',
        date: '',
        method: '',
        remark: ''
      }
    });
  },

  // 编辑金额输入
  onEditAmountInput(e) {
    this.setData({
      'editData.amount': e.detail.value
    });
  },

  // 编辑日期选择
  onEditDateChange(e) {
    this.setData({
      'editData.date': e.detail.value
    });
  },

  // 编辑支付方式选择
  onEditMethodChange(e) {
    const method = this.data.methodOptions[e.detail.value];
    this.setData({
      'editData.method': method
    });
  },

  // 编辑备注输入
  onEditRemarkInput(e) {
    this.setData({
      'editData.remark': e.detail.value
    });
  },

  // 保存修改
  saveEdit() {
    const { editData, currentRecord } = this.data;

    if (!editData.amount || Number(editData.amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    db.collection('advances').doc(currentRecord._id).update({
      data: {
        amount: Number(editData.amount),
        date: editData.date,
        method: editData.method,
        remark: editData.remark
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.setData({ isEditing: false });
      this.fetchRecords();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '修改失败', icon: 'none' });
      console.error('修改借支失败:', err);
    });
  },

  // 删除借支记录
  onDeleteRecord() {
    const record = this.data.currentRecord;
    if (!record) return;

    wx.showModal({
      title: '确认删除',
      content: `确定要删除该借支记录吗？\n工人：${record.workerName}\n金额：¥${record.amount}`,
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          this.deleteRecord(record._id);
        }
      }
    });
  },

  // 执行删除
  deleteRecord(id) {
    wx.showLoading({ title: '删除中...' });

    db.collection('advances').doc(id).remove().then(res => {
      wx.hideLoading();
      wx.showToast({ title: '删除成功', icon: 'success' });
      this.hideDetailModal();
      this.fetchRecords();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
      console.error('删除借支记录失败:', err);
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;

    wx.previewImage({
      urls: this.data.currentRecord.images || [url],
      current: url
    });
  }
});
