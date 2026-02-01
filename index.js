const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const BOT_TOKEN = "7574513701:AAFRq5CFwjptYGBnXshhd1QsnnPYV198skg";
const CHANNEL_USERNAME = "@reelsaver";
const CHANNEL_LINK = "https://t.me/reelsaver";
const API_BASE_URL = "https://reelapibot.vercel.app/api";

const ADMIN_IDS = [5108111483, 901201588];
const USERS_PER_PAGE = 15;
let MAINTENANCE_MODE = false;
const adminUserPage = {};
const DB_FOLDER = path.join(__dirname, "BotSaveData");
const USER_PROFILE_FILE = path.join(DB_FOLDER, "userpr0fileinf0.json");

if (!fs.existsSync(DB_FOLDER)) fs.mkdirSync(DB_FOLDER);

if (!fs.existsSync(USER_PROFILE_FILE))
  fs.writeFileSync(USER_PROFILE_FILE, JSON.stringify({}, null, 2));
  
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/*const welcomedUsers = new Set();*/

const reactionEmojis = [
    "🔥", "❤️", "😍", "👍", "👏", "😎", "🎉", "💯",
    "😭", "😅", "🥳", "🙌", "👀", "🫶", "🤗", "🤩",
    "😤", "✨", "😇", "🔥", "🔔", "🫡", "🥲", "😐",
    "😬", "😮", "😳", "😈", "👻", "📣", "🥶", "🚀",
    "🎬", "📱", "⚡", "🌟", "💫", "🎊", "🎈", "💥",
    "🤯", "🫠", "🥰", "😘", "🤑", "🤠", "🤭", "🤫",
    "🫨", "😏", "🥴", "🤤", "🫦", "💋", "🍿", "🎪"
];

//const reactionEmojis = ["🔥", "❤️", "😍", "👍", "👏", "😎", "🎉", "💯", "😭", "😅", "🥳", "🙌"];

function getRandomEmoji() {
    return reactionEmojis[Math.floor(Math.random() * reactionEmojis.length)];
}

function detectSource(url) {
    if (/https?:\/\/(www\.)?instagram\.com\/[^\s]+/i.test(url)) return "instagram";
    else if (/https?:\/\/(www\.)?facebook\.com\/[^\s]+/i.test(url)) return "fb";
    else if (/https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|shorts\/|[^\s]+)/i.test(url)) return "youtube";
    else if (/https?:\/\/(www|vt\.)?tiktok\.com\/[^\s]+/i.test(url)) return "tiktok";
    else if (/https?:\/\/(www\.)?(x\.com|twitter\.com)\/[^\s]+/i.test(url)) return "twitter";
    return null;
}

function isPrivateChat(chatId) {
    return chatId > 0;
}
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

function getISTTime() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return d.toISOString().replace("T", " ").split(".")[0] +
    (d.getHours() >= 12 ? " PM" : " AM");
}

function getAllUsers() {
  return JSON.parse(fs.readFileSync(USER_PROFILE_FILE));
}

function saveAllUsers(db) {
  fs.writeFileSync(USER_PROFILE_FILE, JSON.stringify(db, null, 2));
}

function saveUser(user) {
  const db = getAllUsers();
  if (!db[user.id]) {
    db[user.id] = {
      id: user.id,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      username: user.username || null,
      joined_at: getISTTime(),
      last_seen: getISTTime()
    };
  } else {
    db[user.id].last_seen = getISTTime();
  }
  saveAllUsers(db);
}

function isBanned(id) {
  const db = getAllUsers();
  return db[id]?.is_ban === true;
}

async function checkMembership(userId) {
    try {
        const member = await bot.getChatMember(CHANNEL_USERNAME, userId);
        return member.status !== 'left' && member.status !== 'kicked';
    } catch (error) {
        return false;
    }
}

function parseIST(str) {
  return new Date(str.replace(" ", "T")).getTime();
}

function getStats() {
  const users = Object.values(getAllUsers());
  const now = Date.now();
  let active = 0, inactive = 0;

  users.forEach(u => {
    const t = parseIST(u.last_seen);
    if (!isNaN(t) && now - t <= 24 * 60 * 60 * 1000) active++;
    else inactive++;
  });

  return { total: users.length, active, inactive };
}

function cleanInactive(days = 30) {
  const db = getAllUsers();
  const now = Date.now();
  const limit = days * 86400000;
  let removed = 0;

  for (const id in db) {
    const t = parseIST(db[id].last_seen);
    if (!isNaN(t) && now - t > limit) {
      delete db[id];
      removed++;
    }
  }

  saveAllUsers(db);
  return removed;
}

