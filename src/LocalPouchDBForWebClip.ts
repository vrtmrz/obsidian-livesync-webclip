/// <reference path="types.ts"/>

// This file snipped from Obsidian-Livesync.
// when to release, I'll make it tidy up.
import xxhash from "xxhash-wasm";
import PouchDB from "pouchdb-browser";
const MAX_DOC_SIZE = 1000; // for .md file, but if delimiters exists. use that before.
const MAX_DOC_SIZE_BIN = 102400; // 100kb

const LOG_LEVEL = {
    VERBOSE: 1,
    INFO: 10,
    NOTICE: 100,
    URGENT: 1000,
} as const;
type LOG_LEVEL = typeof LOG_LEVEL[keyof typeof LOG_LEVEL];

const isValidRemoteCouchDBURI = (uri: string): boolean => {
    if (uri.startsWith("https://")) return true;
    if (uri.startsWith("http://")) return true;
    return false;
};
const connectRemoteCouchDB = async (uri: string, auth: PouchDBCredential): Promise<false | { db: PouchDB.Database; info: any }> => {
    if (!isValidRemoteCouchDBURI(uri)) false;
    let db = new PouchDB(uri, {
        auth,
    });
    try {
        let info = await db.info();
        return { db: db, info: info };
    } catch (ex) {
        return false;
    }
};

//<--Functions

export class LocalPouchDBForWebClip {
    dbname: string;
    async addLog(message: any, level: LOG_LEVEL = LOG_LEVEL.INFO) {
        // debugger;

        let timestamp = new Date().toLocaleString();
        let messagecontent = typeof message == "string" ? message : JSON.stringify(message, null, 2);
        let newmessage = timestamp + "->" + messagecontent;

        console.log(newmessage);
    }
    localDatabase!: PouchDB.Database<EntryDoc>;

    h32!: (input: string, seed?: number) => string;
    h64!: (input: string, seedHigh?: number, seedLow?: number) => string;
    hashCache: {
        [key: string]: string;
    } = {};
    hashCacheRev: {
        [key: string]: string;
    } = {};

    corruptedEntries: { [key: string]: EntryDoc } = {};

    constructor(dbname: string) {
        this.dbname = dbname;

        this.initializeDatabase();
    }
    close() {
        try {
            this.localDatabase.destroy();
        } catch (e) {}

        this.localDatabase.close();
    }

    disposeHashCache() {
        this.hashCache = {};
        this.hashCacheRev = {};
    }

    async initializeDatabase() {
        if (this.localDatabase != null) this.localDatabase.close();

        this.localDatabase = new PouchDB<EntryDoc>(this.dbname + "-webclip", {
            auto_compaction: true,
            revs_limit: 100,
            deterministic_revs: true,
        });
        try {
            await this.localDatabase.destroy();
        } catch (s) {}
        this.localDatabase = new PouchDB<EntryDoc>(this.dbname + "-webclip", {
            auto_compaction: true,
            revs_limit: 100,
            deterministic_revs: true,
        });
        await this.prepareHashFunctions();
    }

    async prepareHashFunctions() {
        if (this.h32 != null) return;
        const { h32, h64 } = await xxhash();
        this.h32 = h32;
        this.h64 = h64;
    }

