
import {
  reviewCase,
  normalizeTime
} from "./engine.mjs";

import {
  analyzeHypotheses
} from "./hypotheses.mjs";

import {
  auditEvidenceDependence
} from "./sensitivity.mjs";

import {
  explainCase
} from "../explainability.mjs";

const button = document.getElementById("runTests");
const status = document.getElementById("testStatus");
const output = document.getElementById("testResults");

function sample() {
  return {
    case_id: "EFX-SYNTHETIC-QA",
    evidence: [
      {
        id: "BANK",
        source: "Bank",
        sha256: "a".repeat(64)
      },
      {
        id: "LOGIN",
        source: "Device"
      },
      {
        id: "COPY",
        source: "Device",
        derived_from: "LOGIN"
      },
      {
        id: "OTHER",
        source: "Device",
        sha256: "b".repeat(64)
      }
    ],
    events: [
      {
        id: "EV2",
        timestamp: "2026-10-30T10:00:00+03:00",
        description: "Synthetic payment",
        evidence_ids: ["BANK"]
      },
      {
        id: "EV1",
        timestamp: "2026-10-30T08:00:00+03:00",
        description: "Synthetic login",
        evidence_ids: ["LOGIN"]
      }
    ],
    links: [
      {
        from: "BANK",
        to: "LOGIN",
        type: "contradicts"
      }
    ],
    hypotheses: [
      {
        id: "H1",
        title: "Account owner",
        supports: ["BANK"],
        challenges: ["LOGIN"],
        gaps: []
      },
      {
        id: "H2",
        title: "Another operator",
        supports: ["LOGIN", "COPY"],
        challenges: [],
        gaps: []
      }
    ]
  };
}

function check(condition, message) {
  if (!condition) throw Error(message);
}

function expectRejection(fn) {
  let rejected = false;

  try {
    fn();
  } catch {
    rejected = true;
  }

  check(rejected, "Invalid data was accepted");
}

const tests = [
  ["Case validation", () => {
    check(
      reviewCase(sample()).evidence.length === 4,
      "Evidence count mismatch"
    );
  }],

  ["Chronological ordering", () => {
    check(
      reviewCase(sample()).timeline[0].id === "EV1",
      "Timeline ordering incorrect"
    );
  }],

  ["Timezone conversion", () => {
    check(
      normalizeTime(
        "2026-10-30T10:00:00+03:00"
      ) === "2026-10-30T07:00:00Z",
      "UTC conversion incorrect"
    );
  }],

  ["Distinct evidence origins", () => {
    check(
      reviewCase(sample()).source_groups.length === 3,
      "Different provenance roots merged"
    );
  }],

  ["Derived evidence grouping", () => {
    const groups = reviewCase(sample()).source_groups;

    const group = groups.find(
      x => x.root_evidence_id === "LOGIN"
    );

    check(
      group?.evidence_ids.includes("COPY"),
      "Derived evidence not grouped correctly"
    );
  }],

  ["Unknown parent rejection", () => {
    const doc = sample();
    doc.evidence[2].derived_from = "MISSING";
    expectRejection(() => reviewCase(doc));
  }],

  ["Derivation cycle rejection", () => {
    const doc = sample();
    doc.evidence[1].derived_from = "COPY";
    expectRejection(() => reviewCase(doc));
  }],

  ["Competing hypothesis analysis", () => {
    const doc = sample();

    const result = analyzeHypotheses(
      doc,
      reviewCase(doc)
    );

    check(
      result.hypotheses.length === 2,
      "Hypothesis results incorrect"
    );
  }],

  ["Copied evidence is not double-counted", () => {
    const doc = sample();

    const result = analyzeHypotheses(
      doc,
      reviewCase(doc)
    );

    check(
      result.hypotheses[1]
        .independent_support_roots.length === 1,
      "Derived copies incorrectly counted"
    );
  }],

  ["Evidence exclusion propagation", () => {
    const result = auditEvidenceDependence(
      sample(),
      "LOGIN"
    );

    check(
      result.total_excluded_items === 2,
      "Incorrect exclusion count"
    );

    check(
      result.automatically_excluded_descendants
        .includes("COPY"),
      "Derived copy was not excluded"
    );
  }],

  ["Declared contradiction identification", () => {
    const doc = sample();

    const result = explainCase(
      doc,
      reviewCase(doc)
    );

    check(
      result.findings.some(
        f => f.code === "DECLARED_CONTRADICTION"
      ),
      "Declared contradiction missing"
    );
  }],

  ["Cross-hypothesis evidence impact", () => {
    const doc = sample();

    const result = explainCase(
      doc,
      reviewCase(doc)
    );

    check(
      result.decisive_candidates.some(
        x =>
          x.root_evidence_id === "LOGIN" &&
          x.hypothesis_count === 2
      ),
      "Shared influence not identified"
    );
  }],

  ["Duplicate hypothesis rejection", () => {
    const doc = sample();
    doc.hypotheses[1].id = "H1";

    expectRejection(() =>
      explainCase(doc, reviewCase(doc))
    );
  }],

  ["Original evidence remains unchanged", () => {
    const doc = sample();
    const before = JSON.stringify(doc);

    const reviewed = reviewCase(doc);

    analyzeHypotheses(doc, reviewed);
    auditEvidenceDependence(doc, "LOGIN");
    explainCase(doc, reviewed);

    check(
      JSON.stringify(doc) === before,
      "Original case was modified"
    );
  }]
];

function addResult(name, passed, message = "") {
  const card = document.createElement("article");
  card.className = "evidence-entry";

  const title = document.createElement("h3");
  title.textContent =
    (passed ? "PASS — " : "FAIL — ") + name;

  card.append(title);

  if (message) {
    const detail = document.createElement("p");
    detail.textContent = message;
    card.append(detail);
  }

  output.append(card);
}

function runTests() {
  button.disabled = true;
  output.replaceChildren();

  let passed = 0;
  const started = performance.now();

  for (const [name, test] of tests) {
    try {
      test();
      passed++;
      addResult(name, true);
    } catch (error) {
      addResult(
        name,
        false,
        String(error.message || error)
      );
    }
  }

  const elapsed = Math.round(
    performance.now() - started
  );

  status.textContent =
    `${passed} / ${tests.length} tests passed ` +
    `in ${elapsed} ms`;

  button.disabled = false;
}

button.addEventListener("click", runTests);

status.textContent =
  `Ready — ${tests.length} integration tests available`;
