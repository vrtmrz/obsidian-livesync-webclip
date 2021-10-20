import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";
function buffer_to_string(buf: ArrayBuffer) {
    return String.fromCharCode.apply(null, buf as any);
}

const defaultSetting: Setting = {
    username: "",
    password: "",
    remote: "",
    filenameTemplate: "/webclip/{title}_{date}.md",
    attachmentFilenameTemplate: "/webclip/attachments/{title}_{date}/{filename}.{date}.{ext}",
};

const Popup = () => {
    const [currentURL, setCurrentURL] = useState<string>();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [remote, setRemote] = useState("");
    const [filenameTemplate, setFilenameTemplate] = useState("");
    const [attachmentFilenameTemplate, setattachmentFilenameTemplate] = useState("");
    const clipTest = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const tab = tabs[0];
            if (tab.id) {
                let tabid = tab.id;
                chrome.pageCapture.saveAsMHTML({ tabId: tabid }, (c: Blob) => {
                    c.text().then((t) => {
                        // let t = await c.text();
                        let setting: Setting = {
                            username,
                            password,
                            remote,
                            filenameTemplate,
                            attachmentFilenameTemplate,
                        };
                        let message: WebClipRequestMessage = {
                            setting: setting,
                            title: tab.title,
                            url: tab.url,
                            type: "clip",
                            pagedata: t,
                        };
                        chrome.tabs.sendMessage(tabid, message, (msg) => {
                            save_options();
                            alert(msg);
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
    function save_options() {
        let setting: Setting = {
            username,
            password,
            remote,
            filenameTemplate,
            attachmentFilenameTemplate,
        };
        chrome.storage.sync.set(setting, function () {
            // Update status to let user know options were saved.
        });
    }
    const resetFilenameTemplate = () => {
        setFilenameTemplate(defaultSetting.filenameTemplate);
        setattachmentFilenameTemplate(defaultSetting.attachmentFilenameTemplate);
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
            setattachmentFilenameTemplate(items.attachmentFilenameTemplate);
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
            <ul style={{ minWidth: "700px" }}>
                <li>Current URL: {currentURL}</li>
                <li>
                    <label>Database Address</label>
                    <input type="url" value={remote} onChange={(event) => setRemote(event.target.value)}></input>
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
                    <label>Clip to </label>
                    <input type="text" value={filenameTemplate} onChange={(event) => setFilenameTemplate(event.target.value)}></input>
                </li>
                <li>
                    <label>Attachments to </label>
                    <input type="text" value={attachmentFilenameTemplate} onChange={(event) => setattachmentFilenameTemplate(event.target.value)}></input>
                </li>
            </ul>
            <button onClick={clipTest}>Clip This Page</button> <button onClick={resetFilenameTemplate}>Reset Filename Template</button>
        </>
    );
};

ReactDOM.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>,
    document.getElementById("root")
);
