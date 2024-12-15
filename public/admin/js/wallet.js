// API基础URL
const API_BASE_URL = '/api';

// Bootstrap模态框实例
let addWalletModal;
let editWalletModal;

// 当前选中的钱包地址
let currentWalletAddress = null;

// 当前页码
let currentPage = 1;
const PAGE_SIZE = 10;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化模态框
    addWalletModal = new bootstrap.Modal(document.getElementById('addWalletModal'));
    editWalletModal = new bootstrap.Modal(document.getElementById('editWalletModal'));

    // 加载钱包列表
    loadWallets();

    // 每5秒自动刷新当前钱包的数据
    setInterval(() => {
        if (currentWalletAddress) {
            loadWalletDetails(currentWalletAddress);
        }
    }, 5000);
});

// 显示添加钱包模态框
function showAddWalletModal() {
    document.getElementById('addWalletForm').reset();
    addWalletModal.show();
}

// 显示编辑钱包模态框
function showEditWalletModal(wallet) {
    document.getElementById('editWalletAddress').value = wallet.walletAddress;
    document.getElementById('editWalletName').value = wallet.walletName;
    document.getElementById('editMonitorBuy').checked = wallet.monitorBuy;
    document.getElementById('editMonitorSell').checked = wallet.monitorSell;
    editWalletModal.show();
}

// 加载钱包列表
async function loadWallets() {
    try {
        const response = await axios.get(`${API_BASE_URL}/wallets`);
        const wallets = response.data.data;
        
        const walletList = document.getElementById('walletList');
        walletList.innerHTML = `
            <div class="list-group-item list-group-item-action ${currentWalletAddress === 'all' ? 'active' : ''}" onclick="selectWallet('all')">
                <h6 class="mb-0">全部交易</h6>
                <small class="text-muted">显示所有钱包的交易记录</small>
            </div>
        `;

        wallets.forEach(wallet => {
            const item = document.createElement('div');
            item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${currentWalletAddress === wallet.walletAddress ? 'active' : ''}`;
            item.innerHTML = `
                <div class="me-3" onclick="selectWallet('${wallet.walletAddress}')">
                    <h6 class="mb-0">${wallet.walletName}</h6>
                    <small class="text-muted">${wallet.walletAddress}</small>
                </div>
                <div class="wallet-actions">
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="event.stopPropagation(); showEditWalletModal(${JSON.stringify(wallet).replace(/"/g, '&quot;')})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteWallet('${wallet.walletAddress}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            walletList.appendChild(item);
        });

        // 如果没有选中的钱包，默认选中"全部交易"
        if (!currentWalletAddress) {
            selectWallet('all');
        }
    } catch (error) {
        showError('加载钱包列表失败');
        console.error('加载钱包列表失败:', error);
    }
}

// 选择钱包
async function selectWallet(address) {
    currentWalletAddress = address;
    document.getElementById('walletDetails').style.display = 'block';
    
    // 更新标题和徽章
    const titleElement = document.getElementById('currentWalletTitle');
    const badgeElement = document.getElementById('currentWalletBadge');
    
    if (address === 'all') {
        titleElement.textContent = '全部交易';
        badgeElement.textContent = '';
    } else {
        const response = await axios.get(`${API_BASE_URL}/wallets`);
        const wallets = response.data.data;
        const currentWallet = wallets.find(w => w.walletAddress === address);
        if (currentWallet) {
            titleElement.textContent = currentWallet.walletName;
            badgeElement.textContent = `${currentWallet.walletAddress.slice(0, 8)}...`;
        }
    }
    
    // 刷新钱包列表以更新选中状态
    await loadWallets();
    
    // 加载钱包详情
    await loadWalletDetails(address);
}

