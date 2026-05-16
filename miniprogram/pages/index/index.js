// pages/index/index.js
const app = getApp();
const db = wx.cloud.database();
const _ = db.command;

// 统一格式化疑问的提交时间（兼容云数据库返回的多种格式）
function formatCreateTime(createTime) {
  if (!createTime) return '';
  if (typeof createTime === 'string' && /^\d{4}-\d{2}-\d{2}/.test(createTime)) {
    try {
      return new Date(createTime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return createTime; }
  }
  if (typeof createTime === 'number') {
    return new Date(createTime).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  if (createTime instanceof Date) {
    return createTime.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  if (typeof createTime === 'object') {
    const dateStr = createTime.$date || createTime.date;
    if (dateStr) {
      try {
        return new Date(dateStr).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch (e) {}
    }
  }
  return '';
}

Page({
  data: {
    isLoading: true,
    userRole: null, // 'ADMIN' 或 'WORKER'
    workerInfo: null,

    // 员工端数据
    stats: {
      attendanceCount: 0,
      advanceTotal: 0
    },
    isThisMonthSubmitted: false,

    // 管理员端数据
    reportMonth: '',
    summary: { total: 0, submitted: 0, pending: 0 },
    pendingWorkers: [],
    isReminding: false,
    isExporting: false,
    completionRate: 0,
    progressWidth: '0%',

    // 疑问弹窗
    showQuestionModal: false,
    currentQuestion: null,
    questionCount: 0,
    showQuestionsList: false,
    questionsList: [],
    questionAdvances: [],
    showAdvanceEditModal: false,
    currentQuestionAdvance: null,
    advanceEditData: {
      _id: '',
      amount: '',
      date: '',
      method: '',
      remark: ''
    },
    advanceMethodOptions: ['现金', '微信', '支付宝', '银行卡', '其他']
  },

  onLoad(options) {
    // 默认设置为当前月份
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    this.setData({
      reportMonth: `${year}-${month}`
    });

    // 检查是否通过分享链接进入（带有questionId参数）
    if (options.questionId) {
      this.handleShareQuestion(options.questionId);
    }

    this.checkUserRole();
  },

  // 处理分享进入的疑问
  handleShareQuestion(questionId) {
    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();

    db.collection('advance_questions').doc(questionId).get()
      .then(res => {
        wx.hideLoading();
        const question = res.data;
        if (question) {
          question.createTimeDisplay = formatCreateTime(question.createTime);

          // 显示疑问详情弹窗
          this.setData({
            showQuestionModal: true,
            currentQuestion: question
          });
          // 获取该员工的借支记录和对应的借支
          this.fetchQuestionAdvances(question.workerId || question.worker_id, question.advanceId);
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('获取疑问失败:', err);
        wx.showToast({ title: '获取疑问失败', icon: 'none' });
      });
  },

  // 关闭疑问弹窗
  hideQuestionModal() {
    this.setData({
      showQuestionModal: false,
      currentQuestion: null
    });
  },

  // 回复疑问
  replyQuestion(e) {
    const replyContent = e.detail.value.replyContent;
    if (!replyContent || !replyContent.trim()) {
      wx.showToast({ title: '请输入回复内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...' });
    const db = wx.cloud.database();

    db.collection('advance_questions').doc(this.data.currentQuestion._id).update({
      data: {
        replyContent: replyContent.trim(),
        replyTime: db.serverDate(),
        status: 'replied'
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '回复成功', icon: 'success' });
      // 更新弹窗内状态
      this.setData({
        'currentQuestion.status': 'replied',
        'currentQuestion.replyContent': replyContent.trim()
      });
      // 更新疑问列表中的状态（过滤掉已回复的，因为已回复不再是待处理）
      const questionsList = this.data.questionsList.filter(q => q._id !== this.data.currentQuestion._id);
      this.setData({
        questionsList,
        questionCount: Math.max(0, this.data.questionCount - 1)
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '回复失败', icon: 'none' });
      console.error('回复疑问失败:', err);
    });
  },

  // 标记为已处理
  markAsResolved() {
    wx.showLoading({ title: '处理中...' });
    const db = wx.cloud.database();

    db.collection('advance_questions').doc(this.data.currentQuestion._id).update({
      data: {
        status: 'resolved',
        resolveTime: db.serverDate()
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '已标记为已处理', icon: 'success' });
      // 更新弹窗内状态
      this.setData({
        'currentQuestion.status': 'resolved'
      });
      // 更新疑问列表中的状态（过滤掉已处理的）
      const questionsList = this.data.questionsList.filter(q => q._id !== this.data.currentQuestion._id);
      this.setData({
        questionsList,
        questionCount: Math.max(0, this.data.questionCount - 1)
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 刷新待处理疑问数量
  refreshQuestionCount() {
    const db = wx.cloud.database();
    db.collection('advance_questions').where({
      status: 'pending'
    }).get().then(res => {
      this.setData({
        questionCount: res.data.length
      });
    }).catch(err => {
      console.error('刷新疑问数失败:', err);
    });
  },

  onShow() {
    // 每次页面显示时刷新数据
    if (this.data.userRole === 'ADMIN') {
      this.fetchData();
    } else if (this.data.userRole === 'WORKER' && app.globalData.workerInfo) {
      // 员工端刷新统计数据
      this.fetchWorkerStats(app.globalData.workerInfo._id);
    }
  },

  // 供其他页面调用的刷新方法
  refreshWorkerStats() {
    if (app.globalData.workerInfo) {
      this.fetchWorkerStats(app.globalData.workerInfo._id);
    }
  },

  // 检查用户角色：管理员还是员工
  async checkUserRole() {
    wx.showLoading({ title: '加载中...' });

    try {
      // 调用登录云函数获取用户信息
      const loginRes = await wx.cloud.callFunction({
        name: 'login'
      });

      if (!loginRes.result || !loginRes.result.success) {
        wx.showToast({ title: '登录失败', icon: 'none' });
        this.setData({ isLoading: false });
        wx.hideLoading();
        return;
      }

      const user = loginRes.result.user;

      // 新用户（未选择角色），跳转到角色选择页面
      if (loginRes.result.isNew) {
        wx.redirectTo({
          url: '/pages/role-select/role-select'
        });
        wx.hideLoading();
        return;
      }

      // 判断用户角色
      if (user.role === 'ADMIN') {
        // 管理者
        app.globalData.userRole = 'ADMIN';
        app.globalData.userInfo = user;
        this.setData({
          isLoading: false,
          userRole: 'ADMIN'
        });
        this.fetchData();
      } else {
        // 员工：检查是否已绑定微信（用 openid 字段查询，因为云函数绑定时写入的是 openid）
        const workerRes = await db.collection('workers').where({
          openid: user._openid
        }).get();

        if (workerRes.data.length > 0) {
          // 已绑定，显示员工端
          app.globalData.userRole = 'WORKER';
          app.globalData.workerInfo = workerRes.data[0];
          this.setData({
            isLoading: false,
            userRole: 'WORKER',
            workerInfo: workerRes.data[0]
          });
          // 获取员工统计数据
          this.fetchWorkerStats(workerRes.data[0]._id);
        } else {
          // 员工未绑定微信，跳转到绑定页面
          this.setData({ isLoading: false });
          wx.hideLoading();
          wx.redirectTo({
            url: '/pages/bind-account/bind-account'
          });
        }
      }
    } catch (err) {
      console.error('检查角色失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ isLoading: false });
    } finally {
      wx.hideLoading();
    }
  },

  // 获取员工端统计数据
  async fetchWorkerStats(workerId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const currentMonth = `${year}-${month.toString().padStart(2, '0')}`;

    // 计算上个月
    let lastMonth = month - 1;
    let lastYear = year;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastYear = year - 1;
    }
    const lastMonthStr = `${lastYear}-${lastMonth.toString().padStart(2, '0')}`;

    try {
      // 获取考勤记录数
      const attendanceRes = await db.collection('attendance').where({
        worker_id: workerId
      }).get();

      // 获取借支总额（同时查询 workerId 和 worker_id 字段，兼容历史数据）
      const advanceRes = await db.collection('advances').where(
        _.or([
          { workerId: workerId },
          { worker_id: workerId }
        ])
      ).get();

      const advanceTotal = advanceRes.data.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      // 检查上月是否已提交（显示的是"上月考勤"）
      const lastMonthRes = await db.collection('attendance').where({
        worker_id: workerId,
        month: lastMonthStr
      }).get();

      this.setData({
        stats: {
          attendanceCount: attendanceRes.data.length,
          advanceTotal: advanceTotal
        },
        isThisMonthSubmitted: lastMonthRes.data.length > 0
      });
    } catch (err) {
      console.error('获取统计数据失败', err);
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    if (this.data.userRole === 'ADMIN') {
      this.fetchData().then(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      this.checkUserRole().then(() => {
        wx.stopPullDownRefresh();
      });
    }
  },

  // 跳转到填报考勤
  goToWorkerAttendance() {
    wx.navigateTo({
      url: '/pages/worker-attendance/worker-attendance'
    });
  },

  // 跳转到我的考勤
  goToMyRecords() {
    wx.navigateTo({
      url: '/pages/my-records/my-records'
    });
  },

  // 跳转到我的借支
  goToMyAdvance() {
    wx.navigateTo({
      url: '/pages/my-advance/my-advance'
    });
  },

  // 跳转到编辑员工信息页面
  goToEditWorker() {
    wx.navigateTo({
      url: '/pages/worker-edit/worker-edit'
    });
  },

  // 获取页面数据
  async fetchData() {
  wx.showNavigationBarLoading();
  try {
    const month = this.data.reportMonth;
    
    // 1. 获取统计数据
    const summaryRes = await wx.cloud.callFunction({
      name: 'getAttendanceSummary',
      data: { month }
    });
    
    // 2. 获取所有员工（调用修改后的云函数）
    const workersRes = await wx.cloud.callFunction({
      name: 'getWorkers'
    });
    
    // 注意这里：从 workersRes.result.data 中获取数组
    const allWorkers = workersRes.result.data || []; 

    // 3. 获取已填报的记录
    const db = wx.cloud.database();
    const attendanceRes = await db.collection('attendance')
      .where({ month: month })
      .get();
    
    // 提取已填报的 worker_id 集合
    const submittedWorkerIds = new Set(attendanceRes.data.map(a => a.worker_id));
    
      // 4. 过滤出未填报的员工（使用 allWorkers）
      const pendingWorkers = allWorkers.filter(w => !submittedWorkerIds.has(w._id));

      // 5. 获取待处理的疑问数量
      const questionsRes = await db.collection('advance_questions').where({
        status: 'pending'
      }).get();
      const questionCount = questionsRes.data.length;

      // 计算完成率 (处理分母为0的情况)
      const totalCount = summaryRes.result.total || 0;
      const submittedCount = summaryRes.result.submitted || 0;
      const rateNumber = totalCount === 0 ? 0 : Math.round((submittedCount / totalCount) * 100);

      this.setData({
        summary: summaryRes.result,
        pendingWorkers: pendingWorkers,
        completionRate: rateNumber,
        progressWidth: `${rateNumber}%`,
        questionCount: questionCount
      });
    } catch (err) {
      console.error('获取数据失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  // 月份选择器改变器
  onMonthChange(e) {
    this.setData({
      reportMonth: e.detail.value
    });
    this.fetchData();
  },

  // 微信一键催办
  handleWeChatRemind() {
    if (this.data.summary.pending === 0) {
      wx.showToast({ title: '所有员工均已填报', icon: 'none' });
      return;
    }

    this.setData({ isReminding: true });
    wx.showLoading({ title: '发送中...' });

    // 模拟发送延迟
    setTimeout(() => {
      wx.hideLoading();
      this.setData({ isReminding: false });
      wx.showToast({
        title: `已向 ${this.data.summary.pending} 人发送提醒`,
        icon: 'success',
        duration: 2000
      });
    }, 1500);
  },

  // 生成报表 (跳转到报表页)
  handleExportReport() {
    wx.navigateTo({
      url: `/pages/report/report?month=${this.data.reportMonth}`
    });
  },

  // 跳转到疑问列表
  goToQuestions() {
    this.fetchQuestionsList();
  },

  // 获取疑问列表
  fetchQuestionsList() {
    wx.showLoading({ title: '加载中...' });
    const db = wx.cloud.database();

    // 同时获取所有疑问和待处理数量
    const listPromise = db.collection('advance_questions').orderBy('createTime', 'desc').get();
    const pendingPromise = db.collection('advance_questions').where({ status: 'pending' }).get();

    Promise.all([listPromise, pendingPromise])
      .then(([listRes, pendingRes]) => {
        wx.hideLoading();
        // 处理时间显示
        const questionsList = (listRes.data || []).map(q => ({
          ...q,
          createTimeDisplay: formatCreateTime(q.createTime)
        }));
        this.setData({
          showQuestionsList: true,
          questionsList: questionsList,
          questionCount: pendingRes.data.length
        });
      })
      .catch(err => {
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
        console.error('获取疑问列表失败:', err);
      });
  },

  // 关闭疑问列表弹窗
  hideQuestionsList() {
    this.setData({
      showQuestionsList: false,
      questionsList: []
    });
  },

  // 点击查看疑问详情
  onQuestionItemTap(e) {
    const question = e.currentTarget.dataset.question;

    question.createTimeDisplay = formatCreateTime(question.createTime);

    this.setData({
      showQuestionsList: false,
      currentQuestion: question,
      showQuestionModal: true
    });
    // 获取该员工的借支记录和对应的借支
    this.fetchQuestionAdvances(question.workerId || question.worker_id, question.advanceId);
  },

  // 获取疑问相关员工的借支记录
  fetchQuestionAdvances(workerId, advanceId) {
    const db = wx.cloud.database();
    const promises = [];

    // 获取该员工的全部借支记录
    if (workerId) {
      promises.push(
        db.collection('advances').where({
          worker_id: workerId
        }).orderBy('date', 'desc').get()
          .then(res => res.data || [])
          .catch(err => {
            console.error('获取借支记录失败:', err);
            return [];
          })
      );
    } else {
      promises.push(Promise.resolve([]));
    }

    // 获取对应的借支记录
    if (advanceId) {
      promises.push(
        db.collection('advances').doc(advanceId).get()
          .then(res => res.data || null)
          .catch(err => {
            console.error('获取对应借支失败:', err);
            return null;
          })
      );
    } else {
      promises.push(Promise.resolve(null));
    }

    Promise.all(promises).then(([allAdvances, targetAdvance]) => {
      this.setData({
        questionAdvances: allAdvances,
        currentQuestionAdvance: targetAdvance
      });
    });
  },

  // 修改借支记录
  editQuestionAdvance(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showAdvanceEditModal: true,
      advanceEditData: {
        _id: item._id,
        amount: item.amount,
        date: item.date,
        method: item.method || '现金',
        remark: item.remark || ''
      }
    });
  },

  // 关闭借支编辑弹窗
  hideAdvanceEditModal() {
    this.setData({
      showAdvanceEditModal: false,
      advanceEditData: {
        _id: '',
        amount: '',
        date: '',
        method: '',
        remark: ''
      }
    });
  },

  // 借支金额输入
  onAdvanceEditAmount(e) {
    this.setData({ 'advanceEditData.amount': e.detail.value });
  },

  // 借支日期选择
  onAdvanceEditDate(e) {
    this.setData({ 'advanceEditData.date': e.detail.value });
  },

  // 借支支付方式选择
  onAdvanceEditMethod(e) {
    const method = this.data.advanceMethodOptions[e.detail.value];
    this.setData({ 'advanceEditData.method': method });
  },

  // 借支备注输入
  onAdvanceEditRemark(e) {
    this.setData({ 'advanceEditData.remark': e.detail.value });
  },

  // 保存借支修改
  saveQuestionAdvance() {
    const { advanceEditData } = this.data;

    if (!advanceEditData.amount || Number(advanceEditData.amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    const db = wx.cloud.database();

    db.collection('advances').doc(advanceEditData._id).update({
      data: {
        amount: Number(advanceEditData.amount),
        date: advanceEditData.date,
        method: advanceEditData.method,
        remark: advanceEditData.remark
      }
    }).then(res => {
      wx.hideLoading();
      wx.showToast({ title: '修改成功', icon: 'success' });
      this.hideAdvanceEditModal();
      // 刷新借支列表
      this.fetchQuestionAdvances(
        this.data.currentQuestion.workerId || this.data.currentQuestion.worker_id,
        this.data.currentQuestion.advanceId
      );
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '修改失败', icon: 'none' });
      console.error('修改借支失败:', err);
    });
  },

  // 删除借支记录
  deleteQuestionAdvance() {
    const { advanceEditData, currentQuestion } = this.data;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该借支记录吗？',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          const db = wx.cloud.database();

          db.collection('advances').doc(advanceEditData._id).remove()
            .then(res => {
              wx.hideLoading();
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.hideAdvanceEditModal();
              this.fetchQuestionAdvances(
                currentQuestion.workerId || currentQuestion.worker_id,
                currentQuestion.advanceId
              );
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: '删除失败', icon: 'none' });
            });
        }
      }
    });
  }
});