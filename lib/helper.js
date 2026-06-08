/**
 * Shadow MD - Helper Functions
 */

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatPhone = (phone) => {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
};

const isOwner = (jid, ownerNumber) => {
    return jid === ownerNumber + '@s.whatsapp.net' || 
           jid === ownerNumber + '@c.us';
};

module.exports = { delay, formatPhone, isOwner };
