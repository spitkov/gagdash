document.addEventListener('DOMContentLoaded', () => {
    const API_ENDPOINTS = {
        stock: 'https://growagardenapi.vercel.app/api/stock/GetStock',
        weather: 'https://growagardenapi.vercel.app/api/GetWeather',
        itemInfo: 'https://growagardenapi.vercel.app/api/Item-Info',
        restockTime: 'https://growagardenapi.vercel.app/api/stock/Restock-Time'
    };

    const elements = {
        weatherData: document.getElementById('weather-data'),
        stockSummary: document.getElementById('stock-summary'),
        stockCategoriesContainer: document.getElementById('stock-categories'),
        itemSearch: document.getElementById('itemSearch'),
        itemInfoModal: document.getElementById('itemInfoModal'),
        modalTitle: document.getElementById('modalTitle'),
        itemInfoContent: document.getElementById('itemInfoContent'),
        closeModal: document.getElementById('closeModal'),
        enableNotificationsBtn: document.getElementById('enableNotificationsBtn'),
        notifyBtn: document.getElementById('notifyBtn'),
        configBtn: document.getElementById('configBtn'),
        notificationConfigModal: document.getElementById('notificationConfigModal'),
        closeConfigModal: document.getElementById('closeConfigModal'),
        notificationConfigContent: document.getElementById('notificationConfigContent'),
        testNotificationBtn: document.getElementById('testNotificationBtn')
    };

    let stockData = [];
    let previousStockJSON = '';
    let stockPollInterval = null;
    let mainRefreshInterval = null;
    let notificationSubscriptions = new Set(JSON.parse(localStorage.getItem('gardenSubscriptions')) || []);
    let isInitialLoad = true;
    let notificationsEnabled = false;
    let restockTimers = {};
    let restockInterval;
    let allItemsInfo = new Map();
    let weatherTimerInterval = null;

    const CATEGORY_MAP = {
        gearStock: 'Gears & Utilities',
        seedsStock: 'Seeds',
        eggStock: 'Eggs',
        honeyStock: 'Honey & Nectar',
        nightStock: 'Night Garden',
        cosmeticsStock: 'Cosmetics',
        easterStock: 'Easter Items'
    };
    
    initializeApp();

    function initializeApp() {
        setupEventListeners();
        fetchAllData();
        initializeNotificationState();
        startMainRefreshInterval();
    }

    function startMainRefreshInterval() {
        if (mainRefreshInterval) clearInterval(mainRefreshInterval);
        console.log("Starting main 2-minute refresh interval.");
        mainRefreshInterval = setInterval(fetchAllData, 2 * 60 * 1000);
    }

    function stopMainRefreshInterval() {
        if (mainRefreshInterval) {
            console.log("Pausing main 2-minute refresh interval.");
            clearInterval(mainRefreshInterval);
            mainRefreshInterval = null;
        }
    }

    function setupEventListeners() {
        elements.itemSearch.addEventListener('input', filterStockItems);
        elements.closeModal.addEventListener('click', () => elements.itemInfoModal.classList.add('hidden'));
        window.addEventListener('click', (e) => {
            if (e.target === elements.itemInfoModal) {
                elements.itemInfoModal.classList.add('hidden');
            }
        });

        elements.enableNotificationsBtn.addEventListener('click', requestNotificationPermission);

        elements.configBtn.addEventListener('click', openNotificationConfigModal);
        elements.closeConfigModal.addEventListener('click', () => elements.notificationConfigModal.classList.add('hidden'));
        elements.testNotificationBtn.addEventListener('click', () => {
             showNotification({
                name: 'Test Notification',
                image: 'https://cdn-icons-png.flaticon.com/512/7518/7518748.png'
            });
        });
    }

    async function fetchAllData() {
        try {
            await Promise.all([
                fetchWeatherData(),
                fetchStockData(),
                fetchAllItemsInfo()
            ]);
            if (!stockPollInterval) {
                fetchRestockTimes();
            }
        } catch (error) {
            console.error('Error during initial data fetch:', error);
        }
    }

    async function fetchData(endpoint, onError) {
        try {
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error(`Failed to fetch from ${endpoint}`);
            return await response.json();
        } catch (error) {
            console.error(`Fetch error for ${endpoint}:`, error);
            onError(error);
            return null;
        }
    }

    async function fetchWeatherData() {
        const data = await fetchData(API_ENDPOINTS.weather, () => {
            elements.weatherData.innerHTML = `<p class="text-red-400">Error loading weather</p>`;
        });
        if (data && data.success) {
            updateWeatherUI(data.weather);
        }
    }
    
    async function fetchStockData() {
        const rawData = await fetchData(API_ENDPOINTS.stock, () => {
            elements.stockCategoriesContainer.innerHTML = `<p class="text-red-400">Error loading stock</p>`;
        });
        if (rawData) {
            processAndDisplayStock(rawData);
        }
    }

    async function fetchAllItemsInfo() {
        const data = await fetchData(API_ENDPOINTS.itemInfo, () => {
            console.error('Could not load item info data.');
        });
        if (data && Array.isArray(data)) {
            data.forEach(item => allItemsInfo.set(item.name, item));
        }
    }

    async function fetchRestockTimes() {
        const data = await fetchData(API_ENDPOINTS.restockTime, () => {
        });
        if (data) {
            restockTimers = data;
            if (restockInterval) clearInterval(restockInterval);
            updateAllRestockTimers();
            restockInterval = setInterval(updateAllRestockTimers, 1000);
        }
    }
    
    function processAndDisplayStock(rawData) {
        const allItemsMap = new Map();
        for (const key of Object.keys(CATEGORY_MAP)) {
            const categoryName = CATEGORY_MAP[key];
            if (rawData[key] && Array.isArray(rawData[key])) {
                rawData[key].forEach(item => {
                    if (!item.name || typeof item.value === 'undefined') return;
                    const itemName = item.name;
                     if (allItemsMap.has(itemName)) {
                        allItemsMap.get(itemName).quantity += item.value;
                    } else {
                        allItemsMap.set(itemName, {
                            name: itemName,
                            quantity: item.value,
                            image: item.image,
                            emoji: item.emoji,
                            category: categoryName
                        });
                    }
                });
            }
        }

        const sortedEntries = Array.from(allItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const currentStockJSON = JSON.stringify(sortedEntries);

        if (previousStockJSON === currentStockJSON) {
            console.log("Polling: Stock data is unchanged.");
            return;
        }

        console.log("Stock data has changed. Updating UI...");

        if (stockPollInterval) {
            clearInterval(stockPollInterval);
            stockPollInterval = null;
            console.log("Polling stopped due to successful stock update.");
            startMainRefreshInterval();
        }
        
        fetchRestockTimes();

        if (!isInitialLoad) {
            sendNotificationsForSubscribedItems(allItemsMap);
        }
        
        previousStockJSON = currentStockJSON;

        isInitialLoad = false;

        const categorizedStock = {};
        for (const cat of Object.values(CATEGORY_MAP)) {
            categorizedStock[cat] = [];
        }

        for (const item of allItemsMap.values()) {
            if (item.category && categorizedStock[item.category]) {
                categorizedStock[item.category].push(item);
            }
        }
        
        for (const categoryName in categorizedStock) {
            categorizedStock[categoryName].sort((a,b) => a.name.localeCompare(b.name));
        }

        stockData = Array.from(allItemsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        updateStockCategoriesUI(categorizedStock);
        updateStockOverviewUI(stockData);
    }
    
    function updateStockCategoriesUI(categorizedStock) {
        let html = '';
        for (const categoryName in categorizedStock) {
            const items = categorizedStock[categoryName];
            if (items.length === 0) continue;

            const categoryId = categoryName.toLowerCase().replace(/[^a-z0-9]/g, '');
            html += `
                <div class="bg-garden-darker rounded-lg shadow-lg flex flex-col h-full">
                    <div class="p-4 border-b border-slate-700 flex justify-between items-center">
                        <h3 class="text-xl font-bold text-garden-accent">${categoryName}</h3>
                        <div id="restock-${categoryId}" class="text-sm text-slate-400">
                            <span class="font-mono">--:--:--</span>
                        </div>
                    </div>
                    <div class="p-4 flex flex-col gap-2 overflow-y-auto">
                        ${items.map(item => createItemCard(item)).join('')}
                    </div>
                </div>
            `;
        }
        elements.stockCategoriesContainer.innerHTML = html || '<p>No stock data to display.</p>';
    }
    
    function createItemCard(item) {
        const imageHtml = item.image 
            ? `<img src="${item.image}" alt="${item.name}" class="w-10 h-10 rounded-md object-cover mr-3 flex-shrink-0">`
            : (item.emoji 
                ? `<div class="text-3xl mr-3 flex-shrink-0 text-center w-10">${item.emoji}</div>` 
                : `<div class="w-10 h-10 rounded-md bg-garden-dark flex items-center justify-center text-slate-500 mr-3 flex-shrink-0">?</div>`);

        return `
            <div class="item-card bg-garden-dark rounded-lg p-2 flex items-center" data-name="${item.name.toLowerCase()}" data-category="${item.category.toLowerCase()}">
                ${imageHtml}
                <div class="flex-grow min-w-0">
                    <p class="font-semibold text-slate-200 truncate">${item.name}</p>
                    <p class="text-sm text-slate-400">x ${item.quantity}</p>
                </div>
                <button class="view-info-btn ml-2 bg-garden-secondary hover:bg-garden-primary text-white px-2 py-1 rounded-md text-sm flex-shrink-0 transition-colors" 
                        onclick="showItemInfo('${item.name}', '${item.image || ''}')">
                    Info
                </button>
            </div>
        `;
    }

    function updateStockOverviewUI(data) {
        if (!data || data.length === 0) {
            elements.stockSummary.innerHTML = '<p>No stock data available</p>';
            return;
        }

        const totalItems = data.length;
        const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
        const categories = Object.keys(CATEGORY_MAP).length;
        
        const stockHtml = `
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                <div>
                    <p class="text-slate-400">Total Unique Items</p>
                    <p class="text-3xl font-bold">${totalItems}</p>
                </div>
                <div>
                    <p class="text-slate-400">Total Quantity</p>
                    <p class="text-3xl font-bold">${totalQuantity}</p>
                </div>
                <div>
                    <p class="text-slate-400">Categories</p>
                    <p class="text-3xl font-bold">${categories}</p>
                </div>
            </div>
        `;
        elements.stockSummary.innerHTML = stockHtml;
    }

    function updateAllRestockTimers() {
        const apiToDisplayMap = {
            gear: 'Gears & Utilities',
            seeds: 'Seeds',
            egg: 'Eggs',
            cosmetic: 'Cosmetics',
            Event: 'Easter Items',
            honey: 'Honey & Nectar',
            night: 'Night Garden'
        };

        if (!restockTimers || Object.keys(restockTimers).length === 0) return;

        for (const apiKey of Object.keys(apiToDisplayMap)) {
            const mappedName = apiToDisplayMap[apiKey];
            if (!mappedName) continue;

            const timerData = restockTimers[apiKey];
            const categoryId = mappedName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const timerEl = document.getElementById(`restock-${categoryId}`);

            if (timerEl) {
                if (timerData && timerData.timestamp) {
                    const now = Date.now();
                    const diff = timerData.timestamp - now;
                    if (diff > 0) {
                        const h = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, '0');
                        const m = Math.floor((diff / (1000 * 60)) % 60).toString().padStart(2, '0');
                        const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
                        timerEl.innerHTML = `<span class="font-mono">${h}:${m}:${s}</span>`;
                    } else {
                        timerEl.innerHTML = `<span class="text-garden-accent animate-pulse">Checking...</span>`;
                        activateStockPoller();
                    }
                } else {
                    timerEl.innerHTML = `<span class="font-mono">--:--:--</span>`;
                }
            }
        }
    }

    function updateWeatherUI(weatherEvents) {
        if (weatherTimerInterval) clearInterval(weatherTimerInterval);

        if (!weatherEvents || weatherEvents.length === 0) {
            elements.weatherData.innerHTML = '<p>No weather data available</p>';
            return;
        }
        const activeEvent = weatherEvents.find(event => event.active);
        
        if (activeEvent) {
            const weatherHtml = `
                <div class="text-center p-4 bg-garden-dark rounded-lg">
                    <p class="text-2xl font-bold text-yellow-400">${activeEvent.weather_name}</p>
                    <p class="text-slate-400">is currently active!</p>
                    <p class="text-lg mt-2">Ends in: <span id="weather-countdown">${formatTimeLeft(activeEvent.end_duration_unix)}</span></p>
                </div>
            `;
            elements.weatherData.innerHTML = weatherHtml;
            
            const countdownEl = document.getElementById('weather-countdown');
            weatherTimerInterval = setInterval(() => {
                if (countdownEl) {
                    const timeLeft = formatTimeLeft(activeEvent.end_duration_unix);
                    countdownEl.textContent = timeLeft;
                    if (timeLeft === '00:00:00') {
                        countdownEl.textContent = 'Ended';
                        clearInterval(weatherTimerInterval);
                    }
                } else {
                     clearInterval(weatherTimerInterval);
                }
            }, 1000);
        } else {
            elements.weatherData.innerHTML = `
                <div class="text-center p-4">
                    <p class="text-2xl font-medium text-slate-300">Weather is Clear</p>
                    <p class="text-slate-400">No active events.</p>
                </div>
            `;
        }
    }

    function formatTimeLeft(unixTimestamp) {
        const now = Math.floor(Date.now() / 1000);
        let secondsLeft = unixTimestamp - now;
        if (secondsLeft < 0) secondsLeft = 0;
        const h = Math.floor(secondsLeft / 3600).toString().padStart(2, '0');
        const m = Math.floor((secondsLeft % 3600) / 60).toString().padStart(2, '0');
        const s = Math.floor(secondsLeft % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    window.showItemInfo = (itemName, itemImage) => {
        elements.modalTitle.textContent = itemName;
        elements.itemInfoModal.classList.remove('hidden');

        const itemDetails = allItemsInfo.get(itemName);
        updateNotifyButtonUI(itemName);

        if (itemDetails) {
            const displayData = { ...itemDetails };
            if (!displayData.image && itemImage) {
                displayData.image = itemImage;
            }
            displayItemInfo(displayData);
        } else {
            elements.itemInfoContent.innerHTML = `<p class="text-red-400">Details for ${itemName} not found. The data might still be loading.</p>`;
        }
    };

    function displayItemInfo(item) {
        if (!item) {
            elements.itemInfoContent.innerHTML = '<p>No information available for this item.</p>';
            return;
        }

        const { name, image, rarity, category, metadata } = item;
        const meta = metadata || {};

        const infoHtml = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-1 text-center">
                    <img src="${image}" alt="${name}" class="w-48 h-48 rounded-lg object-cover mx-auto mb-4 shadow-lg border-4 border-slate-700">
                    <h4 class="text-2xl font-bold text-slate-100">${name}</h4>
                    <p class="text-slate-400">${category || 'N/A'}</p>
                    <div class="mt-2 inline-block px-3 py-1 rounded-full text-sm font-semibold" style="${getRarityStyle(rarity)}">
                        ${rarity || 'N/A'}
                    </div>
                </div>
                <div class="md:col-span-2 space-y-4">
                    ${createMetadataSection('Market Info', {
                        'Buy Price': meta.buyPrice,
                        'Sell Value': meta.sellValue,
                        'Amount in Shop': meta.amountInShop,
                        'Tradeable': meta.tradeable ? 'Yes' : 'No'
                    })}
                    ${createMetadataSection('Details', {
                        'Tier': meta.tier,
                        'Type': meta.type,
                        'Multi-Harvest': meta.multiHarvest ? 'Yes' : 'No',
                        'Egg Source': meta.eggs,
                        'Egg Hatch Chance': meta.eggs_hatch_chance,
                    })}
                </div>
            </div>
        `;
        elements.itemInfoContent.innerHTML = infoHtml;
    }

    function createMetadataSection(title, data) {
        let content = '';
        for (const key in data) {
            const value = data[key];
            if (value && value !== 'N/A' && value !== '0') {
                content += `
                    <div class="flex justify-between">
                        <span class="text-slate-400">${key}:</span>
                        <span class="text-slate-200 font-medium">${value}</span>
                    </div>`;
            }
        }
        if (!content) return '';
        return `
            <div>
                <h5 class="text-lg font-semibold text-garden-accent mb-2 pb-1 border-b border-slate-700">${title}</h5>
                <div class="space-y-1 text-sm">${content}</div>
            </div>`;
    }
    
    function getRarityStyle(rarity) {
        const colors = {
            'Common': '#9ca3af', 'Uncommon': '#22c55e', 'Rare': '#3b82f6', 
            'Legendary': '#a855f7', 'Mythical': '#f59e0b', 'Divine': '#ef4444',
            'Prismatic': 'linear-gradient(90deg, #ef4444, #f59e0b, #eab308, #22c55e, #3b82f6, #a855f7)',
        };
        const color = colors[rarity] || '#6b7280';
        if (rarity === 'Prismatic') {
            return `background: ${color}; color: white;`;
        }
        return `background-color: ${color}20; color: ${color}; border: 1px solid ${color}80;`;
    }

    function filterStockItems() {
        const searchTerm = elements.itemSearch.value.toLowerCase().trim();
        const cards = document.querySelectorAll('.item-card');

        cards.forEach(card => {
            const name = card.dataset.name;
            const category = card.dataset.category;
            const isVisible = name.includes(searchTerm) || category.includes(searchTerm);
            card.style.display = isVisible ? 'flex' : 'none';
        });
    }
    
    function initializeNotificationState() {
        if (!("Notification" in window)) {
            elements.enableNotificationsBtn.textContent = "Not Supported";
            elements.enableNotificationsBtn.disabled = true;
            return;
        }

        if (Notification.permission === "granted") {
            notificationsEnabled = true;
            elements.enableNotificationsBtn.textContent = "Notifications Enabled";
            elements.enableNotificationsBtn.disabled = true;
        } else if (Notification.permission === "denied") {
            notificationsEnabled = false;
            elements.enableNotificationsBtn.textContent = "Notifications Denied";
            elements.enableNotificationsBtn.disabled = true;
        }
    }

    function requestNotificationPermission() {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notification");
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification("Garden Dashboard", { body: "Notifications have been enabled!" });
            }
            initializeNotificationState();
        });
    }

    function showNotification(item) {
        if (!notificationsEnabled) {
            alert("Please enable notifications first.");
            return;
        }

        const notification = new Notification("Item in Stock!", {
            body: `${item.name} is now available in the shop.`,
            icon: item.image || './default-icon.png'
        });
    }

    function updateNotifyButtonUI(itemName) {
        if (notificationSubscriptions.has(itemName)) {
            elements.notifyBtn.textContent = 'Unsubscribe from Notifications';
            elements.notifyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            elements.notifyBtn.classList.add('bg-red-600', 'hover:bg-red-700');
        } else {
            elements.notifyBtn.textContent = 'Subscribe to Notifications';
            elements.notifyBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
            elements.notifyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        }
        elements.notifyBtn.onclick = () => toggleSubscription(itemName);
    }

    function checkForNewItems(currentItemNames, allItemsMap) {
        if (previousStockItemNames.size === 0) return;
        
        const newItems = new Set([...currentItemNames].filter(x => !previousStockItemNames.has(x)));
        
        newItems.forEach(itemName => {
            if (notificationSubscriptions.has(itemName)) {
                showNotification(allItemsMap.get(itemName));
            }
        });
    }

    function toggleSubscription(itemName) {
        if (notificationSubscriptions.has(itemName)) {
            notificationSubscriptions.delete(itemName);
        } else {
            notificationSubscriptions.add(itemName);
        }
        localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
        updateNotifyButtonUI(itemName);
    }

    function openNotificationConfigModal() {
        renderNotificationConfig();
        elements.notificationConfigModal.classList.remove('hidden');
    }

    function renderNotificationConfig() {
        let html = '';
        const itemsByCategory = {};
        for (const item of allItemsInfo.values()) {
            if (!item.category || item.category === 'N/A') continue;
            if (!itemsByCategory[item.category]) {
                itemsByCategory[item.category] = [];
            }
            itemsByCategory[item.category].push(item);
        }

        const sortedCategories = Object.keys(itemsByCategory).sort();

        for (const categoryName of sortedCategories) {
            const items = itemsByCategory[categoryName].sort((a, b) => a.name.localeCompare(b.name));
            const subscribedCount = items.filter(item => notificationSubscriptions.has(item.name)).length;
            
            let toggleClass = 'bg-slate-700';
            let toggleTransform = 'translateX(0)';

            if (subscribedCount > 0 && subscribedCount < items.length) {
                toggleClass = 'bg-orange-500';
                toggleTransform = 'translateX(12px)';
            } else if (items.length > 0 && subscribedCount === items.length) {
                toggleClass = 'bg-garden-primary';
                toggleTransform = 'translateX(24px)';
            }

            html += `
                <details class="bg-garden-dark rounded-lg overflow-hidden group" data-category-name="${categoryName}">
                    <summary class="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800 transition-colors">
                        <div class="flex-grow">
                            <p class="font-bold text-slate-200">${categoryName}</p>
                            <p class="text-xs text-slate-400">${subscribedCount} / ${items.length} items subscribed</p>
                        </div>
                        <div class="flex items-center">
                             <button 
                                class="category-toggle w-12 h-6 rounded-full relative transition-colors mr-4 ${toggleClass}"
                            >
                                <span class="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform" style="transform: ${toggleTransform};"></span>
                            </button>
                            <div class="group-open:rotate-90 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                            </div>
                        </div>
                    </summary>
                    <div class="p-4 border-t border-slate-700 max-h-60 overflow-y-auto custom-scrollbar">
                        ${items.map(item => `
                            <label for="sub-${item.name.replace(/[\s\W]/g, '_')}" class="flex items-center p-2 rounded-md hover:bg-slate-800 cursor-pointer">
                                <input type="checkbox" id="sub-${item.name.replace(/[\s\W]/g, '_')}" data-item-name="${item.name}" class="item-subscription-toggle form-checkbox h-4 w-4 bg-slate-700 border-slate-600 rounded text-garden-primary focus:ring-garden-primary" ${notificationSubscriptions.has(item.name) ? 'checked' : ''}>
                                <span class="ml-3 text-sm text-slate-300">${item.name}</span>
                            </label>
                        `).join('')}
                    </div>
                </details>
            `;
        }
        elements.notificationConfigContent.innerHTML = html;

        document.querySelectorAll('.category-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const categoryName = e.currentTarget.closest('details').dataset.categoryName;
                toggleCategorySubscription(categoryName);
            });
        });

         document.querySelectorAll('.item-subscription-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const itemName = e.currentTarget.dataset.itemName;
                if (e.currentTarget.checked) {
                    notificationSubscriptions.add(itemName);
                } else {
                    notificationSubscriptions.delete(itemName);
                }
                localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
                
                updateCategorySubscriptionUI(e.currentTarget.closest('details'));
            });
        });
    }

    function updateCategorySubscriptionUI(detailsElement) {
        const categoryName = detailsElement.dataset.categoryName;
        const itemsInCategory = Array.from(allItemsInfo.values()).filter(item => item.category === categoryName);
        const subscribedCount = itemsInCategory.filter(item => notificationSubscriptions.has(item.name)).length;

        const countElement = detailsElement.querySelector('.text-xs');
        if (countElement) {
            countElement.textContent = `${subscribedCount} / ${itemsInCategory.length} items subscribed`;
        }

        const toggleButton = detailsElement.querySelector('.category-toggle');
        const toggleDot = toggleButton.querySelector('span');

        toggleButton.classList.remove('bg-garden-primary', 'bg-slate-700', 'bg-orange-500');

        if (subscribedCount > 0 && subscribedCount < itemsInCategory.length) {
            toggleButton.classList.add('bg-orange-500');
            toggleDot.style.transform = 'translateX(12px)';
        } else if (itemsInCategory.length > 0 && subscribedCount === itemsInCategory.length) {
            toggleButton.classList.add('bg-garden-primary');
            toggleDot.style.transform = 'translateX(24px)';
        } else {
            toggleButton.classList.add('bg-slate-700');
            toggleDot.style.transform = 'translateX(0)';
        }
    }

    function toggleCategorySubscription(categoryName) {
        const itemsInCategory = Array.from(allItemsInfo.values()).filter(item => item.category === categoryName);
        if (itemsInCategory.length === 0) return;

        const areAllSubscribed = itemsInCategory.every(item => notificationSubscriptions.has(item.name));

        if (areAllSubscribed) {
            itemsInCategory.forEach(item => notificationSubscriptions.delete(item.name));
        } else {
            itemsInCategory.forEach(item => notificationSubscriptions.add(item.name));
        }
        localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
        
        const detailsElement = document.querySelector(`details[data-category-name="${categoryName}"]`);
        if(detailsElement) {
            detailsElement.querySelectorAll('.item-subscription-toggle').forEach(checkbox => {
                checkbox.checked = !areAllSubscribed;
            });
            updateCategorySubscriptionUI(detailsElement);
        }
    }

    function activateStockPoller() {
        if (stockPollInterval) return;
        stopMainRefreshInterval();
        console.log("A restock timer expired. Activating 5-second stock poller.");
        stockPollInterval = setInterval(fetchStockData, 5000);
    }

    function sendNotificationsForSubscribedItems(allItemsMap) {
        allItemsMap.forEach((item, itemName) => {
            if (notificationSubscriptions.has(itemName)) {
                showNotification(item);
            }
        });
    }
});