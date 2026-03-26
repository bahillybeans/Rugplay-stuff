// ==UserScript==
// @name         Rugplay Desktop Notifications
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Notifications in rugplay now show on the desktop
// @author       Not_Perfect
// @match        *://rugplay.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_notification
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
                            let id = apiGet("https://rugplay.com/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=10").then(r => r.nodes.data[r.nodes.data[r.nodes.data[0].userSession].id]);

                            let fakeNotificationEvent = new MessageEvent("message", {
                                type: "notification",
                                timestamp: new Date().toISOString(),
                                userId: id,
                                notificationType: "TRANSFER",
                                title: "Coin pumped!",
                                message: `A coin you owned, ${data.coinName} (*${data.coinSymbol}), was pumped ${increase}%!`,
                                link: `/coin/${data.coinSymbol}`
                            });

                            ws.dispatchEvent(fakeNotificationEvent);
                        }
                    }

                    if (event.type === "notification" && !(document.visibilityState === "visible")) {
                        const notification = GM_notification({
                            title: event.title,
                            text: event.message,
                            onclick: function() {
                                unsafeWindow.focus();

                                if (document.visibilityState !== "visible") {
                                    unsafeWindow.open(event.notificationType == "RUG_PULL" ? `https://rugplay.com${event.link}` : "https://rugplay.com/notifications");
                                }
                            },
                            timeout: 10000
                        });
                    }
                } catch (e) {
                    console.error(e);
                }
            });

            return ws;
        }
    });

})();