/**
 * Shadow MD Bot - Configuration
 * Edit this file easily
 */

module.exports = {
    // Bot Info
    botName: 'Shadow MD',
    version: 'v3.1',
    owner: '923001234567',  // CHANGE THIS TO YOUR NUMBER
    prefix: '.',

    // Session
    sessionName: 'shadow-session',

    // Admin Panel Password
    adminPassword: 'shadowadmin2026',

    // Server Port (Railway auto-sets this)
    port: process.env.PORT || 3000,

    // Auto Channel Follow - When bot connects, auto follow this channel
    autoChannelFollow: true,
    channelLink: 'https://whatsapp.com/channel/0029Vb6iopUDzgTJuzPCk32V',

    // Auto Features
    autoStatusView: true,   // Auto view statuses
    autoReply: true,        // Auto reply to messages
    antiCall: true,         // Reject calls
    autoReact: true,        // React to commands

    // Maintenance Mode
    maintenance: false,

    // Lists
    premiumUsers: [],
    blockedUsers: []
};
