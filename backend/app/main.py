from datetime import datetime
from typing import Any, Dict, List

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .db import workouts_collection
from .schemas import WorkoutCreate, WorkoutUpdate

app = FastAPI(title="Day Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def serialize_workout(workout: Dict[str, Any]) -> Dict[str, Any]:
    workout["id"] = str(workout.pop("_id"))
    return workout


def build_workout_document(payload: WorkoutCreate) -> Dict[str, Any]:
    exercises = [exercise.model_dump() for exercise in payload.exercises]
    total_volume = sum((exercise.sets * exercise.reps) for exercise in payload.exercises)
    now = datetime.utcnow().isoformat()

    return {
        "workout_name": payload.workout_name,
        "date": payload.date,
        "focus": payload.focus,
        "notes": payload.notes,
        "exercises": exercises,
        "total_volume": total_volume,
        "created_at": now,
        "updated_at": now,
    }


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "message": "Day Tracker backend is running"}


@app.get("/api/workouts")
def get_workouts(date: str | None = Query(default=None)) -> List[Dict[str, Any]]:
    query = {"date": date} if date else {}
    workouts = list(workouts_collection.find(query).sort("date", -1))
    return [serialize_workout(workout) for workout in workouts]


@app.post("/api/workouts", status_code=201)
def create_workout(payload: WorkoutCreate) -> Dict[str, Any]:
    workout_document = build_workout_document(payload)
    result = workouts_collection.insert_one(workout_document)
    created = workouts_collection.find_one({"_id": result.inserted_id})
    if not created:
        raise HTTPException(status_code=500, detail="Workout could not be created.")
    return serialize_workout(created)


@app.put("/api/workouts/{workout_id}")
def update_workout(workout_id: str, payload: WorkoutUpdate) -> Dict[str, Any]:
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout id.")

    update_data = payload.model_dump(exclude_unset=True)
    if "exercises" in update_data and update_data["exercises"] is not None:
        update_data["exercises"] = [exercise.model_dump() for exercise in payload.exercises]
        update_data["total_volume"] = sum(
            (exercise.sets * exercise.reps) for exercise in payload.exercises
        )

    update_data["updated_at"] = datetime.utcnow().isoformat()

    result = workouts_collection.find_one_and_update(
        {"_id": ObjectId(workout_id)},
        {"$set": update_data},
        return_document=True,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Workout not found.")
    return serialize_workout(result)


@app.delete("/api/workouts/{workout_id}")
def delete_workout(workout_id: str) -> Dict[str, str]:
    if not ObjectId.is_valid(workout_id):
        raise HTTPException(status_code=400, detail="Invalid workout id.")

    result = workouts_collection.delete_one({"_id": ObjectId(workout_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found.")
    return {"message": "Workout deleted successfully"}
