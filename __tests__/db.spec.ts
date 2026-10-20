import { Database, defineCollection, SchemaValidationError, QuickMongoError } from "../src";
import { z } from "../src/Schema";

describe("database — classic API", () => {
    const db = new Database<{
        difficulty: string;
        items: string[];
        balance: number;
    }>("mongodb://localhost/quickmongo");

    beforeAll(async () => { await db.connect(); }, 10000);
    afterAll(async () => { await db.deleteAll(); await db.close(); }, 10000);

    test("quick.db compat", async () => {
        await db.set("userInfo", { difficulty: "Easy" });
        await db.push("userInfo.items", "Sword");
        await db.add("userInfo.balance", 500);
        await db.push("userInfo.items", "Watch");
        await db.add("userInfo.balance", 500);

        const res = await db.get("userInfo");
        expect(res).toStrictEqual({ difficulty: "Easy", items: ["Sword", "Watch"], balance: 1000 });
    });

    it("should pull item", async () => {
        const res = await db.pull("userInfo.items", "Watch") as { items: string[] };
        expect(res.items).toStrictEqual(["Sword"]);
    });

    it("should getMany", async () => {
        await db.set("a", { difficulty: "Hard", items: [], balance: 0 });
        await db.set("b", { difficulty: "Easy", items: [], balance: 0 });
        const map = await db.getMany(["a", "b", "missing"]);
        expect(map.get("a")?.difficulty).toBe("Hard");
        expect(map.get("b")?.difficulty).toBe("Easy");
        expect(map.get("missing")).toBeNull();
    });

    it("should deleteKeys", async () => {
        await db.set("del1", { difficulty: "x", items: [], balance: 0 });
        await db.set("del2", { difficulty: "x", items: [], balance: 0 });
        const count = await db.deleteKeys(["del1", "del2"]);
        expect(count).toBe(2);
    });
});

describe("database — Zod schema validation", () => {
    const UserSchema = z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
        roles: z.array(z.string()).default([])
    });

    const db = defineCollection("mongodb://localhost/quickmongo_schema", UserSchema, {
        collectionName: "users"
    });

    beforeAll(async () => { await db.connect(); }, 10000);
    afterAll(async () => { await db.deleteAll(); await db.close(); }, 10000);

    it("should accept valid data", async () => {
        await db.set("u1", { name: "Alice", age: 30, roles: ["admin"] });
        const user = await db.get("u1");
        expect(user?.name).toBe("Alice");
        expect(user?.age).toBe(30);
    });

    it("should reject invalid data", async () => {
        await expect(
            db.set("u2", { name: "", age: -1, roles: [] })
        ).rejects.toBeInstanceOf(SchemaValidationError);
    });

    it("should infer correct type", async () => {
        const user = await db.get("u1");
        // TypeScript should infer user as { name: string; age: number; roles: string[] } | null
        expect(typeof user?.name).toBe("string");
    });
});

describe("errors", () => {
    it("should throw DATABASE_NOT_READY without connect", async () => {
        const db = new Database("mongodb://localhost/quickmongo");
        await expect(db.get("x")).rejects.toBeInstanceOf(QuickMongoError);
    });
});
