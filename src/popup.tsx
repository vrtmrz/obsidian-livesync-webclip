import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { SavingData, type Setting, type WebClipRequestMessage } from "./types";
import { DirectFileManipulator } from "./lib/src/DirectFileManipulator";


const defaultSetting: Setting = {
    username: "",
    password: "",
    remote: "",
    filenameTemplate: "webclip/{title}_{date}.md",
    attachmentFilenameTemplate: "webclip/attachments/{title}_{date}/{filename}.{date}.{ext}",
    hideRemoteSetting: false,
    saveMHTML: false,
    stripImages: false,
    leaveImages: false,
    passphrase: "",
    remoteDBName: "",
};

const Popup = () => {
    const [currentURL, setCurrentURL] = useState<string>("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [remote, setRemote] = useState("");
    const [filenameTemplate, setFilenameTemplate] = useState("");
    const [attachmentFilenameTemplate, setAttachmentFilenameTemplate] = useState("");
    const [hideRemoteSetting, setHideRemoteSetting] = useState(false);
    const [status, setStatus] = useState("");
    const [done, setDone] = useState(false);
    const [saveMHTML, setSaveMHTML] = useState(false);
    const [stripImages, setStripImages] = useState(false);
    const [leaveImages, setLeaveImages] = useState(false);
    const [remoteDBName, setRemoteDBName] = useState("");
    const [passphrase, setPassphrase] = useState("");
    const clipTest = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tab = tabs[0];
            if (tab.id) {
                let tabid = tab.id;
                setStatus("Retriving Attachments.");
                chrome.pageCapture.saveAsMHTML({ tabId: tabid }, (c: Blob) => {
                    c.text().then((t) => {
                        setStatus("Fetching the page and contents...");
                        // let t = await c.text();
                        let setting: Setting = {
                            username,
                            password,
                            remote,
                            filenameTemplate,
                            attachmentFilenameTemplate,
                            hideRemoteSetting,
                            saveMHTML,
                            stripImages,
                            leaveImages,
                            remoteDBName,
                            passphrase,
                        };
                        let message: WebClipRequestMessage = {
                            setting: setting,
                            title: tab.title,
                            url: tab.url,
                            type: "clip",
                            pagedata: t,
                        };
                        chrome.tabs.sendMessage(tabid, message, async (result: SavingData[] | string) => {

                            save_options();
                            if (typeof (result) === "string") {
                                setStatus(result);
                            } else {
                                const manipurator = new DirectFileManipulator({
                                    database: setting.remoteDBName,
                                    username: setting.username,
                                    password: setting.password,
                                    url: setting.remote,
                                    passphrase: setting.passphrase,
                                    obfuscatePassphrase: setting.passphrase
                                })
                                let outMsg = "";
                                for (const data of result) {
                                    await manipurator.put(...data);
                                    outMsg += `OK:${data[0]}\n`
                                    setStatus(outMsg);
                                }
                                outMsg += `Done!\n`;
                                setStatus(outMsg);
                            }
                            // alert(msg);
                            setDone(true);
                        });
                        return true;
                    });
                    return true;
                });
                return true;
            } else {
                return false;
            }
        });
        return true;
    };
    const closeWindow = () => {
        window.close();
    };
    function save_options() {
        let setting: Setting = {
            username,
            password,
            remote,
            filenameTemplate,
            attachmentFilenameTemplate,
            hideRemoteSetting,
            saveMHTML,
            stripImages,
            leaveImages,
            passphrase,
            remoteDBName
        };
        chrome.storage.sync.set(setting, function () {
            // Update status to let user know options were saved.
        });
    }
    const resetFilenameTemplate = () => {
        setFilenameTemplate(defaultSetting.filenameTemplate);
        setAttachmentFilenameTemplate(defaultSetting.attachmentFilenameTemplate);
    };

    // Restores select box and checkbox state using the preferences
    // stored in chrome.storage.
    function restore_options() {
        // Use default value color = 'red' and likesColor = true.
        chrome.storage.sync.get(defaultSetting, function (items: Setting) {
            setUsername(items.username);
            setPassword(items.password);
            setRemote(items.remote);
            setFilenameTemplate(items.filenameTemplate);
            setAttachmentFilenameTemplate(items.attachmentFilenameTemplate);
            setHideRemoteSetting(items.hideRemoteSetting);
            setSaveMHTML(items.saveMHTML);
            setStripImages(items.stripImages);
            setLeaveImages(items.leaveImages);
            setPassphrase(items.passphrase);
            setRemoteDBName(items.remoteDBName);
        });
    }
    document.addEventListener("DOMContentLoaded", restore_options);

    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            setCurrentURL(tabs[0].url);
        });
    }, []);

    return (
        <>
            <div className="header">Obsidian LiveSync Clip</div>
            {!currentURL ? (
                <>
                    <ul className="panel">
                        <li>
                            <label>Current URL</label>
                            <input type="url" value={currentURL} readOnly={true}></input>
                        </li>
                        <li>Couldn't capture this page</li>
                    </ul>
                </>
            ) : (
                <>
                    <ul className="panel">
                        <li>
                            <label>Current URL</label>
                            <input type="url" value={currentURL} readOnly={true}></input>
                        </li>
                        {hideRemoteSetting ? (
                            <></>
                        ) : (
                            <>
                                <li>
                                    <label>Database URL</label>
                                    <input type="url" value={remote} onChange={(event) => setRemote(event.target.value)}></input>
                                </li>
                                <li>
                                    <label>Database Name</label>
                                    <input type="url" value={remoteDBName} onChange={(event) => setRemoteDBName(event.target.value)}></input>
                                </li>
                                <li>
                                    <label>Username </label>
                                    <input type="text" value={username} onChange={(event) => setUsername(event.target.value)}></input>
                                </li>
                                <li>
                                    <label>Password</label>
                                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)}></input>
                                </li>
                                <li>
                                    <label>E2EE Passphrase</label>
                                    <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)}></input>
                                </li>
                            </>
                        )}
                        <li>
                            <label>Clip to </label>
                            <input type="text" value={filenameTemplate} onChange={(event) => setFilenameTemplate(event.target.value)}></input>
                        </li>
                        <li>
                            <label>Attachments to </label>
                            <input type="text" value={attachmentFilenameTemplate} onChange={(event) => setAttachmentFilenameTemplate(event.target.value)}></input>
                        </li>
                        <li>
                            <label>Save MHTML too</label>
                            <span>
                                <label>
                                    <input type="checkbox" checked={saveMHTML} onChange={(event) => setSaveMHTML(event.target.checked)}></input>
                                    <span></span>
                                </label>
                            </span>
                        </li>
                        <li>
                            <label>Strip images</label>
                            <span>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={stripImages}
                                        onChange={(event) => {
                                            setStripImages(event.target.checked);
                                            if (event.target.checked) {
                                                setLeaveImages(!event.target.checked);
                                            }
                                        }}
                                    ></input>
                                    <span></span>
                                </label>
                            </span>
                        </li>
                        <li>
                            <label>leave images as URL</label>
                            <span>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={leaveImages}
                                        onChange={(event) => {
                                            setLeaveImages(event.target.checked);
                                            if (event.target.checked) {
                                                setStripImages(!event.target.checked);
                                            }
                                        }}
                                    ></input>
                                    <span></span>
                                </label>
                            </span>
                        </li>
                    </ul>
                    {status == "" ? (
                        <div className="controls">
                            <label>
                                <input type="checkbox" checked={hideRemoteSetting} onChange={(event) => setHideRemoteSetting(event.target.checked)}></input>
                                <span>Hide Remote Settings:</span>
                            </label>

                            <div className="buttons">
                                <button onClick={clipTest}>Clip This Page</button> <button onClick={resetFilenameTemplate}>Reset Filename Template</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="controls message">{status}</div>
                            {!done ? (
                                <></>
                            ) : (
                                <div className="controls">
                                    <button onClick={closeWindow}>Close</button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </>
    );
};

ReactDOM.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
    document.getElementById("root")
);
