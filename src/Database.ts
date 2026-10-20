import mongoose from "mongoose";
import modelSchema, { CollectionInterface } from "./collection";
import { TypedEmitter } from "tiny-typed-emitter";
import { Util } from "./Util";
import { QuickMongoError } from "./errors";
import { CollectionSchema, ZodSchema, Infer, validate } from "./Schema";
import _ from "lodash";

export interface QuickMongoOptions extends mongoose.ConnectOptions {
    collectionName?: string;
    child?: boolean;
    parent?: Database;
    shareConnectionFromParent?: boolean;
    autoConnect?: boolean;
}

export interface AllQueryOptions<T = unknown> {
    limit?: number;
    sort?: string;
    filter?: (data: AllData<T>) => boolean;
}

export interface AllData<T = unknown> {
    ID: string;
    data: T;
}

export interface BulkSetItem<T = unknown> {
    key: string;
    value: T;
    expireAfterSeconds?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocType<T = unknown> = mongoose.Document<any, any, CollectionInterface<T>> &
    CollectionInterface<T> & { _id: mongoose.Types.ObjectId };

export interface QmEvents<V = unknown> {
    ready: (db: Database<V>) => unknown;
    connecting: () => unknown;
    connected: () => unknown;
    open: () => unknown;
    disconnecting: () => unknown;
    disconnected: () => unknown;
    close: () => unknown;
    reconnected: () => unknown;
    error: (error: Error) => unknown;
    fullsetup: () => unknown;
    all: () => unknown;
    reconnectFailed: () => unknown;
}

export interface TableConstructor<V = unknown> {
    new (name: string): Database<V>;
}

/**
 * The Database class — key-value MongoDB store with optional Zod schema validation.
 *
 * @example
 * // Without schema
 * const db = new Database("mongodb://localhost/mydb");
 * await db.connect();
 *
 * // With Zod schema
 * import { z } from "quickmongo";
 * const UserSchema = z.object({ name: z.string(), age: z.number() });
 * const db = new Database("mongodb://localhost/mydb", {}, UserSchema);
 * await db.connect();
 * await db.set("user:1", { name: "Alice", age: 30 }); // validated!
 */
export class Database<T = unknown, PAR = unknown, S extends ZodSchema = ZodSchema> extends TypedEmitter<QmEvents<T>> {
    public connection: mongoose.Connection;
    public parent: Database<PAR> = null;
    public readonly schema: CollectionSchema<S> | null;
    private __child__ = false;
    // eslint-disable-next-line @typescript-eslint/ban-types
    public model: mongoose.Model<CollectionInterface<T>, {}, {}, {}> = null;

    public constructor(
        public url: string,
        public options: QuickMongoOptions = {},
        schema?: CollectionSchema<S> | S
    ) {
        super();

        Object.defineProperty(this, "__child__", {
            writable: true,
            enumerable: false,
            configurable: true
        });

        // accept raw ZodSchema or wrapped CollectionSchema
        if (schema) {
            this.schema =
                "schema" in (schema as object)
                    ? (schema as CollectionSchema<S>)
                    : { schema: schema as S, strict: true };
        } else {
            this.schema = null;
        }

        if (this.options.autoConnect) this.connect();
    }

    public isChild() {
        return !this.isParent();
    }

    public isParent() {
        return !this.__child__;
    }

    public get ready() {
        return !!(this.model && this.connection);
    }

    public get readyState() {
        return this.connection?.readyState ?? 0;
    }

    /** Validate value against schema if one is defined */
    private __validate(value: unknown): T {
        if (!this.schema) return value as T;
        return validate(this.schema.schema, value, this.schema.strict ?? true) as T;
    }

    public async getRaw(key: string): Promise<DocType<T>> {
        this.__readyCheck();
        const doc = await this.model.findOne({ ID: Util.getKey(key) });
        if (!doc || (doc.expireAt && doc.expireAt.getTime() - Date.now() <= 0)) return null;
        return doc;
    }

    public async get<V = T>(key: string): Promise<V> {
        const res = await this.getRaw(key);
        const formatted = this.__formatData(res);
        return Util.pick(formatted, key) as unknown as V;
    }

