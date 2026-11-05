/**
 * EvidenceForge X — Custody Review Engine
 * Browser-local, deterministic, human-reviewed.
 * Does not certify evidence authenticity.
 */

import { reviewCase, normalizeTime } from "./engine.mjs";

const isObject = value =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const ACTIONS = new Set([
  "collected",
  "transferred",
  "received",
  "examined",
  "stored",
  "released"
]);

export function auditCustody(
  doc,
  reviewed = reviewCase(doc)
) {
  if (!isObject(doc)) {
    throw Error("Valid case document required");
  }

  const entries = doc.custody_events ?? [];

  if (!Array.isArray(entries) || entries.length > 5000) {
    throw Error("Invalid custody_events array");
  }

  const evidence = new Set(
    reviewed.evidence.map(item => item.id)
  );

  const ids = new Set();
  const byEvidence = new Map();
  const findings = [];

  for (const entry of entries) {
    if (
      !isObject(entry) ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      entry.id.length > 120 ||
      ids.has(entry.id)
    ) {
      throw Error("Invalid or duplicate custody event ID");
    }

    ids.add(entry.id);

    if (
      typeof entry.evidence_id !== "string" ||
      !evidence.has(entry.evidence_id)
    ) {
      throw Error("Unknown custody evidence reference");
    }

    if (!ACTIONS.has(entry.action)) {
      throw Error("Invalid custody action");
    }

    if (
      typeof entry.actor !== "string" ||
      !entry.actor.trim() ||
      entry.actor.length > 240
    ) {
      throw Error("Custody actor required");
    }

    const timestamp_utc = normalizeTime(entry.timestamp);

    const event = {
      id: entry.id,
      evidence_id: entry.evidence_id,
      action: entry.action,
      actor: entry.actor,
      timestamp_utc
    };

    const list = byEvidence.get(entry.evidence_id) ?? [];
    list.push(event);
    byEvidence.set(entry.evidence_id, list);
  }

  const trails = [];

  for (const item of reviewed.evidence) {
    const events = [...(byEvidence.get(item.id) ?? [])]
      .sort((a, b) =>
        Date.parse(a.timestamp_utc) -
        Date.parse(b.timestamp_utc) ||
        a.id.localeCompare(b.id)
      );

    if (!events.length) {
      findings.push({
        code: "NO_CUSTODY_EVENTS",
        evidence_id: item.id,
        severity: "review",
        message: "No custody history was supplied."
      });
    } else {
      if (events[0].action !== "collected") {
        findings.push({
          code: "COLLECTION_NOT_DOCUMENTED_FIRST",
          evidence_id: item.id,
          severity: "review",
          message: "First documented event is not collection."
        });
      }

      const collections = events.filter(
        event => event.action === "collected"
      );

      if (collections.length > 1) {
        findings.push({
          code: "REPEATED_COLLECTION",
          evidence_id: item.id,
          severity: "review",
          message:
            "Multiple collection events were recorded. " +
            "Verify whether they refer to the same item."
        });
      }

      for (let i = 1; i < events.length; i++) {
        if (events[i - 1].action === "released") {
          findings.push({
            code: "HANDLING_AFTER_RELEASE",
            evidence_id: item.id,
            severity: "review",
            message:
              "Handling occurred after a recorded release. " +
              "Review subsequent custody documentation."
          });
        }
      }

      const transfers = events.filter(
        event => event.action === "transferred"
      );

      const receipts = events.filter(
        event => event.action === "received"
      );

      if (transfers.length && !receipts.length) {
        findings.push({
          code: "TRANSFER_WITHOUT_RECEIPT",
          evidence_id: item.id,
          severity: "review",
          message:
            "Transfer was recorded without a receipt event. " +
            "Verify receiving-party documentation."
        });
      }
    }

    if (!item.sha256) {
      findings.push({
        code: "NO_REFERENCE_HASH",
        evidence_id: item.id,
        severity: "review",
        message: "Evidence has no reference SHA-256."
      });
    }

    trails.push({
      evidence_id: item.id,
      events
    });
  }

  return {
    schema: "evidenceforge.custody-review.v1",
    case_id: reviewed.case_id,
    trails,
    findings,
    limitations: [
      "Custody records are supplied by the analyst.",
      "No event authenticity is independently verified.",
      "SHA-256 does not prove legal admissibility.",
      "No missing custody events are invented.",
      "Human review remains mandatory."
    ]
  };
}

