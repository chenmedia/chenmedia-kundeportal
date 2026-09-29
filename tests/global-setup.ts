import { resetDatabase, TEST_DB_URL } from "./db-reset";

export default async function setup() {
  await resetDatabase(TEST_DB_URL);
}
