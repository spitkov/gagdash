const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(bodyParser.json());

const vapidKeys = {
    publicKey: 'BNhKADCSD_OgvkSN6Ae2MvKV1jPDtGRcrwBwGUoXj3LWPfaRXNsDQOpWIl1el5n4zSXWFCttLMLxdIZopg0J6Vw',
    privateKey: 'PEM2q1tpNBPmVlrr8HDJSm_sgiGhiAZaung50Iys8Nw',
};

webpush.setVapidDetails(
    'mailto:your-email@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

let subscriptions = [];
let lastStockData = new Map();

const STOCK_API_URL = 'https://growagardenapi.vercel.app/api/stock/GetStock';
const CHECK_INTERVAL = (5 * 60 + 35) * 1000;

app.post('/subscribe', (req, res) => {
    const { subscription, interests } = req.body;
    
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Invalid subscription object provided.' });
    }

    const existingSubIndex = subscriptions.findIndex(sub => sub.endpoint === subscription.endpoint);

    if (existingSubIndex !== -1) {
        subscriptions[existingSubIndex].interests = new Set(interests || []);
        console.log('Subscription interests updated for:', subscription.endpoint);
    } else {
        const newSub = { ...subscription, interests: new Set(interests || []) };
        subscriptions.push(newSub);
        console.log('New subscription added:', subscription.endpoint);
    }

    res.status(201).json({ message: 'Subscription accepted.' });
});

async function checkStockAndNotify() {
    console.log(`[${new Date().toISOString()}] Checking for stock updates...`);
    try {
        const response = await fetch(STOCK_API_URL);
        if (!response.ok) {
            console.error(`Failed to fetch stock API. Status: ${response.status} ${response.statusText}`);
            return;
        }
        const rawData = await response.json();
        const currentStock = processStockData(rawData);

        if (lastStockData.size === 0) {
            console.log('Initial stock data loaded. No notifications will be sent on this run.');
            lastStockData = currentStock;
            return;
        }
        
        const newItems = findNewItems(lastStockData, currentStock);

        if (newItems.length > 0) {
            console.log('New items found in stock:', newItems.map(item => item.name));
            await notifySubscribers(newItems);
        } else {
            console.log('No new items found.');
        }

        lastStockData = currentStock;

    } catch (error) {
        console.error('An error occurred during the stock check process:', error);
    }
}

function processStockData(rawData) {
    const allItemsMap = new Map();
    for (const key in rawData) {
        if (Array.isArray(rawData[key])) {
            rawData[key].forEach(item => {
                 if (item.name && typeof item.value !== 'undefined' && item.value > 0) {
                    const cleanName = item.name.toLowerCase().replace(/\s+/g, '');
                    if (!allItemsMap.has(cleanName)) {
                        allItemsMap.set(cleanName, {
                            name: item.name,
                            quantity: item.value,
                            image: item.image,
                        });
                    }
                }
            });
        }
    }
    return allItemsMap;
}

function findNewItems(oldStock, newStock) {
    const newItemsList = [];
    newStock.forEach((item, cleanName) => {
        if (!oldStock.has(cleanName)) {
            newItemsList.push(item);
        }
    });
    return newItemsList;
}

async function notifySubscribers(newItems) {
    const invalidSubscriptions = new Set();

    for (const sub of subscriptions) {
        const itemsToSend = newItems.filter(item => sub.interests.has(item.name));
        
        if (itemsToSend.length > 0) {
            console.log(`Notifying ${sub.endpoint.slice(0, 50)}... about: ${itemsToSend.map(i => i.name).join(', ')}`);
            
            const payload = JSON.stringify({
                title: `${itemsToSend.length > 1 ? itemsToSend.length + ' of your items are' : itemsToSend[0].name + ' is'} in stock!`,
                body: itemsToSend.map(item => item.name).join(', '),
                icon: 'https://i.postimg.cc/FsY5s1yV/gardening-tools.png'
            });

            try {
                await webpush.sendNotification(sub, payload);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    console.log('Subscription expired or invalid, marking for removal:', sub.endpoint.slice(0, 50) + '...');
                    invalidSubscriptions.add(sub.endpoint);
                } else {
                    console.error('Error sending notification:', error.message);
                }
            }
        }
    }

    if (invalidSubscriptions.size > 0) {
        subscriptions = subscriptions.filter(sub => !invalidSubscriptions.has(sub.endpoint));
        console.log(`Removed ${invalidSubscriptions.size} expired subscriptions.`);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Push server listening on port ${PORT}`);
    checkStockAndNotify();
    setInterval(checkStockAndNotify, CHECK_INTERVAL);
});