function showUsersPage(chatId, messageId, adminId) {
  const users = Object.values(getAllUsers())
    .sort((a, b) => parseIST(b.last_seen) - parseIST(a.last_seen));

  const page = adminUserPage[adminId] || 0;
  const totalPages = Math.ceil(users.length / USERS_PER_PAGE);

  const start = page * USERS_PER_PAGE;
  const pageUsers = users.slice(start, start + USERS_PER_PAGE);

  let text = `👥 Recent Users (Last ${USERS_PER_PAGE})\n\n`;

  pageUsers.forEach((u, i) => {
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim();
    text +=
`${start + i + 1}. ID: ${u.id}
Name: ${fullName || "N/A"}
Username: ${u.username ? "@" + u.username : "N/A"}

`;
  });

  text += `Page ${page + 1}/${totalPages}`;

  return bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⬅️ Previous", callback_data: "users_prev" },
          { text: "➡️ Next", callback_data: "users_next" }
        ],
        [{ text: "❌ Close", callback_data: "admin_back" }]
      ]
    }
  });
}


///Admin Panel
bot.onText(/\/admin/, (msg) => {
  if (!isAdmin(msg.from.id)) return;

  bot.sendMessage(msg.chat.id,
`⚙️ Admin Control Panel
━━━━━━━━━━━━━━━
🛠 Maintenance : ${MAINTENANCE_MODE ? "🔴 ON" : "🟢 OFF"}
━━━━━━━━━━━━━━━`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: `🛠 Maintenance ${MAINTENANCE_MODE ? "OFF" : "ON"}`, callback_data: "toggle_maintenance" }],
          [{ text: "📊 View Statistics", callback_data: "view_stats" }],
          [{ text: "👥 View Users", callback_data: "view_users" }],
          [{ text: "📤 Export Users (JSON)", callback_data: "export_users" }],
          [{ text: "🧹 Clean Inactive Users", callback_data: "clean_inactive" }],
          [{ text: "🔙 Close", callback_data: "admin_back" }]
        ]
      }
    }
  );
});

/* CALLBACKS */
bot.on("callback_query", (q) => {
  const chatId = q.message.chat.id;
  const adminId = q.from.id;

  if (!isAdmin(adminId)) return;

  if (q.data === "toggle_maintenance") {
    MAINTENANCE_MODE = !MAINTENANCE_MODE;
    return bot.answerCallbackQuery(q.id, { text: "Updated" });
  }

  if (q.data === "view_stats") {
    const s = getStats();
    return bot.sendMessage(chatId,
`📊 Statistics

Total Users: ${s.total}
Active Users: ${s.active}
Inactive Users: ${s.inactive}`);
  }

  if (q.data === "view_users") {
    adminUserPage[adminId] = 0;
    return showUsersPage(chatId, q.message.message_id, adminId);
  }

  if (q.data === "users_next") {
    adminUserPage[adminId]++;
    return showUsersPage(chatId, q.message.message_id, adminId);
  }

  if (q.data === "users_prev") {
    adminUserPage[adminId] = Math.max(0, adminUserPage[adminId] - 1);
    return showUsersPage(chatId, q.message.message_id, adminId);
  }

  if (q.data === "export_users") {
    return bot.sendDocument(chatId, USER_PROFILE_FILE);
  }

  if (q.data === "clean_inactive") {
    const removed = cleanInactive(30);
    return bot.sendMessage(chatId, `🧹 Removed ${removed} inactive users`);
  }

  if (q.data === "admin_back") {
    return bot.deleteMessage(chatId, q.message.message_id);
  }
});

//start jandler
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;

    try {
        const isMember = await checkMembership(userId);

        if (!isMember) {
            const keyboard = {
                inline_keyboard: [
                    [{ text: "Join Here", url: CHANNEL_LINK }]
                ]
            };

            await bot.sendMessage(
                chatId,
                `Hello ${firstName},\n\nYou need to join @reelsaver to use this bot. Please join and try again. 😇`,
                { reply_markup: JSON.stringify(keyboard) }
            );
        } else {
            /*
            if (!welcomedUsers.has(userId)) {
                await bot.sendMessage(
                    chatId,
                    `Hello ${firstName},\n\nThank you for joining the channel!\n\nNow You're Ready To Use The Bot.\n\nJust send a valid Instagram, Facebook, YouTube, TikTok, or Twitter reel link and I'll get to work! 😊\n\nHappy Detecting! 🕵️‍♂️`
                );
                welcomedUsers.add(userId);
            }
            */

            await bot.sendMessage(
                chatId,
                `Hello ${firstName},\n\n📥 Send any Instagram, Facebook, YouTube, TikTok, or Twitter reel link to download it fast and free—no watermark! 😊`
            );
        }
    } catch (error) {
        await bot.sendMessage(
            chatId,
            "There was an error checking your membership. Please try again later."
        );
    }
});

