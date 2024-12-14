const { createApp } = Vue;

createApp({
    data() {
        return {
            // 统计数据
            currentOnline: 0,
            todayVisits: 0,
            avgOnlineTime: '0分钟',
            peakOnline: 0,
            
            // 用户列表数据
            users: [],
            filteredUsers: [],
            searchQuery: '',
            filterTimeRange: 'all',
            
            // 分页
            currentPage: 1,
            pageSize: 10,
            totalUsers: 0,
            
            // 图表实例
            onlineTrendChart: null,
            sourceDistributionChart: null,
            
            // 自动刷新
            refreshInterval: null
        }
    },
    computed: {
        totalPages() {
            return Math.ceil(this.totalUsers / this.pageSize);
        },
        pageNumbers() {
            const pages = [];
            const maxButtons = 5;
            const leftOffset = Math.floor(maxButtons / 2);
            
            let start = this.currentPage - leftOffset;
            let end = this.currentPage + leftOffset;
            
            if (start < 1) {
                end = Math.min(end + (1 - start), this.totalPages);
                start = 1;
            }
            
            if (end > this.totalPages) {
                start = Math.max(start - (end - this.totalPages), 1);
                end = this.totalPages;
            }
            
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            
            return pages;
        }
    },
    methods: {
        async fetchData() {
            try {
                const response = await axios.get('/api/admin/online-stats');
                const data = response.data;
                
                // 更新统计数据
                this.currentOnline = data.currentOnline;
                this.todayVisits = data.todayVisits;
                this.avgOnlineTime = this.formatDuration(data.avgOnlineTime);
                this.peakOnline = data.peakOnline;
                
                // 更新用户列表
                this.users = data.users;
                this.totalUsers = data.users.length;
                this.filterUsers();
                
                // 更新图表
                this.updateCharts(data.chartData);
                
            } catch (error) {
                console.error('获取数据失败:', error);
            }
        },
        
        filterUsers() {
            let filtered = [...this.users];
            
            // 搜索过滤
            if (this.searchQuery) {
                const query = this.searchQuery.toLowerCase();
                filtered = filtered.filter(user => 
                    user.ip.toLowerCase().includes(query) ||
                    user.userAgent.toLowerCase().includes(query)
                );
            }
            
            // 时间范围过滤
            if (this.filterTimeRange !== 'all') {
                const now = Date.now();
                const ranges = {
                    '1h': 60 * 60 * 1000,
                    '6h': 6 * 60 * 60 * 1000,
                    '24h': 24 * 60 * 60 * 1000
                };
                const timeLimit = now - ranges[this.filterTimeRange];
                
                filtered = filtered.filter(user => 
                    new Date(user.lastActive).getTime() > timeLimit
                );
            }
            
            this.totalUsers = filtered.length;
            
            // 分页
            const start = (this.currentPage - 1) * this.pageSize;
            const end = start + this.pageSize;
            this.filteredUsers = filtered.slice(start, end);
        },
        
        changePage(page) {
            if (page >= 1 && page <= this.totalPages) {
                this.currentPage = page;
                this.filterUsers();
            }
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
        
        formatDuration(ms) {
            if (!ms) return '0分钟';
            const minutes = Math.floor(ms / (1000 * 60));
            const hours = Math.floor(minutes / 60);
            
            if (hours > 0) {
                return `${hours}小时${minutes % 60}分钟`;
            }
            return `${minutes}分钟`;
        },
        
        initCharts() {
            // 初始化24小时在线趋势图
            this.onlineTrendChart = echarts.init(document.getElementById('onlineTrendChart'));
            this.onlineTrendChart.setOption({
                title: {
                    text: '24小时在线趋势'
                },
                tooltip: {
                    trigger: 'axis'
                },
                xAxis: {
                    type: 'time',
                    axisLabel: {
                        formatter: (value) => {
                            const date = new Date(value);
                            return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                        }
                    }
                },
                yAxis: {
                    type: 'value'
                },
                series: [{
                    name: '在线人数',
                    type: 'line',
                    smooth: true,
                    data: []
                }]
            });
            
            // 初始化访问来源分布图
            this.sourceDistributionChart = echarts.init(document.getElementById('sourceDistributionChart'));
            this.sourceDistributionChart.setOption({
                title: {
                    text: '访问来源分布'
                },
                tooltip: {
                    trigger: 'item',
                    formatter: '{b}: {c} ({d}%)'
                },
                series: [{
                    name: '访问来源',
                    type: 'pie',
                    radius: '60%',
                    data: []
                }]
            });
        },
        
        updateCharts(chartData) {
            if (chartData.onlineTrend) {
                this.onlineTrendChart.setOption({
                    series: [{
                        data: chartData.onlineTrend
                    }]
                });
            }
            
            if (chartData.sourceDistribution) {
                this.sourceDistributionChart.setOption({
                    series: [{
                        data: chartData.sourceDistribution
                    }]
                });
            }
        },
        
        refreshData() {
            this.fetchData();
        },
        
        startAutoRefresh() {
            this.refreshInterval = setInterval(() => {
                this.fetchData();
            }, 30000); // 每30秒刷新一次
        },
        
        stopAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        }
    },
    watch: {
        searchQuery() {
            this.currentPage = 1;
            this.filterUsers();
        },
        filterTimeRange() {
            this.currentPage = 1;
            this.filterUsers();
        }
    },
    mounted() {
        this.initCharts();
        this.fetchData();
        this.startAutoRefresh();
        
        // 监听窗口大小���化，调整图表大小
        window.addEventListener('resize', () => {
            this.onlineTrendChart?.resize();
            this.sourceDistributionChart?.resize();
        });
    },
    beforeUnmount() {
        this.stopAutoRefresh();
        window.removeEventListener('resize', () => {
            this.onlineTrendChart?.resize();
            this.sourceDistributionChart?.resize();
        });
    }
}).mount('#app'); 