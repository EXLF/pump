const { createApp } = Vue;

createApp({
    data() {
        return {
            tokens: [],
            duplicateTokens: [],
            currentPage: 1,
            total: 0,
            pages: 1,
            lastUpdate: '',
            loading: false,
            error: null,
            refreshInterval: null,
            pageSize: 11,
            duplicateCurrentPage: 1,
            duplicatePageSize: 4,
            duplicateTotalPages: 1,
            activeTab: 'all',
            selectedDuplicateGroup: null,
            duplicateGroupTokens: [],
            selectedGroupSymbol: '',
            showCopyMessage: false,
            copyMessageTimer: null,
            twitterLabels: [],
            newLabel: {
                twitterUrl: '',
                label: '',
                color: '#3B82F6' // 默认蓝色
            },
            showLabelForm: false,
            lastScrollPosition: 0,  // 添加这个来记录滚动位置
            polling: null,
            isUserScrolling: false,  // 添加用户滚动状态标记
            lastUpdateTime: 0,
            imageCache: new Map(), // 用于缓存头像
            updateInterval: 10000,  // 更新间隔改为10秒
            importStatus: {
                show: false,
                message: '',
                error: false
            },
            showLabelList: false, // 控制标签列表显示/隐藏
            labelPage: 1,
            labelPages: 1,
            labelTotal: 0,
            scrollPosition: 0,
            searchQuery: '',
            searchResults: [],
            searchTotal: 0,
            searchPages: 1,
            searchCurrentPage: 1,
            isSearchActive: false,
            duplicateSearchQuery: '',
            isDuplicateSearchActive: false,
            duplicateSearchResults: [],
            duplicatePolling: null,
            duplicateSearchPage: 1,
            duplicateSearchTotalPages: 1,
            onlineUsers: 20,
            onlineUsersPolling: null,
            addressAliases: new Map(), // 存储地址别名映射
            showAliasModal: false,
            currentEditAddress: null,
            aliasInput: '',
            devTokens: [],
            devCurrentPage: 1,
            devPageSize: 5,
            showAddDevModal: false,
            newDev: {
                address: '',
                alias: ''
            },
            devAddError: '',
            devAddressExists: false,
            existingAlias: '',
        }
    },
    methods: {
        formatTime(time) {
            if (!time) return '';
            
            // 创建一个新的 Date 对象，直接使用原始时间
            const date = new Date(time);
            
            // 使用 toLocaleString 时指定时区为 'Asia/Shanghai'
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: 'Asia/Shanghai'
            });
        },
        
        formatAddress(address) {
            if (!address) return '';
            return address.slice(0, 4) + '...' + address.slice(-4);
        },
        
        handleImageError(event, token) {
            event.target.style.display = 'none';  // 隐藏失败的图片
            event.target.onerror = null;  // 防止无限循环
        },
        
        checkTwitterLink(link) {
            if (!link) return 'text-gray-500';
            
            try {
                const url = link.toLowerCase().trim();
                
                if (!url.includes('twitter.com') && !url.includes('x.com')) {
                    return 'text-red-500';  // 无效接
                }
                
                if (url.includes('/status/')) {
                    return 'text-green-500';  // 完整推文链接
                }
                
                const urlParts = url.replace('https://', '')
                                   .replace('http://', '')
                                   .replace('twitter.com/', '')
                                   .replace('x.com/', '')
                                   .split('/');
                                   
                if (urlParts.length === 1 && urlParts[0].length > 0) {
                    return 'text-yellow-500';  // 只有用户名的链接
                }
                
                return 'text-red-500';
            } catch (error) {
                return 'text-red-500';
            }
        },
        
        getDuplicateTypeText(type) {
            const typeMap = {
                'twitter_status': '推特链接重复',
                'symbol_match': '代币符号重复',
                'name_match': '代币名称重复'
            };
            return typeMap[type] || '未知重复';
        },
        
        getDuplicateTypeClass(type) {
            const classMap = {
                'twitter_status': 'bg-green-100 text-green-800',
                'symbol_match': 'bg-yellow-100 text-yellow-800',
                'name_match': 'bg-red-100 text-red-800'
            };
            return classMap[type] || 'bg-gray-100 text-gray-800';
        },
        
        getDuplicateColor(token) {
            if (!token.duplicateGroup && !this.addressAliases.has(token.owner)) return '';
            
            // 如果是dev地址（有别名），使用渐变背景色和细微的动画效果
            if (this.addressAliases.has(token.owner)) {
                return 'dev-token-highlight';  // 确保这个类名和CSS中的一致
            }
            
            // 推特重复的保持绿色背景
            if (token.duplicateType === 'twitter_status' || 
                token.duplicateType === 'twitter' ||
                token.duplicateType === 'twitter_match') {
                return 'bg-green-50';
            }
            
            return '';
        },

        retryFetch() {
            this.error = null;
            this.fetchTokens();
        },

        async fetchDuplicateTokens() {
            try {
                const response = await axios.get('/api/duplicate-tokens');
                // 对数据进行时间排序
                this.duplicateTokens = response.data.sort((a, b) => 
                    new Date(b.latestTime) - new Date(a.latestTime)
                );
                
                // 计算总页数
                this.duplicateTotalPages = Math.ceil(this.duplicateTokens.length / this.duplicatePageSize);
                
                // 保持在当前页，除非是初始化或页码无效
                if (!this.duplicateCurrentPage || this.duplicateCurrentPage > this.duplicateTotalPages) {
                    this.duplicateCurrentPage = 1;  // 确保新数据显示在第一页
                }
            } catch (error) {
                console.error('获取重复代币数据失败:', error);
            }
        },

        async fetchTokens(forceRefresh = false) {
            if (this.loading && !forceRefresh) return;
            
            const cacheKey = `tokens_${this.currentPage}_${this.activeTab}`;
            const cachedData = sessionStorage.getItem(cacheKey);
            
            if (cachedData && !forceRefresh) {
                const parsed = JSON.parse(cachedData);
                if (Date.now() - parsed.timestamp < 5000) { // 5秒缓存
                    this.updateTokensData(parsed.data);
                    return;
                }
            }

            this.loading = true;
            this.error = null;
            
            try {
                let params = { 
                    page: this.currentPage
                };
                
                // 优先处理特定组的查询
                if (this.selectedDuplicateGroup) {
                    params.groupNumber = this.selectedDuplicateGroup;
                } else if (this.activeTab === 'duplicates') {
                    params.duplicatesOnly = true;
                }
                
                const response = await axios.get('/api/tokens', { params });
                
                // 只有在当前状态匹配时才更新数据
                if ((!this.selectedDuplicateGroup && !params.groupNumber) || 
                    (this.selectedDuplicateGroup === params.groupNumber)) {
                    this.tokens = response.data.tokens;
                    this.total = response.data.total;
                    this.pages = response.data.pages;
                    this.lastUpdate = new Date().toLocaleString();
                }
            } catch (error) {
                this.error = '获取数据失败';
                console.error(error);
            } finally {
                this.loading = false;
            }

            // 缓存新数据
            sessionStorage.setItem(cacheKey, JSON.stringify({
                data: response.data,
                timestamp: Date.now()
            }));
        },

        async handlePageChange(page) {
            if (this.isSearchActive) {
                if (page === this.searchCurrentPage || page < 1 || page > this.searchPages) return;
                this.searchCurrentPage = page;
                await this.performSearch();
            } else {
                if (page === this.currentPage || page < 1 || page > this.pages) return;
                this.currentPage = page;
                await this.fetchTokens();
            }
        },

        formatMonitorTime() {
            const now = new Date();
            return this.formatTime(now);
        },

        changeDuplicatePage(page) {
            if (page === '...' || page === this.duplicateCurrentPage) return;
            this.duplicateCurrentPage = page;
        },

        async switchTab(tab) {
            if (this.activeTab !== tab) {
                if (this.selectedDuplicateGroup && tab !== 'duplicates') {
                    this.selectedDuplicateGroup = null;
                    this.selectedGroupSymbol = null;
                }
                
                this.activeTab = tab;
                this.currentPage = 1;
                await this.fetchTokens();
            }
        },

        async showDuplicateGroupTokens(group) {
            try {
                this.selectedDuplicateGroup = group.groupNumber;
                this.selectedGroupSymbol = group.symbol;
                this.currentPage = 1;
                this.activeTab = 'duplicates';
                
                await this.fetchDuplicateGroupTokens();
                this.updatePageTitle();
            } catch (error) {
                console.error('获取重复组代币失败:', error);
            }
        },

        updatePageTitle() {
            if (this.activeTab === 'duplicates' && this.selectedDuplicateGroup) {
                document.title = `${this.selectedGroupSymbol} 的重复代币 - Solana 代币监控`;
            } else {
                document.title = 'Solana 代币监控';
            }
        },

        copyAddress(address) {
            this.copyText(address);
        },
        
        async fetchTwitterLabels() {
            try {
                const response = await axios.get(`/api/twitter-labels?page=${this.labelPage}`);
                this.twitterLabels = response.data.labels;
                this.labelTotal = response.data.total;
                this.labelPages = response.data.pages;
            } catch (error) {
                console.error('获取推特标签失败:', error);
            }
        },
        
        async saveTwitterLabel() {
            try {
                if (!this.newLabel.twitterUrl || !this.newLabel.label) {
                    alert('请填写完整的标签信息');
                    return;
                }

                await axios.post('/api/twitter-labels', this.newLabel);
                await this.fetchTwitterLabels();
                
                // 重置表单
                this.showLabelForm = false;
                this.newLabel = {
                    twitterUrl: '',
                    label: '',
                    color: '#3B82F6'
                };
            } catch (error) {
                console.error('保存推特标签失败:', error);
                alert('保存标签失败，请重试');
            }
        },
        
        async deleteTwitterLabel(id) {
            if (confirm('确定要删除这个标签吗？')) {
                try {
                    await axios.delete(`/api/twitter-labels/${id}`);
                    await this.fetchTwitterLabels();
                } catch (error) {
                    console.error('删除推特标签失败:', error);
                }
            }
        },
        
        normalizeTwitterUrl(url) {
            if (!url) return '';
            return url.replace('@', '')
                     .replace('https://', '')
                     .replace('http://', '')
                     .replace('x.com/', '')
                     .replace('twitter.com/', '')
                     .split('/')[0];  // 只保留户名部分
        },
        
        getTwitterLabel(url) {
            if (!url) return null;
            const normalizedUrl = this.normalizeTwitterUrl(url);
            const label = this.twitterLabels.find(label => 
                normalizedUrl === this.normalizeTwitterUrl(label.twitterUrl)
            );
            return label ? {
                ...label,
                // 确保颜色值是有效的
                color: label.color || '#6366f1' // 默认颜色，防没有设置
            } : null;
        },
        
        getTwitterLabelStyle(url) {
            const label = this.getTwitterLabel(url);
            if (!label) return null;
            return {
                backgroundColor: label.color,
                color: '#FFFFFF',
                padding: '1px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                display: 'inline-block',
                lineHeight: '16px',
                whiteSpace: 'nowrap'
            };
        },
        
        processDuplicateGroups() {
            return this.duplicateGroups.map(group => ({
                ...group,
                twitterLink: group.tokens[0]?.metadata?.twitter || null,
                label: this.getTwitterLabel(group.tokens[0]?.metadata?.twitter)
            }));
        },
        
        isFullTwitterLink(url) {
            if (!url) return false;
            // 检查是否为完整推文链接（包含 status 或 i/web/status）
            return url.includes('/status/') || url.includes('/i/web/status/');
        },
        
        isTwitterAccountLink(url) {
            if (!url) return false;
            return url.toLowerCase().includes('twitter.com/') || url.toLowerCase().includes('x.com/');
        },
        
        isValidTwitterLink(url) {
            return this.isFullTwitterLink(url) || this.isTwitterAccountLink(url);
        },
        
        async fetchData() {
            try {
                const now = Date.now();
                if (now - this.lastUpdateTime < this.updateInterval) {
                    return;
                }

                const response = await axios.get('/api/tokens');
                const newData = this.processData(response.data);
                
                if (this.hasDataChanged(this.tokens, newData)) {
                    newData.forEach(token => {
                        if (token.metadata?.image) {
                            this.imageCache.set(token.metadata.image, token.metadata.image);
                        }
                    });
                    
                    this.tokens = newData;
                    this.lastUpdateTime = now;
                }
            } catch (error) {
                console.error('Error fetching data:', error);
            }
        },
        
        hasDataChanged(oldData, newData) {
            if (oldData.length !== newData.length) return true;
            
            return newData.some((newItem, index) => {
                const oldItem = oldData[index];
                return newItem.id !== oldItem.id || 
                       newItem.name !== oldItem.name ||
                       newItem.metadata?.twitter !== oldItem.metadata?.twitter;
            });
        },
        
        getAvatarUrl(url) {
            if (!url) return '';
            if (this.imageCache.has(url)) {
                return this.imageCache.get(url);
            }
            this.imageCache.set(url, url);
            return url;
        },
        
        startPolling() {
            this.fetchTokens();
            this.polling = setInterval(() => {
                if (!this.isSearchActive) {
                    this.fetchTokens();
                }
            }, this.updateInterval);
        },
        
        handleScroll() {
            this.isUserScrolling = true;
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = setTimeout(() => {
                this.isUserScrolling = false;
            }, 150);
        },
        
        processData(data) {
            if (!data) return [];
            
            if (data.tokens) {
                return data.tokens;
            }
            
            if (Array.isArray(data)) {
                return data;
            }
            
            if (typeof data === 'object') {
                return Object.values(data);
            }
            
            return [];
        },
        
        getDefaultAvatar(token) {
            return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="%23666"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20">${this.getInitials(token.name)}</text></svg>`;
        },
        
        getInitials(name) {
            if (!name) return '';
            return name.charAt(0).toUpperCase();
        },
        
        exportTwitterLabels() {
            try {
                // 准备导出数据
                const exportData = this.twitterLabels.map(label => ({
                    twitterUrl: label.twitterUrl,
                    label: label.label,
                    color: label.color,
                    timestamp: new Date(label.timestamp).toISOString()
                }));

                // 创建 Blob
                const blob = new Blob(
                    [JSON.stringify(exportData, null, 2)], 
                    { type: 'application/json' }
                );

                // 创建下载链接
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                
                // 设置文件名（使用当前时间戳）
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                link.download = `twitter-labels-${timestamp}.json`;
                
                // 触发下载
                document.body.appendChild(link);
                link.click();
                
                // 清理
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                console.error('导出标签失败:', error);
            }
        },
        
        // 导入标签
        async importLabels(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const labels = JSON.parse(e.target.result);
                        let imported = 0;
                        let skipped = 0;

                        for (const label of labels) {
                            try {
                                await axios.post('/api/twitter-labels', label);
                                imported++;
                            } catch (error) {
                                skipped++;
                            }
                        }

                        this.importStatus = {
                            show: true,
                            message: `导入完成：成功 ${imported} 个跳过 ${skipped} 个重复或无效标签`,
                            error: false
                        };
                        await this.fetchTwitterLabels();
                    } catch (error) {
                        this.importStatus = {
                            show: true,
                            message: `导入失败: ${error.message}`,
                            error: true
                        };
                    }
                };
                reader.readAsText(file);
            } catch (error) {
                this.importStatus = {
                    show: true,
                    message: `导入失败: ${error.message}`,
                    error: true
                };
            }
        },

        // 导出标签
        async exportLabels() {
            try {
                const response = await axios.get('/api/twitter-labels');
                const labels = response.data.labels;
                const dataStr = JSON.stringify(labels, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'twitter-labels.json';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } catch (error) {
                console.error('导出标签失败:', error);
            }
        },

        // 添加新标签
        async addNewLabel() {
            if (!this.newLabel.twitterUrl || !this.newLabel.label || !this.newLabel.color) {
                return;
            }

            try {
                await axios.post('/api/twitter-labels', this.newLabel);
                this.newLabel = { twitterUrl: '', label: '', color: '#000000' };
                await this.fetchTwitterLabels();
            } catch (error) {
                console.error('添加标签失败:', error);
            }
        },

        // 添加切换显示/隐藏方法
        toggleLabelList() {
            this.showLabelList = !this.showLabelList;
        },

        // 添加分页方法
        async changeLabelPage(page) {
            if (page >= 1 && page <= this.labelPages && page !== this.labelPage) {
                this.labelPage = page;
                await this.fetchTwitterLabels();
            }
        },

        async fetchTokens() {
            // 保存滚动位置
            this.scrollPosition = this.$refs.tableContainer.scrollTop;
            
            try {
                const response = await axios.get(`/api/tokens?page=${this.currentPage}&duplicatesOnly=${this.activeTab === 'duplicates'}`);
                this.tokens = response.data.tokens;
                this.total = response.data.total;  // 确保设置总数
                this.pages = response.data.pages;
                this.lastUpdate = this.formatTime(new Date());  // 更新时间
            } catch (error) {
                console.error('获取数据失败:', error);
                this.error = '获取数据失败，请稍后重试';
            }
            
            // 恢复滚动位置
            this.$nextTick(() => {
                if (this.$refs.tableContainer) {
                    this.$refs.tableContainer.scrollTop = this.scrollPosition;
                }
            });
        },

        // 添加新方法用于获取特定重复组的代币
        async fetchDuplicateGroupTokens() {
            try {
                const response = await axios.get(
                    `/api/duplicate-group-tokens/${this.selectedDuplicateGroup}`,
                    { params: { page: this.currentPage } }
                );
                
                this.tokens = response.data.tokens;
                this.total = response.data.total;
                this.pages = response.data.pages;
                this.lastUpdate = new Date().toLocaleString();
            } catch (error) {
                console.error('获取重复组代币失败:', error);
            }
        },

        async performSearch() {
            if (!this.searchQuery.trim()) {
                return;
            }

            this.loading = true;
            this.error = null;
            
            try {
                const response = await axios.get('/api/tokens/search', {
                    params: {
                        query: this.searchQuery.trim(),
                        page: this.searchCurrentPage
                    }
                });

                this.searchResults = response.data.tokens;
                this.searchTotal = response.data.total;
                this.searchPages = response.data.pages;
                this.isSearchActive = true;

                // 停止自动刷新
                if (this.polling) {
                    clearInterval(this.polling);
                    this.polling = null;
                }
            } catch (error) {
                this.error = '搜索失败: ' + (error.response?.data?.error || error.message);
            } finally {
                this.loading = false;
            }
        },

        clearSearch() {
            this.searchQuery = '';
            this.isSearchActive = false;
            this.searchResults = [];
            this.searchTotal = 0;
            this.searchPages = 1;
            this.searchCurrentPage = 1;
            
            // 恢复原始数据显示
            this.fetchTokens();
            
            // 恢复自动刷新
            this.startPolling();
        },

        // 搜索重复代币
        async searchDuplicateTokens() {
            if (!this.duplicateSearchQuery.trim()) {
                return;
            }

            try {
                this.loading = true;
                const response = await axios.get('/api/duplicate-tokens', {
                    params: {
                        query: this.duplicateSearchQuery.trim()
                    }
                });
                
                this.duplicateSearchResults = response.data.sort((a, b) => 
                    new Date(b.latestTime) - new Date(a.latestTime)
                );
                this.isDuplicateSearchActive = true;
                this.duplicateSearchPage = 1;
            } catch (error) {
                console.error('搜索重复代币失败:', error);
            } finally {
                this.loading = false;
            }
        },

        // 清除搜索
        async clearDuplicateSearch() {
            this.duplicateSearchQuery = '';
            this.isDuplicateSearchActive = false;
            this.duplicateSearchResults = [];
            this.duplicateSearchPage = 1;
            // 恢复轮询
            this.startDuplicatePolling();
        },

        // 添加重复组数据的轮询方法
        startDuplicatePolling() {
            this.fetchDuplicateTokens(); // 立即获取一次数据
            this.duplicatePolling = setInterval(() => {
                if (!this.isDuplicateSearchActive) {  // 只在非搜索状态下更新
                    this.fetchDuplicateTokens();
                }
            }, this.updateInterval);
        },

        // 处理分页切换
        handleDuplicatePageChange(page) {
            if (this.isDuplicateSearchActive) {
                if (page < 1 || page > this.duplicateSearchTotalPages) return;
                this.duplicateSearchPage = page;
            } else {
                if (page < 1 || page > this.duplicateTotalPages) return;
                this.duplicateCurrentPage = page;
            }
        },

        displayedDuplicateTokens() {
            const start = (this.duplicateCurrentPage - 1) * this.duplicatePageSize;
            const end = start + this.duplicatePageSize;
            
            // 接使用已排序数据
            return this.duplicateTokens.slice(start, end);
        },

        // 统一的复制方法
        async copyText(text) {
            try {
                // 主要复制方法
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    this.showCopySuccess();
                } else {
                    // 后备复制方法
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        this.showCopySuccess();
                    } catch (err) {
                        console.error('复制失败:', err);
                        throw new Error('复制失败');
                    } finally {
                        document.body.removeChild(textArea);
                    }
                }
            } catch (err) {
                console.error('复制失败:', err);
                // 可以添加错误提示
            }
        },

        // 显示复制成功提示
        showCopySuccess() {
            this.showCopyMessage = true;
            if (this.copyMessageTimer) {
                clearTimeout(this.copyMessageTimer);
            }
            this.copyMessageTimer = setTimeout(() => {
                this.showCopyMessage = false;
            }, 2000);
        },

        // 获取在线用数
        async fetchOnlineUsers() {
            try {
                const response = await axios.get('/api/online-users');
                this.onlineUsers = response.data.onlineUsers;
            } catch (error) {
                console.error('获取在线用户数失败:', error);
            }
        },

        // 开始轮询在线用户数
        startOnlineUsersPolling() {
            this.fetchOnlineUsers(); // 立即获取一次
            this.onlineUsersPolling = setInterval(() => {
                this.fetchOnlineUsers();
            }, 30000); // 每30秒更新一次
        },

        connectWebSocket() {
            const socket = new WebSocket(`ws://${window.location.host}`);
            
            socket.addEventListener('open', () => {
                console.log('WebSocket 连接已建立');
            });

            socket.addEventListener('message', (event) => {
                const { type, data } = JSON.parse(event.data);
                if (type === 'tokensUpdate') {
                    this.tokens = data;
                    this.lastUpdate = new Date().toLocaleString();
                }
            });

            socket.addEventListener('close', () => {
                console.log('WebSocket 连接已关闭，尝试重新连接...');
                setTimeout(() => this.connectWebSocket(), 5000);
            });
        },

        formatShortAddress(address) {
            if (!address) return '';
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        },

        // 获取地址别名
        async fetchAddressAliases() {
            try {
                const response = await axios.get('/api/address-aliases');
                this.addressAliases.clear();
                response.data.forEach(item => {
                    this.addressAliases.set(item.address, item.alias);
                });
            } catch (error) {
                console.error('获取地址别名失败:', error);
            }
        },

        // 修改显示编辑别名的方法
        showEditAlias(address) {
            console.log('尝试编辑地址:', address); // 添加日志
            console.log('当前别名Map:', this.addressAliases); // 添加日志
            
            // 如果已经有别名，则不允许编辑
            if (this.addressAliases.has(address)) {
                console.log('该地址已有别名，不允许编辑'); // 添加日志
                return;
            }
            
            // 如果没有别名，则允许编辑
            this.currentEditAddress = address;
            this.aliasInput = '';
            this.showAliasModal = true;
            console.log('显示编辑模态框'); // 添加日志
        },

        // 修改地址显示的方法
        formatOwnerDisplay(owner) {
            const alias = this.addressAliases.get(owner);
            if (alias) {
                // 如果有别名，只显示别名，不可点击
                return `<span class="text-gray-700">${alias}</span>`;
            } else {
                // 如果没有别名，显示地址并允许点击编辑
                return `<span class="cursor-pointer hover:text-blue-500" onclick="showEditAlias('${owner}')">${this.formatAddress(owner)}</span>`;
            }
        },

        // 保存名
        async saveAlias() {
            try {
                await axios.post('/api/address-aliases', {
                    address: this.currentEditAddress,
                    alias: this.aliasInput
                });
                
                // 更新本地 Map
                this.addressAliases.set(this.currentEditAddress, this.aliasInput);
                
                // 重新获取数据以确保同步
                await this.fetchAddressAliases();
                await this.fetchDevTokens();
                
                // 重置状态
                this.showAliasModal = false;
                this.currentEditAddress = null;
                this.aliasInput = '';
            } catch (error) {
                console.error('保存别名失败:', error);
            }
        },

        // 获取显示文本（别名或地址）
        getDisplayAddress(address) {
            return this.addressAliases.get(address) || this.formatShortAddress(address);
        },

        // 获取 Dev 代币列表
        async fetchDevTokens() {
            try {
                console.log('开始获取 Dev 代币');
                const response = await axios.get('/api/dev-tokens');
                console.log('获取到的 Dev 代币:', response.data);
                this.devTokens = response.data;
                console.log('当前 devTokens 长度:', this.devTokens.length);
            } catch (error) {
                console.error('获取 Dev 代币失败:', error);
            }
        },

        // 处理页码变化
        handleDevPageChange(page) {
            if (page >= 1 && page <= this.devPages) {
                this.devCurrentPage = page;
            }
        },

        // 添加新的 Dev 地址
        async addNewDev() {
            try {
                // 验证输入
                if (!this.newDev.address || !this.newDev.alias) {
                    this.devAddError = '地址和别名都不能为空';
                    return;
                }
                
                // 验证地址格式
                if (this.newDev.address.length !== 44) {
                    this.devAddError = '请输入有效的 Solana 地址';
                    return;
                }
                
                // 检查是否已存在
                if (this.devAddressExists) {
                    this.devAddError = '该地址已存在别名';
                    return;
                }
                
                // 发送请求添加新的 Dev
                await axios.post('/api/address-aliases', {
                    address: this.newDev.address,
                    alias: this.newDev.alias
                });
                
                // 重新获取 Dev 列表
                await this.fetchDevTokens();
                await this.fetchAddressAliases();
                
                // 重置表单并关闭模态框
                this.newDev = { address: '', alias: '' };
                this.devAddError = '';
                this.devAddressExists = false;
                this.existingAlias = '';
                this.showAddDevModal = false;
                
            } catch (error) {
                console.error('添加 Dev 失败:', error);
                this.devAddError = '添加失败，请稍后重试';
            }
        },

        // 检查 Dev 地址是否已存在
        checkDevAddress() {
            const address = this.newDev.address;
            const existingAlias = this.addressAliases.get(address);
            if (existingAlias) {
                this.devAddressExists = true;
                this.existingAlias = existingAlias;
            } else {
                this.devAddressExists = false;
                this.existingAlias = '';
            }
        },

        // 在显示别名的地方添加类名
        getDisplayName(address) {
            if (this.addressAliases.has(address)) {
                // 确保使用v-html来渲染HTML字符串
                return `<span class="dev-name-highlight">${this.addressAliases.get(address)}</span>`;
            }
            return this.formatAddress(address);
        }
    },
    mounted() {
        this.fetchTokens();
        this.fetchDuplicateTokens();
        
        this.refreshInterval = setInterval(() => {
            // 根据当前状态决定刷新方式
            if (this.selectedDuplicateGroup) {
                this.fetchDuplicateGroupTokens();
            } else {
                this.fetchTokens();
            }
            this.fetchDuplicateTokens();
        }, 2000);
        
        this.fetchTwitterLabels();
        this.fetchData();
        this.startPolling();
        this.startDuplicatePolling();
        this.startOnlineUsersPolling();
        window.addEventListener('scroll', this.handleScroll);
        // 恢复上次的滚动位置
        const savedPosition = sessionStorage.getItem('scrollPosition');
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition));
        }

        this.connectWebSocket();
        this.fetchAddressAliases();
        this.fetchDevTokens();
        
        // 立即获取一次
        this.fetchDevTokens();
        
        // 设置定时获取
        setInterval(() => {
            this.fetchDevTokens();
        }, 30000);
    },
    beforeUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.copyMessageTimer) {
            clearTimeout(this.copyMessageTimer);
        }
        if (this.polling) {
            clearInterval(this.polling);
        }
        if (this.duplicatePolling) {
            clearInterval(this.duplicatePolling);
        }
        if (this.onlineUsersPolling) {
            clearInterval(this.onlineUsersPolling);
        }
        window.removeEventListener('scroll', this.handleScroll);
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
        // 保存当前滚动位置
        sessionStorage.setItem('scrollPosition', window.scrollY.toString());
    },
    computed: {
        paginationRange() {
            const range = [];
            for (let i = 1; i <= this.pages; i++) {
                if (i === 1 || i === this.pages || 
                    (i >= this.currentPage - 2 && i <= this.currentPage + 2)) {
                    range.push(i);
                } else if (range[range.length - 1] !== '...') {
                    range.push('...');
                }
            }
            return range;
        },
        paginatedDuplicateTokens() {
            const start = (this.duplicateCurrentPage - 1) * this.duplicatePageSize;
            const end = start + this.duplicatePageSize;
            return this.duplicateTokens.slice(start, end);
        },
        duplicatePaginationRange() {
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const totalPages = this.isDuplicateSearchActive ? this.duplicateSearchTotalPages : this.duplicateTotalPages;
            
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = currentPage - leftOffset;
            let end = currentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), totalPages);
                start = 1;
            }
            
            if (end > totalPages) {
                start = Math.max(start - (end - totalPages), 1);
                end = totalPages;
            }
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < totalPages) {
                if (end < totalPages - 1) range.push('...');
                range.push(totalPages);
            }
            
            return range;
        },
        labelPaginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.labelPage - leftOffset;
            let end = this.labelPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.labelPages);
                start = 1;
            }
            
            if (end > this.labelPages) {
                start = Math.max(start - (end - this.labelPages), 1);
                end = this.labelPages;
            }
            
            // 添加第一页
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            // 添加中间页码
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            // 添加最后一页
            if (end < this.labelPages) {
                if (end < this.labelPages - 1) range.push('...');
                range.push(this.labelPages);
            }
            
            return range;
        },
        searchPaginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.searchCurrentPage - leftOffset;
            let end = this.searchCurrentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.searchPages);
                start = 1;
            }
            
            if (end > this.searchPages) {
                start = Math.max(start - (end - this.searchPages), 1);
                end = this.searchPages;
            }
            
            // 添加第一页
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            // 添加中间页码
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            // 添加最后一页
            if (end < this.searchPages) {
                if (end < this.searchPages - 1) range.push('...');
                range.push(this.searchPages);
            }
            
            return range;
        },
        displayedTokens() {
            return this.isSearchActive ? this.searchResults : this.tokens;
        },
        displayedDuplicateTokens() {
            // 先获取要显示的数据源（搜索结果或全数据）
            let data = this.isDuplicateSearchActive ? this.duplicateSearchResults : this.duplicateTokens;
            
            // 按照 latestTime 降序排序，这样最新的会在最前面
            data = [...data].sort((a, b) => new Date(b.latestTime) - new Date(a.latestTime));
            
            // 计算分页
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const totalPages = Math.ceil(data.length / this.duplicatePageSize);
            
            // 从后往前计算页码，这样最新的数据会在第一页
            const reversePage = totalPages - currentPage + 1;
            const start = (reversePage - 1) * this.duplicatePageSize;
            const end = start + this.duplicatePageSize;
            
            return data.slice(start, end);
        },
        // 计算当前使用的页码
        currentDuplicatePage() {
            return this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
        },

        // 计算总页数
        duplicateTotalPages() {
            const totalItems = this.isDuplicateSearchActive 
                ? this.duplicateSearchResults.length 
                : this.duplicateTokens.length;
            return Math.max(1, Math.ceil(totalItems / this.duplicatePageSize));
        },

        // 计算搜索结果总页数
        duplicateSearchTotalPages() {
            const totalItems = this.duplicateSearchResults.length;
            return Math.max(1, Math.ceil(totalItems / this.duplicatePageSize));
        },

        // 分页范围计算
        duplicatePaginationRange() {
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const totalPages = this.isDuplicateSearchActive ? this.duplicateSearchTotalPages : this.duplicateTotalPages;
            
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = currentPage - leftOffset;
            let end = currentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), totalPages);
                start = 1;
            }
            
            if (end > totalPages) {
                start = Math.max(start - (end - totalPages), 1);
                end = totalPages;
            }
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < totalPages) {
                if (end < totalPages - 1) range.push('...');
                range.push(totalPages);
            }
            
            return range;
        },

        // 显示的重复组数据
        displayedDuplicateTokens() {
            const data = this.isDuplicateSearchActive ? this.duplicateSearchResults : this.duplicateTokens;
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const start = (currentPage - 1) * this.duplicatePageSize;
            const end = start + this.duplicatePageSize;
            return data.slice(start, end);
        },

        // 计算总页数
        devPages() {
            return Math.ceil(this.devTokens.length / this.devPageSize);
        },
        
        // 当前页显示的数据
        displayedDevTokens() {
            const start = (this.devCurrentPage - 1) * this.devPageSize;
            const end = start + this.devPageSize;
            return this.devTokens.slice(start, end);
        },
        
        // 分页范围
        devPaginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.devCurrentPage - leftOffset;
            let end = this.devCurrentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.devPages);
                start = 1;
            }
            
            if (end > this.devPages) {
                start = Math.max(start - (end - this.devPages), 1);
                end = this.devPages;
            }
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < this.devPages) {
                if (end < this.devPages - 1) range.push('...');
                range.push(this.devPages);
            }
            
            return range;
        }
    }
}).mount('#app'); 