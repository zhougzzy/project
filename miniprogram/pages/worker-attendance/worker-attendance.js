// pages/worker-attendance/worker-attendance.js
const app = getApp();
const db = wx.cloud.database();

// 获取上个月（员工端填报的是上月考勤）
const getLastMonth = () => {
  const d = new Date();
  let month = d.getMonth(); // 上个月（0-11）
  let year = d.getFullYear();
  if (month === 0) {
    month = 12;
    year = year - 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

// 获取指定月份的天数
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

const getLastMonthDays = () => {
  const d = new Date();
  let month = d.getMonth(); // 上个月（0-11）
  let year = d.getFullYear();
  if (month === 0) {
    month = 12;
    year = year - 1;
  }
  return getDaysInMonth(year, month);
};

// 获取可选月份范围（只能选上个月及之前）
const getMonthRange = () => {
  const d = new Date();
  let lastMonth = d.getMonth(); // 上个月
  let year = d.getFullYear();
  if (lastMonth === 0) {
    lastMonth = 12;
    year = year - 1;
  }
  const endMonth = `${year}-${String(lastMonth).padStart(2, '0')}`;
  return { start: '2020-01', end: endMonth };
};

Page({
  data: {
    workerInfo: null,
    currentMonth: getLastMonth(),
    currentMonthDays: getLastMonthDays(),
    monthRange: getMonthRange(),
    projects: [],
    selectedProjects: [],
    submitting: false,
    checkedCount: 0,
    totalDays: 0,
    isSubmitted: false
  },

  onLoad() {
    const workerInfo = app.globalData.workerInfo;
    if (!workerInfo) {
      wx.showToast({ title: '请先绑定账号', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
      return;
    }

    this.setData({ workerInfo: workerInfo });
    this.fetchProjects();
    this.checkSubmitted();
  },

  onShow() {
    // 每次显示页面时刷新数据（解决提交后不同步的问题）
    if (this.data.workerInfo) {
      this.checkSubmitted();
    }
  },

  // 月份选择变化
  onMonthChange(e) {
    const newMonth = e.detail.value;
    const [year, month] = newMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    this.setData({ currentMonth: newMonth, currentMonthDays: daysInMonth });
    this.checkSubmitted();
  },

  // 空方法，用于阻止事件冒泡
  noop() {},

  fetchProjects() {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getProjects'
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const projects = res.result.data.map(p => ({
          ...p,
          checked: false,
          days: '',
          remark: ''
        }));
        this.setData({ projects: projects });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '获取项目失败', icon: 'none' });
    });
  },

  checkSubmitted() {
    const workerInfo = this.data.workerInfo;
    if (!workerInfo) return;

    db.collection('attendance').where({
      worker_id: workerInfo._id,
      month: this.data.currentMonth
    }).get().then(res => {
      if (res.data.length > 0) {
        const record = res.data[0];
        const entries = record.entries || [];

        // 标记为已提交
        this.setData({ isSubmitted: true });

        // 更新工地选中状态和考勤数据
        const projects = this.data.projects.map(p => {
          const entry = entries.find(e => e.project_id === p._id);
          if (entry) {
            return {
              ...p,
              checked: true,
              days: String(entry.days || ''),
              remark: entry.remark || ''
            };
          }
          return p;
        });

        this.setData({ projects: projects }, () => {
          this.updateCheckedCount();
        });
      } else {
        // 未提交
        this.setData({ isSubmitted: false });
      }
    });
  },

  // 切换工地卡片选中状态
  toggleProject(e) {
    // 如果已提交，禁止修改
    if (this.data.isSubmitted) {
      return;
    }

    const index = e.currentTarget.dataset.index;
    const { projects } = this.data;

    projects[index].checked = !projects[index].checked;

    // 如果取消选中，清空填写的数据
    if (!projects[index].checked) {
      projects[index].days = '';
      projects[index].remark = '';
    }

    this.setData({ projects: projects }, () => {
      this.updateCheckedCount();
    });
  },

  // 快捷设置天数
  setQuickDays(e) {
    const index = e.currentTarget.dataset.index;
    const days = e.currentTarget.dataset.days;
    const { projects, currentMonthDays } = this.data;

    // 不能超过当月天数
    const validDays = Math.min(days, currentMonthDays);
    projects[index].days = String(validDays);

    this.setData({ projects: projects }, () => {
      this.updateTotalDays();
    });
  },

  // 增加天数
  increaseDays(e) {
    const index = e.currentTarget.dataset.index;
    const { projects, currentMonthDays } = this.data;
    let days = parseFloat(projects[index].days) || 0;
    if (days < currentMonthDays) {
      days = Math.min(currentMonthDays, days + 0.5);
      projects[index].days = days % 1 === 0 ? String(days) : days.toFixed(1);
      this.setData({ projects: projects }, () => {
        this.updateTotalDays();
      });
    }
  },

  // 减少天数
  decreaseDays(e) {
    const index = e.currentTarget.dataset.index;
    const { projects } = this.data;
    let days = parseFloat(projects[index].days) || 0;
    if (days > 0) {
      days = Math.max(0, days - 0.5);
      projects[index].days = days % 1 === 0 ? String(days) : days.toFixed(1);
      this.setData({ projects: projects }, () => {
        this.updateTotalDays();
      });
    }
  },

  // 更新总天数
  updateTotalDays() {
    const total = this.data.projects
      .filter(p => p.checked)
      .reduce((sum, p) => sum + (parseFloat(p.days) || 0), 0);

    let validTotal = total;
    if (total > this.data.currentMonthDays) {
      validTotal = this.data.currentMonthDays;
    }

    this.setData({
      totalDays: validTotal,
      totalDaysInvalid: total > this.data.currentMonthDays
    });
  },

  // 出勤天数输入
  onDaysInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const { projects, currentMonthDays } = this.data;

    // 限制不能超过当月天数
    let days = value;
    const maxDays = currentMonthDays;
    
    // 如果输入了值，检查是否超过当月天数
    if (value && value.trim() !== '') {
      const numVal = parseFloat(value);
      if (!isNaN(numVal) && numVal > maxDays) {
        days = String(maxDays);
      } else if (!isNaN(numVal) && numVal < 0) {
        days = '0';
      }
    }

    projects[index].days = days;
    this.setData({ projects: projects }, () => {
      this.updateTotalDays();
    });
  },

  // 备注输入
  onRemarkInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const { projects } = this.data;

    projects[index].remark = value;
    this.setData({ projects: projects });
  },

  // 更新已选工地数量
  updateCheckedCount() {
    const count = this.data.projects.filter(p => p.checked).length;
    this.setData({ checkedCount: count });
    this.updateTotalDays();
  },

  async onSubmit() {
    const { workerInfo, projects, currentMonth, currentMonthDays } = this.data;

    // 获取选中的工地
    const selectedProjects = projects.filter(p => p.checked);

    if (selectedProjects.length === 0) {
      return wx.showToast({ title: '请至少选择一个工地', icon: 'none' });
    }

    // 校验并构建考勤数据，没填写的自动记为0
    const entries = [];
    for (const item of selectedProjects) {
      let daysNum = parseFloat(item.days);

      // 如果没填写或填写无效，默认记为0
      if (isNaN(daysNum) || item.days === '') {
        daysNum = 0;
      }

      // 限制范围 0-当月天数
      if (daysNum < 0) daysNum = 0;
      if (daysNum > currentMonthDays) daysNum = currentMonthDays;

      entries.push({
        project_id: item._id,
        project_name: item.name,
        days: daysNum,
        remark: item.remark || ''
      });
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'submitAttendance',
        data: {
          worker_id: workerInfo._id,
          month: currentMonth,
          entries: entries
        }
      });

      wx.hideLoading();
      this.setData({ submitting: false });

      if (res.result && res.result.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });

        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.error) || '提交失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '提交失败', icon: 'none' });
      console.error(err);
    }
  }
});
