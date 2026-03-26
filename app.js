// Python yfinance Backend Integration

// 部署提示：把后台部署到 Render 后，请把这里的地址替换为您获得的那个 https://... 的地址
const API_BASE_URL = 'http://localhost:5000'; 

let defaultTickers = ['AAPL', 'NVDA', '600519.SS', '000001.SZ', 'TSLA'];
let activeWatchlist = [];
let chart;
let lineSeries;
let currentStockTicker = defaultTickers[0];
let updateInterval;

const NEWS = [
    { tag: '市场', title: '美联储维持利率不变，暗示年内仍有三次降息计划', time: '2小时前' },
    { tag: '科技', title: 'AI 产业再掀狂潮，产业链公司财报超预期', time: '4小时前' },
    { tag: '国内', title: '央行进一步释放流动性，利好大盘蓝筹', time: '6小时前' }
];

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    renderNews();
    setupEventListeners();
    
    // Initial fetch
    fetchStockData(defaultTickers, (data) => {
        activeWatchlist = data;
        renderWatchlist();
        selectStock(currentStockTicker);
    });

    // Start auto-refresh heartbeat (every 10 seconds to respect yfinance limits slightly more)
    updateInterval = setInterval(() => {
        const allTickersToFetch = [...new Set([currentStockTicker, ...defaultTickers])];
        fetchStockData(allTickersToFetch, (data) => {
            // Update chart for current stock
            const currentData = data.find(d => d.ticker === currentStockTicker);
            if (currentData) {
                updateChartWithNewPrice(currentData.price, currentData.change);
            }
            updatePnL();

            // Only redraw watchlist if the user is not actively searching
            const searchInput = document.getElementById('stock-search');
            if (searchInput && searchInput.value.trim() === '') {
                // Update active watchlist subset
                activeWatchlist = data.filter(d => defaultTickers.includes(d.ticker));
                renderWatchlist();
            }
        });
    }, 10000);
});

