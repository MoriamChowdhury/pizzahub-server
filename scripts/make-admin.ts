import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email>");
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();
  const users = client.db("pizzahub").collection("user");

  const result = await users.updateOne({ email }, { $set: { role: "admin" } });
  console.log(
    result.matchedCount
      ? `✅ ${email} is now admin`
      : `❌ No user found with ${email}. Sign up first.`
  );
  await client.close();
}

main();