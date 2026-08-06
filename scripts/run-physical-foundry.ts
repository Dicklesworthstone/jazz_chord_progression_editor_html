import metricFixture from "../tests/fixtures/physical-foundry/metric-cases.json";
import { canonicalJson, runFoundryCorpus } from "./physical-foundry";

const receipt = runFoundryCorpus(metricFixture.cases);
process.stdout.write(canonicalJson(receipt));
if (receipt["outcome"] !== "accept") process.exitCode = 1;
