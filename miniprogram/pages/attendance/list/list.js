// pages/attendance/list/list.js
const db = wx.cloud.database();
const _ = db.command;

// 获取当前 YYYY-MM
const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

Page({
  data: {
    currentMonth: getCurrentMonth(),
    
    // 筛选器选项
    workerOptions: [{ _id: 'ALL', name: '全部人员' }],
    workerIndex: 0,
    projectOptions: [{ _id: 'ALL', name: '全部工地' }],
    projectIndex: 0,
    
    // 聚合后的展示数据
    aggregatedData: [],
    
    // 导出弹窗状态
    showModal: false,
    exportStart: getCurrentMonth(),
    exportEnd: getCurrentMonth(),
  },

  onLoad(options) {
    // 1. 接收传递过来的月份
    if (options.month) {
      this.setData({ currentMonth: options.month });
    }
    // 2. 暂存传递过来的 workerId，等下拉列表加载完后再去匹配
    this.targetWorkerId = options.workerId || null;

    this.loadFilterOptions();
  },

  onShow() {
    // 每次页面显示时刷新数据
    this.fetchAttendanceData();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.fetchAttendanceData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.reLaunch({ url: '/pages/index/index' });
    }
  },

  // 1. 加载人员和工地选项
  loadFilterOptions() {
    wx.showLoading({ title: '加载选项...' });
    Promise.all([
      db.collection('workers').get(),
      db.collection('projects').get()
    ]).then(([workersRes, projectsRes]) => {
      const workerOptions = [{ _id: 'ALL', name: '全部人员' }, ...workersRes.data];
      const projectOptions = [{ _id: 'ALL', name: '全部工地' }, ...projectsRes.data];

      let workerIndex = 0;
      if (this.targetWorkerId) {
        const idx = workerOptions.findIndex(w => w._id === this.targetWorkerId);
        if (idx > -1) workerIndex = idx;
      }

      this.setData({ 
        workerOptions, 
        projectOptions,
        workerIndex
      }, () => {
        this.fetchAttendanceData();
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('加载选项失败', err);
    });
  },

  // 2. 筛选器改变事件
  onMonthChange(e) {
    this.setData({ currentMonth: e.detail.value }, () => this.fetchAttendanceData());
  },
  onWorkerChange(e) {
    this.setData({ workerIndex: e.detail.value }, () => this.fetchAttendanceData());
  },
  onProjectChange(e) {
    this.setData({ projectIndex: e.detail.value }, () => this.fetchAttendanceData());
  },

  // 3. 获取考勤数据（新的 entries 结构）
  fetchAttendanceData() {
    wx.showLoading({ title: '加载中...' });
    const { currentMonth, workerOptions, workerIndex, projectOptions, projectIndex } = this.data;

    // 构建查询条件
    let query = { month: currentMonth };

    const selectedWorkerId = workerOptions[workerIndex]._id;
    if (selectedWorkerId !== 'ALL') {
      query.worker_id = selectedWorkerId;
    }

    return db.collection('attendance').where(query).limit(1000).get()
      .then(res => {
        wx.hideLoading();
        this.aggregateData(res.data);
      })
      .catch(err => {
        wx.hideLoading();
        console.error('获取考勤失败', err);
      });
  },

  // 核心：将数据按工人分组聚合
  aggregateData(rawData) {
    const { projectOptions, projectIndex } = this.data;
    const selectedProjectId = projectOptions[projectIndex]._id;
    
    const map = {};
    
    rawData.forEach(record => {
      const wId = record.worker_id;
      const entries = record.entries || [];
      
      if (!map[wId]) {
        map[wId] = {
          workerId: wId,
          workerName: '',
          totalDays: 0,
          projectsMap: {}
        };
      }
      
      // 遍历该员工的每个工地记录
      entries.forEach(entry => {
        const pId = entry.project_id;
        const days = Number(entry.days) || 0;
        
        // 如果选择了特定工地，过滤其他工地
        if (selectedProjectId !== 'ALL' && selectedProjectId !== pId) {
          return;
        }
        
        map[wId].totalDays += days;
        
        if (!map[wId].projectsMap[pId]) {
          map[wId].projectsMap[pId] = {
            projectId: pId,
            projectName: entry.project_name || '未知工地',
            days: 0
          };
        }
        map[wId].projectsMap[pId].days += days;
      });
    });

    // 转换为数组格式
    const result = Object.values(map).map(worker => {
      return {
        ...worker,
        projects: Object.values(worker.projectsMap)
      };
    });

    // 获取员工姓名
    this.loadWorkerNames(result);
  },

  loadWorkerNames(aggregatedData) {
    const workerIds = aggregatedData.map(d => d.workerId);
    if (workerIds.length === 0) {
      this.setData({ aggregatedData: [] });
      return;
    }

    db.collection('workers').where({
      _id: _.in(workerIds)
    }).get().then(res => {
      const workersMap = {};
      res.data.forEach(w => {
        workersMap[w._id] = w.name;
      });

      const result = aggregatedData.map(item => ({
        ...item,
        workerName: workersMap[item.workerId] || '未知员工'
      }));

      this.setData({ aggregatedData: result });
    });
  },

  // ================= 导出功能 =================
  showExportModal() {
    this.setData({ showModal: true });
  },
  hideExportModal() {
    this.setData({ showModal: false });
  },
  onExportStartChange(e) { this.setData({ exportStart: e.detail.value }); },
  onExportEndChange(e) { this.setData({ exportEnd: e.detail.value }); },

  confirmExport() {
    const { exportStart, exportEnd } = this.data;
    if (exportStart > exportEnd) {
      return wx.showToast({ title: '开始月份不能晚于结束月份', icon: 'none' });
    }

    wx.showLoading({ title: '正在生成Excel...', mask: true });
    
    wx.cloud.callFunction({
      name: 'exportAttendance',
      data: { startMonth: exportStart, endMonth: exportEnd }
    }).then(res => {
      if (res.result && res.result.success) {
        wx.cloud.downloadFile({
          fileID: res.result.fileID,
          success: downloadRes => {
            wx.hideLoading();
            this.hideExportModal();
            wx.openDocument({
              filePath: downloadRes.tempFilePath,
              showMenu: true,
              fileType: 'xlsx'
            });
          }
        });
      } else {
        wx.hideLoading();
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('云函数调用失败', err);
      wx.showToast({ title: '调用失败', icon: 'none' });
    });
  }
});