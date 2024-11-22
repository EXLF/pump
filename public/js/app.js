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
            copyMessageTimer: null
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
        
        handleImageError(e) {
            e.target.src = 'https://via.placeholder.com/40';
        },
        
        checkTwitterLink(link) {
            if (!link) return 'text-gray-500';  // 无链接时的默认颜色
            
            try {
                const url = link.toLowerCase().trim();
                
                // 检查是否是有效的Twitter/X域名
                if (!url.includes('twitter.com') && !url.includes('x.com')) {
                    return 'text-red-500';  // 无效链接
                }
                
                // 检查是否包含完整推文链接
                if (url.includes('/status/')) {
                    return 'text-green-500';  // 完整推文链接
                }
                
                // 检查是否只有用户名
                const urlParts = url.replace('https://', '')
                                   .replace('http://', '')
                                   .replace('twitter.com/', '')
                                   .replace('x.com/', '')
                                   .split('/');
                                   
                if (urlParts.length === 1 && urlParts[0].length > 0) {
                    return 'text-yellow-500';  // 只有用户名的链接
                }
                
                return 'text-red-500';  // 其他情况视为无效链接
            } catch (error) {
                return 'text-red-500';  // 解析出错时视为无效链接
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
                
                // 清除之前的定时器
                if (this.copyMessageTimer) {
                    clearTimeout(this.copyMessageTimer);
                }
                
                // 显示消息
                this.showCopyMessage = true;
                
                // 设置新的定时器
                this.copyMessageTimer = setTimeout(() => {
                    this.showCopyMessage = false;
                }, 2000);
            } catch (err) {
                console.error('复制失败:', err);
            }
        }
    },
    mounted() {
        this.fetchTokens();
        this.fetchDuplicateTokens();
        
        this.refreshInterval = setInterval(() => {
            this.fetchTokens();
            this.fetchDuplicateTokens();
        }, 2000);
    },
    beforeUnmount() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.copyMessageTimer) {
            clearTimeout(this.copyMessageTimer);
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