from typing import List, Optional

from pydantic import BaseModel, Field


class ExerciseCreate(BaseModel):
    name: str
    sets: int = 0
    reps: int = 0
    duration_minutes: int = 0
    bodyweight: bool = True
    notes: Optional[str] = None


class WorkoutCreate(BaseModel):
    workout_name: str
    date: str
    focus: Optional[str] = None
    notes: Optional[str] = None
    exercises: List[ExerciseCreate] = Field(default_factory=list)


class WorkoutUpdate(BaseModel):
    workout_name: Optional[str] = None
    date: Optional[str] = None
    focus: Optional[str] = None
    notes: Optional[str] = None
    exercises: Optional[List[ExerciseCreate]] = None
