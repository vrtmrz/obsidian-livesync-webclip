import TurndownService from "turndown";
import { type WebClipRequestMessage, type Setting, SavingData } from "./types";

const turndownPluginGfm = require("turndown-plugin-gfm");
var quotedPrintable = require("quoted-printable");

function cleanAttribute(attribute: string) {
    return attribute ? attribute.replace(/(\n+\s*)+/g, "\n") : "";
}
function getNowDateString(d: Date) {
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    let day = d.getDate();
    let hours = d.getHours();
    let minutes = d.getMinutes();
    let seconds = d.getSeconds();
    let dateStr = year + ("0" + month).slice(-2) + ("0" + day).slice(-2) + "_" + ("0" + hours).slice(-2) + ("0" + minutes).slice(-2) + ("0" + seconds).slice(-2);
    return dateStr;
}

function replaceFilenameStrings(source: string) {
    let regex = /[\u0000-\u001f]|[\\"'/:?<>|*$]/g;
    let x = source.replace(regex, "_");
    let win = /(\\|\/)(COM\d|LPT\d|CON|PRN|AUX|NUL|CLOCK$)($|\.)/gi;
    return (x = x.replace(win, "/_"));
}

interface ReadEntry {
    "Content-Location"?: string;
    "Content-Transfer-Encoding"?: string;
    body?: string;
    "Content-ID"?: string;
    "Content-Type"?: string;
    saveAs?: string;
    linkTo?: string;
}

function createFilename(template: string, url: string, title: string, date: string, encode = false) {
    let realizedFilename = template;
    let xurl = url;
    xurl = xurl.replace(/\?.*$/g, "");
    xurl = xurl.replace(/\/\./g, "/_");
    let orgPageFilenameWithExt = xurl.split("/").slice(-1)[0];
    let filenameTemp = orgPageFilenameWithExt.split(".");
    let ext = filenameTemp.pop() || "";
    let filename = filenameTemp.join(".");
    let enc = (s: string) => s;
    if (encode) {
        enc = (s: string) => encodeURIComponent(s);
    }
    realizedFilename = realizedFilename.replace(/\{title\}/g, enc(replaceFilenameStrings(title)));
    realizedFilename = realizedFilename.replace(/\{date\}/g, enc(date));
    realizedFilename = realizedFilename.replace(/\{filename\}/g, enc(replaceFilenameStrings(filename)));
    realizedFilename = realizedFilename.replace(/\{ext\}/g, enc(replaceFilenameStrings(ext)));
    if (realizedFilename.endsWith(".")) realizedFilename = realizedFilename.substring(0, realizedFilename.length - 1);
    return realizedFilename;
}
function stripSlash(strPath: string) {
    if (strPath.startsWith("/")) {
        if (strPath.startsWith("/_")) return strPath;
        return strPath.substring(1);
    }
    return strPath;
}
function parseMHTML(req: WebClipRequestMessage, date: string): { [key: string]: ReadEntry } {
    const pagedata = req.pagedata;
    const attachmentfile_template = stripSlash(req.setting.attachmentFilenameTemplate);
    const capturingRegex = /\n\s*boundary="(?<boundary>.*?)"\s\n/;
    const title: string = req.title;
    const found = pagedata.match(capturingRegex);
    let pageItems: { [key: string]: ReadEntry } = {};
    // if boundary is not captured, save only markdown

    if (found && found.groups && found.groups.boundary) {
        let boundary = found.groups.boundary as string;
        if (boundary != "") boundary = "--" + boundary;
        let entries = pagedata.split(boundary);
        entries.shift();
        entries.shift();
        for (let v of entries) {
            let [head, body] = v.split("\r\n\r\n", 2);
            let content: any = {};
            let items = head.split("\r\n");
            for (let vl of items) {
                let [key, value] = vl.split(": ", 2);
                if (!key) continue;
                content[key] = value;
            }
            if (!content["Content-Location"]) continue;
            // not treat about base64 and quoted-printable.
            if (content["Content-Transfer-Encoding"] != "base64" && content["Content-Transfer-Encoding"] != "quoted-printable") continue;
            if (content["Content-Transfer-Encoding"] == "quoted-printable") {
                let text = quotedPrintable.decode(body);
                let utf8str = String.fromCharCode.apply(null, new TextEncoder().encode(text));
                body = window.btoa(utf8str);
                content["Content-Transfer-Encoding"] = "base64";
            }
            content["body"] = body.replace(/[^a-zA-Z0-9/+=]/g, "");

            let attachmentFilename = createFilename(attachmentfile_template, content["Content-Location"], replaceFilenameStrings(title), date);
            content.saveAs = attachmentFilename;

            let attachmentFilenameLinkTo = createFilename(attachmentfile_template, content["Content-Location"], replaceFilenameStrings(title), date, true);
            content.linkTo = attachmentFilenameLinkTo;

            pageItems[content["Content-Location"]] = content as ReadEntry;
        }
    }
    return pageItems;
}

function estimateFileSize(s: string, contentType: string) {
    if (contentType == "base64") {
        let x = s.replace(/=|\r|\n/g, "").length;
        return Math.ceil(x * 3) / 4;
    }
    if (contentType == "string") {
        return encodeURIComponent(s).replace(/%../g, "x").length;
    }
    return 1;
}
function trimAll(src: string) {
    return src.replace(/^\s*(.*)\s*$/, "$1");
}

chrome.runtime.onMessage.addListener(function (req: WebClipRequestMessage, sender, sendResponse) {
    (async (req: WebClipRequestMessage, sender, sendResponse: (param: SavingData[] | string) => void) => {
        if (req.type == "clip") {
            try {
                const setting: Setting = req.setting;
                let date = new Date();
                const dispDate = getNowDateString(date);
                const filename_template = stripSlash(setting.filenameTemplate);

                const url: string = req.url;
                // const pagedata: string = msg.pagedata;
                const title: string = req.title;

                // fetch boundary and retrieve data.
                const pageItems = parseMHTML(req, dispDate);

                // retrieve document.
                let doc = document.body.outerHTML;
                let turndownService = new TurndownService({
                    //@ts-ignore
                    preformattedCode: true
                });

                let toSave: ReadEntry[] = [];
                //@ts-ignore
                turndownService.options.preformattedCode = true;
                // override rules for relative links
                turndownService.addRule("inline-link", {
                    filter: function (node, options) {
                        if (options.linkStyle === "inlined" && node.nodeName === "A" && node.getAttribute("href")) {
                            return true;
                        }
                        return false;
                    },
                    replacement: function (content, node: any) {
                        let href = node.getAttribute("href") as string;
                        let title = cleanAttribute(node.getAttribute("title"));
                        if (title) title = ' "' + title + '"';
                        let baseUrl = window.document.baseURI;
                        let url = new URL(href, baseUrl);
                        let newurl = url.toString();
                        return "[" + trimAll(content) + "](" + newurl + title + ")";
                    },
                });
                turndownService.addRule("inlineLink", {
                    filter: function (node, options) {
                        if (options.linkStyle === "inlined" && node.nodeName === "A" && node.getAttribute("href")) {
                            return true;
                        }
                        return false;
                    },
                    replacement: function (content, node: any) {
                        let href = node.getAttribute("href") as string;
                        let title = cleanAttribute(node.getAttribute("title"));
                        if (title) title = ' "' + title + '"';
                        let baseUrl = window.document.baseURI;
                        let url = new URL(href, baseUrl);
                        let newurl = url.toString();
                        return "[" + trimAll(content) + "](" + newurl + title + ")";
                    },
                });
                if (setting.stripImages) {
                    // no.
                    turndownService.addRule("image", {
                        filter: "img",
                        replacement: function (content, node: any) {
                            let alt = cleanAttribute(node.getAttribute("alt"));
                            let src = node.getAttribute("src") || "";
                            let baseUrl = window.document.baseURI;
                            let url = new URL(src, baseUrl);
                            let newurl = url.toString();
                            let title = cleanAttribute(node.getAttribute("title"));
                            let titlePart = title ? ' "' + title + '"' : "";
                            return src ? "<!-- image stipped:" + alt + "(" + newurl + titlePart + ") -->" : "";
                        },
                    });
                } else {
                    if (!setting.leaveImages) {
                        // override rules for replace image with captured one.
                        turndownService.addRule("image", {
                            filter: "img",
                            replacement: function (content, node: any) {
                                let alt = cleanAttribute(node.getAttribute("alt"));
                                let src = node.getAttribute("src") || "";
                                let baseUrl = window.document.baseURI;
                                let url = new URL(src, baseUrl);
                                let newurl = url.toString();
                                if (typeof pageItems[newurl] != "undefined") {
                                    let img = pageItems[newurl];
                                    newurl = img.linkTo;
                                    toSave.push(img);
                                }
                                let title = cleanAttribute(node.getAttribute("title"));
                                let titlePart = title ? ' "' + title + '"' : "";
                                return src ? "![" + trimAll(alt) + "]" + "(" + newurl + titlePart + ")" : "";
                            },
                        });
                    }
                }

                let references: string[] = [];
                turndownService.addRule("referenceLink", {
                    filter: function (node, options) {
                        if (options.linkStyle === "referenced" && node.nodeName === "A" && node.getAttribute("href")) {
                            return true;
                        }
                        return false;
                    },

                    replacement: function (content, node: any, options) {
                        let href = node.getAttribute("href");
                        let title = cleanAttribute(node.getAttribute("title"));
                        if (title) title = ' "' + title + '"';
                        let replacement;
                        let reference;
                        let baseUrl = window.document.baseURI;
                        let url = new URL(href, baseUrl);
                        let newurl = url.toString();

                        switch (options.linkReferenceStyle) {
                            case "collapsed":
                                replacement = "[" + content + "][]";
                                reference = "[" + content + "]: " + newurl + title;
                                break;
                            case "shortcut":
                                replacement = "[" + content + "]";
                                reference = "[" + content + "]: " + newurl + title;
                                break;
                            default:
                                let id = references.length + 1;
                                replacement = "[" + content + "][" + id + "]";
                                reference = "[" + id + "]: " + newurl + title;
                        }

                        references.push(reference);
                        return replacement;
                    },
                });
                turndownService.addRule('fenceAllPreformattedText', {
                    filter: ['pre'],
                    replacement: function (content, node, options) {
                        let body = content ? content : ("innerText" in node) ? node.innerText : node.textContent;
                        if (!body.endsWith("\n")) body += "\n";
                        return (
                            '\n\n' + options.fence + '\n' +
                            body +
                            options.fence + '\n\n'
                        )
                    },
                });
                // remove tags.
                turndownService.remove("script");
                turndownService.remove("style");

                // using plugins.
                let gfm = turndownPluginGfm.gfm;
                let tables = turndownPluginGfm.tables;
                let strikethrough = turndownPluginGfm.strikethrough;

                turndownService.use([gfm, tables, strikethrough]);

                // now make document to markdown.
                let markdown = turndownService.turndown(doc);

                // and front matter
                let matter = `---
title: "${title}"
url: "${url}"
timestamp: ${date.toLocaleString()}
---

`;

                // Prepare filename
                let pageFilename = createFilename(filename_template, url, title, dispDate, false);

                let datex = (new Date() as any) / 1;

                const out = [] as SavingData[];
                // Save 

                for (let attachmentData of toSave) {
                    let body = attachmentData.body;
                    out.push([
                        attachmentData.saveAs,
                        [attachmentData.body],
                        {
                            ctime: Date.now(),
                            mtime: Date.now(),
                            size: estimateFileSize(body, attachmentData["Content-Transfer-Encoding"])
                        },
                        "newnote"]);
                }
                out.push([
                    pageFilename,
                    [matter + markdown],
                    {
                        ctime: datex,
                        mtime: datex,
                        size: estimateFileSize(matter + markdown, "string")
                    },
                    "plain"
                ]);

                if (setting.saveMHTML) {
                    out.push([pageFilename.replace(".md", ".mhtml"),
                    [req.pagedata],
                    {
                        ctime: datex,
                        mtime: datex,
                        size: estimateFileSize(req.pagedata, "string"),
                    },
                        "newnote"])

                }
                sendResponse(out);
            } catch (ex) {
                sendResponse("Something went wrong.\n" + ex.toString());
            }
        } else {
            sendResponse("Something went wrong..");
        }
        return true;
    })(req, sender, sendResponse);
    return true;
});
