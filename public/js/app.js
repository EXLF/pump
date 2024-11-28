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
                    return 'text-red-500';  // 无效链接
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
            // 如果代币没有重复组，返回空字符串（无背景色）
            if (!token.duplicateGroup) return '';
            
            // 根据重复类型返回对应的背景色
            switch (token.duplicateType) {
                case 'twitter_status':
                    return 'bg-green-50';  // 推特链接重复使用浅绿色
                case 'symbol_match':
                    return 'bg-yellow-50'; // 符号重复使用浅黄色
                case 'name_match':
                    return 'bg-red-50';    // 名称重复使用浅红色
                default:
                    return 'bg-gray-50';   // 默认使用浅灰色
            }
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

        async copyAddress(address) {
            try {
                await navigator.clipboard.writeText(address);
                
                // 清除之前的定器
                if (this.copyMessageTimer) {
                    clearTimeout(this.copyMessageTimer);
                }
                
                // 显示消息
                this.showCopyMessage = true;
                
                // 设置新定时器
                this.copyMessageTimer = setTimeout(() => {
                    this.showCopyMessage = false;
                }, 2000);
            } catch (err) {
                console.error('复制失败:', err);
            }
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
                     .split('/')[0];  // 只保留用户名部分
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
                            message: `导入完成：成功 ${imported} 个，跳过 ${skipped} 个重复或无效标签`,
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
            
            // 直接使用已排序的数据
            return this.duplicateTokens.slice(start, end);
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
        window.addEventListener('scroll', this.handleScroll);
        // 恢复上次的滚动位置
        const savedPosition = sessionStorage.getItem('scrollPosition');
        if (savedPosition) {
            window.scrollTo(0, parseInt(savedPosition));
        }
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
            // 首先获取要显示的数据源（搜索结果或全部数据）
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
        }
    }
}).mount('#app'); 