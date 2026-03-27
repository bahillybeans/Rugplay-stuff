// ==UserScript==
// @name         Rugplay Desktop Notifications
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Notifications in rugplay now show on the desktop
// @author       Not_Perfect
// @match        *://rugplay.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        unsafeWindow
// @run-at       document_start
// ==/UserScript==

(function() {
    'use strict';

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const apiPost = async (URL, b) => await fetch(`${URL}`, {
            method: "POST",
            body: JSON.stringify(b)
        }).then(r => r.ok ? r.json() : r.status);

    const apiGet = async (URL) => await fetch(`${URL}`, {
            method: "GET"
        }).then(r => r.ok ? r.json() : r.status);

    const OriginalWebSocket = unsafeWindow.WebSocket;

    function injectToast(title, message, link) {
        const toaster = document.querySelector('ol[data-sonner-toaster="true"]');
        if (!toaster) return;
        const li = document.createElement('li');
        li.setAttribute('data-sonner-toast', '');
        li.setAttribute('data-styled', 'true');
        li.setAttribute('data-mounted', 'true');
        li.setAttribute('data-visible', 'true');
        li.setAttribute('data-type', 'default');
        li.setAttribute('data-dismissible', 'true');
        li.setAttribute('data-removed', 'false');
        li.setAttribute('data-promise', 'false');
        li.setAttribute('data-index', '0');
        li.setAttribute('data-front', 'true');
        li.setAttribute('data-y-position', 'bottom');
        li.setAttribute('data-x-position', 'right');
        li.style.cssText = '--index:0;--toasts-before:0;--z-index:9999;--offset:0px;';
        li.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:14px;background:var(--popover);border:1px solid var(--border);border-radius:8px;color:var(--popover-foreground);font-size:13px;min-width:300px;"><span style="font-size:18px;">🚀</span><div style="flex:1"><strong>${title}</strong><div style="font-size:11px;color:#aaa;margin-top:2px;">${message}</div></div><a href="${link}" style="font-size:11px;color:#6c35de;text-decoration:none;font-weight:600;">View →</a></div>`;
        toaster.prepend(li);
        setTimeout(() => { li.setAttribute('data-removed', 'true'); setTimeout(() => li.remove(), 400); }, 6000);
    }

    function injectNotificationRow(title, message, link) {
        if (!location.pathname.startsWith('/notifications')) return;
        const list = document.querySelector('main ul') || document.querySelector('main ol');
        if (!list) return;
        const row = document.createElement('li');
        row.style.cssText = 'list-style:none;border-bottom:1px solid var(--border)';
        row.innerHTML = `<a href="${link}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;text-decoration:none;color:var(--foreground);"><span style="font-size:20px;">🚀</span><div style="flex:1"><strong>${title}</strong><div style="font-size:12px;color:#aaa;">${message}</div></div><span style="font-size:11px;color:#aaa;">just now</span></a>`;
        list.prepend(row);
    }

    function incrementBadge() {
        const badge = document.querySelector('[data-notification-count]') ||
                      document.querySelector('.notification-badge') ||
                      document.querySelector('nav [class*="badge"]') ||
                      document.querySelector('nav [class*="count"]');
        if (badge) {
            const current = parseInt(badge.textContent?.trim()) || 0;
            badge.textContent = current + 1;
            badge.style.display = 'block';
        }
    }

    async function getHoldings() {
        let data = await apiGet("https://rugplay.com/api/portfolio/total");
        return data.coinHoldings;
    }

    unsafeWindow.WebSocket = new Proxy(OriginalWebSocket, {
        construct(target, args) {
            const ws = new target(...args);

            ws.addEventListener('message', (eventRaw) => {
                try {
                    const event = JSON.parse(eventRaw.data);
                    const data = event?.data ?? 0;
                    console.log(event); //                     ERROR: this is null for some reason for the fake notification that should be dispatched

                    if (event.type === "all-trades" && data.type == "BUY") {
                        let baseCurrencyNew = Math.sqrt(data.price * 1e12);
                        let oldPrice = ((baseCurrencyNew - data.totalValue) ** 2) / 1e12;
                        let increase = ((data.price - oldPrice) / oldPrice) * 100;
                        console.log(increase);
                        if (increase > 20) {// && getHoldings().some(item => item.symbol == data.coinSymbol)) {
                            let id = apiGet("https://rugplay.com/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=10").then(r => r.nodes[0].data[r.nodes[0].data[r.nodes[0].data[0].userSession].id]);

                            let fakeNotificationEvent = new MessageEvent("message", {
                                data: JSON.stringify({
                                    type: "notification",
                                    timestamp: new Date().toISOString(),
                                    userId: id,
                                    notificationType: "TRANSFER",
                                    title: "Coin pumped!",
                                    message: `A coin you owned, ${data.coinName} (*${data.coinSymbol}), was pumped ${increase.toFixed(1)}%!`,
                                    link: `/coin/${data.coinSymbol}`
                                })
                            });

                            ws.dispatchEvent(fakeNotificationEvent);
                        }
                    }

                    if (event.type === "notification") {
                        injectToast(event.title, event.message, event.link);
                        injectNotificationRow(event.title, event.message, event.link);
                        incrementBadge();

                        const notification = (e) => {};
                        notification(event);
                    }
                } catch (e) {
                    console.error(e);
                }
            });

            return ws;
        }
    });

})();