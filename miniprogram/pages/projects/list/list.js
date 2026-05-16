const db = wx.cloud.database();

const formatDate = (dateObj) => {
  if (!dateObj) return '';
  const date = new Date(dateObj);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

Page({
  data: {
    projects: [],
    filteredProjects: [],
    searchQuery: '',
    
    showModal: false,
    modalProjectName: '',
    editingId: null,
    modalCreateDate: '',
    modalFinishDate: '',
  },
// ==================== 返回上级逻辑 ====================
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      // 如果页面栈大于 1，说明有上一页，正常返回
      wx.navigateBack({
        delta: 1
      });
    } else {
      // 如果页面栈等于 1（比如用户是通过分享卡片直接点进来的，没有上一页）
      // 则默认跳转回小程序的首页（请根据您的实际首页路径修改）
      wx.reLaunch({
        url: '/pages/index/index' 
      });
    }
  },
  onShow() {
    this.fetchProjects();
  },

  fetchProjects() {
    wx.showNavigationBarLoading();
    
    db.collection('projects')
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        wx.hideNavigationBarLoading();
        
        const formattedData = res.data.map(p => {
          // 始终只使用创建时间
          const displayDate = p.createTime ? new Date(p.createTime) : new Date();
          p.dateStr = `${displayDate.getFullYear()}/${displayDate.getMonth() + 1}/${displayDate.getDate()}`;
          return p;
        });

        this.setData({ projects: formattedData }, () => {
          this.applyFilter();
        });
      })
      .catch(err => {
        wx.hideNavigationBarLoading();
        console.error('获取项目失败:', err);
      });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  applyFilter() {
    const query = this.data.searchQuery.trim().toLowerCase();
    const filtered = this.data.projects.filter(p => {
      if (!query) return true;
      return p.name && p.name.toLowerCase().includes(query);
    });
    this.setData({ filteredProjects: filtered });
  },

  showAddModal() {
    this.setData({
      showModal: true,
      modalProjectName: '',
      editingId: null,
      modalCreateDate: '',
      modalFinishDate: ''
    });
  },

  handleEdit(e) {
    const id = e.currentTarget.dataset.id;
    const project = this.data.projects.find(p => p._id === id);
    if (!project) return;

    this.setData({
      showModal: true,
      modalProjectName: project.name,
      editingId: id,
      modalCreateDate: formatDate(project.createTime),
      modalFinishDate: formatDate(project.finishTime)
    });
  },

  hideModal() {
    this.setData({ showModal: false });
  },

  onModalInput(e) {
    this.setData({ modalProjectName: e.detail.value });
  },

  confirmSaveProject() {
    const name = this.data.modalProjectName.trim();
    const id = this.data.editingId;

    if (!name) {
      wx.showToast({ title: '请输入工地名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    if (id) {
      db.collection('projects').doc(id).update({
        data: {
          name: name,
          updated_at: db.serverDate()
        }
      }).then(() => {
        this.saveSuccess();
      }).catch(this.saveFail);
    } else {
      db.collection('projects').add({
        data: {
          name: name,
          status: 'IN_PROGRESS',
          createTime: db.serverDate(),
          updated_at: db.serverDate()
        }
      }).then(() => {
        this.saveSuccess();
      }).catch(this.saveFail);
    }
  },

  saveSuccess() {
    wx.hideLoading();
    this.hideModal();
    wx.showToast({ title: '保存成功', icon: 'success' });
    this.fetchProjects(); 
  },

  saveFail(err) {
    wx.hideLoading();
    console.error('保存失败:', err);
    if (err.errCode === -502003) {
      wx.showModal({ title: '权限错误', content: '请去云开发控制台将 projects 集合权限改为“所有用户可读写”', showCancel: false });
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  handleFinish(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认完工',
      content: '确定将该项目标记为已完工吗？',
      confirmColor: '#dc2626',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          
          // 规范的乐观更新：使用深拷贝，防止污染原始数据
          const projectsCopy = JSON.parse(JSON.stringify(this.data.projects));
          const projectIndex = projectsCopy.findIndex(p => p._id === id);
          
          if (projectIndex > -1) {
            projectsCopy[projectIndex].status = 'COMPLETED';
            this.setData({ projects: projectsCopy }, () => {
              this.applyFilter();
            });
          }

          // 去云端真实更新
          db.collection('projects').doc(id).update({
            data: {
              status: 'COMPLETED',
              finishTime: db.serverDate(),
              updated_at: db.serverDate()
            }
          }).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '已完工下线', icon: 'success' });
          }).catch(err => {
            wx.hideLoading();
            console.error('更新状态失败:', err);
            
            // 如果失败，重新拉取真实数据恢复原状
            this.fetchProjects(); 
            
            // 弹出强提醒，告诉您是不是权限没开
            if (err.errCode === -502003) {
              wx.showModal({ title: '权限错误', content: '请去云开发控制台将 projects 集合权限改为“所有用户可读写”', showCancel: false });
            } else {
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          });
        }
      }
    });
  }
});