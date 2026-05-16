// pages/my-records/my-records.js
const app = getApp();

Page({
  data: {
    records: [],
    loading: true
  },

  onLoad: function () {
    this.fetchMyRecords();
  },

  fetchMyRecords: function () {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getMyAttendance',
      success: res => {
        wx.hideLoading();
        if (res.result.success) {
          // 格式化时间戳，方便展示
          const formattedRecords = res.result.data.map(record => {
            const submittedAt = record.submitted_at;
            if (submittedAt) {
              const date = new Date(submittedAt);
              record.formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            } else {
              record.formattedDate = '-';
            }
            return record;
          });
          
          this.setData({
            records: formattedRecords,
            loading: false
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '获取失败', icon: 'none' });
        this.setData({ loading: false });
      }
    });
  }
});