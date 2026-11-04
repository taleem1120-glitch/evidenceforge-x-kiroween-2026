import { reviewCase } from "./engine.mjs";
import { verifyFile } from "./hashing.mjs";

const $ = id => document.getElementById(id);

const demo = {
  case_id: "EFX-DEMO-2026",
  evidence: [
    {
      id: "E001",
      source: "Mobile forensic export",
      sha256: "a".repeat(64)
    },
    {
      id: "E002",
      source: "Bank transaction statement",
      sha256: "b".repeat(64)
    },
    {
      id: "E003",
      source: "Mobile forensic export",
      derived_from: "E001"
    }
  ],
  events: [
    {
      id: "EV001",
      timestamp: "2026-10-30T09:00:00+03:00",
      description: "Synthetic account message recorded.",
      evidence_ids: ["E001"]
    },
    {
      id: "EV002",
      timestamp: "2026-10-30T10:30:00+03:00",
      description: "Synthetic payment event recorded.",
      evidence_ids: ["E002"]
    },
    {
      id: "EV003",
      timestamp: "2026-10-30T11:00:00+03:00",
      description: "Derived screenshot reviewed.",
      evidence_ids: ["E003"]
    }
  ],
  links: [
    {
      from: "E001",
      to: "E002",
      type: "references"
    },
    {
      from: "E001",
      to: "E003",
      type: "derived_from"
    },
    {
      from: "E002",
      to: "E003",
      type: "contradicts"
    }
  ]
};

let result = null;
let currentView = "timeline";

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  if (className) node.className = className;
  return node;
}

function setStatus(message, error = false) {
  const node = $("status");
  node.textContent = message;
  node.dataset.error = String(error);
}

function updateMetrics() {
  const values = {
    eventsCount: result?.timeline.length,
    evidenceCount: result?.evidence.length,
    sourcesCount: result?.source_groups.length,
    conflictsCount: result?.contradictions.length
  };

  for (const [id, value] of Object.entries(values)) {
    $(id).textContent = value ?? "—";
  }
}

function addEntry(container, title, details) {
  const card = element("article", null, "evidence-entry");
  card.appendChild(element("h3", title));

  for (const detail of details) {
    card.appendChild(element("p", detail));
  }

  container.appendChild(card);
}

function showTimeline(container) {
  for (const event of result.timeline) {
    addEntry(container, event.description, [
      event.timestamp_utc,
      `Event: ${event.id}`,
      `Evidence: ${event.evidence_ids.join(", ")}`
    ]);
  }
}

function showEvidence(container) {
  for (const item of result.evidence) {
    addEntry(container, item.id, [
      `Source: ${item.source}`,
      `Derived from: ${item.derived_from || "Original record"}`,
      `SHA-256: ${item.sha256 || "Not supplied"}`
    ]);
  }
}

function showRelationships(container) {
  if (!result.links.length) {
    container.appendChild(element("p", "No relationships recorded."));
  }

  for (const link of result.links) {
    addEntry(container, link.type, [
      `${link.from} → ${link.to}`,
      "Relationship supplied by case data; human review required."
    ]);
  }

  container.appendChild(element(
    "h3",
    "Evidence source groups"
  ));

  for (const group of result.source_groups) {
    addEntry(container, group.source, [
      group.evidence_ids.join(", ")
    ]);
  }
}

function showReport(container) {
  container.appendChild(element(
    "h3",
    `Case review: ${result.case_id}`
  ));

  container.appendChild(element(
    "p",
    `Timeline events: ${result.timeline.length}`
  ));

  container.appendChild(element(
    "p",
    `Declared contradictions: ${result.contradictions.length}`
  ));

  for (const caution of result.cautions) {
    container.appendChild(element("p", caution));
  }

  const download = element("button", "Export JSON review");
  download.addEventListener("click", () => {
    const blob = new Blob(
      [JSON.stringify(result, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "evidenceforge-review.json";
    anchor.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  container.appendChild(download);
}

function showVerification(container) {
  container.appendChild(element(
    "h3",
    "Local SHA-256 verification"
  ));

  container.appendChild(element(
    "p",
    "Select a local file and enter its reference SHA-256 hash."
  ));

  const reference = element("input");
  reference.placeholder = "64-character reference SHA-256";
  reference.setAttribute("aria-label", "Reference SHA-256");

  const file = element("input");
  file.type = "file";
  file.setAttribute("aria-label", "Evidence file");

  const button = element("button", "Verify file");
  const output = element("pre", "");

  button.addEventListener("click", async () => {
    output.textContent = "Calculating SHA-256...";

    try {
      if (!file.files?.length) {
        throw Error("Select a file first.");
      }

      const verification = await verifyFile(
        file.files[0],
        reference.value.trim()
      );

      output.textContent = JSON.stringify(
        verification,
        null,
        2
      );
    } catch (error) {
      output.textContent = `Verification error: ${error.message}`;
    }
  });

  container.append(reference, file, button, output);
}

function render() {
  updateMetrics();

  const container = $("view");
  container.replaceChildren();

  document.querySelectorAll("[data-view]").forEach(button => {
    const active = button.dataset.view === currentView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (currentView === "verify") {
    showVerification(container);
    return;
  }

  if (!result) {
    container.appendChild(element(
      "p",
      "Load the synthetic demonstration to begin."
    ));
    return;
  }

  switch (currentView) {
    case "timeline":
      showTimeline(container);
      break;
    case "evidence":
      showEvidence(container);
      break;
    case "relationships":
      showRelationships(container);
      break;
    case "report":
      showReport(container);
      break;
  }
}

function analyze() {
  try {
    const raw = $("caseData").value;

    if (raw.length > 2 * 1024 * 1024) {
      throw Error("JSON exceeds the 2 MB input limit.");
    }

    const parsed = JSON.parse(raw);
    const reviewed = reviewCase(parsed);

    result = reviewed;
    currentView = "timeline";
    setStatus(`Analysis completed: ${result.case_id}`);
    render();
  } catch (error) {
    result = null;
    setStatus(`Analysis failed: ${error.message}`, true);
    render();
  }
}

$("loadDemo").addEventListener("click", () => {
  $("caseData").value = JSON.stringify(demo, null, 2);
  analyze();
});

$("analyze").addEventListener("click", analyze);

$("fileInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    setStatus("File exceeds the 2 MB limit.", true);
    event.target.value = "";
    return;
  }

  try {
    $("caseData").value = await file.text();
    analyze();
  } catch (error) {
    setStatus(`Could not read file: ${error.message}`, true);
  }

  event.target.value = "";
});

document.querySelectorAll("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    currentView = button.dataset.view;
    render();
  });
});

render();
