/**
 * 🌑 SHADOW MD BOT v3.1 🌑
 * Powered by ShadowBaileys
 * Railway Deploy Ready
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

// ==================== CONFIG ====================
const config = {
    botName: 'Shadow MD',
    version: 'v3.1',
    owner: '923001234567',
    prefix: '.',
    sessionName: 'shadow-session',
    autoChannelFollow: true,
    channelLink: 'https://whatsapp.com/channel/0029Vb6iopUDzgTJuzPCk32V',
    port: process.env.PORT || 3000,
    pairCodeEnabled: true,
    autoStatusView: true,
    autoReply: true,
    antiCall: true,
    autoReact: true,
    maintenance: false,
    premiumUsers: [],
    blockedUsers: []
};

const logger = pino({ level: 'silent' });

// ==================== GLOBAL STATE ====================
let sock = null;
let qrCode = null;
let pairingCode = null;
let connectionState = 'disconnected';
let botInfo = {};
let messageCount = 0;
let startTime = Date.now();
let pairingSocket = null; // Separate socket for pairing

// ==================== EXPRESS APP ====================
const app = express();
const server = createServer(app);
const io = new Server(server, { 
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        state: connectionState,
        uptime: Date.now() - startTime 
    });
});

// ==================== AUTH STATE ====================
async function getAuthState(sessionName) {
    const sessionPath = path.join(__dirname, 'session');
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }
    return await useMultiFileAuthState(path.join(sessionPath, sessionName));
}

// ==================== MAIN BOT CONNECTION ====================
async function connectMainBot() {
    try {
        const { state, saveCreds } = await getAuthState(config.sessionName);
        const { version } = await fetchLatestBaileysVersion();

        console.log('🔄 Connecting main bot...');

        sock = makeWASocket({
            version,
            logger,
            printQRInTerminal: true,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            browser: Browsers.macOS('Safari'),
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            keepAliveIntervalMs: 30000
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                qrCode = qr;
                connectionState = 'qr';
                io.emit('qr', qr);
                console.log('📱 QR Code generated for main bot');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Main bot disconnected:', lastDisconnect?.error?.message);
                connectionState = 'disconnected';
                io.emit('disconnected');

                if (shouldReconnect) {
                    console.log('🔄 Reconnecting main bot in 5s...');
                    setTimeout(() => connectMainBot(), 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Main bot connected!');
                connectionState = 'connected';
                qrCode = null;

                botInfo = {
                    name: sock.user.name,
                    id: sock.user.id,
                    connectedAt: new Date().toISOString()
                };

                io.emit('connected', botInfo);
                await autoChannelFollow();
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.message || msg.key.fromMe) return;

            messageCount++;

            if (config.autoStatusView && msg.key.remoteJid === 'status@broadcast') {
                await sock.readMessages([msg.key]);
            }

            await handleCommand(msg);
        });

        sock.ev.on('call', async (call) => {
            if (config.antiCall) {
                for (const c of call) {
                    if (c.status === 'offer') {
                        await sock.rejectCall(c.id, c.from);
                        await sock.sendMessage(c.from, { 
                            text: '❌ *Shadow MD Auto-Reject*\n\nI do not accept calls. Please send a message instead.' 
                        });
                    }
                }
            }
        });

        return sock;
    } catch (err) {
        console.error('❌ Main bot error:', err.message);
        setTimeout(() => connectMainBot(), 10000);
    }
}

// ==================== PAIRING CODE HANDLER (SEPARATE) ====================
async function generatePairingCode(phoneNumber) {
    return new Promise(async (resolve, reject) => {
        try {
            // Clean phone number
            let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
            if (!cleanPhone.startsWith('+')) cleanPhone = '+' + cleanPhone;

            const pairSessionName = 'pair-' + Date.now();
            const { state, saveCreds } = await getAuthState(pairSessionName);
            const { version } = await fetchLatestBaileysVersion();

            console.log('🔑 Creating pairing socket for:', cleanPhone);

            // Create temporary socket for pairing
            const pairSock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                browser: Browsers.macOS('Safari'),
                keepAliveIntervalMs: 30000,
                pairingCode: true,
                phoneNumber: cleanPhone
            });

            let codeGenerated = false;
            let connectionTimeout;

            // Set timeout
            connectionTimeout = setTimeout(() => {
                if (!codeGenerated) {
                    pairSock.end();
                    reject(new Error('Pairing code generation timeout'));
                }
            }, 30000);

            pairSock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    const statusCode = lastDisconnect?.error?.output?.statusCode;

                    if (statusCode === DisconnectReason.loggedOut) {
                        reject(new Error('Phone number not registered on WhatsApp'));
                    } else if (!codeGenerated) {
                        reject(new Error('Connection closed before code generation'));
                    }
                } else if (connection === 'open') {
                    clearTimeout(connectionTimeout);
                    console.log('✅ Pairing successful!');

                    // Move session to main
                    const pairPath = path.join(__dirname, 'session', pairSessionName);
                    const mainPath = path.join(__dirname, 'session', config.sessionName);

                    // Copy credentials
                    if (fs.existsSync(pairPath)) {
                        // Clean old main session
                        if (fs.existsSync(mainPath)) {
                            fs.rmSync(mainPath, { recursive: true });
                        }
                        fs.renameSync(pairPath, mainPath);
                    }

                    pairSock.end();

                    // Restart main bot with new session
                    if (sock) {
                        try { sock.end(); } catch(e) {}
                    }
                    await connectMainBot();

                    resolve({ success: true, connected: true });
                }
            });

            pairSock.ev.on('creds.update', saveCreds);

            // Request pairing code
            if (!pairSock.authState.creds.registered) {
                try {
                    const code = await pairSock.requestPairingCode(cleanPhone);
                    codeGenerated = true;
                    console.log('✅ Pairing Code generated:', code);

                    resolve({ 
                        success: true, 
                        code: code,
                        phone: cleanPhone,
                        message: 'Check WhatsApp for linking notification'
                    });
                } catch (err) {
                    clearTimeout(connectionTimeout);
                    pairSock.end();
                    reject(new Error('Failed to generate pairing code: ' + err.message));
                }
            }

        } catch (err) {
            reject(new Error('Pairing setup failed: ' + err.message));
        }
    });
}

// ==================== AUTO CHANNEL FOLLOW ====================
async function autoChannelFollow() {
    if (!config.autoChannelFollow || !config.channelLink || !sock) return;

    try {
        const channelId = config.channelLink.split('/').pop();
        console.log('📢 Auto channel follow:', channelId);

        // Send notification to owner
        const ownerJid = config.owner + '@s.whatsapp.net';
        await sock.sendMessage(ownerJid, {
            text: `✅ *Shadow MD Connected!*\n\n🤖 Bot is now online!\n📢 Channel: ${config.channelLink}\n⏰ ${new Date().toLocaleString()}`
        });
    } catch (err) {
        console.log('⚠️ Channel follow error:', err.message);
    }
}

// ==================== COMMANDS ====================
async function handleCommand(msg) {
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    if (!text.startsWith(config.prefix)) return;

    const args = text.slice(config.prefix.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const pushName = msg.pushName || 'User';

    if (config.maintenance && !isOwner(sender)) {
        return await sock.sendMessage(from, { 
            text: '🔧 *Maintenance Mode*\n\nBot is under maintenance.' 
        });
    }

    if (config.blockedUsers.includes(sender)) return;

    if (config.autoReact) {
        await sock.sendMessage(from, { react: { text: '⚡', key: msg.key } });
    }

    switch (cmd) {
        case 'menu':
        case 'help':
            await sendMenu(from, pushName);
            break;
        case 'ping':
            await sock.sendMessage(from, { text: '⚡ *Pong!*' });
            break;
        case 'owner':
            await sock.sendMessage(from, { 
                text: `👤 *Owner:* ${config.owner}\n🤖 *Bot:* ${config.botName} ${config.version}` 
            });
            break;
        case 'info':
            await sendBotInfo(from);
            break;
        case 'channel':
            await sock.sendMessage(from, { 
                text: `📢 *Join Our Channel*\n\n${config.channelLink}` 
            });
            break;
        case 'vv':
            await handleVV(msg, from);
            break;
        case 'hack':
            await handleHack(from, args);
            break;
        case 'bomb':
            await handleBomb(from);
            break;
        case 'spam':
            await handleSpam(from, args, sender);
            break;
        case 'ban':
            await handleBan(from, args, sender);
            break;
        case 'unban':
            await handleUnban(from, args, sender);
            break;
        case 'autostatus':
            config.autoStatusView = !config.autoStatusView;
            await sock.sendMessage(from, { 
                text: `👁️ Auto Status: ${config.autoStatusView ? '✅ ON' : '❌ OFF'}` 
            });
            break;
        case 'autoreply':
            config.autoReply = !config.autoReply;
            await sock.sendMessage(from, { 
                text: `💬 Auto Reply: ${config.autoReply ? '✅ ON' : '❌ OFF'}` 
            });
            break;
        case 'anticalls':
            config.antiCall = !config.antiCall;
            await sock.sendMessage(from, { 
                text: `📵 Anti Call: ${config.antiCall ? '✅ ON' : '❌ OFF'}` 
            });
            break;
        case 'autoreact':
            config.autoReact = !config.autoReact;
            await sock.sendMessage(from, { 
                text: `😀 Auto React: ${config.autoReact ? '✅ ON' : '❌ OFF'}` 
            });
            break;
        default:
            await loadPlugin(cmd, from, args, msg);
    }
}

async function sendMenu(to, name) {
    const menu = `
🌑 *SHADOW MD BOT* 🌑
*Version:* ${config.version}

👋 *Hello ${name}!*

📋 *MAIN COMMANDS*
${config.prefix}menu - Show this menu
${config.prefix}ping - Check bot speed
${config.prefix}owner - Contact owner
${config.prefix}info - Bot information
${config.prefix}channel - Our channel

👁️ *AUTO FEATURES*
${config.prefix}autostatus - Toggle auto status view
${config.prefix}autoreply - Toggle auto reply
${config.prefix}anticalls - Toggle anti call
${config.prefix}autoreact - Toggle auto react

⚡ *FUN COMMANDS*
${config.prefix}hack - Fake hack effect
${config.prefix}bomb - Fake bomb effect
${config.prefix}spam - Spam messages
${config.prefix}ban - Ban user
${config.prefix}unban - Unban user

💎 *Powered by ShadowBaileys*
`;
    await sock.sendMessage(to, { text: menu });
}

async function sendBotInfo(to) {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);

    const info = `
🌑 *SHADOW MD BOT INFO* 🌑

🤖 *Name:* ${config.botName}
📌 *Version:* ${config.version}
👤 *Owner:* ${config.owner}
⏱️ *Uptime:* ${hours}h ${mins}m
📨 *Messages:* ${messageCount}
📊 *Status:* ${connectionState.toUpperCase()}

🔗 *Channel:* ${config.channelLink}

💎 *Powered by ShadowBaileys*
`;
    await sock.sendMessage(to, { text: info });
}

async function handleVV(msg, to) {
    try {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            return await sock.sendMessage(to, { text: '❌ Reply to a view-once message!' });
        }
        const type = Object.keys(quoted)[0];
        await sock.sendMessage(to, { [type.replace('Message', '')]: quoted[type] });
    } catch (e) {
        await sock.sendMessage(to, { text: '❌ Failed: ' + e.message });
    }
}

async function handleHack(to, args) {
    const target = args[0] || 'Target';
    const stages = [
        '💀 *SHADOW HACK INITIATED* 💀',
        '🔍 Scanning target...',
        '🔓 Bypassing firewall...',
        '📡 Accessing mainframe...',
        '💾 Downloading data...',
        '✅ *HACK COMPLETE*',
        '',
        `🎯 Target: ${target}`,
        '🤡 _This is just a prank!_ 😄'
    ];

    for (const stage of stages) {
        if (stage) await sock.sendMessage(to, { text: stage });
        await delay(600);
    }
}

async function handleBomb(to) {
    const msgs = ['💣 *BOMB PLANTED* 💣', '💣 3...', '💣💣 2...', '💣💣💣 1...', '💥💥💥 *BOOM!* 💥💥💥', '🤡 _Just kidding!_ 😄'];
    for (const m of msgs) {
        await sock.sendMessage(to, { text: m });
        await delay(800);
    }
}

async function handleSpam(to, args, sender) {
    if (!isOwner(sender)) return await sock.sendMessage(to, { text: '❌ Owner only!' });
    const count = Math.min(parseInt(args[0]) || 5, 50);
    const text = args.slice(1).join(' ') || 'Shadow MD!';
    for (let i = 0; i < count; i++) {
        await sock.sendMessage(to, { text: `${text} (${i + 1})` });
        await delay(500);
    }
}

async function handleBan(to, args, sender) {
    if (!isOwner(sender)) return await sock.sendMessage(to, { text: '❌ Owner only!' });
    const user = args[0];
    if (!user) return await sock.sendMessage(to, { text: '❌ Provide user number!' });
    config.blockedUsers.push(user + '@s.whatsapp.net');
    await sock.sendMessage(to, { text: `🚫 Banned: ${user}` });
}

async function handleUnban(to, args, sender) {
    if (!isOwner(sender)) return await sock.sendMessage(to, { text: '❌ Owner only!' });
    const user = args[0];
    if (!user) return await sock.sendMessage(to, { text: '❌ Provide user number!' });
    config.blockedUsers = config.blockedUsers.filter(u => u !== user + '@s.whatsapp.net');
    await sock.sendMessage(to, { text: `✅ Unbanned: ${user}` });
}

function isOwner(jid) {
    return jid === config.owner + '@s.whatsapp.net' || jid === config.owner + '@c.us';
}

async function loadPlugin(cmd, to, args, msg) {
    try {
        const pluginPath = path.join(__dirname, 'plugins', `${cmd}.js`);
        if (fs.existsSync(pluginPath)) {
            const plugin = require(pluginPath);
            if (plugin.run) await plugin.run(sock, to, args, msg);
        }
    } catch (e) {
        console.log('Plugin error:', e.message);
    }
}

// ==================== API ROUTES ====================
app.get('/api/status', (req, res) => {
    res.json({
        status: connectionState,
        bot: botInfo,
        uptime: Date.now() - startTime,
        messages: messageCount,
        config: {
            botName: config.botName,
            version: config.version,
            autoStatusView: config.autoStatusView,
            autoReply: config.autoReply,
            antiCall: config.antiCall,
            autoReact: config.autoReact,
            maintenance: config.maintenance
        }
    });
});

// FIXED: Proper pairing code endpoint
app.post('/api/pair-code', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    try {
        console.log('📱 Pair code request for:', phone);
        const result = await generatePairingCode(phone);
        res.json(result);
    } catch (e) {
        console.error('❌ Pair code error:', e.message);
        res.status(500).json({ 
            error: e.message || 'Failed to generate pairing code',
            detail: 'Please check your phone number and try again'
        });
    }
});

app.get('/api/qr', (req, res) => {
    res.json({ qr: qrCode, state: connectionState, pairingCode });
});

// ==================== START SERVER ====================
server.listen(config.port, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════╗
║                                          ║
║     🌑 SHADOW MD BOT v3.1 🌑            ║
║                                          ║
║     Railway Deploy Ready                 ║
║                                          ║
╠══════════════════════════════════════════╣
║  Port:     ${config.port.toString().padEnd(33)}║
╚══════════════════════════════════════════╝
    `);
});

// Start main bot
connectMainBot().catch(err => {
    console.log('Initial connection failed, will retry...');
});

module.exports = { app };
