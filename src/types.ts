interface Setting {
    username: string;
    password: string;
    remote: string;
    filenameTemplate: string;
    attachmentFilenameTemplate: string;
    hideRemoteSetting: boolean;
    saveMHTML: boolean;
    stripImages: boolean;
    leaveImages: boolean;
}
interface WebClipRequestMessage {
    setting: Setting;
    title: string;
    url: string;
    type: "clip";
    pagedata: string;
}

interface DBEntry {
    _id: string;
    data: string;
    _rev?: string;
    ctime: number;
    mtime: number;
    size: number;
    _deleted?: boolean;
    _conflicts?: string[];
    type?: "notes";
}
interface NewEntry {
    _id: string;
    children: string[];
    _rev?: string;
    ctime: number;
    mtime: number;
    size: number;
    _deleted?: boolean;
    _conflicts?: string[];
    NewNote: true;
    type: "newnote";
}
interface PlainEntry {
    _id: string;
    children: string[];
    _rev?: string;
    ctime: number;
    mtime: number;
    size: number;
    _deleted?: boolean;
    NewNote: true;
    _conflicts?: string[];
    type: "plain";
}
type LoadedEntry = DBEntry & {
    children: string[];
    datatype: "plain" | "newnote";
};

interface EntryLeaf {
    _id: string;
    data: string;
    _deleted?: boolean;
    type: "leaf";
    _rev?: string;
}

type EntryBody = DBEntry | NewEntry | PlainEntry;
type EntryDoc = EntryBody | LoadedEntry | EntryLeaf;
type SavingEntry = DBEntry & {
    datatype: "plain" | "newnote";
};
type diff_result_leaf = {
    rev: string;
    data: string;
    ctime: number;
    mtime: number;
};
type dmp_result = Array<[number, string]>;

type diff_result = {
    left: diff_result_leaf;
    right: diff_result_leaf;
    diff: dmp_result;
};
type diff_check_result = boolean | diff_result;

type PouchDBCredential = {
    username: string;
    password: string;
};

type EntryDocResponse = EntryDoc & PouchDB.Core.IdMeta & PouchDB.Core.GetMeta;
