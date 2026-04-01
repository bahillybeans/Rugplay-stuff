// ==UserScript==
// @name         Rugplay QOL
// @namespace    http://tampermonkey.net/
// @version      2026-03-11
// @description  Rugplay tool that changes the number of trades on the sidebar from 5 to 10 and makes the live trades not show anything below $10 to hide bots. Also modifies the coinflip and slots in the arcade so you can play much faster. If I can think of anything else that can easily be converted from chrome overrides to tampermonkey i will put it in
// @author       Not_Perfect
// @match        *://rugplay.com/*
// @icon         https://rugplay.com/rugplay.svg
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {

    const originalFetch = window.fetch;

    window.fetch = async function (...args) {

        let url = args[0];

        //console.log(args[0]);

        if (typeof url === "string" && url.includes("/api/trades/recent")) {

            const u = new URL(url, location.origin);

            if (u.searchParams.get("limit") === "5") { //expand the sidebar to 10 trades
                u.searchParams.set("limit", "10");
            }

            if (u.searchParams.get("limit") === "100") { //add a minimum totalValue of $10 to the live feed
                u.searchParams.set("minValue", "10");
            }

            url = u.toString();
            args[0] = url;


        }

        const res = await originalFetch(...args);

        // filter out trades under $10 that are probably bots
        if (typeof args[0] === "string" && args[0].includes("/api/trades")) {

            const data = await res.clone().json();

            if (Array.isArray(data)) {
                const filtered = data.filter(t => t.totalValue >= 10);

                return new Response(JSON.stringify(filtered), {
                    status: res.status,
                    headers: res.headers
                });
            }
        }

        return res;
    };

    // Change the slice function but only when dealing with the sidebar trades
    const originalSlice = Array.prototype.slice;

    Array.prototype.slice = function(start, end) {
        const tradeFields = ["amount", "coinIcon", "coinName", "coinSymbol", "price", "timestamp", "totalValue", "type", "userId", "userImage", "username"];
        if (this.length && typeof this[0] === "object" && tradeFields.every(item => item in this[0])) {
            if (start == 0 && end == 5) {
                end = 10;
            }
            if (start == 0 && end == 4) {
                end = 9;
            }
        }

        return originalSlice.call(this, start, end);
    };

    const originalSetTimeout = window.setTimeout;

    /*window.setTimeout = function(fn, delay, ...rest) {
        const fnText = fn?.toString?.() || "";
        if (delay === 2e3) { //The only two times setTimeout delay is 2e3 is the target timeout and the other is actually the other target which we set to 0 in the next if statement anyway
            delay = 0;
            console.log(fnText);
        }
        if (fnText.includes('3 OF A KIND')) { // this is enough to narrow it down to one setTimeout across the whole site and sets delay to 0 so slots go faster
            delay = 0;
        }

    return originalSetTimeout(fn, delay, ...rest);
};*/

})();