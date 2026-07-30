"""
validation_hook.py

User-validation interface for the document identification stage.

Design principle
----------------
AuditPipeline accepts a ValidationCallback — an object that knows HOW
to present the identified documents to a user and collect their decision.

Two implementations are provided:
    CliValidationCallback   — used today (terminal / test scripts)
    AsyncQueueCallback      — used when FastAPI WebSocket is added later

The pipeline code stays identical; only the callback changes.

Chat-agent flow
---------------
    1. identify_documents() runs — results stored in self._identified_documents
    2. pipeline calls await callback.validate(identified_docs)
    3. callback returns ValidatedDocuments(approved=True) or with corrections
    4. pipeline applies corrections before parse_documents()

Why implement it now, not later?
---------------------------------
If this hook is added at frontend-integration time, AuditPipeline.run()
would need to become an async generator and every caller refactored.
Adding the thin interface now costs ~zero; skipping it costs a full
pipeline rewrite later.
"""
from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

# ============================================================
# DATA TYPES
# ============================================================

@dataclass
class DocumentCorrection:
    """User's manual override for one identified document."""
    filename: str
    new_matched_category: str


@dataclass
class ValidationResult:
    """Returned by every ValidationCallback.validate() call."""
    approved: bool                          # True → proceed as-is
    corrections: list[DocumentCorrection] = field(default_factory=list)
    # If approved=False and corrections is empty → user rejected; pipeline should stop


# ============================================================
# ABSTRACT PROTOCOL
# ============================================================

class ValidationCallback(ABC):
    """Implement this to plug any UI into the pipeline's validation step."""

    @abstractmethod
    async def validate(
        self,
        identified_docs: list[dict],
    ) -> ValidationResult:
        """Present identified_docs to the user; return their decision."""
        ...


# ============================================================
# CLI IMPLEMENTATION  (works today, no frontend needed)
# ============================================================

class CliValidationCallback(ValidationCallback):
    """Prints identification results to the terminal and reads stdin."""

    async def validate(self, identified_docs: list[dict]) -> ValidationResult:
        print("\n" + "=" * 60)
        print("Document Identification Results")
        print("=" * 60)

        for i, doc in enumerate(identified_docs, 1):
            status = "✓" if doc.get("confidence") != "low" else "?"
            print(
                f"  {i}. {status} {doc['filename']}\n"
                f"       → {doc['matched_category']} "
                f"({doc.get('confidence','?')})\n"
                f"       Reason: {doc.get('reasoning','')}"
            )

        print("\nDo these look correct? [y = proceed / n = edit mappings]: ", end="")
        # run_in_executor so the coroutine doesn't block the event loop
        answer = await asyncio.get_event_loop().run_in_executor(
            None, input
        )

        if answer.strip().lower() in ("y", "yes", ""):
            return ValidationResult(approved=True)

        # --- let user correct per-document ---
        corrections: list[DocumentCorrection] = []
        for i, doc in enumerate(identified_docs, 1):
            print(f"\n  {i}. {doc['filename']}  (current: {doc['matched_category']})")
            print("     Enter new category (or press Enter to keep): ", end="")
            new_cat = await asyncio.get_event_loop().run_in_executor(None, input)
            if new_cat.strip():
                corrections.append(
                    DocumentCorrection(
                        filename=doc["filename"],
                        new_matched_category=new_cat.strip(),
                    )
                )

        return ValidationResult(approved=True, corrections=corrections)


# ============================================================
# ASYNC QUEUE IMPLEMENTATION  (ready for WebSocket/FastAPI)
# ============================================================

class AsyncQueueCallback:
    """
    How it works:
        1. pipeline.identify_documents() calls self._validation_callback.validate(docs)
        2. AsyncQueueCallback.validate() puts the docs into question_queue and WAITS
        3. The WebSocket handler reads from question_queue and sends docs to the browser
        4. Browser user approves/edits and sends back a message
        5. WebSocket handler puts the answer into answer_queue
        6. AsyncQueueCallback.validate() reads the answer and returns it
        7. identify_documents() continues with the approved/corrected list
    """
 
    def __init__(self):
        self.question_queue: asyncio.Queue = asyncio.Queue()
        self.answer_queue:   asyncio.Queue = asyncio.Queue()
 
    async def validate(self, identified_docs: list[dict]):
        # Send the question to the WebSocket handler
        await self.question_queue.put({"identified_docs": identified_docs})
 
        # Block here until the WebSocket handler puts an answer in
        answer = await self.answer_queue.get()
 
        # Import your existing types
        from agent.validation.validation_hook import ValidationResult, DocumentCorrection
 
        corrections = [
            DocumentCorrection(
                filename=c["filename"],
                new_matched_category=c["new_matched_category"],
            )
            for c in answer.get("corrections", [])
        ]
 
        return ValidationResult(
            approved=answer.get("approved", True),
            corrections=corrections,
        )



def apply_corrections(
    identified_docs: list[dict],
    corrections: list[DocumentCorrection],
) -> list[dict]:
    """Apply user corrections to the identified documents list."""
    correction_map = {c.filename: c.new_matched_category for c in corrections}
    for doc in identified_docs:
        if doc["filename"] in correction_map:
            doc["matched_category"] = correction_map[doc["filename"]]
    return identified_docs