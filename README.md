# GAGDash Push Notification Server

This is a simple Node.js backend server to enable push notifications for the GAGDash application. It periodically checks the "Grow A Garden" API for stock updates and sends notifications to users who have subscribed to specific items.

## Setup

1.  **Install Dependencies:**
    You need to have [Node.js](https://nodejs.org/) installed. Then, run the following command in your terminal in the project root:
    ```bash
    npm install
    ```

2.  **Generate VAPID Keys:**
    Push notifications require VAPID keys for security. This server uses the `web-push` library. To generate your own unique keys, run:
    ```bash
    npm run generate-vapid-keys
    ```
    This will print a public and private key to your console.

3.  **Configure Keys:**
    Open `server.js` and replace the placeholder VAPID keys with the ones you just generated:

    ```javascript
    const vapidKeys = {
        publicKey: 'REPLACE_WITH_YOUR_PUBLIC_KEY',
        privateKey: 'REPLACE_WITH_YOUR_PRIVATE_KEY',
    };
    ```

    You also need to add the **public key** to `app.js`. Open `app.js` and add this constant at the top:

    ```javascript
    const VAPID_PUBLIC_KEY = 'REPLACE_WITH_YOUR_PUBLIC_KEY';
    ```

4.  **Start the Server:**
    To run the server, use the command:
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3000` by default. You must have this server running for push notifications to work.

## How It Works

*   **`/subscribe` endpoint:** The frontend calls this endpoint to register a user's browser for push notifications. The server stores the subscription object along with the list of items the user is interested in.
*   **Stock Polling:** The server fetches the stock from the GAG API every 5 minutes and 35 seconds.
*   **Notification Dispatch:** It compares the new stock with the last known stock. If an item a user is subscribed to comes back in stock, it sends a push notification to that user's device via their stored subscription.

## Important Notes

*   **In-Memory Storage:** For simplicity, this server stores user subscriptions in memory. This means if you restart the server, all subscriptions will be lost. For a production environment, you should replace the `subscriptions` array with a persistent database (e.g., SQLite, PostgreSQL, MongoDB).
*   **CORS:** The server is configured to allow requests from any origin (`cors`). For production, you should restrict this to only allow requests from your web application's domain for better security.
*   **API Rate Limiting:** The polling interval is set to over 5 minutes to be respectful to the GAG API. Be cautious about decreasing this interval significantly.