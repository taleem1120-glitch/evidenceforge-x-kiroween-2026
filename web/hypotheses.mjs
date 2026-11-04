/**
 * EvidenceForge X
 * Competing Hypotheses Investigation Engine
 *
 * Deterministic, browser-local processing.
 * No automated attribution or guilt assessment.
 */

const validText = (value, max = 500) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= max;

const unique = values =>
  new Set(values).size === values.length;

export function analyzeHypotheses(caseDoc, caseReview) {
  if (!caseDoc || !caseReview ||
      !Array.isArray(caseReview.evidence)) {
    throw Error("Analyzed case required");
  }

  const hypotheses = caseDoc.hypotheses ?? [];

  if (!Array.isArray(hypotheses) ||
      hypotheses.length > 20) {
    throw Error("At most 20 hypotheses allowed");
  }

  const evidence = new Map(
    caseReview.evidence.map(item => [item.id, item])
  );

  const ancestors = new Map();

  function origin(id) {
    if (ancestors.has(id)) return ancestors.get(id);

    let item = evidence.get(id);

    if (!item) {
      throw Error("Unknown evidence ID: " + String(id));
    }

    const visited = new Set();

    while (item.derived_from) {
      if (visited.has(item.id)) {
        throw Error("Evidence derivation cycle");
      }

      visited.add(item.id);
      item = evidence.get(item.derived_from);

      if (!item) {
        throw Error("Evidence parent not found");
      }
    }

    ancestors.set(id, item.id);
    return item.id;
  }

  const hypothesisIds = new Set();

  const compiled = hypotheses.map(h => {
    if (!h || !validText(h.id, 100) ||
        !validText(h.title, 240) ||
        hypothesisIds.has(h.id)) {
      throw Error("Invalid or duplicate hypothesis");
    }

    hypothesisIds.add(h.id);

    const supports = h.supports ?? [];
    const challenges = h.challenges ?? [];
    const gaps = h.gaps ?? [];

    if (![supports, challenges, gaps].every(Array.isArray) ||
        supports.length > 200 ||
        challenges.length > 200 ||
        gaps.length > 30) {
      throw Error("Invalid hypothesis arrays");
    }

    for (const items of [supports, challenges]) {
      if (!items.every(id =>
            validText(id, 200) && evidence.has(id)
          ) || !unique(items)) {
        throw Error(
          "Unrecognized or duplicate evidence reference"
        );
      }
    }

    if (supports.some(id => challenges.includes(id))) {
      throw Error(
        "An item cannot both support and challenge a hypothesis"
      );
    }

    if (gaps.some(g =>
      !g ||
      !validText(g.question, 500) ||
      !validText(g.why, 1000) ||
      !validText(g.discriminator, 100)
    )) {
      throw Error(
        "Each gap requires question, why and discriminator"
      );
    }

    const roots = items =>
      [...new Set(items.map(origin))];

    const supportRoots = roots(supports);
    const challengeRoots = roots(challenges);

    const overlap = supportRoots.filter(
      id => challengeRoots.includes(id)
    );

    const warnings = [];

    if (overlap.length) {
      warnings.push(
        "Support and challenge may derive from the same observation."
      );
    }

    if (!challenges.length) {
      warnings.push(
        "No counter-evidence supplied. This does not mean none exists."
      );
    }

    if (!gaps.length) {
      warnings.push(
        "No investigative gaps supplied. Review completeness manually."
      );
    }

    return {
      id: h.id,
      title: h.title,
      hypothesis_status: "unresolved",

      supporting_evidence: supports.map(id => ({
        id,
        root_evidence_id: origin(id)
      })),

      challenging_evidence: challenges.map(id => ({
        id,
        root_evidence_id: origin(id)
      })),

      independent_support_roots: supportRoots,
      independent_challenge_roots: challengeRoots,

      source_conflicts: overlap,

      unanswered_questions: gaps.map(g => ({
        question: g.question,
        why: g.why,
        discriminator: g.discriminator
      })),

      warnings
    };
  });

  const questions = [];

  for (const h of compiled) {
    for (const gap of h.unanswered_questions) {
      questions.push({
        ...gap,
        hypothesis_id: h.id
      });
    }
  }

  const relevance = new Map();

  for (const q of questions) {
    const related = relevance.get(q.discriminator)
      ?? new Set();

    related.add(q.hypothesis_id);
    relevance.set(q.discriminator, related);
  }

  questions.sort((a, b) =>
    relevance.get(b.discriminator).size -
    relevance.get(a.discriminator).size ||
    a.discriminator.localeCompare(b.discriminator) ||
    a.hypothesis_id.localeCompare(b.hypothesis_id)
  );

  return {
    case_id: caseReview.case_id,
    hypotheses: compiled,

    prioritized_questions: questions.map(q => ({
      ...q,
      cross_hypothesis_relevance:
        relevance.get(q.discriminator).size
    })),

    declarations: [
      "Hypotheses are investigator-entered, not AI-generated.",
      "Distinct evidence roots do not establish statistical independence.",
      "No guilt determination or numerical probability is generated."
    ]
  };
}
