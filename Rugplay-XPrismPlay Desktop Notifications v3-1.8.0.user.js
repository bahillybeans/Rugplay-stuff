// ==UserScript==
// @name         Rugplay/XPrismPlay Desktop Notifications v3
// @namespace    http://tampermonkey.net/
// @version      1.8.0
// @description  Notifications in rugplay and xprismplay now show up natively
// @author       Not_Perfect / Hoodclassic
// @match        *://rugplay.com/*
// @match        *://xprismplay.dpdns.org/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        unsafeWindow
// @grant        GM_notification
// @run-at       document_start
// ==/UserScript==

(function() {
    'use strict';

    const baseURL = location.origin.includes("rugplay") ? "https://rugplay.com/" : "https://xprismplay.dpdns.org/"

    const u = (path) => `${baseURL}${path.charAt(0) == "/" ? path.slice(1) : path}`;

    const apiGet = async (URL) => await fetch(`${URL}`, {
        method: "GET"
    }).then(r => r.ok ? r.json() : r.status);

    const OriginalWebSocket = unsafeWindow.WebSocket;
    const cooldowns = new Map();
    const holderCache = new Map();
    const COOLDOWN_MS = 30000;
    const HOLDER_CACHE_MS = 11000;

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {

        let url = args[0];

        if (typeof url === "string" && url.includes("/api/trades/recent")) {

            const v = new URL(url, location.origin);

            if (v.searchParams.get("limit") === "5") { //expand the sidebar to 10 trades
                v.searchParams.set("limit", "10");
            }

            if (v.searchParams.get("limit") === "100") { //add a minimum totalValue of $10 to the live feed
                v.searchParams.set("minValue", "10");
            }

            url = v.toString();
            args[0] = url;


        }

        const res = await originalFetch(...args);

        // filter out trades under $10 that are probably bots
        if (typeof args[0] === "string") {
            const data = await res.clone().json();

            if (args[0].includes("/api/trades")) {
                if (Array.isArray(data)) {
                    const filtered = data.filter(t => t.totalValue >= 10);

                    return new Response(JSON.stringify(filtered), {
                        status: res.status,
                        headers: res.headers
                    });
                }
            }
            if (args[0].includes("/_app/immutable/nodes")) {
                const dataString = JSON.stringify(data);
                data.replace(".creator.name.charAt(0)", ".creator?.name?.charAt(0) ?? \"X\""); // Fix hopium so now it handles the error that is guaranteed to show up
            }
        }
        return res;
    };

    // Change the slice function but only when dealing with the sidebar trades
    const originalSlice = Array.prototype.slice;

    Array.prototype.slice = function(start, end) {
        const tradeFields = ["amount", "coinIcon", "coinName", "coinSymbol", "price", "timestamp", "totalValue", "type", "userId", "userImage", "username"];
        if (this.length && typeof this[0] === "object" && tradeFields.some(item => item in this[0])) {
            if (start == 0 && end == 5) {
                end = 10;
            }
            if (start == 0 && end == 4) {
                end = 9;
            }
        }

        return originalSlice.call(this, start, end);
    };

    let cachedUserId = null;

    const PUMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;

    async function getUserId() {
        if (cachedUserId) return cachedUserId;
        const r = await apiGet(u("__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=10")).catch(() => null);
        if (!r) return null;
        cachedUserId = r.nodes[0].data[r.nodes[0].data[r.nodes[0].data[0].userSession].id];
        return cachedUserId;
    }

    async function isHolder(symbol) {
        const now = Date.now();
        const cached = holderCache.get(symbol);
        if (cached && now - cached.ts < HOLDER_CACHE_MS) return cached.result;

        const userId = await getUserId();
        if (!userId) return false;

        const data = await apiGet(u(`api/coin/${symbol}/holders?limit=100`)).catch(() => null);
        if (!data || !Array.isArray(data.holders)) return false;

        const result = data.holders.some(h => String(h.userId) === String(userId));
        holderCache.set(symbol, { result, ts: now });
        return result;
    }

    function formatAge(ts) {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 60) return 'Just now';
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }

    function normalizeText(s) {
        return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function notificationKey(n) {
        return normalizeText(`${n.title}|${n.message}|${n.link}`);
    }

    function getCache() {
        if (location.origin.includes("rugplay")) {
            return JSON.parse(sessionStorage.getItem('rugplay_notifs') || '[]');
        } else {
            return JSON.parse(sessionStorage.getItem('xprismplay_notifs') || '[]');
        }
    }

    function setCache(cache) {
        if (location.origin.includes("rugplay")) {
            sessionStorage.setItem('rugplay_notifs', JSON.stringify(cache));
        } else {
            sessionStorage.setItem('xprismplay_notifs', JSON.stringify(cache));
        }
    }

    function saveNotification(title, message, link) {
        const cache = getCache();
        const key = notificationKey({ title, message, link });
        if (cache.some(n => notificationKey(n) === key)) return false;
        cache.unshift({ title, message, link, ts: Date.now() });
        if (cache.length > 20) cache.pop();
        setCache(cache);
        return true;
    }

    function buildRow(notif, className) {
        const row = document.createElement('a');
        row.href = notif.link;
        row.setAttribute('data-notif-id', notif.ts);
        row.setAttribute('data-notif-key', notificationKey(notif));
        row.className = className;
        row.innerHTML = `
            <div class="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10">
                ${PUMP_SVG}
            </div>
            <div class="flex-1 space-y-1">
                <p class="text-sm font-medium leading-none" style="display:flex;align-items:center;gap:6px;">
                    ${notif.title}
                    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>
                </p>
                <p class="text-sm text-muted-foreground">${notif.message}</p>
            </div>
            <div class="text-xs text-muted-foreground whitespace-nowrap">${formatAge(notif.ts)}</div>
        `;
        return row;
    }

    function parseRelativeTime(text) {
        if (!text) return 0;
        const t = text.trim().toLowerCase();
        if (t === 'just now') return Date.now();
        const match = t.match(/(\d+)\s*(s|m|h|d)/);
        if (!match) return 0;
        const val = parseInt(match[1]);
        const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        return Date.now() - val * (multipliers[match[2]] || 0);
    }

    function insertInOrder(listContainer, row, ts) {
        const realRows = Array.from(listContainer.querySelectorAll('a[class*="hover:bg-muted"]:not([data-notif-id])'));
        for (const existing of realRows) {
            const timeEl = existing.querySelector('.text-xs.text-muted-foreground');
            const existingTs = parseRelativeTime(timeEl?.textContent);
            if (ts >= existingTs) {
                listContainer.insertBefore(row, existing);
                return;
            }
        }
        listContainer.appendChild(row);
    }

    function findListContainer() {
        const existingRow = document.querySelector('a[class*="hover:bg-muted"]:not([data-notif-id])');
        return existingRow ? existingRow.parentElement : null;
    }

    function rowExists(listContainer, notif) {
        const key = notificationKey(notif);
        if (listContainer.querySelector(`a[data-notif-key="${CSS.escape(key)}"]`)) return true;
        return Array.from(listContainer.querySelectorAll('a[class*="hover:bg-muted"]')).some(row =>
            normalizeText(row.textContent).includes(normalizeText(notif.title)) &&
            normalizeText(row.textContent).includes(normalizeText(notif.message))
        );
    }

    function injectCachedNotifications() {
        if (!location.pathname.startsWith('/notifications')) return;
        const cache = getCache();
        if (cache.length === 0) return;
        const listContainer = findListContainer();
        if (!listContainer) return;
        cache.forEach(notif => {
            if (rowExists(listContainer, notif)) return;
            const row = buildRow(notif, listContainer.querySelector('a[class*="hover:bg-muted"]')?.className || '');
            insertInOrder(listContainer, row, notif.ts);
        });
    }

    unsafeWindow.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
            const ws = new target(...args);

            ws.addEventListener('message', async (eventRaw) => {
                try {
                    const event = JSON.parse(eventRaw.data);
                    const data = event?.data ?? 0;

                    if (event.type === "all-trades" && data.type == "BUY") {
                        const now = Date.now();
                        const lastAlert = cooldowns.get(data.coinSymbol) || 0;
                        if (now - lastAlert < COOLDOWN_MS) return;

                        let baseCurrencyNew = Math.sqrt(data.price * 1e12);
                        let oldPrice = ((baseCurrencyNew - data.totalValue) ** 2) / 1e12;
                        let increase = ((data.price - oldPrice) / oldPrice) * 100;

                        if (increase > 20) {
                            const holding = await isHolder(data.coinSymbol);
                            if (holding) {
                                cooldowns.set(data.coinSymbol, now);

                                const userId = await getUserId();
                                const title = "Coin pumped!";
                                const message = `${data.coinName} (*${data.coinSymbol}) was pumped ${increase.toFixed(1)}% by @${data.username}!`;
                                const link = `/coin/${data.coinSymbol}`;

                                const saved = saveNotification(title, message, link);

                                if (saved || location.pathname.startsWith('/notifications')) {
                                    ws.dispatchEvent(new MessageEvent("message", {
                                        data: JSON.stringify({
                                            type: "notification",
                                            timestamp: new Date().toISOString(),
                                            userId: userId,
                                            notificationType: "TRANSFER",
                                            title: title,
                                            message: message,
                                            link: link
                                        })
                                    }));
                                }
                            }
                        }
                    }
                    if (event.type === "notification") {
                        const notification = (e) => {
                            GM_notification({
                                title: event.title,
                                text: event.message,
                                onclick: function() {
                                    unsafeWindow.focus();

                                    if (document.visibilityState !== "visible") {
                                        unsafeWindow.open(event.notificationType == "RUG_PULL" ? u(event.link) : u("notifications"));
                                    }
                                }
                            });
                        }
                        notification(event);
                    }
                } catch (e) {console.error(e)}
            });

            return ws;
        }
    });

    const observer = new MutationObserver(() => {
        if (location.pathname.startsWith('/notifications')) {
            injectCachedNotifications();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    getUserId();
})();