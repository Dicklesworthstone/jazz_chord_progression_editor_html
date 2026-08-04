import { runA0RandomizedSequenceRangeFromJson } from
  "./a0-randomized-protocol";

try {
  const request = await Bun.stdin.text();
  const result = runA0RandomizedSequenceRangeFromJson(request);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
