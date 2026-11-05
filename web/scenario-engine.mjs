/**
 * EvidenceForge X
 * Alternative Scenario Reconstruction Engine
 * Deterministic, local, explainable.
 * No automated guilt determination.
 */

import { reviewCase } from "./engine.mjs";
import { analyzeHypotheses } from "./hypotheses.mjs";

const asArray = value =>
  Array.isArray(value) ? value : [];

const sortIds = (a, b) => a.localeCompare(b);

function evidenceRoot(index, id) {
  const visited = new Set();
  let current = id;

  while (true) {
    if (visited.has(current)) {
      throw Error("Evidence derivation cycle");
    }

    visited.add(current);

    const item = index.get(current);

    if (!item) {
      throw Error("Missing evidence reference");
    }

    if (!item.derived_from) {
      return current;
    }

    current = item.derived_from;
  }
}

export function reconstructScenarios(
  document,
  review = reviewCase(document)
) {
  if (
    !document ||
    typeof document !== "object" ||
    Array.isArray(document)
  ) {
    throw Error("Valid case object required");
  }

  const analysis = analyzeHypotheses(document, review);

  const evidence = new Map(
    review.evidence.map(item => [item.id, item])
  );

  const timeline = review.timeline.map(event => ({
    id: event.id,
    timestamp_utc: event.timestamp_utc,
    description: event.description,
    evidence_ids: [...event.evidence_ids]
  }));

  const declaredContradictions =
    review.links.filter(
      link => link.type === "contradicts"
    );

  const scenarios = analysis.hypotheses.map(h => {
    const supports = new Set(
      h.independent_support_roots
    );

    const challenges = new Set(
      h.independent_challenge_roots
    );

    const overlaps = [...supports]
      .filter(id => challenges.has(id))
      .sort(sortIds);

    const used = new Set([
      ...h.supporting_evidence.map(e => e.id),
      ...h.challenging_evidence.map(e => e.id)
    ]);

    const relatedEvents = timeline.filter(event =>
      event.evidence_ids.some(id => used.has(id))
    );

    const contradictions =
      declaredContradictions
        .filter(link =>
          used.has(link.from) ||
          used.has(link.to)
        )
        .map(link => ({
          from: link.from,
          to: link.to,
          status: "declared-unverified"
        }));

    const gaps = h.unanswered_questions.map(g => ({
      question: g.question,
      reason: g.why,
      discriminator: g.discriminator
    }));

    return {
      id: h.id,
      title: h.title,
      status: "unresolved",
      supporting_roots: [...supports].sort(sortIds),
      challenging_roots: [...challenges].sort(sortIds),
      overlapping_roots: overlaps,
      related_events: relatedEvents,
      declared_contradictions: contradictions,
      investigative_gaps: gaps,
      cautions: [...h.warnings],
      next_checks: gaps.map(g => ({
        question: g.question,
        reason: g.reason,
        source: "investigator-provided-gap"
      }))
    };
  });

  const referencedRoots = new Set(
    scenarios.flatMap(s => [
      ...s.supporting_roots,
      ...s.challenging_roots
    ])
  );

  const unreferencedEvidence =
    review.evidence
      .filter(item =>
        !referencedRoots.has(
          evidenceRoot(evidence, item.id)
        )
      )
      .map(item => item.id)
      .sort(sortIds);

  const questions =
    asArray(analysis.prioritized_questions)
      .map(q => ({
        question: q.question,
        reason: q.why,
        discriminator: q.discriminator,
        related_scenario: q.hypothesis_id,
        cross_scenario_relevance:
          q.cross_hypothesis_relevance
      }));

  return {
    schema: "evidenceforge.scenario-reconstruction.v1",
    case_id: review.case_id,
    scenarios,
    timeline,
    unreferenced_evidence_ids: unreferencedEvidence,
    investigative_questions: questions,
    disclaimers: [
      "All hypotheses are investigator supplied.",
      "No automated guilt or identity determination.",
      "Contradictions require human verification.",
      "Source roots do not prove independence.",
      "This analysis does not establish admissibility."
    ]
  };
}
