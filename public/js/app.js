const { createApp } = Vue;

createApp({
    data() {
        return {
            tokens: [],
            duplicateTokens: [],
            currentPage: 1,
            total: 0,
            pages: 1,
            lastUpdate: '从未',
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
            }
        }
    },
    methods: {
        formatTime(time) {
            if (!time) return '';
            
            // 创建一个新的 Date 对象，并添加 8 小时
            const date = new Date(new Date(time).getTime() + 60 * 60 * 1000 - 5 * 60 * 60 * 1000);
            
            // 使用 toLocaleString 格式化时间
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        },
        
        formatAddress(address) {
            if (!address) return '';
            return address.slice(0, 4) + '...' + address.slice(-4);
        },
        
        handleImageError(event, token) {
            event.target.src = this.getDefaultAvatar(token);
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
            if (!token.duplicateType) return '';
            const styleMap = {
                'twitter_status': 'bg-green-100 border-l-4 border-green-500',
                'symbol_match': 'bg-yellow-100 border-l-4 border-yellow-500',
                'name_match': 'bg-red-100 border-l-4 border-red-500'
            };
            return styleMap[token.duplicateType] || 'bg-gray-50';
        },

        retryFetch() {
            this.error = null;
            this.fetchTokens();
        },

        async fetchDuplicateTokens() {
            try {
                const response = await axios.get('/api/duplicate-tokens');
                this.duplicateTokens = response.data;
            } catch (error) {
                console.error('获取重复代币失败:', error);
            }
        },

        async fetchTokens() {
            this.loading = true;
            this.error = null;
            
            try {
                let url = '/api/tokens';
                let params = { page: this.currentPage };
                
                if (this.activeTab === 'duplicates') {
                    if (this.selectedDuplicateGroup) {
                        url = `/api/duplicate-group-tokens/${this.selectedDuplicateGroup}`;
                    } else {
                        params.duplicatesOnly = true;
                    }
                }
                
                const response = await axios.get(url, { params });
                this.tokens = response.data.tokens;
                this.total = response.data.total;
                this.pages = response.data.pages;
                this.lastUpdate = new Date().toLocaleString();
            } catch (error) {
                this.error = '获取数据失败';
                console.error(error);
            } finally {
                this.loading = false;
            }
        },

        async changePage(page) {
            if (page === this.currentPage) return;
            this.currentPage = page;
            await this.fetchTokens();
        },

        formatMonitorTime() {
            const now = new Date();
            return this.formatTime(now);
        },

        changeDuplicatePage(page) {
            if (page === '...' || page === this.duplicateCurrentPage) return;
            this.duplicateCurrentPage = page;
        },

        switchTab(tab) {
            this.activeTab = tab;
            if (tab === 'all') {
                this.selectedDuplicateGroup = null;
                this.selectedGroupSymbol = '';
            }
            this.currentPage = 1;
            this.fetchTokens();
            this.updatePageTitle();
        },

        async showDuplicateGroupTokens(group) {
            try {
                const response = await axios.get(`/api/duplicate-group-tokens/${group.groupNumber}`);
                this.selectedDuplicateGroup = group.groupNumber;
                this.selectedGroupSymbol = group.symbol;
                this.tokens = response.data.tokens;
                this.total = response.data.total;
                this.pages = response.data.pages;
                this.currentPage = 1;
                this.activeTab = 'duplicates';

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
                const response = await axios.get('/api/twitter-labels');
                this.twitterLabels = response.data;
            } catch (error) {
                console.error('获取推特标签失败:', error);
            }
        },
        
        async saveTwitterLabel() {
            try {
                await axios.post('/api/twitter-labels', this.newLabel);
                await this.fetchTwitterLabels();
                this.showLabelForm = false;
                this.newLabel = {
                    twitterUrl: '',
                    label: '',
                    color: '#3B82F6'
                };
            } catch (error) {
                console.error('保存推特标签失败:', error);
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
                color: label.color || '#6366f1' // 默认颜色，以防没有设置
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
            return url?.toLowerCase().includes('/status/');
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
            if (this.polling) {
                clearInterval(this.polling);
            }
            this.polling = setInterval(() => {
                this.fetchData();
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
            if (!name) return '?';
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
        async importTwitterLabels(event) {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const labels = JSON.parse(e.target.result);
                        
                        // 验证数据格式
                        if (!Array.isArray(labels)) {
                            throw new Error('无效的数据格式');
                        }

                        this.importStatus = {
                            show: true,
                            message: '正在导入...',
                            error: false
                        };

                        // 统计数据
                        let imported = 0;
                        let skipped = 0;
                        
                        // 批量导入标签
                        for (const label of labels) {
                            if (!label.twitterUrl || !label.label) {
                                skipped++;
                                continue;
                            }
                            
                            // 检查是否重复
                            const isDuplicate = this.twitterLabels.some(existingLabel => 
                                this.normalizeTwitterUrl(existingLabel.twitterUrl) === this.normalizeTwitterUrl(label.twitterUrl) ||
                                existingLabel.label === label.label
                            );
                            
                            if (isDuplicate) {
                                skipped++;
                                continue;
                            }

                            // 导入新标签
                            try {
                                await axios.post('/api/twitter-labels', {
                                    twitterUrl: label.twitterUrl,
                                    label: label.label,
                                    color: label.color || '#3B82F6'
                                });
                                imported++;
                            } catch (error) {
                                console.error('导入标签失败:', error);
                                skipped++;
                            }
                        }

                        // 刷新标签列表
                        await this.fetchTwitterLabels();

                        // 显示详细的导入结果
                        this.importStatus = {
                            show: true,
                            message: `导入完成：成功 ${imported} 个，跳过 ${skipped} 个重复或无效标签`,
                            error: false
                        };

                        // 3秒后隐藏消息
                        setTimeout(() => {
                            this.importStatus.show = false;
                        }, 5000); // 延长显示时间到5秒，因为消息更长了

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

            // 清空文件输入框
            event.target.value = '';
        },
    },
    mounted() {
        this.fetchTokens();
        this.fetchDuplicateTokens();
        
        this.refreshInterval = setInterval(() => {
            this.fetchTokens();
            this.fetchDuplicateTokens();
        }, 2000);
        this.fetchTwitterLabels();
        this.fetchData();
        this.startPolling();
        window.addEventListener('scroll', this.handleScroll);
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
        window.removeEventListener('scroll', this.handleScroll);
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }
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
            this.duplicateTotalPages = Math.ceil(this.duplicateTokens.length / this.duplicatePageSize);
            const range = [];
            for (let i = 1; i <= this.duplicateTotalPages; i++) {
                if (i === 1 || i === this.duplicateTotalPages || 
                    (i >= this.duplicateCurrentPage - 1 && i <= this.duplicateCurrentPage + 1)) {
                    range.push(i);
                } else if (range[range.length - 1] !== '...') {
                    range.push('...');
                }
            }
            return range;
        }
    }
}).mount('#app'); 