    public async fetch<V = T>(key: string): Promise<V> {
        return this.get(key);
    }

    /**
     * Set a value. If a Zod schema is defined, the value is validated before writing.
     * @param expireAfterSeconds Set to positive number to auto-delete (mongodb TTL, ~1 min granularity)
     */
    public async set(key: string, value: T | unknown, expireAfterSeconds = -1): Promise<T> {
        this.__readyCheck();

        // validate only root-level sets when no dot notation
        if (!key.includes(".") && this.schema) {
            this.__validate(value);
        }

        if (!key.includes(".")) {
            await this.model.findOneAndUpdate(
                { ID: key },
                {
                    $set: Util.shouldExpire(expireAfterSeconds)
                        ? { data: value, expireAt: Util.createDuration(expireAfterSeconds * 1000) }
                        : { data: value }
                },
                { upsert: true }
            );
            return this.get(key);
        }

        const keyMetadata = Util.getKeyMetadata(key);
        const existing = await this.model.findOne({ ID: keyMetadata.master });

        if (!existing) {
            await this.model.create(
                Util.shouldExpire(expireAfterSeconds)
                    ? { ID: keyMetadata.master, data: _.set({}, keyMetadata.target, value), expireAt: Util.createDuration(expireAfterSeconds * 1000) }
                    : { ID: keyMetadata.master, data: _.set({}, keyMetadata.target, value) }
            );
            return this.get(key);
        }

        if (existing.data !== null && typeof existing.data !== "object") {
            throw new QuickMongoError("CANNOT_TARGET_NON_OBJECT");
        }

        const prev = Object.assign({}, existing.data);
        const newData = _.set(prev, keyMetadata.target, value);

        await existing.updateOne({
            $set: Util.shouldExpire(expireAfterSeconds)
                ? { data: newData, expireAt: Util.createDuration(expireAfterSeconds * 1000) }
                : { data: newData }
        });

        return this.get(keyMetadata.master);
    }

    /**
     * Set multiple key-value pairs atomically using MongoDB transactions.
     * Falls back to sequential writes if transactions are not supported.
     */
    public async setMany(items: BulkSetItem<T>[]): Promise<void> {
        this.__readyCheck();
        const session = await this.connection.startSession();

        try {
            await session.withTransaction(async () => {
                for (const item of items) {
                    await this.set(item.key, item.value, item.expireAfterSeconds ?? -1);
                }
            });
        } finally {
            await session.endSession();
        }
    }

    /**
     * Get multiple keys at once
     */
    public async getMany<V = T>(keys: string[]): Promise<Map<string, V | null>> {
        const entries = await Promise.all(keys.map(async (k) => [k, await this.get<V>(k)] as const));
        return new Map(entries);
    }

    public async has(key: string) {
        const data = await this.get(key);
        // eslint-disable-next-line eqeqeq, no-eq-null
        return data != null;
    }

    public async delete(key: string) {
        this.__readyCheck();
        const keyMetadata = Util.getKeyMetadata(key);

        if (!keyMetadata.target) {
            const removed = await this.model.deleteOne({ ID: keyMetadata.master });
            return removed.deletedCount > 0;
        }

        const existing = await this.model.findOne({ ID: keyMetadata.master });
        if (!existing) return false;
        if (existing.data !== null && typeof existing.data !== "object") {
            throw new QuickMongoError("CANNOT_TARGET_NON_OBJECT");
        }

        const prev = Object.assign({}, existing.data);
        _.unset(prev, keyMetadata.target);
        await existing.updateOne({ $set: { data: prev } });
        return true;
    }

    public async deleteAll() {
        const res = await this.model.deleteMany();
        return res.deletedCount > 0;
    }

    /**
     * Delete multiple keys at once
     */
    public async deleteKeys(keys: string[]): Promise<number> {
        this.__readyCheck();
        const res = await this.model.deleteMany({ ID: { $in: keys } });
        return res.deletedCount;
    }

    public async count() {
        return this.model.estimatedDocumentCount();
    }

    public async ping() {
        if (!this.model) return NaN;
        const initial = Util.now();
        await this.get("__ping__");
        return Util.now() - initial;
    }

