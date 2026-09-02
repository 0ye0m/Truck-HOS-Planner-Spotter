"""Engine-specific exceptions."""

from __future__ import annotations


class HosEngineError(Exception):
    """Base class for HOS engine errors."""


class InfeasibleTripError(HosEngineError):
    """
    Raised when a trip cannot be scheduled under the configured rules.

    `explanation` is a human-readable sentence suitable for display in the UI.
    """

    def __init__(self, explanation: str, rule: str = "hos-infeasible"):
        super().__init__(explanation)
        self.explanation = explanation
        self.rule = rule
