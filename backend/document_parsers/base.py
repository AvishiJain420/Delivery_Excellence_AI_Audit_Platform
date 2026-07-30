"""
Base parser interface. Every format-specific parser implements
this so the factory can call them uniformly.
"""

from abc import ABC, abstractmethod
from agent.document import Document


class BaseParser(ABC):

    @abstractmethod
    def parse(
        self,
        content_bytes: bytes,
        filename: str,
        metadata: dict
    ) -> Document:
        """
        Parse raw file bytes into a structured Document object.

        Args:
            content_bytes: raw binary content of the file
            filename: original filename
            metadata: dict with source info to attach to document

        Returns:
            Document with text/tables/images/content_sequence populated.
            On failure, returns Document with parse_error set —
            never raises, so the pipeline continues processing
            other documents even if one file fails.
        """
        raise NotImplementedError