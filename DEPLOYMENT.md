# Bot Messenger Deployment

## Environment Variables
Cần set các biến môi trường:

```bash
# Facebook bot credentials
APPSTATE_EMAIL=your_email
APPSTATE_PASSWORD=your_password

# Optional video config
VD_MAX_BUFFER=5
VD_BASE_INTERVAL=18000
VD_INTERVAL_JITTER=5000
```

## Deploy trên Railway
1. Connect GitHub repo
2. Set environment variables
3. Deploy tự động

## Deploy trên Render
1. Connect repo từ GitHub  
2. Build command: `npm install`
3. Start command: `npm start`

## Keep-alive (cho free hosting)
Bot sẽ tự restart nếu crash nhờ logic trong index.js
