const db = wx.cloud.database();

Page({
  data: {
    workerId: null,
    worker: null,
    mode: 'FULL', 
    activeTab: 'advance', 
    selectedMonth: '', 
    advances: [],
    filteredAdvances: [],
    attendance: [],
    totalAdvances: 0,
    totalAttendanceDays: 0,
    loading: true
  },

  onLoad(options) {
    const id = options.id;
    const mode = options.mode || 'FULL';
    
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    this.setData({ 
      workerId: id,
      mode,
      selectedMonth: monthStr
    });
  },

  onShow() {
    if (this.data.workerId) {
      this.fetchWorkerDetail(this.data.workerId);
    }
  },

  fetchWorkerDetail(id) {
    this.setData({ loading: true });
    
    // 1. 查询员工基本信息
    const workerPromise = db.collection('workers').doc(id).get();
    
    // 2. 查询借支记录 (假设 advances 集合中有 worker_id 字段)
    const advancesPromise = db.collection('advances')
      .where({ worker_id: id })
      .get();
      
    // 3. 查询出勤记录 (假设 attendance 集合中有 worker_id 字段)
    const attendancePromise = this.data.mode === 'FULL' 
      ? db.collection('attendance').where({ worker_id: id }).get()
      : Promise.resolve({ data: [] });

    // 并发执行三个查询
    Promise.all([workerPromise, advancesPromise, attendancePromise])
      .then(([workerRes, advancesRes, attendanceRes]) => {
        this.setData({
          worker: workerRes.data,
          advances: advancesRes.data,
          attendance: attendanceRes.data,
          loading: false
        });
        
        this.calculateTotals();
      })
      .catch(err => {
        console.error('获取员工详情失败:', err);
        wx.showToast({ title: '获取数据失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },
// 跳转到考勤明细
goToAttendance() {
  const workerId = this.data.worker._id;
  // 假设您详情页有 currentMonth 数据，如果没有，可以用下面的代码获取当前年月
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  
  wx.navigateTo({
    url: `/pages/attendance/list/list?workerId=${workerId}&month=${month}`
  });
},

// 跳转到借支明细
goToAdvance() {
  const workerId = this.data.worker._id;
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  
  wx.navigateTo({
    url: `/pages/advance/list/list?workerId=${workerId}&month=${month}`
  });
},
  calculateTotals() {
    const { advances, attendance, selectedMonth } = this.data;
    
    // 过滤当前选择月份的借支 (假设 advances 集合中有 date 字段，格式为 YYYY-MM-DD)
    const filteredAdvances = advances.filter(a => a.date && a.date.startsWith(selectedMonth));
    const totalAdvances = filteredAdvances.reduce((sum, rec) => sum + (Number(rec.amount) || 0), 0);
    
    // 计算总出勤天数 (假设 attendance 集合中有 days 字段)
    const totalAttendanceDays = attendance.reduce((sum, rec) => sum + (Number(rec.days) || 0), 0);

    this.setData({
      filteredAdvances,
      totalAdvances,
      totalAttendanceDays
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  onMonthChange(e) {
    this.setData({ selectedMonth: e.detail.value }, () => {
      this.calculateTotals();
    });
  },

  goToEdit() {
    wx.navigateTo({
      url: `/pages/personal/edit/edit?id=${this.data.workerId}`
    });
  },

  goToAddAdvance() {
    wx.navigateTo({
      url: `/pages/recordAdd/recordAdd?worker_id=${this.data.workerId}`
    });
  },

  handleDelete() {
    const id = this.data.workerId;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该员工吗？此操作不可撤销。',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          // 删除员工基本信息
          db.collection('workers').doc(id).remove()
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success' });
              
              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            })
            .catch(err => {
              console.error('删除员工失败:', err);
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  }
});