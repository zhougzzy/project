// pages/report/report.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    month: '',
    groupedRecords: [], // 分组后的考勤记录
    isLoading: true
  },

  onLoad(options) {
    const month = options.month || this.getCurrentMonth();
    this.setData({ month });
    this.fetchReportData(month);
  },

  getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  },

  async fetchReportData(month) {
    wx.showLoading({ title: '生成报表中...' });
    try {
      // 1. 获取当月所有考勤记录
      const attendanceRes = await db.collection('attendance').where({ month }).get();
      const attendances = attendanceRes.data;

      if (attendances.length === 0) {
        this.setData({ groupedRecords: [], isLoading: false });
        wx.hideLoading();
        return;
      }

      // 2. 提取所有涉及到的 worker_id
      const workerIds = [...new Set(attendances.map(a => a.worker_id))];
      
      // 3. 查询工人信息
      const workersRes = await db.collection('workers').where({ _id: _.in(workerIds) }).get();
      
      // 制作映射字典，方便快速查找名字
      const workerMap = {};
      workersRes.data.forEach(w => workerMap[w._id] = w.name);

      // 4. 核心逻辑：按工人分组数据（适配 entries 数组结构）
      const grouped = {};
      attendances.forEach(record => {
        const wId = record.worker_id;
        const entries = record.entries || [];
        
        if (!grouped[wId]) {
          grouped[wId] = {
            workerId: wId,
            workerName: workerMap[wId] || '未知姓名',
            totalDays: 0,
            details: []
          };
        }
        
        // 遍历该员工的所有工地记录
        entries.forEach(entry => {
          grouped[wId].details.push({
            projectName: entry.project_name || '未知工地',
            days: entry.days || 0,
            remark: entry.remark || '-'
          });
          grouped[wId].totalDays += (entry.days || 0);
        });
      });

      // 转换为数组并按姓名排序
      const groupedRecords = Object.values(grouped);
      groupedRecords.sort((a, b) => a.workerName.localeCompare(b.workerName, 'zh'));

      this.setData({ groupedRecords, isLoading: false });
    } catch (err) {
      console.error('获取报表失败', err);
      wx.showToast({ title: '获取数据失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onShareAppMessage() {
    return {
      title: `📢 ${this.data.month} 考勤公示表，请各位工友核对`,
      path: `/pages/report/report?month=${this.data.month}`
    };
  },

  onShareTimeline() {
    return {
      title: `${this.data.month} 考勤公示表，请核对`,
      query: `month=${this.data.month}`
    };
  }
});