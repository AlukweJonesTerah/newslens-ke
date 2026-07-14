const assert = require("assert");
const { properNounOverlap } = require("./cluster.js");

const cases = [
  [
    "Chuka University courses offered in 2025/2026, fees and cluster points",
    "University of Eldoret courses, cluster points & fees structure",
    0,
  ],
  [
    "Ruto Reveals New Timelines for Completion of Deadly Stalled Bridge",
    "Ruto Issues Fresh Orders to Ministry Over Delayed Multi-Billion Project",
    1,
  ],
  [
    "NTSA sounds alarm over uncollected logbooks as deadline nears",
    "NTSA Gives Fresh Directive Over Unclaimed Logbooks, Number Plates & Licences",
    1,
  ],
];

for (const [a, b, expectedMin] of cases) {
  const overlap = properNounOverlap(a, b);
  assert(
    overlap !== null && overlap >= expectedMin,
    `FAILED: "${a}" vs "${b}" -> ${overlap}`,
  );
}
console.log("all entity-overlap tests passed");
