export type Setting = {
    username: string;
    password: string;
    remote: string;
    remoteDBName: string;
    passphrase: string;
    filenameTemplate: string;
    attachmentFilenameTemplate: string;
    hideRemoteSetting: boolean;
    saveMHTML: boolean;
    stripImages: boolean;
    leaveImages: boolean;
}
export type WebClipRequestMessage = {
    setting: Setting;
    title: string;
    url: string;
    type: "clip";
    pagedata: string;
}

export type SavingData = [string, string[], {
    ctime: number;
    mtime: number;
    size: number;
}, "newnote" | "plain"]