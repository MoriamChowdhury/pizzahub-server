import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  db = client.db("pizzahub");
  console.log("MongoDB connected ✅");
  return db;
}

export function getDB(): Db {
  if (!db) throw new Error("Database not connected");
  return db;
}