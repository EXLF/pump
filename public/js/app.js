const { createApp } = Vue;

const app = createApp({
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
            pageSize: 9,
            duplicateCurrentPage: 1,
            duplicatePageSize: 4,
            duplicateTotalPages: 1,
            activeTab: 'all',
            selectedDuplicateGroup: null,
            duplicateGroupTokens: [],
            selectedGroupSymbol: '',
            showCopyMessage: false,
            showActionMessage: false,
            actionMessage: '',
            actionMessageType: 'success',
            messageTimer: null,
            lastScrollPosition: 0,
            polling: null,
            isUserScrolling: false,
            lastUpdateTime: 0,
            imageCache: new Map(),
            updateInterval: 3000,
            minUpdateInterval: 2000,
            maxUpdateInterval: 5000,
            lastDataChange: null,
            consecutiveNoChanges: 0,
            onlineUsers: 0,
            onlineUsersPolling: null,
            addressAliases: new Map(),
            addressAliasesLastUpdate: 0,
            addressAliasesUpdateInterval: 6000,
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
            showDevListModal: false,
            devList: [],
            devSearchQuery: '',
            notificationSound: new Audio('/sounds/dev.mp3'),
            previousDevCount: 0,
            soundEnabled: true,
            showDonateModal: false,
            currentDonateMethod: 'wechat',
            donateMethods: [
                {
                    id: 'wechat',
                    name: '微信支付',
                    qrcode: '/images/donate/wechat.png'
                },
                {
                    id: 'alipay',
                    name: '支付宝',
                    qrcode: '/images/donate/alipay.png'
                }
            ],
            tokenCache: null,
            isCacheEnabled: true,
            lastCacheUpdate: null,
            websocket: null,
            devPollingInterval: 5000,
            lastDevUpdate: null,
            previousDevTokens: [],
            wallets: [],
            currentWalletAddress: null,
            walletStats: {
                totalTransactions: 0,
                buyCount: 0,
                sellCount: 0,
                totalSolAmount: 0
            },
            transactions: [],
            totalPages: 1,
            showAddWalletModal: false,
            showEditWalletModal: false,
            showTransactionDetailsModal: false,
            newWallet: {
                address: '',
                name: '',
                monitorBuy: true,
                monitorSell: true
            },
            editingWallet: {
                walletAddress: '',
                walletName: '',
                monitorBuy: true,
                monitorSell: true
            },
            selectedTransaction: null,
            walletAddressExists: false,
            existingWalletName: '',
            walletSoundEnabled: true,
            walletNotificationSound: new Audio('/sounds/wallet.mp3'),
            previousTransactions: [],
            walletListPage: 1,
            walletListPageSize: 10,
            walletListPages: 1,
            allWallets: []
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
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        },
        
        handleImageError(event, token) {
            event.target.style.display = 'none';  // 隐藏失败的图片
            event.target.onerror = null;  // 防止无限循
        },
        
        checkTwitterLink(link) {
            if (!link) return 'text-gray-500';
            
            try {
                const url = link.toLowerCase().trim();
                
                if (!url.includes('twitter.com') && !url.includes('x.com')) {
                    return 'text-red-500';  // 无效
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
                'symbol_match': '代币符重',
                'name_match': '代币名称重'
            };
            return typeMap[type] || '未知重复';
        },
        
        getDuplicateTypeClass(type) {
            const classMap = {
                'twitter_status': 'bg-green-100',
                'symbol_match': 'bg-yellow-100',
                'name_match': 'bg-red-100'
            };
            return classMap[type] || 'bg-gray-100';
        },
        
        getDuplicateColor(token) {
            if (!token.duplicateGroup && !this.addressAliases.has(token.signer)) return '';
            
            // 如果是dev地址（有别名），使用渐变背景色和细微的动画效果
            if (this.addressAliases.has(token.signer)) {
                return 'dev-token-highlight';
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
                // 如果正在查询特定组不是制刷新，则保持当前数据
                if (this.selectedDuplicateGroup && !arguments[0]) {
                    return;
                }

                const response = await axios.get('/api/duplicate-tokens');
                const newData = response.data.sort((a, b) => 
                    new Date(b.latestTime) - new Date(a.latestTime)
                );
                
                // 只没有选中特定组时更新数据
                if (!this.selectedDuplicateGroup) {
                    this.duplicateTokens = newData;
                    this.duplicateTotalPages = Math.ceil(this.duplicateTokens.length / this.duplicatePageSize);
                    
                    if (!this.duplicateCurrentPage || this.duplicateCurrentPage > this.duplicateTotalPages) {
                        this.duplicateCurrentPage = 1;
                    }
                }
            } catch (error) {
                console.error('获取重复代币数据失败:', error);
            }
        },

        async fetchTokens(forceRefresh = false) {
            if (this.loading && !forceRefresh) return;
            
            // 如果正在查看特定重复组且不是强制刷新，则不更新数据
            if (this.selectedDuplicateGroup && this.activeTab === 'duplicates' && !forceRefresh) {
                return;
            }
            
            this.loading = true;
            this.error = null;
            
            try {
                const params = { 
                    page: this.currentPage,
                    _t: Date.now()
                };
                
                // 如果有选中的重复组，并且前在重复标签页
                if (this.selectedDuplicateGroup && this.activeTab === 'duplicates') {
                    params.groupNumber = this.selectedDuplicateGroup;
                } else if (this.activeTab === 'duplicates') {
                    params.duplicatesOnly = true;
                }
                
                const response = await axios.get('/api/tokens', { 
                    params,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    }
                });
                
                // 只有在以下情况才更新数据：
                // 1. 没有选中重复组
                // 2. 不在重复标签页
                // 3. 强制刷新
                if (!this.selectedDuplicateGroup || this.activeTab !== 'duplicates' || forceRefresh) {
                    const hasChanged = this.hasDataChanged(this.tokens, response.data.tokens);
                    if (hasChanged) {
                        this.updateTokensData(response.data);
                        this.lastDataChange = Date.now();
                        this.consecutiveNoChanges = 0;
                        this.adjustUpdateInterval(true);
                    } else {
                        this.consecutiveNoChanges++;
                        this.adjustUpdateInterval(false);
                    }
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
                // 设置选中的重复组
                this.selectedDuplicateGroup = group.groupNumber;
                this.selectedGroupSymbol = group.symbol;
                this.activeTab = 'duplicates';
                this.currentPage = 1;
                
                // 获取该组的代币
                const response = await axios.get('/api/tokens', {
                    params: {
                        groupNumber: group.groupNumber,
                        page: this.currentPage
                    }
                });

                // 更新左侧列表数据
                this.tokens = response.data.tokens;
                this.total = response.data.total;
                this.pages = response.data.pages;

                // 更新标题
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
        
        
        normalizeTwitterUrl(url) {
            if (!url) return '';
            return url.replace('@', '')
                     .replace('https://', '')
                     .replace('http://', '')
                     .replace('x.com/', '')
                     .replace('twitter.com/', '')
                     .split('/')[0];  // 只保留户名部分
        },
        


        
        processDuplicateGroups() {
            return this.duplicateGroups.map(group => ({
                ...group,
                twitterLink: group.tokens[0]?.metadata?.twitter || null,
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
            if (!oldData || !newData) return true;
            if (oldData.length !== newData.length) return true;
            
            return newData.some((newItem, index) => {
                const oldItem = oldData[index];
                return newItem.mint !== oldItem.mint || 
                       newItem.timestamp !== oldItem.timestamp;
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
        
        

        // 添加分页方法
        async changeLabelPage(page) {
            if (page >= 1 && page <= this.labelPages && page !== this.labelPage) {
                this.labelPage = page;
            }
        },

        async fetchTokens() {
            // 保存滚动位置
            this.scrollPosition = this.$refs.tableContainer.scrollTop;
            
            try {
                const response = await axios.get(`/api/tokens?page=${this.currentPage}&duplicatesOnly=${this.activeTab === 'duplicates'}`);
                this.tokens = response.data.tokens;
                this.total = response.data.total;  // 确保设置数
                this.pages = response.data.pages;
                this.lastUpdate = this.formatTime(new Date());  // 更新时间
            } catch (error) {
                console.error('获取据失败:', error);
                this.error = '获数据失败，请后重试';
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
            
            // 恢复始数据显示
            this.fetchTokens();
            
            // 恢复自动刷新
            this.startPolling();
        },

        // 搜索复币
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
            this.fetchDuplicateTokens(); // 立即获取次数
            this.duplicatePolling = setInterval(() => {
                if (!this.isDuplicateSearchActive) {  // 只在非搜索态下更新
                    this.fetchDuplicateTokens();
                }
            }, this.updateInterval);
        },

        // 处理分页换
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
            
            // 接使已排序数据
            return this.duplicateTokens.slice(start, end);
        },

        // 统一的复制方法
        async copyText(text) {
            try {
                // 首先尝试使用 Clipboard API
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    // 后备方案：使用传统的复制方法
                    const textArea = document.createElement('textarea');
                    textArea.value = text;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    textArea.style.top = '0';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    
                    try {
                        document.execCommand('copy');
                    } catch (err) {
                        console.error('复制失败:', err);
                        return;
                    } finally {
                        document.body.removeChild(textArea);
                    }
                }
                
                // 清除之前的时器
                if (this.copyMessageTimer) {
                    clearTimeout(this.copyMessageTimer);
                }
                
                // 显示提示
                this.showCopyMessage = true;
                
                // 设置新的定时器
                this.copyMessageTimer = setTimeout(() => {
                    this.showCopyMessage = false;
                }, 2000);
            } catch (err) {
                console.error('复制失败:', err);
            }
        },

        // 获取在线用户数
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
                // 连接成功后立即获取一次数据
                if (!this.selectedDuplicateGroup || this.activeTab !== 'duplicates') {
                    this.fetchTokens(true);
                }
                
                // 启动心跳
                this.startHeartbeat(socket);
            });

            socket.addEventListener('message', (event) => {
                try {
                    const { type, data } = JSON.parse(event.data);
                    // 只在没有选中特定重复组时更新数据
                    if (type === 'tokensUpdate' && !this.isSearchActive && 
                        (!this.selectedDuplicateGroup || this.activeTab !== 'duplicates')) {
                        this.updateTokensData(data);
                    } else if (type === 'onlineUsers') {
                        this.onlineUsers = data.onlineUsers;
                    }
                } catch (error) {
                    console.error('处理WebSocket消息失败:', error);
                }
            });

            socket.addEventListener('close', () => {
                console.log('WebSocket 连接已关闭，尝试重新连接...');
                clearInterval(this.heartbeatInterval);
                setTimeout(() => this.connectWebSocket(), 5000);
            });

            socket.addEventListener('error', (error) => {
                console.error('WebSocket 错误:', error);
                clearInterval(this.heartbeatInterval);
            });

            this.websocket = socket;
        },

        // 添加心跳检测
        startHeartbeat(socket) {
            // 清除可能存在的旧心跳
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
            }

            // 启动新的心跳
            this.heartbeatInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: 'heartbeat',
                        timestamp: Date.now()
                    }));
                }
            }, 30000); // 每30秒发送一次心跳
        },

        // 统一的数据更新方法
        updateTokensData(data) {
            if (!data) return;
            
            // 更新代币数据
            if (data.tokens) {
                this.tokens = data.tokens;
                this.total = data.total;
                this.pages = data.pages;
            } else if (Array.isArray(data)) {
                this.tokens = data;
            }
            
            // 更新时间戳
            this.lastUpdate = new Date().toLocaleString();
            this.lastUpdateTime = Date.now();
        },

        formatShortAddress(address) {
            if (!address) return '';
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        },

        // 获取地址别名
        async fetchAddressAliases() {
            try {
                const now = Date.now();
                if (now - this.addressAliasesLastUpdate < this.addressAliasesUpdateInterval) {
                    return;
                }

                const response = await axios.get('/api/address-aliases');
                this.addressAliases = new Map(
                    response.data.map(item => [item.address, item.alias])
                );
                this.addressAliasesLastUpdate = now;
            } catch (error) {
                console.error('获取地址别名失败:', error);
            }
        },

        // 修改显示编辑别名的法
        showEditAlias(address) {
            console.log('尝试编辑地址:', address); // 添加日志
            console.log('当前别名Map:', this.addressAliases); // 添加日志
            
            // 如果有别名，则不允许编辑
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

        // 修改地址显示方法
        formatOwnerDisplay(token) {
            const address = token.signer;  // 改为使用 signer
            const alias = this.addressAliases.get(address);
            if (alias) {
                return `<span class="text-gray-700">${alias}</span>`;
            } else {
                return `<span class="cursor-pointer hover:text-blue-500">${this.formatAddress(address)}</span>`;
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
                
                // 重获取数据以确保同步
                await this.fetchAddressAliases();
                await this.fetchDevTokens();
                
                // 重置状
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

        // 格式化显示 Dev 地址
        formatDevAddress(token) {
            return token.signerAlias || this.formatAddress(token.signer);
        },

        // 获取 Dev 代币列表
        async fetchDevTokens() {
            try {
                const response = await axios.get('/api/dev-tokens');
                const newTokens = response.data;
                
                // 检查是否有新代币
                if (this.previousDevTokens.length > 0) {
                    const newDevTokens = newTokens.filter(token => 
                        !this.previousDevTokens.some(pt => pt.mint === token.mint)
                    );
                    
                    // 如果有新代币且声音开启播放提示音
                    if (newDevTokens.length > 0 && this.soundEnabled) {
                        this.playNotification();
                        // 可以加桌面通知
                        this.showNotification(`发现 ${newDevTokens.length} 个新的 Dev 币`);
                    }
                }
                
                this.devTokens = newTokens;
                this.previousDevTokens = newTokens;
                this.lastDevUpdate = new Date();
            } catch (error) {
                console.error('获取Dev币失败:', error);
            }
        },

        // 处理页码变化
        handleDevPageChange(page) {
            if (page >= 1 && page <= this.devPages) {
                this.devCurrentPage = page;
            }
        },

        // 添加新 Dev 地址
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
                
                // 重置单并关闭模态框
                this.newDev = { address: '', alias: '' };
                this.devAddError = '';
                this.devAddressExists = false;
                this.existingAlias = '';
                this.showAddDevModal = false;
                
            } catch (error) {
                console.error('添加 Dev 失败:', error);
                this.devAddError = '添加失败，稍后重试';
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
        getDisplayName(signer) {
            if (this.addressAliases.has(signer)) {
                return `<span class="dev-name-highlight">${this.addressAliases.get(signer)}</span>`;
            }
            return this.formatAddress(signer);
        },

        // 格式化显示 Dev 地址
        formatDevDisplay(token) {
            return token.signerAlias || this.formatAddress(token.signer);
        },

        // 获取显示名称
        getDisplayName(token) {
            if (this.addressAliases.has(token.signer)) {
                return this.addressAliases.get(token.signer);
            }
            return this.formatAddress(token.signer);
        },

        // 载地址别名
        async loadAddressAliases() {
            try {
                const response = await axios.get('/api/address-aliases');
                const aliases = response.data;
                this.addressAliases.clear();
                aliases.forEach(alias => {
                    this.addressAliases.set(alias.address, alias.alias);
                });
            } catch (error) {
                console.error('加载地址别名失败:', error);
            }
        },

        // 获取 Dev 列表
        async fetchDevList() {
            try {
                const response = await axios.get('/api/address-aliases');
                this.devList = response.data;
            } catch (error) {
                console.error('获取 Dev 列表失败:', error);
            }
        },

        // 添加播放提示音的方法
        playNotificationSound() {
            if (!this.soundEnabled) return; // 检查是否启用了声音
            
            try {
                this.notificationSound.currentTime = 0;
                this.notificationSound.play().catch(error => {
                    console.error('播放提示音失败:', error);
                });
            } catch (error) {
                console.error('播放提示音时发生错误:', error);
            }
        },

        // 清除缓存的方法
        async clearTokenCache() {
            if (this.tokenCache) {
                await this.tokenCache.clearCache();
                this.lastCacheUpdate = null;
            }
        },

        // 刷新数据的方法
        async refreshData() {
            await this.clearTokenCache();
            await this.loadTokens(this.currentPage);
        },

        initWebSocket() {
            this.websocket = new WebSocket(`ws://${window.location.host}`);
            
            this.websocket.onmessage = async (event) => {
                const { type, data } = JSON.parse(event.data);
                if (type === 'tokensUpdate') {
                    // 收到新数据时，更新缓存
                    await this.tokenCache?.saveTokens(data);
                    // 如果是当前页的数据，直接更新显示
                    await this.loadTokens(this.currentPage);
                }
            };

            this.websocket.onclose = () => {
                console.log('WebSocket 连接已关闭，尝试重新连接...');
                setTimeout(() => this.initWebSocket(), 5000);
            };
        },

        async loadTokens(page = 1) {
            try {
                // 1. 首先尝试从缓存加载
                const cachedData = await this.tokenCache?.getTokens(
                    page, 
                    this.pageSize, 
                    { search: this.searchQuery }
                );

                if (cachedData) {
                    console.log('使用缓数据');
                    this.tokens = cachedData.tokens;
                    this.totalTokens = cachedData.total;
                    return;
                }

                // 2. 如果缓存未命中从服务器加载
                console.log('从服务器获取数据');
                const response = await axios.get(`/api/tokens`, {
                    params: {
                        page: page,
                        pageSize: this.pageSize,
                        search: this.searchQuery
                    }
                });

                this.tokens = response.data.tokens;
                this.totalTokens = response.data.total;

                // 3. 保存到缓存
                await this.tokenCache?.saveTokens(response.data.tokens);
            } catch (error) {
                console.error('加载令牌失败:', error);
            }
        },

        getAddressAlias(address) {
            return this.addressAliases.get(address) || address;
        },

        // 添加桌面通知
        showNotification(message) {
            if (Notification.permission === 'granted') {
                new Notification('Dev 代币提醒', {
                    body: message,
                    icon: '/favicon.ico'
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        this.showNotification(message);
                    }
                });
            }
        },

        playNotification() {
            if (this.soundEnabled && this.notificationSound) {
                this.notificationSound.play().catch(error => {
                    console.error('播放提示音失败:', error);
                });
            }
        },

        // 动态调整更新间隔
        adjustUpdateInterval(hasChanged) {
            if (hasChanged) {
                // 如果据变化，减少更新间隔
                this.updateInterval = Math.max(
                    this.minUpdateInterval,
                    this.updateInterval - 500
                );
            } else {
                // 如果连续多次无变化，逐增加更新间隔
                if (this.consecutiveNoChanges >= 3) {
                    this.updateInterval = Math.min(
                        this.maxUpdateInterval,
                        this.updateInterval + 500
                    );
                }
            }
            
            // 重新设置询间隔
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            this.refreshInterval = setInterval(() => {
                if (!this.isSearchActive) {
                    this.fetchTokens();
                    this.fetchDuplicateTokens();
                }
            }, this.updateInterval);
        },

        // 添加更新持币人数的方法
        async updateHoldersCount(mint) {
            try {
                const cell = document.querySelector(`tr[data-mint="${mint}"] .holders-count`);
                if (cell) {
                    cell.innerHTML = '<span class="loading">更新中...</span>';
                }

                const response = await fetch('/api/update-holders-count', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ mint })
                });
                
                if (!response.ok) {
                    throw new Error('更新失败');
                }
                
                const data = await response.json();
                // 更新本地数据
                const tokenIndex = this.tokens.findIndex(t => t.mint === mint);
                if (tokenIndex !== -1) {
                    this.tokens[tokenIndex].holdersCount = data.holdersCount;
                    this.tokens[tokenIndex].lastHoldersUpdate = new Date();
                }
                
                if (cell) {
                    cell.innerHTML = `${data.holdersCount}<span class="update-icon">🔄</span>`;
                }
            } catch (error) {
                console.error('更新持币人数失败:', error);
                if (cell) {
                    cell.innerHTML = '更新失败 🔄';
                }
            }
        },

        // 修改 formatTokenRow 方法
        formatTokenRow(token) {
            return `
                <tr data-mint="${token.mint}">
                    <td>${token.name || '未知'}</td>
                    <td>${token.symbol || '未知'}</td>
                    <td class="address-cell">
                        <a href="https://solscan.io/token/${token.mint}" target="_blank" class="address-link">
                            ${this.formatAddress(token.mint)}
                        </a>
                        <button class="copy-button" onclick="copyToClipboard('${token.mint}')">复制</button>
                    </td>
                    <!-- 暂时注释掉持人数显示
                    <td class="holders-count" onclick="app.updateHoldersCount('${token.mint}')" title="点击更新">
                        ${token.holdersCount || '0'}
                        <span class="update-icon">🔄</span>
                    </td>
                    -->
                    <td class="address-cell">
                        <a href="https://solscan.io/account/${token.signer}" target="_blank" class="address-link">
                            ${this.formatAddress(token.signer)}
                        </a>
                        <button class="copy-button" onclick="copyToClipboard('${token.signer}')">复制</button>
                    </td>
                    <td>${this.formatTime(token.timestamp)}</td>
                    <td>
                        ${token.metadata?.twitter ? `
                            <div class="social-links">
                                <a href="${token.metadata.twitter}" target="_blank" class="${this.checkTwitterLink(token.metadata.twitter)}">
                                    Twitter
                                </a>
                            </div>
                        ` : ''}
                    </td>
                </tr>
            `;
        },

        // 格式化日期
        formatDate(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        },

        // 格式化时间
        formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        },

        // 添加新方法用于重复次数的显示
        formatDuplicateCount(count) {
            return `<span class="text-blue-500">${count}</span>`;
        },

        // 钱包相关法
        async loadWallets() {
            try {
                const response = await axios.get('/api/wallets');
                if (response.data.success) {
                    this.allWallets = response.data.data || [];
                    this.walletListPages = Math.ceil(this.allWallets.length / this.walletListPageSize);
                    this.updateDisplayedWallets();
                }
            } catch (error) {
                console.error('获取钱包列表失败:', error);
                this.showMessage('获取钱包列表失败', 'error');
            }
        },

        updateDisplayedWallets() {
            const start = (this.walletListPage - 1) * this.walletListPageSize;
            const end = start + this.walletListPageSize;
            this.wallets = this.allWallets.slice(start, end);
        },

        handleWalletListPageChange(page) {
            if (typeof page === 'number' && page >= 1 && page <= this.walletListPages) {
                this.walletListPage = page;
                this.updateDisplayedWallets();
            }
        },

        // 计算钱包列表分页范围
        walletListPaginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.walletListPage - leftOffset;
            let end = this.walletListPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.walletListPages);
                start = 1;
            }
            
            if (end > this.walletListPages) {
                start = Math.max(start - (end - this.walletListPages), 1);
                end = this.walletListPages;
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
            if (end < this.walletListPages) {
                if (end < this.walletListPages - 1) range.push('...');
                range.push(this.walletListPages);
            }
            
            return range;
        },

        async selectWallet(address) {
            this.currentWalletAddress = address;
            this.currentPage = 1;
            await this.loadWalletDetails();
        },

        async loadWalletDetails() {
            try {
                if (this.currentWalletAddress === 'all') {
                    await this.loadAllTransactions();
                } else {
                    await Promise.all([
                        this.loadWalletStats(),
                        this.loadWalletTransactions()
                    ]);
                }

                // 检查是否有新交易
                if (this.previousTransactions.length > 0) {
                    const newTransactions = this.transactions.filter(tx => 
                        !this.previousTransactions.some(pt => pt.signature === tx.signature)
                    );

                    // 果有新交易且声音开启，播放提示音
                    if (newTransactions.length > 0 && this.walletSoundEnabled) {
                        this.playWalletNotification();
                        // 显示桌面通知
                        this.showWalletNotification(`发现 ${newTransactions.length} 笔新交易`);
                    }
                }

                // 更新previousTransactions
                this.previousTransactions = [...this.transactions];
            } catch (error) {
                console.error('加载钱包详情失败:', error);
                this.showMessage('加载钱包详情失败', 'error');
            }
        },

        async loadWalletStats() {
            try {
                const response = await axios.get(`/api/wallets/${this.currentWalletAddress}/stats`);
                this.walletStats = response.data.data;
            } catch (error) {
                console.error('加载钱包统计信息失败:', error);
                this.$message.error('加载钱包统计信息失败');
            }
        },

        async loadWalletTransactions() {
            try {
                const response = await axios.get(
                    `/api/wallets/${this.currentWalletAddress}/transactions`,
                    {
                        params: {
                            page: this.currentPage,
                            limit: this.pageSize
                        }
                    }
                );
                this.transactions = response.data.data.transactions;
                this.totalPages = Math.ceil(response.data.data.total / this.pageSize);
            } catch (error) {
                console.error('加载钱包交易记录失败:', error);
                this.$message.error('加载钱包交易记录失败');
            }
        },

        async loadAllTransactions() {
            try {
                const response = await axios.get('/api/wallets/transactions', {
                    params: {
                        page: this.currentPage,
                        limit: this.pageSize
                    }
                });
                this.transactions = response.data.data.transactions;
                this.totalPages = Math.ceil(response.data.data.total / this.pageSize);
            } catch (error) {
                console.error('加载所有交易记录失败:', error);
                this.$message.error('加载所有交易记录失败');
            }
        },

        async addWallet() {
            // 表单验证
            if (!this.newWallet.address || !this.newWallet.name) {
                this.showMessage('请填写完整的钱包信息', 'error');
                return;
            }

            if (this.walletAddressExists) {
                this.showMessage('该钱包地址已存在', 'error');
                return;
            }

            try {
                // 构建请求数据
                const walletData = {
                    walletAddress: this.newWallet.address,
                    walletName: this.newWallet.name,
                    monitorBuy: this.newWallet.monitorBuy,
                    monitorSell: this.newWallet.monitorSell
                };

                console.log('正在添加钱包:', walletData);

                const response = await axios.post('/api/wallets', walletData);
                
                console.log('加钱包响应:', response.data);

                if (response.data.success) {
                    // 添加成功后更新钱包列表
                    await this.fetchWallets();
                    
                    // 关闭模态框
                    this.showAddWalletModal = false;
                    
                    // 重置表单
                    this.newWallet = {
                        address: '',
                        name: '',
                        monitorBuy: true,
                        monitorSell: true
                    };
                    this.walletAddressExists = false;
                    this.existingWalletName = '';
                    
                    // 显示成功消息
                    this.showMessage('添加钱包成功');
                } else {
                    throw new Error(response.data.message || '添加钱包失败');
                }
            } catch (error) {
                console.error('添加钱包时出错:', error);
                
                // 显示详细错误信息
                let errorMessage = '添加钱包失败，钱包地址已存在: ';
                if (error.response) {
                    // 服务器响应的错误
                    errorMessage += error.response.data?.message || error.response.statusText;
                    console.error('服务器响应:', error.response);
                } else if (error.request) {
                    // 请求发送失败
                    errorMessage += '无法连接到服务器';
                    console.error('请求错误:', error.request);
                } else {
                    // 其他错误
                    errorMessage += error.message;
                }
                
                this.showMessage(errorMessage, 'error');
            }
        },

        showEditWalletModal(wallet) {
            console.log('准备编辑钱包:', wallet);
            // 深拷贝钱包数据
            this.editingWallet = {
                walletAddress: wallet.walletAddress,
                walletName: wallet.walletName,
                monitorBuy: wallet.monitorBuy ?? true,
                monitorSell: wallet.monitorSell ?? true
            };
            // 显示模态框
            this.showEditWalletModal = true;
        },

        openEditWalletModal(wallet) {
            console.log('打开编辑钱包模态框:', wallet);
            this.editingWallet = {
                walletAddress: wallet.walletAddress,
                walletName: wallet.walletName,
                monitorBuy: wallet.monitorBuy ?? true,
                monitorSell: wallet.monitorSell ?? true
            };
            this.showEditWalletModal = true;
        },

        closeEditWalletModal() {
            this.showEditWalletModal = false;
            this.editingWallet = {
                walletAddress: '',
                walletName: '',
                monitorBuy: true,
                monitorSell: true
            };
        },

        async updateWallet() {
            try {
                if (!this.editingWallet.walletAddress || !this.editingWallet.walletName) {
                    this.showMessage('请填写整的钱包信息', 'error');
                    return;
                }

                console.log('正在更新钱包:', this.editingWallet);
                const response = await axios.put(`/api/wallets/${this.editingWallet.walletAddress}`, {
                    walletName: this.editingWallet.walletName,
                    monitorBuy: this.editingWallet.monitorBuy,
                    monitorSell: this.editingWallet.monitorSell
                });

                console.log('更新钱包响应:', response.data);

                if (response.data.success) {
                    // 更新成功后刷新钱包列表
                    await this.loadWallets();
                    
                    // 如果当前正在查看这个钱包的详情，也更新详情
                    if (this.currentWalletAddress === this.editingWallet.walletAddress) {
                        await this.loadWalletDetails();
                    }
                    
                    // 关闭模态框
                    this.closeEditWalletModal();
                    
                    // 显示成功消息
                    this.showMessage('更新钱包成功', 'success');
                } else {
                    throw new Error(response.data.message || '更新钱包失败');
                }
            } catch (error) {
                console.error('更新钱包失败:', error);
                let errorMessage = '更新钱包失败: ';
                if (error.response) {
                    errorMessage += error.response.data?.message || error.response.statusText;
                } else if (error.request) {
                    errorMessage += '无法连接到服务器';
                } else {
                    errorMessage += error.message;
                }
                this.showMessage(errorMessage, 'error');
            }
        },

        async deleteWallet(address) {
            if (!confirm('确定要删除这个钱包吗？')) {
                return;
            }

            try {
                console.log('正在删除钱包:', address);
                const response = await axios.delete(`/api/wallets/${address}`);
                
                if (response.data.success) {
                    // 显示成功消息
                    this.showMessage('删除钱包成功', 'success');
                    
                    // 如果当前正在查看被删除的钱包，切换到全部视图
                    if (this.currentWalletAddress === address) {
                        this.currentWalletAddress = 'all';
                    }
                    
                    // 立即重新加载钱包列表
                    await this.loadWallets();
                    
                    // 重新加载交易记录
                    await this.loadWalletDetails();
                } else {
                    throw new Error(response.data.message || '删除钱包失败');
                }
            } catch (error) {
                console.error('删除钱包失败:', error);
                let errorMessage = '删除钱包失败: ';
                if (error.response) {
                    errorMessage += error.response.data?.message || error.response.statusText;
                } else if (error.request) {
                    errorMessage += '无法连接到服务器';
                } else {
                    errorMessage += error.message;
                }
                this.showMessage(errorMessage, 'error');
            }
        },

        showTransactionDetails(transaction) {
            this.selectedTransaction = transaction;
            this.showTransactionDetailsModal = true;
        },

        getWalletName(address) {
            const wallet = this.wallets.find(w => w.walletAddress === address);
            return wallet ? wallet.walletName : '未命名钱包';
        },

        handlePageChange(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.loadWalletDetails();
            }
        },

        // 工具方法
        formatAddress(address) {
            if (!address) return '';
            return `${address.slice(0, 4)}...${address.slice(-4)}`;
        },

        formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
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

        // 检查钱包址是否已存在
        async checkWalletAddress() {
            if (!this.newWallet.address) {
                this.walletAddressExists = false;
                this.existingWalletName = '';
                return;
            }
            
            try {
                console.log('检查钱包地址:', this.newWallet.address);
                const response = await axios.get(`/api/wallets/check/${this.newWallet.address}`);
                console.log('检查钱包响应:', response.data);
                
                this.walletAddressExists = response.data.exists;
                this.existingWalletName = response.data.walletName || '';
                
                if (response.data.error) {
                    throw new Error(response.data.error);
                }
            } catch (error) {
                console.error('检查钱包地址时出错:', error);
                // 不显示错误提示，只在控制台记录
                this.walletAddressExists = false;
                this.existingWalletName = '';
            }
        },

        // 获取钱包列表的方法
        async fetchWallets() {
            try {
                console.log('正在获取钱包列表...');
                const response = await axios.get('/api/wallets');
                console.log('获取钱包列表响应:', response.data);
                
                if (response.data.success) {
                    this.wallets = response.data.data || [];
                    
                    // 如果当前选中的钱包不在列表中，重置为 'all'
                    if (this.currentWalletAddress && 
                        this.currentWalletAddress !== 'all' && 
                        !this.wallets.find(w => w.walletAddress === this.currentWalletAddress)) {
                        this.currentWalletAddress = 'all';
                    }
                    
                    // 更新完列表后，如果有当前选中的钱包，重新加载其详情
                    if (this.currentWalletAddress) {
                        await this.loadWalletDetails();
                    }
                } else {
                    throw new Error(response.data.message || '获取钱包列表失败');
                }
            } catch (error) {
                console.error('获取钱包列表失败:', error);
                let errorMessage = '获取钱包列表失败: ';
                if (error.response) {
                    errorMessage += error.response.data?.message || error.response.statusText;
                } else if (error.request) {
                    errorMessage += '无法连���到服务器';
                } else {
                    errorMessage += error.message;
                }
                this.showMessage(errorMessage, 'error');
            }
        },

        // 添加新的提示方法
        showMessage(message, type = 'success') {
            // 清除可能存在的定时器
            if (this.messageTimer) {
                clearTimeout(this.messageTimer);
            }
            
            this.actionMessage = message;
            this.actionMessageType = type;
            this.showActionMessage = true;
            
            // 3秒后自动隐藏
            this.messageTimer = setTimeout(() => {
                this.showActionMessage = false;
            }, 3000);
        },

        // 添加钱包声音提示方法
        playWalletNotification() {
            if (this.walletSoundEnabled && this.walletNotificationSound) {
                this.walletNotificationSound.currentTime = 0;
                this.walletNotificationSound.play().catch(error => {
                    console.error('播放钱包提示音失败:', error);
                });
            }
        },

        // 添加钱包桌面通知方法
        showWalletNotification(message) {
            if (Notification.permission === 'granted') {
                new Notification('钱包交易提醒', {
                    body: message,
                    icon: '/favicon.ico'
                });
            }
        },

        handleWalletListPageChange(page) {
            if (page >= 1 && page <= this.walletListPages) {
                this.walletListPage = page;
                this.updateDisplayedWallets();
            }
        },

        updateDisplayedWallets() {
            const start = (this.walletListPage - 1) * this.walletListPageSize;
            const end = start + this.walletListPageSize;
            this.wallets = this.allWallets.slice(start, end);
        }
    },
    mounted() {
        // 初始化数据
        this.fetchTokens(true);
        this.fetchDuplicateTokens(true);
        this.fetchAddressAliases();
        this.fetchDevTokens();
        this.loadAddressAliases();
        this.fetchDevList();
        
        // 修改自动刷新逻辑
        this.refreshInterval = setInterval(() => {
            if (!this.isSearchActive) {
                // 只在没有选中特定重复组时进行自动刷新
                if (!this.selectedDuplicateGroup || this.activeTab !== 'duplicates') {
                    this.fetchTokens();
                    this.fetchDuplicateTokens();
                }
            }
        }, this.updateInterval);
        
        // WebSocket连接
        this.connectWebSocket();
        
        // 其他初始化
        window.addEventListener('scroll', this.handleScroll);
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
        
        // 初始化钱包监 - 设置默认显示全部交易
        this.currentWalletAddress = 'all';
        this.loadWallets().then(() => {
            this.loadAllTransactions();  // 加载全部交易记录
        });
        
        // 定时刷新当前钱数据
        setInterval(() => {
            if (this.currentWalletAddress) {
                this.loadWalletDetails();
            }
        }, 5000);
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
        // 基本分页
        paginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.currentPage - leftOffset;
            let end = this.currentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.pages);
                start = 1;
            }
            
            if (end > this.pages) {
                start = Math.max(start - (end - this.pages), 1);
                end = this.pages;
            }
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < this.pages) {
                if (end < this.pages - 1) range.push('...');
                range.push(this.pages);
            }
            
            return range;
        },
        
        // 显示的代币
        displayedTokens() {
            return this.isSearchActive ? this.searchResults : this.tokens;
        },
        
        // 重复代币分页
        displayedDuplicateTokens() {
            const data = this.isDuplicateSearchActive ? this.duplicateSearchResults : this.duplicateTokens;
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const start = (currentPage - 1) * this.duplicatePageSize;
            const end = start + this.duplicatePageSize;
            return data.slice(start, end);
        },
        
        // 重复代币总页数
        duplicateTotalPages() {
            const totalItems = this.isDuplicateSearchActive 
                ? this.duplicateSearchResults.length 
                : this.duplicateTokens.length;
            return Math.max(1, Math.ceil(totalItems / this.duplicatePageSize));
        },
        
        // 重复代币分页范围
        duplicatePaginationRange() {
            const currentPage = this.isDuplicateSearchActive ? this.duplicateSearchPage : this.duplicateCurrentPage;
            const totalPages = this.duplicateTotalPages;
            
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
        
        // Dev 代币相关计算属性
        devPages() {
            return Math.ceil(this.devTokens.length / this.devPageSize);
        },
        
        displayedDevTokens() {
            const start = (this.devCurrentPage - 1) * this.devPageSize;
            const end = start + this.devPageSize;
            return this.devTokens.slice(start, end);
        },
        
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
        },
        
        // 搜索相关计算属性
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
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < this.searchPages) {
                if (end < this.searchPages - 1) range.push('...');
                range.push(this.searchPages);
            }
            
            return range;
        },
        
        // Dev 列表过滤
        filteredDevList() {
            if (!this.devSearchQuery) return this.devList;
            
            const query = this.devSearchQuery.toLowerCase();
            return this.devList.filter(dev => 
                dev.address.toLowerCase().includes(query) || 
                dev.alias.toLowerCase().includes(query)
            );
        },
        
        // 钱包列表分页范围
        walletListPaginationRange() {
            const range = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.walletListPage - leftOffset;
            let end = this.walletListPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.walletListPages);
                start = 1;
            }
            
            if (end > this.walletListPages) {
                start = Math.max(start - (end - this.walletListPages), 1);
                end = this.walletListPages;
            }
            
            if (start > 1) {
                range.push(1);
                if (start > 2) range.push('...');
            }
            
            for (let i = start; i <= end; i++) {
                range.push(i);
            }
            
            if (end < this.walletListPages) {
                if (end < this.walletListPages - 1) range.push('...');
                range.push(this.walletListPages);
            }
            
            return range;
        }
    },
    watch: {
        // 监听态显示状态，每次打开时刷新列表
        showDevListModal(newVal) {
            if (newVal) {
                this.fetchDevList();
            }
        }
    }
}).mount('#app');

// 将 Vue 实例暴露到全局作用域
window.app = app; 