// Set required environment variables before any tests run
process.env.JWT_SECRET = "test-secret-key-for-unit-tests-only";
process.env.JWT_EXPIRES_IN = "7d";
process.env.MONGO_URI = "mongodb://localhost:27017/test-placeholder";
