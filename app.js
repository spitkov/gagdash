document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const CACHE_KEY_ALL_ITEMS = 'gagDashAllItems';
    const VAPID_PUBLIC_KEY = 'REPLACE_WITH_YOUR_PUBLIC_KEY';
    const PUSH_SERVER_URL = 'http://localhost:3000'; // URL of your push server
    const API_BASE_URLS = [
        'https://growagardenapi.vercel.app/api',
        'http://localhost:1000/api'
    ];
    const API_PATHS = {
        stock: '/stock/GetStock',
        weather: '/GetWeather',
        itemInfo: '/Item-Info',
        restockTime: '/stock/Restock-Time'
    };
    const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
    const FAST_POLL_INTERVAL = 5 * 1000; // 5 seconds
    const CATEGORY_MAP = {
        gearStock: 'Gears & Utilities',
        seedsStock: 'Seeds',
        eggStock: 'Eggs',
        honeyStock: 'Honey & Nectar',
        nightStock: 'Night Garden',
        cosmeticsStock: 'Cosmetics',
        easterStock: 'Easter Items'
    };

    // --- DOM Elements ---
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

    // --- State Variables ---
    let allItemsInfo = new Map();
    let stockData = [];
    let lastStockDataJSON = '';
    let isFastPolling = false;
    let mainRefreshTimeout;
    let fastPollTimeout;
    let notificationSubscriptions = new Set(JSON.parse(localStorage.getItem('gardenSubscriptions')) || []);
    let initialLoadComplete = false;
    let restockInterval;
    let pushSubscription = null;

    // --- Calculator State & Constants ---
    let selectedPlant = null;
    let showPriceRange = false;
    let debouncedCalculateValue;
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    };

    const PLANT_DATA = {
        easteregg: 2.85, moonflower: 1.9, starfruit: 2.85, pepper: 4.75, grape: 2.85,
        nightshade: 0.48, mint: 0.95, glowshroom: 0.7, bloodbanana: 1.42, beanstalk: 9.5,
        coconut: 13.31, candyblossom: 2.85, carrot: 0.24, strawberry: 0.29, blueberry: 0.17,
        orangetulip: 0.0499, tomato: 0.44, daffodil: 0.16, watermelon: 7.3, pumpkin: 6.9,
        mushroom: 25.9, bamboo: 3.8, apple: 2.85, corn: 1.9, cactus: 6.65,
        cranberry: 0.95, moonmelon: 7.6, pear: 2.85, durian: 7.6, peach: 1.9,
        cacao: 7.6, moonglow: 6.65, dragonfruit: 11.38, mango: 14.28, moonblossom: 2.85,
        raspberry: 0.71, eggplant: 4.75, papaya: 2.86, celestiberry: 1.9, moonmango: 14.25,
        banana: 1.425, passionfruit: 2.867, soulfruit: 23.75, chocolatecarrot: 0.2616,
        redlolipop: 3.7988, candysunflower: 1.428, lotus: 18.99, pineapple: 2.85,
        hive: 7.6, lilac: 2.846, rose: 0.95, foxglove: 1.9, purpledahlia: 11.4,
        sunflower: 15.66, pinklily: 5.699, nectarine: 2.807, honeysuckle: 14.25,
        lavender: 0.25, venusflytrap: 9.5, nectarshade: 0.75, manuka: 0.289,
        emberlily: 11.4, dandelion: 3.79, lumira: 5.69
    };

    const CALCULATOR_CONSTANTS = {
        modifierDescriptions: {
          rainbow: "50x", gold: "20x", shocked: "+99x", frozen: "+9x", wet: "+1x",
          chilled: "+1x", choc: "+1x", moonlit: "+1x", bloodlit: "+3x", celestial: "+119x",
          disco: "+124x", zomb: "+24x", plasma: "+4x", voidtouched: "+134x",
          pollinated: "+2x", honeyglazed: "+4x", dawnbound: "+149x", heavenly: "+4x"
        },
        modifiers: [
          'rainbow', 'gold', 'shocked', 'frozen', 'wet', 'chilled', 'choc', 'moonlit', 'bloodlit',
          'celestial', 'disco', 'zomb', 'plasma', 'voidtouched', 'pollinated', 'honeyglazed', 'dawnbound', 'heavenly'
        ],
        categories: {
          "All": [], // Will be populated dynamically from API
          "Popular": ['candyblossom','moonblossom','sunflower','moonmango','moonmelon','lavender','nectarshade','manuka','dandelion','lumira','honeysuckle','emberlily'],
          "Seed Shop": ['carrot','strawberry','blueberry','orangetulip','tomato','corn','daffodil','watermelon','pumpkin','apple','bamboo','coconut','cactus','dragonfruit','mango','grape','mushroom','pepper','cacao','beanstalk','emberlily'],
          "Exotic Seed Pack": ['papaya','banana','passionfruit','soulfruit'], 
          "Normal Seed Pack": ['raspberry','pear','peach','pineapple'],
          "Easter Event": ['chocolatecarrot','redlolipop','candysunflower','candyblossom','easteregg'],
          "Event Seed Pack": ['cranberry','durian','eggplant','lotus','venusflytrap'],
          "Night Event": ['nightshade','mint','glowshroom','moonmelon','starfruit','moonflower','bloodbanana','moonglow','moonblossom','celestiberry','moonmango'],
          "Bee Event" : ['hive','nectarine','rose','foxglove','purpledahlia','pinklily','lilac','sunflower','lavender','nectarshade','manuka','dandelion','lumira','honeysuckle']
        }
    };

    // --- App Initialization ---
    initializeApp();

    async function initializeApp() {
        loadItemsFromCache();
        setupEventListeners();
        await setupPushNotifications();
        fetchAllData();
        initializeNotificationState();
        mainRefreshTimeout = setTimeout(fetchAllData, REFRESH_INTERVAL);
        initializeCalculator();
    }

    function setupEventListeners() {
        // Dashboard listeners
        elements.itemSearch.addEventListener('input', filterStockItems);
        elements.closeModal.addEventListener('click', () => elements.itemInfoModal.classList.add('hidden'));
        elements.itemInfoModal.addEventListener('click', (e) => {
            if (e.target === elements.itemInfoModal) {
                elements.itemInfoModal.classList.add('hidden');
            }
        });
        elements.notifyBtn.addEventListener('click', () => {
            const itemName = elements.modalTitle.textContent;
            if (itemName) {
                toggleSubscription(itemName, true);
                elements.itemInfoModal.classList.add('hidden');
            }
        });

        // Notification listeners
        elements.enableNotificationsBtn.addEventListener('click', setupPushNotifications);
        elements.configBtn.addEventListener('click', openNotificationConfigModal);
        elements.closeConfigModal.addEventListener('click', () => elements.notificationConfigModal.classList.add('hidden'));
        elements.notificationConfigModal.addEventListener('click', (e) => {
             if (e.target.id === 'notificationConfigModal') {
                elements.notificationConfigModal.classList.add('hidden');
             }
        });
        elements.testNotificationBtn.addEventListener('click', sendTestNotification);

        // Tab switching
        document.getElementById('tab-status').addEventListener('click', () => switchTab('status'));
        document.getElementById('tab-calculator').addEventListener('click', () => switchTab('calculator'));
    }

    function loadItemsFromCache() {
        const cachedData = localStorage.getItem(CACHE_KEY_ALL_ITEMS);
        if (cachedData) {
            try {
                console.log("Loading all item info from cache.");
                const items = JSON.parse(cachedData);
                if (items && items.length > 0) {
                    processAndDisplayItemData(items);
                }
            } catch (e) {
                console.error("Failed to parse cached item data:", e);
                localStorage.removeItem(CACHE_KEY_ALL_ITEMS);
            }
        }
    }

    function saveItemsToCache(items) {
        try {
            console.log("Saving all item info to cache.");
            localStorage.setItem(CACHE_KEY_ALL_ITEMS, JSON.stringify(items));
        } catch (e) {
            console.error("Failed to save item data to cache:", e);
        }
    }

    // --- Data Fetching ---
    async function fetchAllData() {
        console.log("Fetching all data...");
        // If the fast poller is running, don't execute the main refresh
        if (isFastPolling) {
            console.log("Main refresh skipped because fast poller is active.");
            return;
        }

        try {
            if (allItemsInfo.size === 0) {
                 await fetchAllItemsInfo(); // Fetch only if not already populated
            }
            const [weather, stock, restockTimes] = await Promise.all([
                fetchData(API_PATHS.weather),
                fetchData(API_PATHS.stock),
                fetchData(API_PATHS.restockTime)
            ]);

            if (weather && weather.success) updateWeatherUI(weather.weather);
            if (stock) processAndDisplayStock(stock, false);
            if (restockTimes) {
                if (restockInterval) clearInterval(restockInterval);
                updateAllRestockTimers(restockTimes);
                restockInterval = setInterval(() => updateAllRestockTimers(restockTimes), 1000);
            }

        } catch (error) {
            console.error('Error during data fetch:', error);
        } finally {
            clearTimeout(mainRefreshTimeout);
            mainRefreshTimeout = setTimeout(fetchAllData, REFRESH_INTERVAL);
            if (!initialLoadComplete) {
                initialLoadComplete = true;
                console.log("Initial data load complete.");
            }
        }
    }

    async function fetchData(endpointPath) {
        for (const baseUrl of API_BASE_URLS) {
            const url = `${baseUrl}${endpointPath}`;
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${url}`);
                }
                console.log(`Successfully fetched from ${url}`);
                return await response.json();
            } catch (error) {
                console.warn(`Fetch attempt failed for ${url}:`, error.message);
            }
        }

        console.error(`All fetch attempts failed for endpoint: ${endpointPath}`);
        return null; // Return null to allow Promise.all to continue
    }
    
    function processAndDisplayItemData(data) {
        allItemsInfo.clear();
        data.forEach(item => {
            const cleanName = item.name.toLowerCase().replace(/\s+/g, '');
            allItemsInfo.set(cleanName, {
                displayName: item.name,
                image: item.image,
                metadata: item.metadata
            });
        });
        console.log("All item info has been processed and mapped from source.");

        // Populate calculator with the new data
        if(document.getElementById('content-calculator')) {
            populateCalculatorPlants();
        }
    }

    async function fetchAllItemsInfo() {
        const data = await fetchData(API_PATHS.itemInfo);
        if (data && Array.isArray(data) && data.length > 0) {
            processAndDisplayItemData(data);
            saveItemsToCache(data);
        } else {
            console.log("Could not fetch new item info, will rely on cache if available.");
        }
    }
    
    // --- Stock Processing & UI ---
    function processAndDisplayStock(rawData, fromPoll) {
        const allItemsMap = new Map();
        for (const key of Object.keys(CATEGORY_MAP)) {
            const categoryName = CATEGORY_MAP[key];
            if (rawData[key] && Array.isArray(rawData[key])) {
                rawData[key].forEach(item => {
                    if (!item.name || typeof item.value === 'undefined') return;
                    const cleanName = item.name.toLowerCase().replace(/\s+/g, '');
                     if (allItemsMap.has(cleanName)) {
                        allItemsMap.get(cleanName).quantity += item.value;
                    } else {
                        allItemsMap.set(cleanName, {
                            name: item.name,
                            quantity: item.value,
                            image: item.image,
                            category: categoryName
                        });
                    }
                });
            }
        }

        const sortedEntries = Array.from(allItemsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const currentStockJSON = JSON.stringify(sortedEntries);

        if (lastStockDataJSON === currentStockJSON) {
            console.log("Stock data is unchanged.");
            return;
        }
        
        console.log("Stock data has changed. Updating UI.");
        if(fromPoll) {
            stopFastPolling(); // Stop polling as we've found a change
            fetchAllData(); // Trigger a full refresh to get new timer data
            return; // Exit to let the full refresh handle the UI update
        }

        lastStockDataJSON = currentStockJSON;

        if (initialLoadComplete) {
            sendNotificationsForSubscribedItems(allItemsMap);
        }

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
        filterStockItems(); // Re-apply search filter
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
                        <div id="restock-${categoryId}" class="text-sm text-slate-400"></div>
                    </div>
                    <ul class="p-4 space-y-2 flex-grow">
                        ${items.map(createItemCard).join('')}
                    </ul>
                </div>
            `;
        }
        elements.stockCategoriesContainer.innerHTML = html;
        document.querySelectorAll('.item-card').forEach(card => {
            card.addEventListener('click', () => {
                const itemName = card.dataset.itemName;
                const cleanName = itemName.toLowerCase().replace(/\s+/g, '');
                if (allItemsInfo.has(cleanName)) {
                    displayItemInfo(allItemsInfo.get(cleanName));
                }
            });
        });
    }

    function createItemCard(item) {
        return `
            <li class="item-card flex items-center p-2 rounded-md hover:bg-garden-dark cursor-pointer transition-colors" data-item-name="${item.name}">
                <img src="${item.image}" alt="${item.name}" class="w-8 h-8 mr-3 object-contain">
                <span class="flex-grow text-slate-300">${item.name}</span>
                <span class="text-garden-primary font-semibold">${item.quantity.toLocaleString()}</span>
            </li>
        `;
    }

    function updateStockOverviewUI(data) {
        const totalItems = data.length;
        const totalQuantity = data.reduce((sum, item) => sum + item.quantity, 0);
        elements.stockSummary.innerHTML = `
            <p><strong>Total Unique Items:</strong> ${totalItems}</p>
            <p><strong>Total Item Quantity:</strong> ${totalQuantity.toLocaleString()}</p>
        `;
    }

    function updateAllRestockTimers(restockData) {
        for (const category in restockData) {
            const timeLeft = formatTimeLeft(restockData[category]);
            const categoryId = CATEGORY_MAP[category]?.toLowerCase().replace(/[^a-z0-9]/g, '');
            const timerEl = document.getElementById(`restock-${categoryId}`);
            if (timerEl) {
                if (timeLeft === 'Expired') {
                    timerEl.innerHTML = `<span class="text-yellow-400 animate-pulse">Checking for stock...</span>`;
                    if (!isFastPolling) startFastPolling();
                } else {
                    timerEl.textContent = `Restocks in ${timeLeft}`;
                }
            }
        }
    }

    function startFastPolling() {
        if (isFastPolling) return;
        console.log("Timer expired. Starting 5-second polling.");
        isFastPolling = true;
        clearTimeout(mainRefreshTimeout); // Pause main refresh

        const poll = async () => {
            console.log("Polling for stock changes...");
            const stock = await fetchData(API_PATHS.stock);
            if (stock) {
                processAndDisplayStock(stock, true);
            }
            if(isFastPolling) { // Check if polling is still active before setting next timeout
               fastPollTimeout = setTimeout(poll, FAST_POLL_INTERVAL);
            }
        };
        poll();
    }

    function stopFastPolling() {
        console.log("Stopping 5-second polling.");
        isFastPolling = false;
        clearTimeout(fastPollTimeout);
        // Restart main refresh cycle immediately instead of waiting for its timer
        clearTimeout(mainRefreshTimeout);
        mainRefreshTimeout = setTimeout(fetchAllData, REFRESH_INTERVAL);
    }

    // --- Weather UI ---
    function updateWeatherUI(weatherEvents) {
        if (!weatherEvents || weatherEvents.length === 0) {
            elements.weatherData.innerHTML = `<p>No current weather events.</p>`;
            return;
        }
        const now = Date.now();
        const activeEvent = weatherEvents.find(event => {
            const startTime = new Date(event.startTime).getTime();
            const endTime = new Date(event.endTime).getTime();
            return now >= startTime && now <= endTime;
        });

        if (activeEvent) {
            const endTime = new Date(activeEvent.endTime).getTime();
            elements.weatherData.innerHTML = `
                <div class="flex items-center">
                    <img src="${activeEvent.eventImage}" alt="${activeEvent.eventName}" class="w-12 h-12 mr-4">
                    <div>
                        <p class="text-xl font-bold">${activeEvent.eventName}</p>
                        <p class="text-slate-400">Ends in: <span id="weather-timer">${formatTimeLeft(endTime / 1000)}</span></p>
                    </div>
                </div>
            `;
            // You might want a timer here to update the 'Ends in' part every second
        } else {
            elements.weatherData.innerHTML = `<p>No active weather events right now.</p>`;
        }
    }

    function formatTimeLeft(unixTimestamp) {
        const now = Date.now();
        const targetTime = unixTimestamp * 1000;
        const diff = targetTime - now;

        if (diff <= 0) return 'Expired';

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        let result = '';
        if (d > 0) result += `${d}d `;
        if (h > 0) result += `${h}h `;
        if (m > 0) result += `${m}m `;
        if (d === 0 && h === 0) result += `${s}s`; // Only show seconds if less than an hour

        return result.trim();
    }

    // --- Modal & Item Info UI ---
    function displayItemInfo(itemInfo) {
        elements.modalTitle.textContent = itemInfo.displayName;
        const content = elements.itemInfoContent;
        
        let metadataHtml = '<p class="text-slate-400 mb-4">No additional details available.</p>';
        if (itemInfo.metadata && Object.keys(itemInfo.metadata).length > 0) {
            metadataHtml = `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${createMetadataSection('Price', { 'Buy': itemInfo.metadata.buyPrice, 'Sell': itemInfo.metadata.sellValue })}
                    ${createMetadataSection('Properties', { 'Rarity': itemInfo.metadata.rarity, 'Tier': itemInfo.metadata.tier, 'Type': itemInfo.metadata.type })}
                    ${createMetadataSection('Gardening', { 'Growth Time': itemInfo.metadata.growthTime, 'Season': itemInfo.metadata.season })}
                    ${createMetadataSection('Location', { 'Found In': itemInfo.metadata.foundIn })}
                </div>
            `;
        }
        
        content.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left">
                <img src="${itemInfo.image}" alt="${itemInfo.displayName}" class="w-24 h-24 mb-4 sm:mb-0 sm:mr-6 rounded-lg bg-slate-800 p-2">
                <div class="flex-grow">
                     ${metadataHtml}
                </div>
            </div>
        `;

        updateNotifyButtonUI(itemInfo.displayName);
        elements.itemInfoModal.classList.remove('hidden');
    }
    
    function createMetadataSection(title, data) {
        const filteredData = Object.entries(data).filter(([_, value]) => value && value !== 'N/A');
        if (filteredData.length === 0) return '';
        
        return `
            <div class="bg-garden-dark p-3 rounded-lg">
                <h4 class="font-bold text-garden-accent mb-2">${title}</h4>
                <dl>
                    ${filteredData.map(([key, value]) => `
                        <div class="flex justify-between text-sm mb-1">
                            <dt class="text-slate-400">${key}:</dt>
                            <dd class="text-slate-200 font-medium">${getRarityStyle(value)}</dd>
                        </div>
                    `).join('')}
                </dl>
            </div>
        `;
    }

    function getRarityStyle(value) {
        if (typeof value !== 'string') return value;
        const rarities = {
            'Common': 'text-slate-300',
            'Uncommon': 'text-green-400',
            'Rare': 'text-blue-400',
            'Epic': 'text-purple-400',
            'Legendary': 'text-orange-400',
            'Mythic': 'text-red-500'
        };
        const rarityClass = rarities[value];
        return rarityClass ? `<span class="${rarityClass}">${value}</span>` : value;
    }
    
    // --- UI Filtering & Searching ---
    function filterStockItems() {
        const query = elements.itemSearch.value.toLowerCase();
        document.querySelectorAll('.item-card').forEach(card => {
            const itemName = card.dataset.itemName.toLowerCase();
            if (itemName.includes(query)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }

    // --- Notifications (New Push Notification Logic) ---
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async function setupPushNotifications() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push messaging is not supported.');
            elements.enableNotificationsBtn.textContent = 'Push Not Supported';
            elements.enableNotificationsBtn.disabled = true;
            return;
        }

        if (Notification.permission === 'denied') {
            initializeNotificationState();
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered successfully.');

            pushSubscription = await registration.pushManager.getSubscription();
            
            if (Notification.permission === 'granted' && pushSubscription) {
                 console.log('User is already subscribed.');
                 updateNotifyButtonState(true);
                 // Ensure server has the latest subscription list
                 await sendSubscriptionToServer(pushSubscription);

            } else if(Notification.permission !== 'granted') {
                 console.log('Requesting notification permission...');
                 const permission = await Notification.requestPermission();
                 if (permission !== 'granted') {
                    throw new Error('Permission not granted for Notification');
                 }
            }

            if (!pushSubscription) {
                console.log('No existing subscription found, creating new one...');
                const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
                pushSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: applicationServerKey
                });
                console.log('User subscribed successfully.');
                await sendSubscriptionToServer(pushSubscription);
            }
            
            initializeNotificationState();

        } catch (error) {
            console.error('Failed to setup push notifications:', error);
            updateNotifyButtonState(false);
        }
    }
    
    async function sendSubscriptionToServer(subscription) {
        if (!subscription) {
            console.warn("No push subscription available to send to server.");
            return;
        }
        try {
            await fetch(`${PUSH_SERVER_URL}/subscribe`, {
                method: 'POST',
                body: JSON.stringify({
                    subscription: subscription,
                    interests: Array.from(notificationSubscriptions)
                }),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('Subscription details sent to push server.');
        } catch (error) {
            console.error('Failed to send subscription to server:', error);
        }
    }

    function initializeNotificationState() {
        updateNotifyButtonState(Notification.permission === 'granted');
    }

    function updateNotifyButtonState(isGranted) {
         if (Notification.permission === 'denied') {
            elements.enableNotificationsBtn.textContent = 'Notifications Blocked';
            elements.enableNotificationsBtn.disabled = true;
            elements.enableNotificationsBtn.classList.remove('bg-green-600', 'hover:bg-green-700');

        } else if (isGranted && pushSubscription) {
            elements.enableNotificationsBtn.textContent = 'Push Notifications On';
            elements.enableNotificationsBtn.disabled = true;
            elements.enableNotificationsBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        } else {
             elements.enableNotificationsBtn.textContent = 'Enable Push Notifications';
             elements.enableNotificationsBtn.disabled = false;
             elements.enableNotificationsBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        }
    }

    function sendTestNotification() {
        if (Notification.permission === 'granted') {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg) {
                    reg.showNotification('Test Notification', {
                        body: 'This is a test notification from GAGDash!',
                        icon: 'https://i.postimg.cc/FsY5s1yV/gardening-tools.png'
                    });
                }
            });
        }
    }

    function updateNotifyButtonUI(itemName) {
        const notifyBtn = elements.notifyBtn;
        if (notificationSubscriptions.has(itemName)) {
            notifyBtn.textContent = 'Unsubscribe from Notifications';
            notifyBtn.classList.replace('bg-blue-600', 'bg-red-600');
            notifyBtn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
        } else {
            notifyBtn.textContent = 'Subscribe to Notifications';
            notifyBtn.classList.replace('bg-red-600', 'bg-blue-600');
            notifyBtn.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        }
        localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
        updateNotifyButtonUI(itemName);
        renderNotificationConfig(); // Update config modal if open
        // After interests change, re-sync with the server
        sendSubscriptionToServer(pushSubscription);
    }
    
    function openNotificationConfigModal() {
        renderNotificationConfig();
        elements.notificationConfigModal.classList.remove('hidden');
        localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
        renderNotificationConfig();
        // After interests change, re-sync with the server
        sendSubscriptionToServer(pushSubscription);
    }
    
    function renderNotificationConfig() {
        const contentEl = elements.notificationConfigContent;
        if (stockData.length === 0) {
            contentEl.innerHTML = '<p>Stock data hasn\'t loaded yet. Please wait a moment.</p>';
            return;
        }

        const categorized = {};
        for (const categoryName of Object.values(CATEGORY_MAP)) {
            categorized[categoryName] = [];
        }
        categorized['Uncategorized'] = [];

        stockData.forEach(item => {
            const category = item.category || 'Uncategorized';
            if (categorized[category]) {
                categorized[category].push(item);
            } else {
                categorized['Uncategorized'].push(item);
            }
        });

        let html = '';
        const categoryOrder = [...Object.values(CATEGORY_MAP), 'Uncategorized'];

        for (const categoryName of categoryOrder) {
            const items = categorized[categoryName];
            if (!items || items.length === 0) continue;

            const categoryId = `config-${categoryName.replace(/\s+/g, '-')}`;
            const allSubscribed = items.every(item => notificationSubscriptions.has(item.name));
            const someSubscribed = !allSubscribed && items.some(item => notificationSubscriptions.has(item.name));

            html += `
                <details class="bg-garden-dark rounded-lg" id="${categoryId}">
                    <summary class="p-4 cursor-pointer flex justify-between items-center font-semibold text-lg">
                        <span>${categoryName}</span>
                        <input type="checkbox" class="category-toggle-all" data-category="${categoryName}" 
                               ${allSubscribed ? 'checked' : ''} ${someSubscribed ? 'data-indeterminate="true"' : ''}>
                    </summary>
                    <div class="p-4 border-t border-slate-700">
                        <ul class="space-y-2">
                            ${items.map(item => `
                                <li class="flex items-center justify-between">
                                    <label for="sub-${item.name}" class="flex-grow">${item.name}</label>
                                    <input type="checkbox" id="sub-${item.name}" class="item-subscription-toggle" data-item-name="${item.name}" 
                                           ${notificationSubscriptions.has(item.name) ? 'checked' : ''}>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </details>
            `;
        }

        contentEl.innerHTML = html;
        
        // Add event listeners after content is rendered
        contentEl.querySelectorAll('.item-subscription-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                toggleSubscription(e.target.dataset.itemName);
            });
        });
        
        contentEl.querySelectorAll('.category-toggle-all').forEach(toggle => {
            if (toggle.dataset.indeterminate) {
                toggle.indeterminate = true;
            }
            toggle.addEventListener('click', (e) => {
                // Stop propagation to prevent details from closing
                e.stopPropagation(); 
            });
            toggle.addEventListener('change', (e) => {
                e.stopPropagation();
                toggleCategorySubscription(e.target.dataset.category, e.target.checked);
            });
        });

        contentEl.querySelectorAll('details').forEach(detail => {
            detail.addEventListener('toggle', () => updateCategorySubscriptionUI(detail));
        });
    }

    function updateCategorySubscriptionUI(detailsElement) {
        const categoryToggle = detailsElement.querySelector('.category-toggle-all');
        const itemToggles = Array.from(detailsElement.querySelectorAll('.item-subscription-toggle'));
        const allChecked = itemToggles.every(t => t.checked);
        const someChecked = itemToggles.some(t => t.checked);

        categoryToggle.indeterminate = !allChecked && someChecked;
        categoryToggle.checked = allChecked;
    }

    function toggleCategorySubscription(categoryName, shouldSubscribe) {
        const itemsInCategory = stockData.filter(item => {
            if(item.category === categoryName) return true;
            if(!item.category && categoryName === 'Uncategorized') return true;
            return false;
        });
        itemsInCategory.forEach(item => {
            if (shouldSubscribe) {
                notificationSubscriptions.add(item.name);
            } else {
                notificationSubscriptions.delete(item.name);
            }
        });
        localStorage.setItem('gardenSubscriptions', JSON.stringify(Array.from(notificationSubscriptions)));
        renderNotificationConfig();
        // After interests change, re-sync with the server
        sendSubscriptionToServer(pushSubscription);
    }
    
    function sendNotificationsForSubscribedItems(allItemsMap) {
        // This function is now deprecated. The server handles notifications.
        if (initialLoadComplete) { // Only warn after the first load to avoid spamming console
             console.warn("DEPRECATED: Client-side notification checks are no longer used.");
        }
    }

    // --- Tab Management ---
    function switchTab(tab) {
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active-content');
        });
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active-tab');
        });

        document.getElementById(`content-${tab}`).classList.add('active-content');
        document.getElementById(`tab-${tab}`).classList.add('active-tab');
    }

    // ===================================================================================
    // GAGDash Calculator Logic
    // ===================================================================================
    
    function initializeCalculator() {
        // Initialize debounce function here, now that its dependencies are defined
        debouncedCalculateValue = debounce(() => calculateValue(), 250);
        
        setupCalculatorUI();
        setupCalculatorEventListeners();
    }

    function setupCalculatorUI() {
        const modifierContainer = document.getElementById('calculator-modifiers');
        if (!modifierContainer) return;
        modifierContainer.innerHTML = '';
        CALCULATOR_CONSTANTS.modifiers.forEach(id => {
            const button = document.createElement('button');
            button.id = `mod-${id}`;
            // A generic class for styling all modifier buttons
            button.className = 'py-1 px-3 text-sm rounded-full bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-garden-accent';
            button.textContent = id.charAt(0).toUpperCase() + id.slice(1);
            button.title = CALCULATOR_CONSTANTS.modifierDescriptions[id] || id;
            button.onclick = () => toggleModifier(id);
            modifierContainer.appendChild(button);
        });

        // Dynamically add new calculator features
        const controlsContainer = document.getElementById('calculator-controls');
        if (controlsContainer) {
             // Price Range Toggle Button
            const priceRangeBtn = document.createElement('button');
            priceRangeBtn.id = 'togglePriceRangeBtn';
            priceRangeBtn.className = 'w-full mt-2 py-2 px-4 rounded-md bg-blue-600 hover:bg-blue-700 transition-colors text-white font-semibold';
            priceRangeBtn.textContent = 'Toggle Price Range';
            controlsContainer.appendChild(priceRangeBtn);

            // Value to Weight Calculator
            const valueToWeightContainer = document.createElement('div');
            valueToWeightContainer.className = 'mt-4 p-4 bg-garden-dark rounded-lg';
            valueToWeightContainer.innerHTML = `
                <h4 class="text-lg font-semibold text-garden-accent mb-2">Calculate Weight from Value</h4>
                <div class="flex flex-col gap-2">
                    <input type="number" id="valueInput" placeholder="Enter target value..." class="w-full p-2 rounded-md bg-slate-800 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-garden-primary text-white">
                    <button id="calculateWeightBtn" class="py-2 px-4 rounded-md bg-green-600 hover:bg-green-700 transition-colors text-white font-semibold">Calculate Weight</button>
                    <p id="weightFromValue" class="text-center text-slate-300 mt-2 h-6"></p>
                </div>
            `;
            controlsContainer.appendChild(valueToWeightContainer);
        }
    }

    function populateCalculatorPlants() {
        CALCULATOR_CONSTANTS.categories["All"] = Array.from(allItemsInfo.keys());
        
        const categoryButtonsContainer = document.getElementById('calculator-category-buttons');
        const categoryContentsContainer = document.getElementById('calculator-category-contents');
        if(!categoryButtonsContainer || !categoryContentsContainer) return;

        categoryButtonsContainer.innerHTML = '';
        categoryContentsContainer.innerHTML = '';

        const createButton = (id, name, container, clickHandler) => {
            const button = document.createElement('button');
            button.id = id;
            button.textContent = name;
            button.onclick = clickHandler;
            container.appendChild(button);
            return button;
        };
        
        // Create Plant categories
        Object.entries(CALCULATOR_CONSTANTS.categories).forEach(([title, plantIdList]) => {
            const catId = `cat-${title.toLowerCase().replace(/\s/g, '-')}`;
            const btn = createButton(catId, title, categoryButtonsContainer, () => selectCalculatorCategory(catId));
            btn.className = 'px-3 py-1 text-sm rounded-md bg-slate-600 hover:bg-slate-500 transition-colors';

            const contentDiv = document.createElement('div');
            contentDiv.id = `${catId}-content`;
            contentDiv.className = 'hidden';
            
            const plantGrid = document.createElement('div');
            plantGrid.className = 'grid grid-cols-3 gap-2 text-center';
            
            plantIdList.forEach(plantId => {
                 const plantInfo = allItemsInfo.get(plantId);
                 if (plantInfo) {
                    const plantButton = document.createElement('button');
                    plantButton.className = 'p-2 rounded-lg hover:bg-garden-dark transition-colors border-2 border-transparent';
                    plantButton.id = `plant-${plantId}`;
                    plantButton.innerHTML = `
                        <img src="${plantInfo.image}" alt="${plantInfo.displayName}" class="mx-auto h-12 w-12 object-contain" />
                        <span class="block text-xs mt-1 text-slate-400">${plantInfo.displayName}</span>
                    `;
                    plantButton.onclick = () => selectPlant(plantId);
                    plantGrid.appendChild(plantButton);
                 }
            });
            contentDiv.appendChild(plantGrid);
            categoryContentsContainer.appendChild(contentDiv);
        });

        // Create Pet XP category last
        const petXpButton = createButton('cat-petxp', 'Pet XP', categoryButtonsContainer, () => selectCalculatorCategory('cat-petxp'));
        petXpButton.className = 'px-3 py-1 text-sm rounded-md bg-slate-600 hover:bg-slate-500 transition-colors';
        
        // Select "All" category by default
        const allCategoryButton = document.getElementById('cat-all');
        if (allCategoryButton) {
            allCategoryButton.click();
        } else {
            // Fallback to first button if "All" doesn't exist for some reason
            const firstCat = document.querySelector('#calculator-category-buttons button');
            if (firstCat) firstCat.click();
        }

        document.getElementById('calculatePetXpBtn').addEventListener('click', calculatePetGrowth);
        document.getElementById('brownMouseBtn').addEventListener('click', () => toggleMouse('brown'));
        document.getElementById('greyMouseBtn').addEventListener('click', () => toggleMouse('grey'));

        // Listeners for dynamically added elements
        const priceRangeBtn = document.getElementById('togglePriceRangeBtn');
        if (priceRangeBtn) {
            priceRangeBtn.addEventListener('click', togglePriceRange);
        }
        const calculateWeightBtn = document.getElementById('calculateWeightBtn');
        if(calculateWeightBtn) {
            calculateWeightBtn.addEventListener('click', calculateWeightFromValue);
        }
    }

    function selectCalculatorCategory(catId) {
        document.querySelectorAll('#calculator-category-buttons button').forEach(b => b.classList.remove('bg-garden-primary', 'hover:bg-garden-secondary'));
        document.getElementById(catId).classList.add('bg-garden-primary', 'hover:bg-garden-secondary');

        document.querySelectorAll('#calculator-category-contents > div').forEach(div => div.classList.add('hidden'));
        
        const isPetXp = catId === 'cat-petxp';
        document.getElementById('mainCalculator').style.display = isPetXp ? 'none' : 'block';
        document.getElementById('petXpCalculator').style.display = isPetXp ? 'block' : 'none';
        
        if (!isPetXp) {
            const contentDiv = document.getElementById(`${catId}-content`);
            if(contentDiv) contentDiv.classList.remove('hidden');
        }
    }

    function selectPlant(plantId) {
        selectedPlant = plantId;
        
        // Update plant button UI
        document.querySelectorAll('#calculator-category-contents button').forEach(b => {
            b.classList.remove('border-garden-primary', 'bg-garden-dark');
        });
        const plantButton = document.getElementById(`plant-${plantId}`);
        if(plantButton) plantButton.classList.add('border-garden-primary', 'bg-garden-dark');

        // Handle Dawnbound modifier logic
        const dawnboundBtn = document.getElementById("mod-dawnbound");
        if(dawnboundBtn) {
            if (selectedPlant === "sunflower") {
                dawnboundBtn.disabled = false;
                dawnboundBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                dawnboundBtn.classList.remove('active-modifier');
                dawnboundBtn.disabled = true;
                dawnboundBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
        
        debouncedCalculateValue();
        updateSelectedModifiersDisplay();
    }

    function setupCalculatorEventListeners() {
        document.getElementById('weight').addEventListener('input', debouncedCalculateValue);
        document.getElementById('plantAmount').addEventListener('input', debouncedCalculateValue);
        document.getElementById('weightSlider').addEventListener('input', () => {
            updateSliderLabel();
            debouncedCalculateValue();
        });
        document.getElementById('calculator-plant-search').addEventListener('input', filterPlants);
        
        // Wire up the final buttons
        document.getElementById('calculator-clear-btn').addEventListener('click', clearCalculator);
        document.getElementById('calculator-max-mutations-btn').addEventListener('click', activateMaxMutations);
        
        // Pet XP listeners
        document.getElementById('calculatePetXpBtn').addEventListener('click', calculatePetGrowth);
        document.getElementById('brownMouseBtn').addEventListener('click', () => toggleMouse('brown'));
        document.getElementById('greyMouseBtn').addEventListener('click', () => toggleMouse('grey'));

        // Listeners for dynamically added elements
        const priceRangeBtn = document.getElementById('togglePriceRangeBtn');
        if (priceRangeBtn) {
            priceRangeBtn.addEventListener('click', togglePriceRange);
        }
        const calculateWeightBtn = document.getElementById('calculateWeightBtn');
        if(calculateWeightBtn) {
            calculateWeightBtn.addEventListener('click', calculateWeightFromValue);
        }
    }

    function filterPlants(e) {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('#calculator-category-contents button').forEach(btn => {
            const plantName = btn.id.substring(6).toLowerCase();
            const displayName = btn.querySelector('span').textContent.toLowerCase();
            btn.style.display = (plantName.includes(query) || displayName.includes(query)) ? 'block' : 'none';
        });
    }

    function toggleModifier(id) {
      const btn = document.getElementById(`mod-${id}`);
      if (btn.disabled) return;

      if (id === "dawnbound" && selectedPlant !== "sunflower") return;
      
      const isActive = btn.classList.contains('active-modifier');

      if (id === "wet" || id === "chilled") {
        const other = id === "wet" ? "chilled" : "wet";
        document.getElementById(`mod-${other}`).classList.remove("active-modifier");
        const frozenBtn = document.getElementById("mod-frozen");
        frozenBtn.classList.remove("active-modifier");
        frozenBtn.disabled = !isActive; // Disable if activating wet/chilled
      } else if (id === "frozen") {
        ["wet", "chilled"].forEach(x => {
          const otherBtn = document.getElementById(`mod-${x}`);
          otherBtn.classList.remove("active-modifier");
          otherBtn.disabled = !isActive; // Disable if activating frozen
        });
      }

      if (id === "rainbow" || id === "gold") {
        const other = id === "rainbow" ? "gold" : "rainbow";
        document.getElementById(`mod-${other}`).classList.remove("active-modifier");
      }

      btn.classList.toggle("active-modifier");

      debouncedCalculateValue();
      updateSelectedModifiersDisplay();
    }

    function updateSliderLabel() {
        const slider = document.getElementById('weightSlider');
        const label = document.getElementById('sliderValueLabel');
        const boostLevels = [0, 10, 20, 30, 40, 50];
        if (slider && label) {
            label.textContent = `${boostLevels[slider.value]}%`;
        }
    }

    function formatShortNumber(value, isSeconds = false) {
        if (value < 1000) return value.toFixed(3) + " ";
        const suffixes = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion', 'Quintillion', 'Sextillion', 'Septillion', 'Octillion', 'Nonillion', 'Decillion'];
        let i = 0;
        while (value >= 1000 && i < suffixes.length - 1) {
            value /= 1000;
            i++;
        }
        if (isSeconds) {
            return `${value.toFixed(3)} ${suffixes[i]}`;
        } else {
            return `${value.toFixed(3)} ${suffixes[i]}`;
        }
    }

    function calculateValue() {
        if (!selectedPlant) return;

        const weight = parseFloat(document.getElementById('weight').value) || 0;
        const amount = parseInt(document.getElementById('plantAmount').value) || 1;
        
        const { fruitMultiplier, sum } = getMultiplierParts();
        
        const sliderValue = parseInt(document.getElementById('weightSlider').value) || 0;
        const friendBoostLevels = [1, 1.1, 1.2, 1.3, 1.4, 1.5];
        const friendBoost = friendBoostLevels[sliderValue];

        const valueEl = document.getElementById('calculator-value');

        if (showPriceRange) {
            const lowWeight = Math.max(weight - 0.04, 0);
            const highWeight = Math.min(weight + 0.04, 100000); // Safety cap

            const calculate = (w) => {
                const baseValue = calculateBaseValueForPlant(selectedPlant, w);
                let total = Math.ceil(baseValue * fruitMultiplier * (1 + sum));
                total *= amount;
                total *= friendBoost;
                return total;
            };

            const lowValue = calculate(lowWeight);
            const highValue = calculate(highWeight);
            
            valueEl.innerHTML = `
                <div class="text-sm">
                    ≈$${lowValue.toLocaleString()} - $${highValue.toLocaleString()}
                    <span class="text-slate-400 block">(${formatShortNumber(lowValue)} - ${formatShortNumber(highValue)})</span>
                </div>
            `;

        } else {
            const baseValue = calculateBaseValueForPlant(selectedPlant, weight);
            let totalValue = Math.ceil(baseValue * fruitMultiplier * (1 + sum));
            totalValue *= amount;
            totalValue *= friendBoost;
            valueEl.textContent = `≈$${totalValue.toLocaleString()} (${formatShortNumber(totalValue)})`;
        }
    }

    function getMultiplierParts() {
      const fruitMultiplier = document.getElementById("mod-rainbow")?.classList.contains("active-modifier")
        ? 50 : document.getElementById("mod-gold")?.classList.contains("active-modifier") ? 20 : 1;

      const modValues = {
        shocked: 99, frozen: 9, wet: 1, chilled: 1, choc: 1, moonlit: 1, bloodlit: 3,
        celestial: 119, disco: 124, zomb: 24, plasma: 4, voidtouched: 134,
        pollinated: 2, honeyglazed: 4, dawnbound: 149, heavenly: 4
      };

      let sum = 0;
      for (const [mod, val] of Object.entries(modValues)) {
        if (document.getElementById(`mod-${mod}`)?.classList.contains("active-modifier")) {
          sum += val;
        }
      }
      const finalMultiplier = fruitMultiplier * (1 + sum);
      return { finalMultiplier, fruitMultiplier, sum };
    }

    function updateSelectedModifiersDisplay() {
      const { finalMultiplier } = getMultiplierParts();
      const displayEl = document.getElementById("total-multiplier-display");
      if (displayEl) {
        if (finalMultiplier > 1) {
            displayEl.textContent = `Total: x${finalMultiplier.toLocaleString()}`;
        } else {
            displayEl.textContent = '';
        }
      }
    }

    function clearCalculator() {
        document.querySelectorAll('.active-modifier').forEach(b => b.classList.remove('active-modifier'));
        document.querySelectorAll('.modifier-button:disabled').forEach(b => {
            b.disabled = false;
            b.classList.remove('opacity-50', 'cursor-not-allowed');
        });

        if(selectedPlant) {
            const plantButton = document.getElementById(`plant-${selectedPlant}`);
            if(plantButton) plantButton.classList.remove('border-garden-primary', 'bg-garden-dark');
            selectedPlant = null;
        }
        
        document.getElementById('weight').value = '1.00';
        document.getElementById('plantAmount').value = '1';
        document.getElementById('weightSlider').value = '0';
        updateSliderLabel();
        document.getElementById('calculator-value').textContent = '$0';
        document.getElementById('total-multiplier-display').textContent = '';

        const weightFromResult = document.getElementById('weightFromValue');
        if(weightFromResult) weightFromResult.textContent = '';
        const valueInput = document.getElementById('valueInput');
        if(valueInput) valueInput.value = '';

        const priceRangeBtn = document.getElementById('togglePriceRangeBtn');
        if(priceRangeBtn && priceRangeBtn.classList.contains('active-modifier')) {
            togglePriceRange();
        }
    }

    function activateMaxMutations() {
      const excluded = ['gold', 'wet', 'chilled'];
      CALCULATOR_CONSTANTS.modifiers.forEach(id => {
        const btn = document.getElementById(`mod-${id}`);
        if (!excluded.includes(id) && !btn.disabled) {
          if (id === "dawnbound" && selectedPlant !== "sunflower") return;
          btn.classList.add("active-modifier");
        }
      });
     
      const frozenBtn = document.getElementById("mod-frozen");
      frozenBtn.classList.add("active-modifier");
      frozenBtn.disabled = false;

      ["wet", "chilled"].forEach(id => {
        const btn = document.getElementById(`mod-${id}`);
        btn.classList.remove("active-modifier");
        btn.disabled = true;
      });

      debouncedCalculateValue();
      updateSelectedModifiersDisplay();
    }

    // --- Pet XP Calculator ---
    function toggleMouse(color) {
        const btn = document.getElementById(`${color}MouseBtn`);
        const otherBtn = document.getElementById(color === 'brown' ? 'greyMouseBtn' : 'brownMouseBtn');
        
        btn.classList.toggle('active-modifier');
        otherBtn.classList.remove('active-modifier');
    }

    function calculatePetGrowth() {
        const targetAge = parseInt(document.getElementById('targetAge').value);
        const currentAge = parseInt(document.getElementById('currentAge').value);
        const owlCount = parseInt(document.getElementById('owlCount').value) || 0;
        const bloodOwlCount = parseInt(document.getElementById('bloodOwlCount').value) || 0;
        const resultEl = document.getElementById('petGrowthResult');

        if (isNaN(targetAge) || isNaN(currentAge) || targetAge < 1 || targetAge > 100 || currentAge < 1 || currentAge >= targetAge) {
            resultEl.textContent = 'Please enter valid ages (1–100) and ensure target age > current age.';
            return;
        }

        const isMouseActive = document.getElementById('brownMouseBtn').classList.contains('active-modifier') || 
                              document.getElementById('greyMouseBtn').classList.contains('active-modifier');
        const owlLimit = isMouseActive ? 7 : 8;

        if (owlCount + bloodOwlCount > owlLimit) {
            resultEl.textContent = `You can only have up to ${owlLimit} owls in total ${isMouseActive ? 'when a mouse is selected.' : '.'}`;
            return;
        }

        function getXpForLevel(level) {
            if (level === 1) return 20;
            if (level === 2) return 81;
            let prev = 20;
            let curr = 81;
            for (let i = 3; i <= level; i++) {
                const next = 2 * curr - prev + 43;
                prev = curr;
                curr = next;
            }
            return curr;
        }

        let totalXpNeeded = 0;
        for (let i = currentAge; i < targetAge; i++) {
            totalXpNeeded += getXpForLevel(i);
        }

        const owlXpBonus = (owlCount * 0.25) + (bloodOwlCount * 0.55);
        const xpPerSecond = 0.52 + owlXpBonus;
        
        const timeInSeconds = totalXpNeeded / xpPerSecond;
        const timeInHours = timeInSeconds / 3600;

        resultEl.innerHTML = `
            <div class="text-sm space-y-1 text-left">
                <p><strong>Start Age:</strong> ${currentAge} → <strong>Target Age:</strong> ${targetAge}</p>
                <p><strong>Total XP Required:</strong> ${totalXpNeeded.toLocaleString()} XP</p>
                <p><strong>XP Rate:</strong> ≈${xpPerSecond.toFixed(2)} XP/s</p>
                <p><strong>Time Needed:</strong> ≈${formatShortNumber(timeInSeconds, true)} seconds</p>
                <p class="text-slate-400">(which is about ${timeInHours.toFixed(2)} hours)</p>
            </div>
        `;
    }

    function togglePriceRange() {
        showPriceRange = !showPriceRange;
        const btn = document.getElementById('togglePriceRangeBtn');
        if (btn) {
            btn.classList.toggle('active-modifier', showPriceRange); // Use same active style
            btn.textContent = showPriceRange ? 'Showing Price Range' : 'Toggle Price Range';
        }
        debouncedCalculateValue();
    }

    function calculateWeightFromValue() {
        const targetValue = parseFloat(document.getElementById('valueInput')?.value);
        const resultEl = document.getElementById('weightFromValue');

        if (!selectedPlant || isNaN(targetValue) || targetValue <= 0) {
            resultEl.textContent = 'Select a plant and enter a valid value.';
            return;
        }

        const { fruitMultiplier, sum } = getMultiplierParts();
        const sliderValue = parseInt(document.getElementById('weightSlider').value) || 0;
        const friendBoostLevels = [1, 1.1, 1.2, 1.3, 1.4, 1.5];
        const friendBoost = friendBoostLevels[sliderValue];
        const amount = parseInt(document.getElementById('plantAmount').value) || 1;

        const totalMultiplier = fruitMultiplier * (1 + sum) * amount * friendBoost;
        const requiredBaseValue = targetValue / totalMultiplier;

        const plantBaseMultiplier = getPlantBaseMultiplier(selectedPlant);
        let estimatedWeightSq = requiredBaseValue / plantBaseMultiplier;
        let estimatedWeight = Math.sqrt(estimatedWeightSq);

        const threshold = PLANT_DATA[selectedPlant];
        if (estimatedWeight < threshold) {
            resultEl.textContent = `Estimated weight: ≤${threshold.toFixed(3)} kg`;
        } else {
            resultEl.textContent = `Estimated weight: ≈${estimatedWeight.toFixed(3)} kg`;
        }
    }

    function getPlantBaseMultiplier(plantId) {
        // Calculate the multiplier for weights > threshold
        const sampleWeight = (PLANT_DATA[plantId] || 1) + 1;
        const baseValueAtSample = calculateBaseValueForPlant(plantId, sampleWeight);
        return baseValueAtSample / (sampleWeight * sampleWeight);
    }
    
    function calculateBaseValueForPlant(plantId, weight) {
        const threshold = PLANT_DATA[plantId];
        if (threshold === undefined) return weight * weight; // Default fallback

        switch (plantId) {
            case "easteregg": return weight <= threshold ? 2256 : 277.825 * Math.pow(weight, 2);
            case 'moonflower': return weight <= threshold ? 8574 : 2381 * Math.pow(weight, 2);
            case "starfruit": return weight <= threshold ? 13538 : 1666.6 * Math.pow(weight, 2);
            case 'pepper': return weight <= threshold ? 7220 : 320 * Math.pow(weight, 2);
            case "grape": return weight <= threshold ? 7085 : 872 * Math.pow(weight, 2);
            case "nightshade": return weight <= threshold ? 3159 : 13850 * Math.pow(weight, 2);
            case "mint": return weight <= threshold ? 4738 : 5230 * Math.pow(weight, 2);
            case "glowshroom": return weight <= threshold ? 271 : 532.5 * Math.pow(weight, 2);
            case "bloodbanana": return weight <= threshold ? 5415 : 2670 * Math.pow(weight, 2);
            case "beanstalk": return weight <= threshold ? 25270 : 280 * Math.pow(weight, 2);
            case 'coconut': return weight <= threshold ? 361 : 2.04 * Math.pow(weight, 2);
            case "candyblossom": return weight <= threshold ? 90250 : 11111.11111 * Math.pow(weight, 2);
            case "carrot": return weight <= threshold ? 18 : 275 * Math.pow(weight, 2);
            case "strawberry": return weight <= threshold ? 14 : 175 * Math.pow(weight, 2);
            case "blueberry": return weight <= threshold ? 18 : 500 * Math.pow(weight, 2);
            case "orangetulip": return weight <= threshold ? 767 : 300000 * Math.pow(weight, 2);
            case 'tomato': return weight <= threshold ? 27 : 120 * Math.pow(weight, 2);
            case "daffodil": return weight <= threshold ? 903 : 25000 * Math.pow(weight, 2);
            case "watermelon": return weight <= threshold ? 2708 : 61.25 * Math.pow(weight, 2);
            case "pumpkin": return weight <= threshold ? 3069 : 64 * Math.pow(weight, 2);
            case 'mushroom': return weight <= threshold ? 136278 : 241.6 * Math.pow(weight, 2);
            case "bamboo": return weight <= threshold ? 3610 : 250 * Math.pow(weight, 2);
            case "apple": return weight <= threshold ? 248 : 30.53 * Math.pow(weight, 2);
            case "corn": return weight <= threshold ? 36 : 10 * Math.pow(weight, 2);
            case "cactus": return weight <= threshold ? 3069 : 69.4 * Math.pow(weight, 2);
            case "cranberry": return weight <= threshold ? 1805 : 2000 * Math.pow(weight, 2);
            case 'moonmelon': return weight <= threshold ? 16245 : 281.2 * Math.pow(weight, 2);
            case "pear": return weight <= threshold ? 451 : 55.5 * Math.pow(weight, 2);
            case 'durian': return weight <= threshold ? 4513 : 78.19 * Math.pow(weight, 2);
            case 'peach': return weight <= threshold ? 271 : 75 * Math.pow(weight, 2);
            case "cacao": return weight <= threshold ? 10830 : 187.5 * Math.pow(weight, 2);
            case 'moonglow': return weight <= threshold ? 18050 : 408.45 * Math.pow(weight, 2);
            case "dragonfruit": return weight <= threshold ? 4287 : 32.99 * Math.pow(weight, 2);
            case "mango": return weight <= threshold ? 5866 : 28.89 * Math.pow(weight, 2);
            case "moonblossom": return weight <= threshold ? 54150 : 6666.666 * Math.pow(weight, 2);
            case "raspberry": return weight <= threshold ? 90 : 177.5 * Math.pow(weight, 2);
            case 'eggplant': return weight <= threshold ? 6769 : 300 * Math.pow(weight, 2);
            case "papaya": return weight <= threshold ? 903 : 111.11 * Math.pow(weight, 2);
            case "celestiberry": return weight <= threshold ? 9025 : 2500 * Math.pow(weight, 2);
            case "moonmango": return weight <= threshold ? 45125 : 222.22 * Math.pow(weight, 2);
            case "banana": return weight <= threshold ? 1579 : 777.77 * Math.pow(weight, 2);
            case "passionfruit": return weight <= threshold ? 3204 : 395 * Math.pow(weight, 2);
            case 'soulfruit': return weight <= threshold ? 6994 : 12.4 * Math.pow(weight, 2);
            case "chocolatecarrot": return weight <= threshold ? 9928 : 145096 * Math.pow(weight, 2);
            case "redlolipop": return weight <= threshold ? 45125 : 3125 * Math.pow(weight, 2);
            case "candysunflower": return weight <= threshold ? 72200 : 35413 * Math.pow(weight, 2);
            case "lotus": return weight <= threshold ? 15343 : 42.5 * Math.pow(weight, 2);
            case "pineapple": return weight <= threshold ? 1805 : 222.5 * Math.pow(weight, 2);
            case "hive": return weight <= threshold ? 45125 : 781.5 * Math.pow(weight, 2);
            case 'lilac': return weight <= threshold ? 31588 : 3899 * Math.pow(weight, 2);
            case 'rose': return weight <= threshold ? 4513 : 5000 * Math.pow(weight, 2);
            case "foxglove": return weight <= threshold ? 18050 : 5000 * Math.pow(weight, 2);
            case "purpledahlia": return weight <= threshold ? 67688 : 522 * Math.pow(weight, 2);
            case "sunflower": return weight <= threshold ? 135000 : 551 * Math.pow(weight, 2);
            case "pinklily": return weight <= threshold ? 58663 : 1806.5 * Math.pow(weight, 2);
            case "nectarine": return weight <= threshold ? 35000 : 4440 * Math.pow(weight, 2);
            case "lavender": return weight <= threshold ? 22563 : 361008 * Math.pow(weight, 2);
            case "honeysuckle": return weight <= threshold ? 90250 : 444.4 * Math.pow(weight, 2);
            case "venusflytrap": return weight <= threshold ? 40612 : 450 * Math.pow(weight, 2);
            case "nectarshade": return weight <= threshold ? 45125 : 78500 * Math.pow(weight, 2);
            case "manuka": return weight <= threshold ? 22563 : 270000 * Math.pow(weight, 2);
            case "emberlily": return weight <= threshold ? 50138 : 385.6 * Math.pow(weight, 2);
            case 'dandelion': return weight <= threshold ? 45125 : 3130 * Math.pow(weight, 2);
            case "lumira": return weight <= threshold ? 76713 : 2362.5 * Math.pow(weight, 2);
            default: return weight * weight;
        }
    }
});