async function fetchStockData(tickerList, callback) {
    if(!tickerList || tickerList.length === 0) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/quote?tickers=${tickerList.join(',')}`);
        const data = await res.json();
        if (data) {
            callback(data);
        }
    } catch(err) {
        console.error("Failed to fetch from python backend:", err);
        alert(`无法连接到数据服务器 (${API_BASE_URL})！请检查后端是否在运行，或控制台报错: ` + err.message);
    }
}

function initChart() {
    const chartContainer = document.getElementById('chart-container');
    chart = LightweightCharts.createChart(chartContainer, {
        layout: {
            background: { color: 'transparent' },
            textColor: '#94a3b8',
        },
        grid: {
            vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
    });

    lineSeries = chart.addLineSeries({
        color: '#6366f1',
        lineWidth: 3,
        areaTopColor: 'rgba(99, 102, 241, 0.4)',
        areaBottomColor: 'rgba(99, 102, 241, 0)',
    });
    
    window.addEventListener('resize', () => {
        chart.applyOptions({ width: chartContainer.clientWidth });
    });
}

function updateChartWithNewPrice(price, change) {
    const time = Math.floor(Date.now() / 1000);
    const dataList = lineSeries.data();
    if(dataList && dataList.length > 0) {
        let last = dataList[dataList.length - 1];
        if (last.time === time) return;
    }
    lineSeries.update({ time: time, value: price });
    
    const color = change >= 0 ? '#10b981' : '#ef4444';
    lineSeries.applyOptions({ color: color });
}

function selectStock(ticker) {
    currentStockTicker = ticker;
    
    if (!defaultTickers.includes(ticker)) {
        defaultTickers.push(ticker);
    }

    const searchInput = document.getElementById('stock-search');
    if (searchInput) searchInput.value = '';

    fetchStockData([ticker], async (data) => {
        if(data && data.length > 0) {
            const stock = data[0];
            document.getElementById('current-stock-name').textContent = stock.name;
            document.getElementById('current-stock-ticker').textContent = stock.ticker;
            
            // Generate real history chart using backend
            fetch(`${API_BASE_URL}/api/history?ticker=${ticker}`)
                .then(res => res.json())
                .then(histData => {
                    if(histData && histData.length > 0) {
                        lineSeries.setData(histData);
                    } else {
                        // Fallback to empty if history fails but quote works
                        lineSeries.setData([{time: Math.floor(Date.now()/1000), value: stock.price}]);
                    }
                }).catch(e => console.error("Historical data error", e));

            // Fetch live news for the selected stock
            fetch(`${API_BASE_URL}/api/news?ticker=${ticker}`)
                .then(res => res.json())
                .then(newsData => {
                    if (newsData && newsData.length > 0) {
                        renderNews(newsData);
                    } else {
                        renderNews(NEWS); // Fallback to static dummy news
                    }
                }).catch(e => console.error("News data error", e));
            
            const color = stock.change >= 0 ? '#10b981' : '#ef4444';
            lineSeries.applyOptions({ color: color });
            
            fetchStockData(defaultTickers, (listData) => {
                activeWatchlist = listData;
                renderWatchlist();
            });
        }
    });
}

function renderWatchlist() {
    const container = document.getElementById('watchlist-container');
    container.innerHTML = activeWatchlist.map(stock => {
        return `
            <div class="watchlist-item" onclick="selectStock('${stock.ticker}')">
                <div class="wi-info">
                    <h4>${stock.ticker}</h4>
                    <p style="text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 80px;">${stock.name}</p>
                </div>
                <div class="wi-stats">
                    <div class="wi-price">${stock.price.toFixed(2)}</div>
                    <div class="wi-change ${stock.change >= 0 ? 'positive' : 'negative'}">
                        ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderNews(newsData = NEWS) {
    const container = document.getElementById('news-container');
    container.innerHTML = newsData.map(item => `
        <a href="${item.link || '#'}" target="_blank" class="news-item" style="text-decoration: none; color: inherit;">
            <span class="tag">${item.tag}</span>
            <h4>${item.title}</h4>
            <span class="time">${item.time}</span>
        </a>
    `).join('');
}

function setupEventListeners() {
    const searchInput = document.getElementById('stock-search');
    let debounceTimer;

    const performSearch = (query, autoSelect = false) => {
        if (!query) {
            renderWatchlist();
            return;
        }

        let testTicker = query.toUpperCase();
        
        // Auto-fix A-share formats if user types 6 digits
        if (/^\d{6}$/.test(testTicker)) {
            testTicker = (testTicker.startsWith('6') ? testTicker + '.SS' : testTicker + '.SZ');
        } 

        fetchStockData([testTicker], (data) => {
            if (data && data.length > 0) {
                const stock = data[0];
                if (autoSelect) {
                    selectStock(stock.ticker);
                } else {
                    const container = document.getElementById('watchlist-container');
                    container.innerHTML = `
                        <div class="watchlist-item" onclick="selectStock('${stock.ticker}')" style="background: rgba(99,102,241,0.2); border: 1px solid #6366f1;">
                            <div class="wi-info">
                                <h4>🔍 ${stock.ticker}</h4>
                                <p>${stock.name}</p>
                            </div>
                            <div class="wi-stats">
                                <div class="wi-price">${stock.price.toFixed(2)}</div>
                                <div class="wi-change ${stock.change >= 0 ? 'positive' : 'negative'}">
                                    ${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%
                                </div>
                            </div>
                        </div>
                    `;
                }
            } else {
                document.getElementById('watchlist-container').innerHTML = `
                    <div style="padding: 1rem; color:#94a3b8; text-align:center; font-size: 0.9rem;">
                        未找到相关股票。<br>重敲回车继续搜索，或检查全球股票代码是否正确(如 0331.KL)。
                    </div>
                `;
            }
        });
    };

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        debounceTimer = setTimeout(() => {
            performSearch(query, false);
        }, 800);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            if (query) {
                performSearch(query, true);
            }
        }
    });

    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim();
            if (query) {
                performSearch(query, true);
            }
        });
    }

    const btns = document.querySelectorAll('.timeframe-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Mock refreshing logic for timeframes since history provides 3mo
            fetchStockData([currentStockTicker], async (data) => {
                if(data.length > 0) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/api/history?ticker=${currentStockTicker}`);
                        const histData = await res.json();
                        if(histData && histData.length > 0) {
                            lineSeries.setData(histData);
                        }
                    } catch(e) {}
                }
            });
        });
    });
}

function updatePnL() {
    const pnl = document.getElementById('daily-pnl');
    const currentPnlText = pnl.textContent.replace('+¥ ', '').replace('-¥ ', '').replace(',', '');
    let currentPnl = parseFloat(currentPnlText);
    const sign = pnl.textContent.includes('-') ? -1 : 1;
    currentPnl *= sign;
    
    const newPnl = currentPnl + (Math.random() - 0.45) * 50; 
    pnl.textContent = `${newPnl >= 0 ? '+¥' : '-¥'} ${Math.abs(newPnl).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
}
