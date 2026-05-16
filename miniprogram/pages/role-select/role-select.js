const app = getApp();

Page({
  data: {
    showAdminModal: false,
    inviteCode: '',
    errorMsg: '',
    verifying: false,
    checkingLogin: true
  },

  onLoad() {
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const self = this;
    wx.showLoading({ title: '检查登录状态...' });

    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(function (loginRes) {
      wx.hideLoading();
      console.log('自动登录检查:', loginRes);

      const result = loginRes && loginRes.result ? loginRes.result : null;
      const user = result && result.user ? result.user : null;
      const success = !!(result && result.success);
      const isNew = !!(result && result.isNew);

      console.log('result:', result);
      console.log('success:', success);
      console.log('user:', user);
      console.log('role:', user ? user.role : '');

      if (!result || !success || isNew || !user) {
        self.setData({ checkingLogin: false });
        return;
      }

      app.globalData.userRole = user.role;
      app.globalData.userInfo = user;

      if (user.role === 'ADMIN') {
        wx.switchTab({
          url: '/pages/index/index'
        });
        return;
      }

      if (user.role === 'WORKER') {
        wx.redirectTo({
          url: '/pages/worker-attendance/worker-attendance'
        });
        return;
      }

      self.setData({ checkingLogin: false });
    }).catch(function (err) {
      wx.hideLoading();
      console.error('自动登录检查失败:', err);
      self.setData({ checkingLogin: false });
    });
  },

  onAdminTap() {
    this.setData({
      showAdminModal: true,
      inviteCode: '',
      errorMsg: ''
    });
  },

  onWorkerTap() {
    wx.redirectTo({
      url: '/pages/bind-account/bind-account'
    });
  },

  onInviteCodeInput(e) {
    this.setData({
      inviteCode: e.detail.value,
      errorMsg: ''
    });
  },

  onCancelAdmin() {
    this.setData({
      showAdminModal: false,
      inviteCode: '',
      errorMsg: ''
    });
  },

  onConfirmAdmin() {
    const self = this;
    const inviteCode = this.data.inviteCode;

    if (!inviteCode || inviteCode.trim() === '') {
      this.setData({ errorMsg: '请输入邀请码' });
      return;
    }

    const trimmedCode = inviteCode.trim().toUpperCase();
    if (!trimmedCode.startsWith('ADMIN_')) {
      this.setData({ errorMsg: '邀请码格式错误，应以 ADMIN_ 开头' });
      return;
    }

    this.setData({ verifying: true, errorMsg: '' });

    wx.cloud.callFunction({
      name: 'login',
      data: { inviteCode: trimmedCode }
    }).then(function (loginRes) {
      console.log('登录结果:', loginRes);

      const result = loginRes && loginRes.result ? loginRes.result : null;
      if (!result) {
        self.setData({ errorMsg: '调用失败，请重试', verifying: false });
        return;
      }

      if (!result.success) {
        self.setData({
          errorMsg: result.error || '验证失败，请重试',
          verifying: false
        });
        return;
      }

      const user = result.user || null;
      const isNew = !!result.isNew;

      if (isNew) {
        if (user && user.role === 'ADMIN') {
          app.globalData.userRole = 'ADMIN';
          app.globalData.userInfo = user;
          wx.reLaunch({
            url: '/pages/index/index'
          });
        } else {
          self.setData({ errorMsg: '邀请码无效，请检查后重试', verifying: false });
        }
        return;
      }

      if (user && user.role === 'ADMIN') {
        app.globalData.userRole = 'ADMIN';
        app.globalData.userInfo = user;
        wx.reLaunch({
          url: '/pages/index/index'
        });
        return;
      }

      if (user && user.role === 'WORKER') {
        self.setData({
          errorMsg: '您已是员工，请联系管理员升级为管理员',
          verifying: false
        });
        return;
      }

      self.setData({
        checkingLogin: false,
        verifying: false
      });
    }).catch(function (err) {
      console.error('管理员验证失败:', err);
      self.setData({
        errorMsg: '网络错误，请重试',
        verifying: false
      });
    });
  }
});
