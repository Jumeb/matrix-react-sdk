/*
Copyright 2018 New Vector Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

const puppeteer = require('puppeteer');
const Logger = require('./logger');
const LogBuffer = require('./logbuffer');

module.exports = class RiotSession {
    constructor(browser, page, username, riotserver, hsUrl) {
        this.browser = browser;
        this.page = page;
        this.hsUrl = hsUrl;
        this.riotserver = riotserver;
        this.username = username;
        this.consoleLog = new LogBuffer(page, "console", (msg) => `${msg.text()}\n`);
        this.networkLog = new LogBuffer(page, "requestfinished", async (req) => {
            const type = req.resourceType();
            const response = await req.response();
            return `${type} ${response.status()} ${req.method()} ${req.url()} \n`;
        }, true);
        this.log = new Logger(this.username);
    }

    static async create(username, puppeteerOptions, riotserver, hsUrl) {
        const browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        await page.setViewport({
            width: 1280,
            height: 800
        });
        return new RiotSession(browser, page, username, riotserver, hsUrl);
    }

    async tryGetInnertext(selector) {
        const field = await this.page.$(selector);
        if (field != null) {
            const text_handle = await field.getProperty('innerText');
            return await text_handle.jsonValue();
        }
        return null;
    }

    async getElementProperty(handle, property) {
        const propHandle = await handle.getProperty(property);
        return await propHandle.jsonValue();
    }

    innerText(field) {
        return this.getElementProperty(field, 'innerText');
    }

    getOuterHTML(element_handle) {
        return this.getElementProperty(field, 'outerHTML');
    }

    consoleLogs() {
        return this.consoleLog.buffer;
    }

    networkLogs() {
        return this.networkLog.buffer;
    }

    logXHRRequests() {
        let buffer = "";
        this.page.on('requestfinished', async (req) => {
            const type = req.resourceType();
            const response = await req.response();
            //if (type === 'xhr' || type === 'fetch') {
                buffer += `${type} ${response.status()} ${req.method()} ${req.url()} \n`;
                // if (req.method() === "POST") {
                //   buffer += "  Post data: " + req.postData();
                // }
            //}
        });
        return {
            logs() {
                return buffer;
            }
        }
    }

    async printElements(label, elements) {
        console.log(label, await Promise.all(elements.map(getOuterHTML)));
    }

    async replaceInputText(input, text) {
        // click 3 times to select all text
        await input.click({clickCount: 3});
        // then remove it with backspace
        await input.press('Backspace');
        // and type the new text
        await input.type(text);
    }

    query(selector) {
        return this.page.$(selector);
    }

    waitAndQuery(selector, timeout = 5000) {
        return this.page.waitForSelector(selector, {visible: true, timeout});
    }

    queryAll(selector) {
        return this.page.$$(selector);
    }

    async waitAndQueryAll(selector, timeout = 5000) {
        await this.waitAndQuery(selector, timeout);
        return await this.queryAll(selector);
    }

    waitForReload(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.browser.removeEventListener('domcontentloaded', callback);
                reject(new Error(`timeout of ${timeout}ms for waitForReload elapsed`));
            }, timeout);

            const callback = async () => {
                clearTimeout(timeoutHandle);
                resolve();
            };

            this.page.once('domcontentloaded', callback);
        });
    }

    waitForNewPage(timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.browser.removeListener('targetcreated', callback);
                reject(new Error(`timeout of ${timeout}ms for waitForNewPage elapsed`));
            }, timeout);

            const callback = async (target) => {
                if (target.type() !== 'page') {
                    return;
                }
                this.browser.removeListener('targetcreated', callback);
                clearTimeout(timeoutHandle);
                const page = await target.page();
                resolve(page);
            };

            this.browser.on('targetcreated', callback);
        });
    }

    goto(url) {
        return this.page.goto(url);
    }

    url(path) {
        return this.riotserver + path;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    close() {
        return this.browser.close();
    }
}
