import { z } from "zod";
import { SchemaValidationError } from "./errors";

export type ZodSchema = z.ZodTypeAny;
export type Infer<S extends ZodSchema> = z.infer<S>;

export interface CollectionSchema<S extends ZodSchema = ZodSchema> {
    schema: S;
    strict?: boolean;
}

export function defineSchema<S extends ZodSchema>(schema: S, options: { strict?: boolean } = {}): CollectionSchema<S> {
    return { schema, options: options.strict ?? true, strict: options.strict ?? true } as unknown as CollectionSchema<S>;
}

export function validate<S extends ZodSchema>(schema: S, value: unknown, _strict = true): z.infer<S> {
    const result = schema.safeParse(value);
    if (!result.success) throw new SchemaValidationError((result as z.SafeParseError<unknown>).error.issues);
    return result.data;
}

export { z };
