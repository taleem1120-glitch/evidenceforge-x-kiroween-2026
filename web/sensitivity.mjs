/**
 * EvidenceForge X — Evidence Dependence Audit
 * Browser-local, deterministic counterfactual analysis.
 * No guilt assessment, network calls or probability scores.
 */

function isRecord(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requireString(value, what) {
  if (typeof value !== "string" ||
      value.length === 0 ||
      value.length > 200) {
    throw Error(`Invalid ${what}`);
  }
}

export function auditEvidenceDependence(
  caseDoc,
  excludedId
) {
  if (!isRecord(caseDoc) ||
      !Array.isArray(caseDoc.evidence) ||
      !Array.isArray(caseDoc.hypotheses)) {
    throw Error(
      "Case needs evidence and hypotheses arrays"
    );
  }

  if (caseDoc.evidence.length > 2000 ||
      caseDoc.hypotheses.length > 20) {
    throw Error("Case exceeds audit limits");
  }

  requireString(
    excludedId,
    "evidence identifier"
  );

  const evidence = new Map();

  for (const item of caseDoc.evidence) {
    if (!isRecord(item)) {
      throw Error("Invalid evidence entry");
    }

    requireString(
      item.id,
      "evidence identifier"
    );

    if (evidence.has(item.id)) {
      throw Error(
        "Duplicate evidence identifier"
      );
    }

    evidence.set(item.id, item);
  }

  if (!evidence.has(excludedId)) {
    throw Error(
      "Evidence identifier not found"
    );
  }

  const roots = new Map();

  function root(id, trail = new Set()) {
    if (!evidence.has(id)) {
      throw Error(
        "Evidence dependency not found"
      );
    }

    if (roots.has(id)) {
      return roots.get(id);
    }

    if (trail.has(id)) {
      throw Error(
        "Evidence dependency cycle"
      );
    }

    const item = evidence.get(id);
    const parent = item.derived_from;

    if (parent != null &&
        typeof parent !== "string") {
      throw Error(
        "Invalid evidence dependency"
      );
    }

    const r = parent
      ? root(
          parent,
          new Set([...trail, id])
        )
      : id;

    roots.set(id, r);

    return r;
  }

  for (const id of evidence.keys()) {
    root(id);
  }

  // Remove selected evidence and all derivatives.
  const removed = new Set([excludedId]);

  let previousSize = -1;

  while (previousSize !== removed.size) {
    previousSize = removed.size;

    for (const item of evidence.values()) {
      if (
        item.derived_from &&
        removed.has(item.derived_from)
      ) {
        removed.add(item.id);
      }
    }
  }

  const output = [];
  const seenHypotheses = new Set();

  for (const h of caseDoc.hypotheses) {
    if (!isRecord(h)) {
      throw Error("Invalid hypothesis");
    }

    requireString(
      h.id,
      "hypothesis identifier"
    );

    if (seenHypotheses.has(h.id)) {
      throw Error(
        "Duplicate hypothesis identifier"
      );
    }

    seenHypotheses.add(h.id);

    if (
      !Array.isArray(h.supports) ||
      !Array.isArray(h.challenges) ||
      h.supports.length > 200 ||
      h.challenges.length > 200
    ) {
      throw Error(
        "Invalid support/challenge arrays"
      );
    }

    for (const id of [
      ...h.supports,
      ...h.challenges
    ]) {
      requireString(
        id,
        "hypothesis evidence reference"
      );

      if (!evidence.has(id)) {
        throw Error(
          "Unknown hypothesis evidence reference"
        );
      }
    }

    const setRoots = ids =>
      [...new Set(
        ids.map(id => roots.get(id))
      )].sort();

    const originalSupportRoots =
      setRoots(h.supports);

    const originalChallengeRoots =
      setRoots(h.challenges);

    const retainedSupports =
      h.supports.filter(
        id => !removed.has(id)
      );

    const retainedChallenges =
      h.challenges.filter(
        id => !removed.has(id)
      );

    const newSupportRoots =
      setRoots(retainedSupports);

    const newChallengeRoots =
      setRoots(retainedChallenges);

    const lostSupportRoots =
      originalSupportRoots.filter(
        id => !newSupportRoots.includes(id)
      );

    const lostChallengeRoots =
      originalChallengeRoots.filter(
        id => !newChallengeRoots.includes(id)
      );

    output.push({
      hypothesis_id: h.id,

      title:
        typeof h.title === "string"
          ? h.title.slice(0, 240)
          : h.id,

      original_support_roots:
        originalSupportRoots.length,

      remaining_support_roots:
        newSupportRoots.length,

      original_challenge_roots:
        originalChallengeRoots.length,

      remaining_challenge_roots:
        newChallengeRoots.length,

      lost_support_root_ids:
        lostSupportRoots,

      lost_challenge_root_ids:
        lostChallengeRoots,

      removed_support_ids:
        h.supports.filter(
          id => removed.has(id)
        ),

      removed_challenge_ids:
        h.challenges.filter(
          id => removed.has(id)
        ),

      has_no_remaining_support:
        retainedSupports.length === 0,

      interpretation:
        lostSupportRoots.length ||
        lostChallengeRoots.length
          ? "Submitted evidence links changed; reassess manually."
          : "No change to linked independent roots in this hypothetical exclusion."
    });
  }

  return {
    schema:
      "evidenceforge.dependence-audit.v1",

    excluded_evidence_id:
      excludedId,

    automatically_excluded_descendants:
      [...removed]
        .filter(id => id !== excludedId)
        .sort(),

    total_excluded_items:
      removed.size,

    affected_hypotheses:
      output,

    cautions: [
      "Counterfactual removal does not establish guilt or truth.",
      "A distinct provenance root does not prove source independence.",
      "Remaining evidence counts do not measure probability."
    ]
  };
}
