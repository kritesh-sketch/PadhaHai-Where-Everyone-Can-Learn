import { Client } from "pg";
const client = await new Client().connect();

try {
  const res = await client.query("SELECT $1::text as message", [
    "Hello world!",
  ]);
  console.log(res.rows[0].message); // Hello world!
} catch (err) {
  console.error(err);
} finally {
  await client.end();
}
