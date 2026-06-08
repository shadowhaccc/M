# 🚀 Railway Deployment Guide

## Step 1: Prepare Your Code

1. Make sure all files are in the root folder:
   - index.js
   - config.js
   - package.json
   - Procfile
   - railway.toml
   - web/ (folder)
   - plugins/ (folder)
   - lib/ (folder)

## Step 2: Upload to GitHub

```bash
git init
git add .
git commit -m "Shadow MD Bot v3.1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shadow-md-bot.git
git push -u origin main
```

## Step 3: Deploy on Railway

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Click "Deploy"

## Step 4: Environment Variables (Optional)

In Railway Dashboard:
1. Go to Variables
2. Add:
   - `PORT` = 3000
   - `OWNER_NUMBER` = your_number

## Step 5: Get Your URL

1. Go to Settings → Domains
2. Copy your Railway URL
3. Use it as your bot's web dashboard!

## ⚠️ Common Issues

### Issue: "tsc: not found"
**Fix:** ✅ Already fixed! No TypeScript build needed.

### Issue: "Cannot find module"
**Fix:** Make sure package.json has all dependencies.

### Issue: "Port already in use"
**Fix:** Use `process.env.PORT` in code. ✅ Already done!

## 📱 How Pair Code Works

1. User visits: `https://your-app.railway.app`
2. Enters phone number
3. Clicks "Request Pairing Code"
4. WhatsApp notification arrives
5. User enters code
6. Bot connects!

## 🔗 Your Channel

Auto-follow channel: https://whatsapp.com/channel/0029Vb6iopUDzgTJuzPCk32V

---

**Need help?** Contact: shadowhacc
