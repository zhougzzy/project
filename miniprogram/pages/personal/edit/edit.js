const db = wx.cloud.database();

Page({
  data: {
    workerId: null,
    formData: {
      name: '',
      phone: '',
      team: '',
      status: 'UNLINKED'
    },
    submitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ workerId: options.id });
      this.fetchWorkerData(options.id);
    }
  },

  fetchWorkerData(id) {
    wx.showLoading({ title: '加载中...' });

    db.collection('workers').doc(id).get()
      .then(res => {
        wx.hideLoading();
        const data = res.data;
        this.setData({
          formData: {
            name: data.name || '',
            phone: data.phone || '',
            team: data.team || '',
            status: data.status || 'UNLINKED'
          }
        });
      })
      .catch(err => {
        wx.hideLoading();
        console.error('获取员工数据失败:', err);
        wx.showToast({ title: '数据加载失败', icon: 'none' });
      });
  },

  handleInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });
  },

  handleSubmit() {
    const { formData, workerId, submitting } = this.data;

    if (!formData.name.trim()) {
      wx.showToast({ title: '请填写姓名', icon: 'none' });
      return;
    }

    if (submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...' });

    const submitData = {
      ...formData,
      updateTime: db.serverDate()
    };

    if (workerId) {
      db.collection('workers').doc(workerId).update({
        data: submitData
      })
        .then(() => {
          this.handleSubmitSuccess('修改成功');
        })
        .catch(err => {
          this.handleSubmitFail(err);
        });
    } else {
      submitData.createTime = db.serverDate();

      db.collection('workers').add({
        data: submitData
      })
        .then(() => {
          this.handleSubmitSuccess('添加成功');
        })
        .catch(err => {
          this.handleSubmitFail(err);
        });
    }
  },

  handleSubmitSuccess(title) {
    wx.hideLoading();
    this.setData({ submitting: false });

    wx.showToast({
      title,
      icon: 'success',
      duration: 1500
    });

    setTimeout(() => {
      wx.navigateBack();
    }, 1500);
  },

  handleSubmitFail(err) {
    wx.hideLoading();
    this.setData({ submitting: false });
    console.error('保存失败:', err);
    wx.showToast({ title: '保存失败，请重试', icon: 'none' });
  }
});