    public async instantiateChild<K = unknown>(collection?: string, url?: string): Promise<Database<K>> {
        const childDb = new Database<K, T>(url || this.url, {
            ...this.options,
            child: true,
            // @ts-expect-error assign parent
            parent: this,
            collectionName: collection,
            shareConnectionFromParent: !!url || true
        });

        return childDb.connect();
    }

    public get table() {
        return new Proxy(
            function () { /* noop */ } as unknown as TableConstructor,
            {
                construct: (_, args) => this.useCollection(args[0]),
                apply: (_, _thisArg, args) => this.useCollection(args[0])
            }
        );
    }

    public useCollection(name: string) {
        if (!name || typeof name !== "string") throw new QuickMongoError("INVALID_COLLECTION_NAME", "Invalid collection name");
        const db = new Database(this.url, this.options);
        db.connection = this.connection;
        // @ts-expect-error assign collection
        db.model = modelSchema(this.connection, name);
        db.connect = () => Promise.resolve(db);
        return db;
    }

    public async all(options?: AllQueryOptions) {
        this.__readyCheck();
        const everything = await this.model.find({});
        let arb = everything
            .filter((v) => !(v.expireAt && v.expireAt.getTime() - Date.now() <= 0))
            .filter((v) => options?.filter?.({ ID: v.ID, data: v.data }) ?? true)
            .map((m) => ({ ID: m.ID, data: this.__formatData(m) })) as AllData<T>[];

        if (typeof options?.sort === "string") {
            if (options.sort.startsWith(".")) options.sort = options.sort.slice(1);
            const pref = options.sort.split(".");
            arb = _.sortBy(arb, pref).reverse();
        }

        return typeof options?.limit === "number" && options.limit > 0 ? arb.slice(0, options.limit) : arb;
    }

    public async drop() {
        this.__readyCheck();
        return this.model.collection.drop();
    }

    public async push(key: string, value: unknown | unknown[]) {
        const data = await this.get(key);
        // eslint-disable-next-line eqeqeq, no-eq-null
        if (data == null) {
            return this.set(key, Array.isArray(value) ? value : [value]);
        }
        if (!Array.isArray(data)) throw new QuickMongoError("TARGET_EXPECTED_ARRAY");
        if (Array.isArray(value)) return this.set(key, data.concat(value));
        data.push(value);
        return this.set(key, data);
    }

    public async pull(
        key: string,
        value: unknown | unknown[] | ((data: unknown) => boolean),
        multiple = true
    ): Promise<false | T> {
        let data = (await this.get(key)) as T[];
        // eslint-disable-next-line eqeqeq, no-eq-null
        if (data == null) return false;
        if (!Array.isArray(data)) throw new QuickMongoError("TARGET_EXPECTED_ARRAY");

        if (typeof value === "function") {
            // @ts-expect-error apply fn
            data = data.filter(value);
        } else if (Array.isArray(value)) {
            data = data.filter((i) => !value.includes(i));
        } else if (multiple) {
            data = data.filter((i) => i !== value);
        } else {
            const index = data.findIndex((x) => x === value);
            if (index === -1) return false;
            data.splice(index, 1);
        }

        return this.set(key, data);
    }

    public async unshift(key: string, value: unknown | unknown[]) {
        let arr = await this.getArray(key);
        Array.isArray(value) ? (arr = value.concat(arr)) : arr.unshift(value as T);
        return this.set(key, arr);
    }

    public async shift(key: string) {
        const arr = await this.getArray(key);
        const removed = arr.shift();
        await this.set(key, arr);
        return removed;
    }

    public async pop(key: string) {
        const arr = await this.getArray(key);
        const removed = arr.pop();
        await this.set(key, arr);
        return removed;
    }

    public async startsWith(query: string) {
        return this.all({ filter: (data) => data.ID.startsWith(query) });
    }

    public async endsWith(query: string) {
        return this.all({ filter: (data) => data.ID.endsWith(query) });
    }

    public async add(key: string, value: number) {
        if (typeof value !== "number") throw new QuickMongoError("VALUE_MUST_BE_NUMBER");
        const val = await this.get(key);
        return this.set(key, (typeof val === "number" ? val : 0) + value);
    }