// 加载钱包详情
async function loadWalletDetails(address) {
    try {
        if (address === 'all') {
            // 如果是全部交易，隐藏统计卡片
            document.querySelectorAll('.stats-card').forEach(card => {
                card.style.display = 'none';
            });
        } else {
            // 显示统计卡片
            document.querySelectorAll('.stats-card').forEach(card => {
                card.style.display = 'block';
            });
            
            // 加载统计信息
            const statsResponse = await axios.get(`${API_BASE_URL}/wallets/${address}/stats`);
            const stats = statsResponse.data.data;
            
            document.getElementById('totalTransactions').textContent = stats.totalTransactions;
            document.getElementById('buyCount').textContent = stats.buyCount;
            document.getElementById('sellCount').textContent = stats.sellCount;
            document.getElementById('totalSolAmount').textContent = stats.totalSolAmount.toFixed(4);
        }

        // 加载交易历史
        await loadTransactions(address);
    } catch (error) {
        showError('加载钱包详情失败');
        console.error('加载钱包详情失败:', error);
    }
}

// 加载交易历史
async function loadTransactions(address, page = 1) {
    try {
        // 获取钱包配置信息
        const walletResponse = await axios.get(`${API_BASE_URL}/wallets`);
        const wallets = walletResponse.data.data;
        const walletMap = new Map(wallets.map(w => [w.walletAddress, w]));

        // 根据是否是全部交易来调整API请求
        const response = await axios.get(
            address === 'all' 
                ? `${API_BASE_URL}/wallets/transactions` 
                : `${API_BASE_URL}/wallets/${address}/transactions`, 
            {
                params: {
                    limit: PAGE_SIZE,
                    skip: (page - 1) * PAGE_SIZE
                }
            }
        );

        const { transactions, total } = response.data.data;
        const totalPages = Math.ceil(total / PAGE_SIZE);

        // 更新交易列表
        const transactionList = document.getElementById('transactionList');
        transactionList.innerHTML = '';

        transactions.forEach(tx => {
            const wallet = walletMap.get(tx.walletAddress);
            const walletName = wallet ? wallet.walletName : '未命名钱包';
            
            // 简化地址显示的辅助函数
            const formatAddress = (address) => {
                if (!address) return '';
                if (address.length <= 12) return address;
                return `${address.slice(0, 6)}...${address.slice(-4)}`;
            };
            
            const row = document.createElement('tr');
            row.className = 'transaction-row';
            row.innerHTML = `
                <td>
                    <div class="fw-bold">${walletName}</div>
                </td>
                <td class="transaction-time">${new Date(tx.timestamp).toLocaleString()}</td>
                <td>
                    <div class="fw-bold">${tx.tokenSymbol}</div>
                    <div class="text-muted small">${formatAddress(tx.tokenAddress)}</div>
                </td>
                <td>
                    <span class="badge bg-${tx.direction === '买入' ? 'success' : 'danger'}">
                        ${tx.direction}
                    </span>
                </td>
                <td>${tx.amount.toFixed(4)}</td>
                <td>${Math.abs(tx.solAmount).toFixed(4)}</td>
                <td>
                    <span class="badge bg-${tx.status === '成功' ? 'success' : 'danger'}">
                        ${tx.status}
                    </span>
                </td>
            `;

            // 添加点击事件显示交易详情（在详情中仍然显示完整地址）
            row.onclick = () => {
                showTransactionDetails(tx, walletName);
            };

            transactionList.appendChild(row);
        });

        // 更新分页
        updatePagination(page, totalPages, address);
    } catch (error) {
        showError('加载交易历史失败');
        console.error('加载交易历史失败:', error);
    }
}

// 显示交易详情
function showTransactionDetails(tx, walletName) {
    const details = `
交易详情：
钱包名称：${walletName}
钱包地址：${tx.walletAddress}
时间���${new Date(tx.timestamp).toLocaleString()}
代币符号：${tx.tokenSymbol}
代币名称：${tx.tokenName}
代币地址：${tx.tokenAddress}
交易方向：${tx.direction}
交易数量：${tx.amount.toFixed(4)}
SOL数量：${Math.abs(tx.solAmount).toFixed(4)} SOL
交易状态：${tx.status}
交易签名：${tx.signature}
    `;
    alert(details); // 这里可以改用更好的UI组件显示
}

