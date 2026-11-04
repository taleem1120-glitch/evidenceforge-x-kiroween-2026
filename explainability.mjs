/**
 * EvidenceForge X
 * Explainable Evidence Audit Engine
 * Deterministic, browser-local processing.
 * Investigative leads, never conclusions of guilt.
 */

const isRecord = x =>
  x !== null &&
  typeof x === "object" &&
  !Array.isArray(x);

const byText = (a, b) => a.localeCompare(b);

export function explainCase(doc, review) {
  if (
    !isRecord(doc) ||
    !isRecord(review) ||
    !Array.isArray(review.evidence) ||
    !Array.isArray(review.timeline) ||
    !Array.isArray(review.links)
  ) {
    throw Error("Validated case review required");
  }

  const evidence = new Map(
    review.evidence.map(item => [item.id, item])
  );

  if (evidence.size !== review.evidence.length) {
    throw Error("Duplicate evidence ID");
  }

  const roots = new Map();

  function root(id, trail = new Set()) {
    if (!evidence.has(id)) {
      throw Error("Unknown evidence: " + String(id));
    }

    if (roots.has(id)) return roots.get(id);

    if (trail.has(id)) {
      throw Error("Evidence derivation cycle");
    }

    const item = evidence.get(id);

    const value = item.derived_from
      ? root(
          item.derived_from,
          new Set([...trail, id])
        )
      : id;

    roots.set(id, value);
    return value;
  }

  for (const id of evidence.keys()) {
    root(id);
  }

  const findings = [];

  function add(code, severity, ids, explanation, check) {
    findings.push({
      code,
      severity,
      evidence_ids: [...new Set(ids)].sort(byText),
      explanation,
      recommended_check: check,
      status: "requires-human-review"
    });
  }

  const missingHashes = review.evidence
    .filter(item => !item.sha256)
    .map(item => item.id);

  if (missingHashes.length) {
    add(
      "MISSING_REFERENCE_HASH",
      "review",
      missingHashes,
      "Some evidence records lack SHA-256 reference hashes.",
      "Obtain reference hashes and verify original files."
    );
  }

  for (const link of review.links) {
    if (link.type !== "contradicts") continue;

    root(link.from);
    root(link.to);

    add(
      "DECLARED_CONTRADICTION",
      "review",
      [link.from, link.to],
      `A supplied relationship declares a contradiction between ${link.from} and ${link.to}. This has not been independently established.`,
      "Review original evidence, timestamps and context."
    );
  }

  if (
    doc.hypotheses !== undefined &&
    !Array.isArray(doc.hypotheses)
  ) {
    throw Error("Hypotheses must be an array");
  }

  const hypotheses = doc.hypotheses ?? [];

  if (hypotheses.length > 20) {
    throw Error("Maximum 20 hypotheses");
  }

  const seen = new Set();
  const impact = new Map();

  for (const h of hypotheses) {
    if (
      !isRecord(h) ||
      typeof h.id !== "string" ||
      !h.id.trim() ||
      !Array.isArray(h.supports) ||
      !Array.isArray(h.challenges)
    ) {
      throw Error("Invalid hypothesis");
    }

    if (seen.has(h.id)) {
      throw Error("Duplicate hypothesis ID");
    }

    seen.add(h.id);

    if (
      h.supports.length > 200 ||
      h.challenges.length > 200
    ) {
      throw Error("Too many hypothesis references");
    }

    const ids = [...h.supports, ...h.challenges];

    for (const id of ids) {
      if (
        typeof id !== "string" ||
        !id.trim() ||
        !evidence.has(id)
      ) {
        throw Error("Invalid evidence reference");
      }
    }

    const supportRoots = new Set(h.supports.map(root));
    const challengeRoots = new Set(h.challenges.map(root));

    const overlap = [...supportRoots]
      .filter(id => challengeRoots.has(id))
      .sort(byText);

    if (overlap.length) {
      add(
        "DEPENDENT_OPPOSING_EVIDENCE",
        "review",
        overlap,
        `Hypothesis ${h.id} contains opposing evidence from the same recorded origin.`,
        "Inspect evidence derivation and independence."
      );
    }

    if (!h.challenges.length) {
      add(
        "NO_COUNTER_EVIDENCE_RECORDED",
        "information",
        h.supports,
        `Hypothesis ${h.id} has no recorded challenging evidence.`,
        "Seek and document possible counter-evidence."
      );
    }

    for (const id of new Set(ids)) {
      const origin = root(id);

      if (!impact.has(origin)) {
        impact.set(origin, new Set());
      }

      impact.get(origin).add(h.id);
    }
  }

  const decisiveCandidates = [...impact]
    .map(([id, related]) => ({
      root_evidence_id: id,
      hypotheses_affected: [...related].sort(byText),
      hypothesis_count: related.size,
      reason:
        "Removing this evidence origin may change the recorded support or challenge coverage."
    }))
    .sort(
      (a, b) =>
        b.hypothesis_count - a.hypothesis_count ||
        byText(a.root_evidence_id, b.root_evidence_id)
    );

  findings.sort(
    (a, b) =>
      byText(a.code, b.code) ||
      byText(
        a.evidence_ids.join(","),
        b.evidence_ids.join(",")
      ) ||
      byText(a.explanation, b.explanation)
  );

  return {
    schema: "evidenceforge.explainability.v1",
    case_id: review.case_id,
    findings,
    decisive_candidates: decisiveCandidates,
    caveats: [
      "No automated determination of guilt or identity.",
      "Declared contradictions require human verification.",
      "Impact counts are not probabilities.",
      "Hash equality does not prove chain of custody."
    ]
  };
}