//Text handle 
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    const messageId = msg.message_id;
    const isPrivate = isPrivateChat(chatId);

    if (msg.from.is_bot) return;
    if (!text || text.startsWith('/')) return;

    const isReelLink =
        /https?:\/\/(www\.)?(instagram|facebook|youtube|tiktok|x|twitter)\.com\/[^\s]+/i.test(text) ||
        /https?:\/\/(youtu\.be)\/[^\s]+/i.test(text) ||
        /https?:\/\/(vt\.|m\.)?tiktok\.com\/[^\s]+/i.test(text);

    if (!isReelLink) {
        if (isPrivate) {
            await bot.sendMessage(
                chatId,
                "❌ Please send only Instagram, Facebook, YouTube, TikTok, or Twitter links!"
            );
        }
        return;
    }

    const source = detectSource(text.trim());
    if (!source) return;

    try {
        const isMember = await checkMembership(userId);

        if (!isMember) {
            const keyboard = {
                inline_keyboard: [[{ text: "Join Here", url: CHANNEL_LINK }]]
            };

            await bot.sendMessage(
                chatId,
                `You need to join ${CHANNEL_USERNAME} to use this bot. Please join and try again. 😇`,
                { reply_markup: JSON.stringify(keyboard) }
            );
            return;
        }

        let waitingMsg = null;

        try {
        
            waitingMsg = await bot.sendMessage(
                chatId,
                "Processing your request, please wait.... ⏳"
            );
           await bot.sendMessage(
           chatId,
           getRandomEmoji(),
           {reply_to_message_id: msg.message_id });
        } catch {}

        await bot.sendChatAction(chatId, 'typing');

        try {
            const apiUrl = `${API_BASE_URL}?type=${source}&url=${encodeURIComponent(text.trim())}`;
            // console.log('API URL:', apiUrl);

            const response = await axios.get(apiUrl);
            // console.log('API Status:', response.status);

            if (waitingMsg?.message_id) {
                await bot.deleteMessage(chatId, waitingMsg.message_id);
            }

            if (response.status !== 200) {
                await bot.sendMessage(
                    chatId,
                    "Request failed. ❌ Make sure the account is public or Please Try Again."
                );
                return;
            }

            const videoInfo = response.data;
            const data = videoInfo.data || {};
            const videoUrl = data.video_url;
            const thumbnail = data.thumbnail;
            const rawDescription = data.caption || "";
            let description = rawDescription.replace(/\\n/g, "\n");

            const botTag = "\n\n@allreeldownloader_bot";

            if (!description || description.trim() === "") {
                description = "Video Downloaded Successfully!" + botTag;
            } else {
                description += botTag;
            }

            // console.log('Video URL Present:', !!videoUrl);
            // console.log('Description Length:', description.length);
            // console.log('Thumbnail Present:', !!thumbnail);

            if (videoUrl) {
                await bot.sendChatAction(chatId, 'upload_video');

                if (description.length > 1000) {
                    const part1 = description.substring(0, 1000);
                    const part2 = description.substring(1000);

                    const sentVideo = await bot.sendVideo(chatId, videoUrl, {
                        caption: part1
                    });

                    await bot.sendMessage(chatId, part2, {
                        reply_to_message_id: sentVideo.message_id
                    });
                } else {
                    await bot.sendVideo(chatId, videoUrl, {
                        caption: description
                    });
                }

                // ✅ Download complete message (COMMENTED – keep for future)
                /*
                if (isPrivate) {
                    await bot.sendMessage(chatId, "✅ Download Complete! 🎉", {
                        reply_to_message_id: messageId
                    });
                }
                */

            } else {
                let messageContent = "⚠️ Video could not be downloaded\n\n";

                if (thumbnail && description) {
                    await bot.sendPhoto(chatId, thumbnail, {
                        caption: messageContent + description
                    });
                } else if (description) {
                    await bot.sendMessage(chatId, messageContent + description);
                } else {
                    await bot.sendMessage(
                        chatId,
                        "❌ Could not download the video. Please try another link."
                    );
                }
            }

        } catch (apiError) {
            // console.log('API Error:', apiError.message);

            if (waitingMsg?.message_id) {
                await bot.deleteMessage(chatId, waitingMsg.message_id);
            }

            await bot.sendMessage(
                chatId,
                "Sorry, I couldn't fetch the video. Please try again later."
            );
        }

    } catch (error) {
        await bot.sendMessage(
            chatId,
            "There was an error checking your membership. Please try again later."
        );
    }
});

bot.on(['photo', 'video', 'document', 'sticker', 'voice'], async (msg) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;

    if (isPrivateChat(chatId)) {
        await bot.sendMessage(
            chatId,
            "📥 Please send me a reel link from Instagram, Facebook, YouTube, TikTok, or Twitter to download it! 😊",
            { reply_to_message_id: messageId }
        );
    }
});

bot.on('polling_error', (error) => {
    console.log('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.log('Bot error:', error.message);
});

console.log('🤖 Bot is started...');