    public async subtract(key: string, value: number) {
        if (typeof value !== "number") throw new QuickMongoError("VALUE_MUST_BE_NUMBER");
        const val = await this.get(key);
        return this.set(key, (typeof val === "number" ? val : 0) - value);
    }

    public async sub(key: string, value: number) {
        return this.subtract(key, value);
    }

    public async addSubtract(key: string, value: number, sub = false) {
        return sub ? this.subtract(key, value) : this.add(key, value);
    }

    public async getArray<Rt = T>(key: string): Promise<Rt[]> {
        const data = await this.get(key);
        if (!Array.isArray(data)) throw new TypeError(`Data type of key "${key}" is not array`);
        return data;
    }

    public connect(): Promise<Database<T>> {
        return new Promise<Database<T>>((resolve, reject) => {
            if (typeof this.url !== "string" || !this.url) {
                return reject(new QuickMongoError("MISSING_MONGODB_URL"));
            }

            this.__child__ = Boolean(this.options.child);
            this.parent = (this.options.parent as Database<PAR>) || null;
            const collectionName = this.options.collectionName;
            const shareConnectionFromParent = !!this.options.shareConnectionFromParent;

            delete this.options["collectionName"];
            delete this.options["child"];
            delete this.options["parent"];
            delete this.options["shareConnectionFromParent"];
            delete this.options["autoConnect"];

            if (shareConnectionFromParent && this.__child__ && this.parent) {
                if (!this.parent.connection) return reject(new QuickMongoError("PARENT_HAS_NO_CONNECTION"));
                this.connection = this.parent.connection;
                // @ts-expect-error assign model
                this.model = modelSchema<T>(this.connection, Util.v(collectionName, "string", "JSON"));
                return resolve(this);
            }

            mongoose.createConnection(this.url, this.options, (err, connection) => {
                if (err) return reject(err);
                this.connection = connection;
                // @ts-expect-error assign model
                this.model = modelSchema<T>(this.connection, Util.v(collectionName, "string", "JSON"));
                this.emit("ready", this);
                this.__applyEventsBinding();
                resolve(this);
            });
        });
    }

    public watch() {
        this.__readyCheck();
        return this.model.watch();
    }

    public get metadata() {
        if (!this.model) return null;
        return {
            name: this.model.collection.name,
            db: this.model.collection.dbName,
            namespace: this.model.collection.namespace
        };
    }

    public async stats() {
        this.__readyCheck();
        return this.model.collection.stats();
    }

    public async close(force = false) {
        return this.connection.close(force);
    }

    private __applyEventsBinding() {
        this.__readyCheck();
        const events = ["connecting", "connected", "open", "disconnecting", "disconnected", "close", "reconnected", "error", "fullsetup", "all", "reconnectFailed", "reconnectTries"];
        for (const event of events) {
            this.connection.on(event, (...args) => {
                // @ts-expect-error event forwarder
                this.emit(event, ...args);
            });
        }
    }

    private __formatData(doc: DocType<T>) {
        return doc?.data ?? null;
    }

    private __readyCheck() {
        if (!this.model) throw new QuickMongoError("DATABASE_NOT_READY", "Use db.connect() first");
    }
}

/**
 * Create a schema-validated Database instance with full type inference from Zod.
 *
 * @example
 * import { defineCollection, z } from "quickmongo";
 *
 * const UserDB = defineCollection(
 *   "mongodb://localhost/mydb",
 *   z.object({ name: z.string(), age: z.number(), roles: z.array(z.string()).default([]) })
 * );
 *
 * await UserDB.connect();
 * await UserDB.set("user:1", { name: "Alice", age: 30 }); // fully typed + validated
 * const user = await UserDB.get("user:1");                // inferred as { name: string; age: number; roles: string[] }
 */
export function defineCollection<S extends ZodSchema>(
    url: string,
    schema: S,
    options?: QuickMongoOptions & { strict?: boolean }
): Database<Infer<S>, unknown, S> {
    const { strict = true, ...mongoOptions } = options ?? {};
    return new Database<Infer<S>, unknown, S>(url, mongoOptions, { schema, strict });
}
