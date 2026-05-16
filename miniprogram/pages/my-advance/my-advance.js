// pages/my-advance/my-advance.js
const app = getApp();

Page({
  data: {
    advances: [],
    filteredAdvances: [],
    groupedAdvances: [],
    loading: true,
    loadingMore: false,
    total: 0,
    count: 0,
    hasMore: true,
    pageSize: 10,
    currentPage: 1,

    // 筛选相关
    currentMonth: '',
    filterType: 'all',
    filterText: '全部记录',
    showFilterModal: false,

    // 统计数据
    thisMonthCount: 0,
    lastMonthCount: 0,

    // 疑问分享
    shareQuestion: null,
    pendingQuestion: null
  },

  onLoad() {
    this.initMonth();
    this.fetchAdvances();
  },

  onShow() {
    // 每次显示页面时刷新数据
    if (!this.data.loading) {
      this.fetchAdvances();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.fetchAdvances().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 初始化月份
  initMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    this.setData({
      currentMonth: `${year}-${month}`
    });
  },

  // 获取借支数据
  fetchAdvances() {
    this.setData({ loading: true, loadingMore: false });

    return wx.cloud.callFunction({
      name: 'getWorkerAdvances'
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const advances = res.result.data || [];
        const total = advances.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        // 计算本月和上月数量
        const now = new Date();
        const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

        const thisMonthCount = advances.filter(a => a.date && a.date.startsWith(thisMonthStr)).length;
        const lastMonthCount = advances.filter(a => a.date && a.date.startsWith(lastMonthStr)).length;

        this.setData({
          advances,
          total: total.toFixed(2),
          count: advances.length,
          thisMonthCount,
          lastMonthCount,
          loading: false,
          currentPage: 1,
          hasMore: advances.length > this.data.pageSize
        });

        this.applyFilters();
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '获取失败', icon: 'none' });
        this.setData({ loading: false });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '获取失败', icon: 'none' });
      console.error('获取借支失败:', err);
      this.setData({ loading: false });
    });
  },

  // 应用筛选
  applyFilters() {
    let filtered = [...this.data.advances];
    const { currentMonth, filterType } = this.data;

    // 按月份筛选
    if (currentMonth) {
      filtered = filtered.filter(item => item.date && item.date.startsWith(currentMonth));
    }

    // 按类型筛选
    if (filterType !== 'all') {
      const now = new Date();
      const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

      if (filterType === 'thisMonth') {
        filtered = filtered.filter(item => item.date && item.date.startsWith(thisMonthStr));
      } else if (filterType === 'lastMonth') {
        filtered = filtered.filter(item => item.date && item.date.startsWith(lastMonthStr));
      }
    }

    this.setData({ filteredAdvances: filtered });
    this.groupByMonth();
  },

  // 按月份分组
  groupByMonth() {
    const { filteredAdvances, pageSize, currentPage } = this.data;

    // 分页
    const startIndex = 0;
    const endIndex = currentPage * pageSize;
    const pagedData = filteredAdvances.slice(startIndex, endIndex);

    // 按月份分组
    const groups = {};
    pagedData.forEach(item => {
      const month = item.date ? item.date.substring(0, 7) : '未知月份';
      if (!groups[month]) {
        groups[month] = {
          month: month + '月',
          list: [],
          total: 0
        };
      }
      groups[month].list.push(item);
      groups[month].total += Number(item.amount) || 0;
    });

    // 转换为数组并按月份降序排序
    const grouped = Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map(month => ({
        month: groups[month].month,
        list: groups[month].list,
        total: groups[month].total.toFixed(2)
      }));

    this.setData({
      groupedAdvances: grouped,
      hasMore: endIndex < filteredAdvances.length,
      loadingMore: false
    });
  },

  // 加载更多
  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;

    this.setData({
      loadingMore: true,
      currentPage: this.data.currentPage + 1
    });

    this.groupByMonth();
  },

  // 月份筛选变化
  onMonthChange(e) {
    this.setData({
      currentMonth: e.detail.value,
      currentPage: 1
    });
    this.applyFilters();
  },

  // 切换筛选弹窗
  toggleFilter() {
    this.setData({
      showFilterModal: !this.data.showFilterModal
    });
  },

  // 隐藏筛选弹窗
  hideFilterModal() {
    this.setData({ showFilterModal: false });
  },

  // 选择筛选类型
  selectFilter(e) {
    const type = e.currentTarget.dataset.type;
    const filterTexts = {
      all: '全部记录',
      thisMonth: '本月',
      lastMonth: '上月'
    };

    this.setData({
      filterType: type,
      filterText: filterTexts[type],
      showFilterModal: false,
      currentPage: 1
    });

    this.applyFilters();
  },

  // 点击卡片
  onCardTap(e) {
    // 可以在这里添加详情查看功能
    const id = e.currentTarget.dataset.id;
    console.log('点击了借支记录:', id);
  },

  // 阻止事件冒泡
  stopPropagation() {},

  // 点击有疑问按钮
  onQuestionTap(e) {
    const advanceId = e.currentTarget.dataset.id;
    const advance = this.data.advances.find(a => a._id === advanceId);

    wx.showModal({
      title: '提交疑问',
      placeholderText: '请输入您的疑问...',
      editable: true,
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.setData({
            pendingQuestion: {
              advanceId,
              content: res.content.trim(),
              advance: advance
            }
          });
          this.askToShare(advanceId, res.content.trim(), advance);
        } else if (res.confirm && !res.content) {
          wx.showToast({ title: '请输入疑问内容', icon: 'none' });
        }
      }
    });
  },

  // 询问是否分享给好友
  askToShare(advanceId, content, advance) {
    wx.showModal({
      title: '疑问已提交',
      content: '是否将此疑问分享给管理员？',
      confirmText: '分享给好友',
      cancelText: '仅提交',
      success: (res) => {
        if (res.confirm) {
          // 显示分享提示
          this.submitQuestionAndShare(advanceId, content, advance);
        } else {
          // 仅提交疑问
          this.submitQuestion(advanceId, content);
        }
      }
    });
  },

  // 提交疑问并准备分享
  submitQuestionAndShare(advanceId, content, advance) {
    wx.showLoading({ title: '提交中...' });

    const workerInfo = app.globalData.workerInfo || {};
    const db = wx.cloud.database();

    db.collection('advance_questions').add({
      data: {
        advanceId: advanceId,
        content: content,
        workerId: workerInfo._id || '',
        workerName: workerInfo.name || '',
        status: 'pending',
        createTime: db.serverDate()
      }
    }).then(res => {
      wx.hideLoading();
      // 设置分享数据
      this.setData({
        shareQuestion: {
          id: res.result._id,
          content: content,
          workerName: workerInfo.name || '',
          amount: advance ? advance.amount : '',
          date: advance ? advance.formattedDate : ''
        }
      });
      // 触发分享
      wx.showToast({
        title: '点击右上角分享',
        icon: 'none',
        duration: 2000
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
      console.error('提交疑问失败:', err);
    });
  },

  // 提交疑问（不分享）
  submitQuestion(advanceId, content) {
    wx.showLoading({ title: '提交中...' });

    const workerInfo = app.globalData.workerInfo || {};
    const db = wx.cloud.database();

    db.collection('advance_questions').add({
      data: {
        advanceId: advanceId,
        content: content,
        workerId: workerInfo._id || '',
        workerName: workerInfo.name || '',
        status: 'pending',
        createTime: db.serverDate()
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '已提交疑问', icon: 'success' });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
      console.error('提交疑问失败:', err);
    });
  },

  // 分享给好友
  onShareAppMessage() {
    const { shareQuestion } = this.data;
    if (!shareQuestion) return {};

    const title = `【疑问反馈】${shareQuestion.workerName} - 借支 ¥${shareQuestion.amount}（${shareQuestion.date}）\n${shareQuestion.content}`;
    const path = `/pages/index/index?questionId=${shareQuestion.id}`;

    // 清除分享数据
    this.setData({ shareQuestion: null });

    return {
      title: title,
      path: path
    };
  }
});
