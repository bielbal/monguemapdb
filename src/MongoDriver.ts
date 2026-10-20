import mongoose from "mongoose";
import modelSchema from "./collection";
import { QuickMongoError } from "./errors";

export interface IDriver {
    prepare(table: string): Promise<void>;
    getAllRows(table: string): Promise<{ id: string; value: unknown }[]>;
    getRowByKey<T>(table: string, key: string): Promise<[T | null, boolean]>;
    setRowByKey<T>(table: string, key: string, value: unknown, update: boolean): Promise<T>;
    deleteAllRows(table: string): Promise<number>;
    deleteRowByKey(table: string, key: string): Promise<number>;
}

/**
 * Quick.db compatible MongoDB driver.
 *
 * @example
 * const { QuickDB } = require("quick.db");
 * const { MongoDriver } = require("quickmongo");
 *
 * const driver = new MongoDriver("mongodb://localhost/quickdb");
 * await driver.connect();
 *
 * const db = new QuickDB({ driver });
 * await db.set("foo", "bar");
 * console.log(await db.get("foo")); // "bar"
 */
export class MongoDriver implements IDriver {
    public connection: mongoose.Connection;
    private models = new Map<string, ReturnType<typeof modelSchema>>();

    public constructor(public url: string, public options: mongoose.ConnectOptions = {}) {}

    public connect(): Promise<MongoDriver> {
        return new Promise(async (resolve, reject) => {
            // eslint-disable-next-line
            mongoose.createConnection(this.url, this.options, (err, connection) => {
                if (err) return reject(err);
                this.connection = connection;
                resolve(this);
            });
        });
    }

    public close(force?: boolean) {
        return this.connection?.close(force);
    }

    private checkConnection() {
        if (this.connection == null) throw new QuickMongoError("DATABASE_NOT_READY", "MongoDriver is not connected");
    }

    public async prepare(table: string) {
        this.checkConnection();
        if (!this.models.has(table)) this.models.set(table, modelSchema(this.connection, table));
    }

    private async getModel(name: string) {
        await this.prepare(name);
        return this.models.get(name);
    }

    async getAllRows(table: string): Promise<{ id: string; value: unknown }[]> {
        this.checkConnection();
        const model = await this.getModel(table);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await model.find()).map((row: any) => ({ id: row.ID, value: row.data }));
    }

    async getRowByKey<T>(table: string, key: string): Promise<[T | null, boolean]> {
        this.checkConnection();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model: any = await this.getModel(table);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await model.find({ ID: key });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return res.map((m: any) => m.data);
    }

    async setRowByKey<T>(table: string, key: string, value: unknown, _update: boolean): Promise<T> {
        this.checkConnection();
        const model = await this.getModel(table);
        await model.findOneAndUpdate({ ID: key }, { $set: { data: value } }, { upsert: true });
        return value as T;
    }

    async deleteAllRows(table: string): Promise<number> {
        this.checkConnection();
        const model = await this.getModel(table);
        const res = await model.deleteMany();
        return res.deletedCount;
    }

    async deleteRowByKey(table: string, key: string): Promise<number> {
        this.checkConnection();
        const model = await this.getModel(table);
        const res = await model.deleteMany({ ID: key });
        return res.deletedCount;
    }
}
