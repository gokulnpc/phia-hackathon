"""Pydantic v2 models for the fit-score API and worker payloads."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, NonNegativeInt

Confidence = Literal["low", "medium", "high"]


class Breakdown(BaseModel):
    silhouette: NonNegativeInt = Field(ge=0, le=100)
    color_palette: NonNegativeInt = Field(ge=0, le=100)
    closet_overlap: NonNegativeInt = Field(ge=0, le=100)
    occasion_fit: NonNegativeInt = Field(ge=0, le=100)
    brand_affinity: NonNegativeInt = Field(ge=0, le=100)


class MatchingItem(BaseModel):
    closet_item_id: str
    reason: str = Field(max_length=120)


class FitScoreResult(BaseModel):
    overall_score: NonNegativeInt = Field(ge=0, le=100)
    breakdown: Breakdown
    matching_items: list[MatchingItem] = Field(default_factory=list)
    conflicts: list[MatchingItem] = Field(default_factory=list)
    explanation: str
    confidence: Confidence


class FitScoreSubmitRequest(BaseModel):
    url: str
    extracted: dict[str, object] = Field(default_factory=dict)
