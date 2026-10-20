import _ from "lodash";

export class Util extends null {
    private constructor() {
        /* noop */
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static v(k: any, type: string, fallback?: any) {
        return typeof k === type && !!k ? k : fallback;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static pick(holder: any, id?: string) {
        if (!holder || typeof holder !== "object") return holder;
        if (!id || typeof id !== "string" || !id.includes(".")) return holder;
        const keysMeta = Util.getKeyMetadata(id);
        return _.get(Object.assign({}, holder), keysMeta.target);
    }

    public static getKey(key: string) {
        return key.split(".").shift();
    }

    public static getKeyMetadata(key: string) {
        const [master, ...child] = key.split(".");
        return { master, child, target: child.join(".") };
    }

    public static shouldExpire(dur: number) {
        if (typeof dur !== "number") return false;
        if (dur > Infinity || dur <= 0 || Number.isNaN(dur)) return false;
        return true;
    }

    public static createDuration(dur: number) {
        if (!Util.shouldExpire(dur)) return null;
        return new Date(Date.now() + dur);
    }

    public static now() {
        return typeof performance !== "undefined" ? performance.now() : Date.now();
    }
}
