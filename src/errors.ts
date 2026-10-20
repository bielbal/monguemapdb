export type QuickMongoErrorCode =
    | "DATABASE_NOT_READY"
    | "MISSING_MONGODB_URL"
    | "PARENT_HAS_NO_CONNECTION"
    | "CANNOT_TARGET_NON_OBJECT"
    | "TARGET_EXPECTED_ARRAY"
    | "VALUE_MUST_BE_NUMBER"
    | "SCHEMA_VALIDATION_FAILED"
    | "INVALID_COLLECTION_NAME"
    | "TRANSACTION_FAILED";

export class QuickMongoError extends Error {
    public readonly code: QuickMongoErrorCode;

    public constructor(code: QuickMongoErrorCode, message?: string) {
        super(message ?? code);
        this.name = "QuickMongoError";
        this.code = code;
    }
}

export class SchemaValidationError extends QuickMongoError {
    public readonly issues: unknown[];

    public constructor(issues: unknown[]) {
        super("SCHEMA_VALIDATION_FAILED", `Schema validation failed: ${JSON.stringify(issues)}`);
        this.name = "SchemaValidationError";
        this.issues = issues;
    }
}
