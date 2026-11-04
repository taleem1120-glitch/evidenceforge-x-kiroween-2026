
import test from "node:test";
import assert from "node:assert/strict";

import {
  reviewCase,
  normalizeTime
} from "../web/engine.mjs";

import {
  analyzeHypotheses
} from "../web/hypotheses.mjs";

import {
  auditEvidenceDependence
} from "../web/sensitivity.mjs";

import {
  explainCase
} from "../explainability.mjs";

function sample() {
  return {
    case_id: "EFX-INTEGRATION-2026",
    evidence: [
      {
        id: "BANK",
        source: "Bank record",
        sha256: "a".repeat(64)
      },
      {
        id: "LOGIN",
        source: "Device log",
        sha256: "b".repeat(64)
      },
      {
        id: "LOGIN_COPY",
        source: "Device log",
        derived_from: "LOGIN"
      },
      {
        id: "OTHER",
        source: "Device log",
        sha256: "c".repeat(64)
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
        title: "Account owner operated device",
        supports: ["BANK"],
        challenges: ["LOGIN"],
        gaps: [
          {
            question: "Who operated the device?",
            why: "Ownership is not proof of use",
            discriminator: "device-control"
          }
        ]
      },
      {
        id: "H2",
        title: "Another operator",
        supports: ["LOGIN", "LOGIN_COPY"],
        challenges: [],
        gaps: []
      }
    ]
  };
}

test("01 - valid case reviews successfully", () => {
  const result = reviewCase(sample());
  assert.equal(result.case_id, "EFX-INTEGRATION-2026");
  assert.equal(result.evidence.length, 4);
});

test("02 - timeline is correctly ordered", () => {
  const result = reviewCase(sample());
  assert.equal(result.timeline[0].id, "EV1");
  assert.equal(result.timeline[1].id, "EV2");
});

test("03 - timezone conversion is correct", () => {
  assert.equal(
    normalizeTime("2026-10-30T10:00:00+03:00"),
    "2026-10-30T07:00:00Z"
  );
});

test("04 - different roots remain distinct", () => {
  const result = reviewCase(sample());

  assert.equal(result.source_groups.length, 3);

  const group = result.source_groups.find(
    g => g.evidence_ids.includes("LOGIN")
  );

  assert.deepEqual(
    group.evidence_ids,
    ["LOGIN", "LOGIN_COPY"]
  );
});

test("05 - invalid parent is rejected", () => {
  const doc = sample();
  doc.evidence[2].derived_from = "MISSING";

  assert.throws(() => reviewCase(doc));
});

test("06 - derivation cycles are rejected", () => {
  const doc = sample();
  doc.evidence[1].derived_from = "LOGIN_COPY";

  assert.throws(() => reviewCase(doc));
});

test("07 - competing hypotheses analyze", () => {
  const doc = sample();
  const review = reviewCase(doc);
  const result = analyzeHypotheses(doc, review);

  assert.equal(result.hypotheses.length, 2);
  assert.equal(
    result.hypotheses[1].independent_support_roots.length,
    1
  );
});

test("08 - exclusion removes derivatives", () => {
  const result = auditEvidenceDependence(
    sample(),
    "LOGIN"
  );

  assert.equal(result.total_excluded_items, 2);
  assert.deepEqual(
    result.automatically_excluded_descendants,
    ["LOGIN_COPY"]
  );

  const h2 = result.affected_hypotheses.find(
    h => h.hypothesis_id === "H2"
  );

  assert.equal(h2.has_no_remaining_support, true);
});

test("09 - explainability reports declarations", () => {
  const doc = sample();
  const result = explainCase(doc, reviewCase(doc));

  assert.ok(
    result.findings.some(
      f => f.code === "DECLARED_CONTRADICTION"
    )
  );

  assert.ok(
    result.findings.some(
      f => f.code === "MISSING_REFERENCE_HASH"
    )
  );
});

test("10 - explainability identifies shared impact", () => {
  const doc = sample();
  const result = explainCase(doc, reviewCase(doc));

  const login = result.decisive_candidates.find(
    x => x.root_evidence_id === "LOGIN"
  );

  assert.equal(login.hypothesis_count, 2);
});

test("11 - duplicate hypothesis is rejected", () => {
  const doc = sample();
  doc.hypotheses[1].id = "H1";

  assert.throws(() =>
    explainCase(doc, reviewCase(doc))
  );
});

test("12 - original case remains unchanged", () => {
  const doc = sample();
  const before = JSON.stringify(doc);

  const review = reviewCase(doc);
  analyzeHypotheses(doc, review);
  auditEvidenceDependence(doc, "LOGIN");
  explainCase(doc, review);

  assert.equal(JSON.stringify(doc), before);
});
