/**
 * Example: Schema-validated collections with Zod
 */
import { defineCollection, z, Database } from "quickmongo";

// --- defineCollection: full type inference from Zod schema ---

const UserDB = defineCollection(
    "mongodb://localhost/mydb",
    z.object({
        name: z.string().min(1),
        age: z.number().int().positive(),
        roles: z.array(z.enum(["admin", "user", "moderator"])).default([]),
        metadata: z.record(z.string()).optional()
    }),
    { collectionName: "users" }
);

await UserDB.connect();

// Fully typed — TypeScript infers the shape from the Zod schema
await UserDB.set("user:1", { name: "Alice", age: 30, roles: ["admin"] });

// This would throw SchemaValidationError at runtime:
// await UserDB.set("user:2", { name: "", age: -1 });

const user = await UserDB.get("user:1");
// user is inferred as { name: string; age: number; roles: ("admin"|"user"|"moderator")[]; metadata?: Record<string, string> }

console.log(user?.name); // "Alice"

// Bulk set with transactions
await UserDB.setMany([
    { key: "user:2", value: { name: "Bob", age: 25, roles: ["user"] } },
    { key: "user:3", value: { name: "Carol", age: 35, roles: ["moderator"] } }
]);

// Get multiple keys
const users = await UserDB.getMany(["user:1", "user:2", "user:3"]);
users.forEach((value, key) => console.log(key, value?.name));

// TTL — automatically deleted after 5 minutes
await UserDB.set("session:abc", { name: "temp", age: 0, roles: [] }, 300);

// --- Classic usage without schema (unchanged API) ---

const db = new Database("mongodb://localhost/mydb");
await db.connect();
await db.set("config", { theme: "dark" });
const config = await db.get("config");
console.log(config);

await db.close();
await UserDB.close();
