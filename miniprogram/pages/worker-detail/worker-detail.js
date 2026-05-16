// pages/worker-detail/worker-detail.js
const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

Page({
  data: {
    worker_id: '',
    worker_name: '',
    month: getCurrentMonth(), // 默认查看当前月份

    attendanceRecords: [],
    advances: [],

    // 添加预支表单相关
    showAdvanceForm: false,
    advanceAmount: '',
    advanceDate: '',
    advanceMethod: '现金',
    advanceRemark: '',
    submitting: false
  },

  onLoad: function (options) {
    // 接收从列表页传来的参数
    this.setData({
      worker_id: options.id,
      worker_name: options.name,
      advanceDate: this.getTodayDate() // 默认今天
    });

    wx.setNavigationBarTitle({ title: `${options.name} 的详情` });

    this.fetchData();
  },

  onShow: function () {
    // 每次显示页面时刷新数据
    this.fetchData();
  },

  // 获取今天日期的辅助函数 (YYYY-MM-DD)
  getTodayDate: function() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  fetchData: function () {
    wx.showLoading({ title: '加载中...' });
    
    // 并发请求考勤和预支记录
    Promise.all([
      this.fetchAttendance(),
      this.fetchAdvances()
    ]).then(() => {
      wx.hideLoading();
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 获取该员工某月的考勤 (复用之前写的逻辑，稍微改一下查询条件)
  fetchAttendance: function () {
    return new Promise((resolve, reject) => {
      const db = wx.cloud.database();
      const $ = db.command.aggregate;
      
      db.collection('attendance').aggregate()
        .match({ 
          worker_id: this.data.worker_id,
          month: this.data.month
        })
        .lookup({
          from: 'projects',
          localField: 'project_id',
          foreignField: '_id',
          as: 'project_info'
        })
        .replaceRoot({
          newRoot: $.mergeObjects([
            {
              _id: '$_id',
              days: '$days',
              remark: '$remark',
              createTime: '$createTime',
              project_name: $.arrayElemAt(['$project_info.name', 0])
            }
          ])
        })
        .sort({ createTime: -1 })
        .end()
        .then(res => {
          this.setData({ attendanceRecords: res.list });
          resolve();
        })
        .catch(reject);
    });
  },

  // 获取预支记录
  fetchAdvances: function () {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getWorkerAdvances',
        data: { worker_id: this.data.worker_id },
        success: res => {
          if (res.result.success) {
            this.setData({ advances: res.result.data });
            resolve();
          } else {
            reject(res.result.error);
          }
        },
        fail: reject
      });
    });
  },

  // --- 预支表单相关操作 ---
  toggleAdvanceForm: function () {
    this.setData({ showAdvanceForm: !this.data.showAdvanceForm });
  },

  onAmountInput: function(e) { this.setData({ advanceAmount: e.detail.value }); },
  onDateChange: function(e) { this.setData({ advanceDate: e.detail.value }); },
  onMethodChange: function(e) { this.setData({ advanceMethod: e.detail.value }); },
  onRemarkInput: function(e) { this.setData({ advanceRemark: e.detail.value }); },

  submitAdvance: function () {
    const { advanceAmount, advanceDate, advanceMethod, advanceRemark } = this.data;
    
    if (!advanceAmount || Number(advanceAmount) <= 0) {
      return wx.showToast({ title: '请输入有效金额', icon: 'none' });
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...' });

    wx.cloud.callFunction({
      name: 'addAdvance',
      data: {
        worker_id: this.data.worker_id,
        worker_name: this.data.worker_name,
        amount: advanceAmount,
        date: advanceDate,
        method: advanceMethod,
        remark: advanceRemark
      },
      success: res => {
        wx.hideLoading();
        this.setData({ submitting: false });
        if (res.result.success) {
          wx.showToast({ title: '添加成功', icon: 'success' });
          // 重置表单并刷新数据
          this.setData({
            showAdvanceForm: false,
            advanceAmount: '',
            advanceRemark: ''
          });
          this.fetchAdvances();
        } else {
          wx.showToast({ title: '添加失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});