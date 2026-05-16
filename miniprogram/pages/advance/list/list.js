const db = wx.cloud.database();
const _ = db.command;

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

Page({
  data: {
    currentMonth: getCurrentMonth(),
    workerOptions: [{ _id: 'ALL', name: '全部人员' }],
    workerIndex: 0,
    advances: [],
    totalAmount: 0,

    showModal: false,
    exportStart: getCurrentMonth(),
    exportEnd: getCurrentMonth(),

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

  onLoad(options) {
    if (options.month) this.setData({ currentMonth: options.month });
    this.targetWorkerId = options.workerId || null;
    this.loadFilterOptions();
  },

  loadFilterOptions() {
    db.collection('workers').get().then(res => {
      const workerOptions = [{ _id: 'ALL', name: '全部人员' }, ...res.data];
      let workerIndex = 0;
      if (this.targetWorkerId) {
        const idx = workerOptions.findIndex(w => w._id === this.targetWorkerId);
        if (idx > -1) workerIndex = idx;
      }
      this.setData({ workerOptions, workerIndex }, () => {
        this.fetchAdvances();
      });
    });
  },

  onMonthChange(e) {
    this.setData({ currentMonth: e.detail.value }, () => this.fetchAdvances());
  },
  onWorkerChange(e) {
    this.setData({ workerIndex: e.detail.value }, () => this.fetchAdvances());
  },

  fetchAdvances() {
    wx.showLoading({ title: '加载中...' });
    const { currentMonth, workerOptions, workerIndex } = this.data;
    
    let query = {
      date: db.RegExp({ regexp: '^' + currentMonth, options: 'i' })
    };
    
    const selectedWorkerId = workerOptions[workerIndex]._id;
    if (selectedWorkerId !== 'ALL') query.worker_id = selectedWorkerId;

    // 假设借支集合叫 advances
    db.collection('advances').where(query).orderBy('date', 'desc').get().then(res => {
      wx.hideLoading();
      // 计算总额
      const totalAmount = res.data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      this.setData({ advances: res.data, totalAmount });
    }).catch(err => {
      wx.hideLoading();
      console.error('获取借支失败', err);
    });
  },

  // ================= 导出功能 =================
  showExportModal() { this.setData({ showModal: true }); },
  hideExportModal() { this.setData({ showModal: false }); },
  onExportStartChange(e) { this.setData({ exportStart: e.detail.value }); },
  onExportEndChange(e) { this.setData({ exportEnd: e.detail.value }); },

  confirmExport() {
    const { exportStart, exportEnd } = this.data;
    if (exportStart > exportEnd) return wx.showToast({ title: '时间错误', icon: 'none' });

    wx.showLoading({ title: '生成Excel...', mask: true });

    // 调用云函数 exportAdvance (需新建)
    wx.cloud.callFunction({
      name: 'exportAdvance',
      data: { startMonth: exportStart, endMonth: exportEnd }
    }).then(res => {
      if (res.result && res.result.success) {
        wx.cloud.downloadFile({
          fileID: res.result.fileID,
          success: downloadRes => {
            wx.hideLoading();
            this.hideExportModal();
            wx.openDocument({ filePath: downloadRes.tempFilePath, showMenu: true, fileType: 'xlsx' });
          }
        });
      } else {
        wx.hideLoading();
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '调用失败', icon: 'none' });
    });
  },

  // 点击卡片查看详情
  onCardTap(e) {
    const advance = e.currentTarget.dataset.item;
    this.setData({
      currentRecord: advance,
      showDetailModal: true
    });
  },

  // 预览图片
  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: this.data.currentRecord.images || [url],
      current: url
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
      this.fetchAdvances();
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
      this.fetchAdvances();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '删除失败', icon: 'none' });
      console.error('删除借支记录失败:', err);
    });
  }
});