// 更新分页
function updatePagination(currentPage, totalPages, address) {
    const pagination = document.getElementById('transactionPagination');
    pagination.innerHTML = '';

    // 显示的页码数量（当前页左右各显示2页）
    const delta = 2;

    // 生成页码数组
    let pages = [];
    
    // 总是显示一页
    pages.push(1);
    
    // 计算显示范围
    let leftBound = Math.max(2, currentPage - delta);
    let rightBound = Math.min(totalPages - 1, currentPage + delta);

    // 添加省略号和左侧页码
    if (leftBound > 2) {
        pages.push('...');
    } else {
        leftBound = 2;
    }

    // 添加中间的页码
    for (let i = leftBound; i <= rightBound; i++) {
        pages.push(i);
    }

    // 添加省略号和右侧页码
    if (rightBound < totalPages - 1) {
        pages.push('...');
    }

    // 总是显示最后一页（如果总页数大于1）
    if (totalPages > 1) {
        pages.push(totalPages);
    }

    // 上一页按钮
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `
        <a class="page-link" href="#" onclick="event.preventDefault(); ${currentPage > 1 ? `loadTransactions('${address}', ${currentPage - 1})` : ''}">
            上一页
        </a>
    `;
    pagination.appendChild(prevLi);

    // 页码按钮
    pages.forEach(page => {
        const li = document.createElement('li');
        if (page === '...') {
            // 省略号
            li.className = 'page-item disabled';
            li.innerHTML = '<span class="page-link">...</span>';
        } else {
            // 数字页码
            li.className = `page-item ${page === currentPage ? 'active' : ''}`;
            li.innerHTML = `
                <a class="page-link" href="#" onclick="event.preventDefault(); loadTransactions('${address}', ${page})">
                    ${page}
                </a>
            `;
        }
        pagination.appendChild(li);
    });

    // 下一页按钮
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `
        <a class="page-link" href="#" onclick="event.preventDefault(); ${currentPage < totalPages ? `loadTransactions('${address}', ${currentPage + 1})` : ''}">
            下一页
        </a>
    `;
    pagination.appendChild(nextLi);
}

// 添加钱包
async function addWallet() {
    try {
        const walletAddress = document.getElementById('walletAddress').value;
        const walletName = document.getElementById('walletName').value;
        const monitorBuy = document.getElementById('monitorBuy').checked;
        const monitorSell = document.getElementById('monitorSell').checked;

        const response = await axios.post(`${API_BASE_URL}/wallets`, {
            walletAddress,
            walletName,
            monitorBuy,
            monitorSell
        });

        addWalletModal.hide();
        await loadWallets();
        showSuccess('添加钱包成功');
    } catch (error) {
        showError(error.response?.data?.error || '添加钱包失败');
        console.error('添加钱包失败:', error);
    }
}

// 更新钱包
async function updateWallet() {
    try {
        const walletAddress = document.getElementById('editWalletAddress').value;
        const walletName = document.getElementById('editWalletName').value;
        const monitorBuy = document.getElementById('editMonitorBuy').checked;
        const monitorSell = document.getElementById('editMonitorSell').checked;

        const response = await axios.put(`${API_BASE_URL}/wallets/${walletAddress}`, {
            walletName,
            monitorBuy,
            monitorSell
        });

        editWalletModal.hide();
        await loadWallets();
        showSuccess('更新钱包成功');
    } catch (error) {
        showError(error.response?.data?.error || '更新钱包失败');
        console.error('更新钱包失败:', error);
    }
}

// 删除钱包
async function deleteWallet(address) {
    if (!confirm('确定要删除这个钱包吗？')) {
        return;
    }

    try {
        await axios.delete(`${API_BASE_URL}/wallets/${address}`);
        
        if (currentWalletAddress === address) {
            currentWalletAddress = null;
            document.getElementById('walletDetails').style.display = 'none';
        }

        await loadWallets();
        showSuccess('删除钱包成功');
    } catch (error) {
        showError(error.response?.data?.error || '删除钱包失败');
        console.error('删除钱包失败:', error);
    }
}

// 显示成功提示
function showSuccess(message) {
    // 这里可以使用你喜欢提示框组件
    alert(message);
}

// 显示错误提示
function showError(message) {
    // 这里可以使用你喜欢的提示框组件
    alert(message);
} 