// 获取当前日期 YYYY-MM-DD
const getToday = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

Page({
  data: {
    workers: [], // 将从云数据库获取
    selectedWorker: null,
    
    date: getToday(),
    amount: '',
    
    methods: ['微信', '现金', '转卡'],
    method: '微信',
    
    remark: '',
    images: [], // 存储本地选择的凭证截图路径
    submitting: false,
    
    // 弹窗与键盘控制状态
    showKeypad: false,
    showMethodModal: false,
    newMethod: ''
  },

  onLoad(options) {
    // 1. 接收从员工详情页传来的 worker_id（如果有的话）
    const workerId = options.worker_id || null;

    // 2. 页面加载时，从云数据库拉取工人列表，并把 workerId 传过去
    this.fetchWorkers(workerId);
  },

  onShow() {
    // 检查用户角色，如果是员工则跳转
    const app = getApp();
    const userRole = app.globalData.userRole;

    if (userRole === 'WORKER') {
      // 员工端使用 switchTab 保持 tabBar
      wx.switchTab({ url: '/pages/record/record' });
    }
  },

  // --- 1. 从云数据库获取工人列表 ---
  fetchWorkers(preSelectedWorkerId) {
    wx.showNavigationBarLoading();
    const db = wx.cloud.database();
    
    db.collection('workers').get().then(res => {
      const workers = res.data;
      let autoSelectedWorker = null;

      // 3. 如果传了 preSelectedWorkerId，就在列表中找到对应的工人对象
      if (preSelectedWorkerId) {
        autoSelectedWorker = workers.find(w => w._id === preSelectedWorkerId) || null;
      }

      // 4. 更新数据，自动选中该工人
      this.setData({
        workers: workers,
        selectedWorker: autoSelectedWorker // 如果匹配到了，页面上就会自动显示他的名字
      });
      
      wx.hideNavigationBarLoading();
    }).catch(err => {
      console.error('获取工人列表失败:', err);
      wx.hideNavigationBarLoading();
      wx.showToast({ title: '获取工人失败，请检查云开发配置', icon: 'none' });
    });
  },

  // --- 2. 表单基础交互 ---
  onWorkerChange(e) {
    const index = e.detail.value;
    this.setData({ selectedWorker: this.data.workers[index] });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onMethodSelect(e) {
    this.setData({ method: e.currentTarget.dataset.method });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // --- 3. 自定义数字键盘逻辑 ---
  toggleKeypad() {
    this.setData({ showKeypad: !this.data.showKeypad });
  },

  onKeyTap(e) {
    const key = e.currentTarget.dataset.key;
    let current = this.data.amount;
    
    // 只能有一个小数点
    if (key === '.' && current.includes('.')) return; 
    // 去掉前导0
    if (current === '0' && key !== '.') current = ''; 
    
    // 限制只能输入两位小数
    const parts = current.split('.');
    if (parts[1] && parts[1].length >= 2) return; 
    
    this.setData({ amount: current + key });
  },

  onKeyDelete() {
    this.setData({ amount: this.data.amount.slice(0, -1) });
  },

  // --- 4. 自定义支付方式逻辑 ---
  showCustomMethodModal() {
    this.setData({ showMethodModal: true, newMethod: '' });
  },
  
  hideCustomMethodModal() {
    this.setData({ showMethodModal: false });
  },
  
  onNewMethodInput(e) {
    this.setData({ newMethod: e.detail.value });
  },
  
  confirmCustomMethod() {
    const method = this.data.newMethod.trim();
    if (method) {
      this.setData({
        methods: [...this.data.methods, method],
        method: method,
        showMethodModal: false
      });
    } else {
      wx.showToast({ title: '请输入支付方式', icon: 'none' });
    }
  },

  // --- 5. 凭证截图上传逻辑 ---
  chooseImage() {
    wx.chooseMedia({
      count: 3 - this.data.images.length, // 最多上传3张
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => file.tempFilePath);
        this.setData({ images: [...this.data.images, ...tempFiles] });
      }
    });
  },
  
  removeImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({ images });
  },
  
  previewImage(e) {
    wx.previewImage({
      current: e.currentTarget.dataset.url,
      urls: this.data.images
    });
  },

  // --- 6. 提交数据到云开发 (核心逻辑) ---
  async onSubmit() {
    const { selectedWorker, amount, date, method, remark, images } = this.data;

    // 表单验证
    if (!selectedWorker) {
      return wx.showToast({ title: '请选择工人', icon: 'none' });
    }
    if (!amount || parseFloat(amount) <= 0) {
      return wx.showToast({ title: '请输入有效金额', icon: 'none' });
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '正在保存...', mask: true });

    try {
      let fileIDs = []; // 用于存储上传到云存储后的文件ID

      // 步骤 A: 如果有截图，先并发上传图片到【微信云存储】
      if (images.length > 0) {
        wx.showLoading({ title: '上传凭证中...', mask: true });
        
        const uploadTasks = images.map((filePath) => {
          // 提取文件扩展名 (如 .jpg, .png)
          const extMatch = filePath.match(/\.[^.]+?$/);
          const ext = extMatch ? extMatch[0] : '.png';
          // 生成唯一的云端文件路径
          const cloudPath = `advances/${Date.now()}-${Math.random().toString(36).slice(-6)}${ext}`;
          
          return wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath
          });
        });

        // 等待所有图片上传完成
        const uploadResults = await Promise.all(uploadTasks);
        fileIDs = uploadResults.map(res => res.fileID); // 拿到云文件ID (cloud://...)
      }

      // 步骤 B: 将记录保存到【微信云数据库】的 advances 集合中
      wx.showLoading({ title: '保存记录中...', mask: true });
      const db = wx.cloud.database();
      
      await db.collection('advances').add({
        data: {
          workerId: selectedWorker._id, // 云数据库自动生成的工人 _id
          workerName: selectedWorker.name,
          amount: parseFloat(amount).toFixed(2), // 保证保存的是两位小数的字符串或数字
          date: date,
          method: method,
          remark: remark,
          images: fileIDs, // 存入刚才上传的图片云ID数组
          createTime: db.serverDate() // 记录创建的服务器时间，方便后续按时间排序
        }
      });

      // 步骤 C: 成功后的处理
      wx.hideLoading();
      this.setData({ submitting: false });
      
      wx.showToast({ 
        title: '记录成功', 
        icon: 'success',
        duration: 1500
      });
      
      // 延迟 1.5 秒后返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);

    } catch (err) {
      console.error('保存失败:', err);
      wx.hideLoading();
      this.setData({ submitting: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'error' });
    }
  }
});