    async putDBEntry(note: SavingEntry) {
        let leftData = note.data;
        let savenNotes = [];
        let processed = 0;
        let made = 0;
        let skiped = 0;
        let pieceSize = MAX_DOC_SIZE_BIN;
        let plainSplit = false;
        let cacheUsed = 0;
        if (note._id.endsWith(".md")) {
            pieceSize = MAX_DOC_SIZE;
            plainSplit = true;
        }
        do {
            // To keep low bandwith and database size,
            // Dedup pieces on database.
            // from 0.1.10, for best performance. we use markdown delimiters
            // 1. \n[^\n]{longLineThreshold}[^\n]*\n -> long sentence shuld break.
            // 2. \n\n shold break
            // 3. \r\n\r\n should break
            // 4. \n# should break.
            let cPieceSize = pieceSize;
            let minimumChunkSize = 20;
            if (minimumChunkSize < 10) minimumChunkSize = 10;
            let longLineThreshold = 100;
            if (longLineThreshold < 100) longLineThreshold = 100;
            if (plainSplit) {
                cPieceSize = 0;
                // lookup for next splittion .
                // we're standing on "\n"
                // debugger
                do {
                    let n1 = leftData.indexOf("\n", cPieceSize + 1);
                    let n2 = leftData.indexOf("\n\n", cPieceSize + 1);
                    let n3 = leftData.indexOf("\r\n\r\n", cPieceSize + 1);
                    let n4 = leftData.indexOf("\n#", cPieceSize + 1);
                    if (n1 == -1 && n2 == -1 && n3 == -1 && n4 == -1) {
                        cPieceSize = MAX_DOC_SIZE;
                        break;
                    }

                    if (n1 > longLineThreshold) {
                        // long sentence is an established piece
                        cPieceSize = n1 + 1;
                    } else {
                        // cPieceSize = Math.min.apply([n2, n3, n4].filter((e) => e > 1));
                        // ^ heavy.
                        if (n2 > 0 && cPieceSize < n2) cPieceSize = n2 + 1;
                        if (n3 > 0 && cPieceSize < n3) cPieceSize = n3 + 3;
                        if (n4 > 0 && cPieceSize < n4) cPieceSize = n4 + 0;
                        cPieceSize++;
                    }
                } while (cPieceSize < minimumChunkSize);
            }

            let piece = leftData.substring(0, cPieceSize);
            leftData = leftData.substring(cPieceSize);
            processed++;
            let leafid = "";
            // Get has of piece.
            let hashedPiece: string = "";
            let hashQ: number = 0; // if hash collided, **IF**, count it up.
            let tryNextHash = false;
            let needMake = true;
            if (typeof this.hashCache[piece] !== "undefined") {
                hashedPiece = "";
                leafid = this.hashCache[piece];
                needMake = false;
                skiped++;
                cacheUsed++;
            } else {
                hashedPiece = this.h32(piece);
                leafid = "h:" + hashedPiece;
                do {
                    let nleafid = leafid;
                    try {
                        nleafid = `${leafid}${hashQ}`;
                        let pieceData = await this.localDatabase.get<EntryLeaf>(nleafid);
                        if (pieceData.type == "leaf" && pieceData.data == piece) {
                            leafid = nleafid;
                            needMake = false;
                            tryNextHash = false;
                            this.hashCache[piece] = leafid;
                            this.hashCacheRev[leafid] = piece;
                        } else if (pieceData.type == "leaf") {
                            this.addLog("hash:collision!!");
                            hashQ++;
                            tryNextHash = true;
                        } else {
                            leafid = nleafid;
                            tryNextHash = false;
                        }
                    } catch (ex: any) {
                        if (ex.status && ex.status == 404) {
                            //not found, we can use it.
                            leafid = nleafid;
                            needMake = true;
                        } else {
                            needMake = false;
                            throw ex;
                        }
                    }
                } while (tryNextHash);
                if (needMake) {
                    //have to make
                    let d: EntryLeaf = {
                        _id: leafid,
                        data: piece,
                        type: "leaf",
                    };
                    let result = await this.localDatabase.put(d);
                    if (result.ok) {
                        this.addLog(`save ok:id:${result.id} rev:${result.rev}`, LOG_LEVEL.VERBOSE);
                        this.hashCache[piece] = leafid;
                        this.hashCacheRev[leafid] = piece;
                        made++;
                    } else {
                        this.addLog("save faild");
                    }
                } else {
                    skiped++;
                }
            }

            savenNotes.push(leafid);
        } while (leftData != "");
        this.addLog(`note content saven, pieces:${processed} new:${made}, skip:${skiped}, cache:${cacheUsed}`);
        let newDoc: PlainEntry | NewEntry = {
            NewNote: true,
            children: savenNotes,
            _id: note._id,
            ctime: note.ctime,
            mtime: note.mtime,
            size: note.size,
            type: plainSplit ? "plain" : "newnote",
        };
        // Here for upsert logic,
        try {
            let old = await this.localDatabase.get(newDoc._id);
            if (!old.type || old.type == "notes" || old.type == "newnote" || old.type == "plain") {
                // simple use rev for new doc
                newDoc._rev = old._rev;
            }
        } catch (ex: any) {
            if (ex.status && ex.status == 404) {
                // NO OP/
            } else {
                throw ex;
            }
        }
        let r = await this.localDatabase.put(newDoc);
    }

    openReplication(setting: Setting) {
        return new Promise(async (res) => {
            let uri = setting.remote;
            let auth: PouchDBCredential = {
                username: setting.username,
                password: setting.password,
            };
            let dbret = await connectRemoteCouchDB(uri, auth);
            if (dbret === false) {
                this.addLog(`could not connect to ${uri}`, LOG_LEVEL.NOTICE);
                return res(false);
            }
            let syncOptionBase: PouchDB.Replication.SyncOptions = {
                batch_size: 250,
                batches_limit: 40,
            };

            let db = dbret.db;
            //replicate once
            let replicate = this.localDatabase.replicate.to(db, syncOptionBase);
            replicate
                .on("complete", async (info) => {
                    replicate.cancel();
                    replicate.removeAllListeners();
                    return res(true);
                })
                .on("error", (e) => {
                    this.addLog("Pulling Replication error", LOG_LEVEL.NOTICE);
                    this.addLog(e);
                    res(false);
                });
        });
    }
}
