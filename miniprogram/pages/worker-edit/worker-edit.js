const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    workerInfo: null,
    loading: true,
    saving: false,
    editMode: false,
    teams: ['木工组', '钢筋组', '水电组', '泥工组', '涂料组', '其他'],
    teamIndex: 0,
    name: '',
    phone: ''
  },

  onLoad() {
    const workerInfo = app.globalData.workerInfo;
    if (workerInfo) {
      const teamIndex = this.data.teams.findIndex(t => t === workerInfo.team);
      this.setData({
        workerInfo,
        name: workerInfo.name || '',
        phone: workerInfo.phone || '',
        teamIndex: teamIndex >= 0 ? teamIndex : 5,
        loading: false
      });
    } else {
      wx.showToast({ title: '获取信息失败', icon: 'none' });
    }
  },

  enableEdit() {
    this.setData({ editMode: true });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onTeamChange(e) {
    this.setData({ teamIndex: e.detail.value });
  },

  saveInfo() {
    const { name, phone, saving, workerInfo } = this.data;
    if (!name || name.trim() === '') {
      return wx.showToast({ title: '请输入姓名', icon: 'none' });
    }

    if (saving) return;

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });

    const nextWorkerInfo = {
      ...workerInfo,
      name: name.trim(),
      phone: phone.trim(),
      team: this.data.teams[this.data.teamIndex]
    };

    db.collection('workers').doc(workerInfo._id).update({
      data: {
        name: nextWorkerInfo.name,
        phone: nextWorkerInfo.phone,
        team: nextWorkerInfo.team
      }
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });

      app.globalData.workerInfo = nextWorkerInfo;
      this.setData({
        workerInfo: nextWorkerInfo,
        editMode: false,
        saving: false
      });
    }).catch(err => {
      wx.hideLoading();
      this.setData({ saving: false });
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  }
});
