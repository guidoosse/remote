const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { GarminConnect } = require('garmin-connect');
const FitParser = require('fit-file-parser');
const { XMLParser } = require('fast-xml-parser');
const multer = require('multer');
const yaml = require('js-yaml');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: process.env.SPORTS_ENV_FILE || '/sports/.env' });
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateSecret, verify } = require('otplib');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const legacyMongoUri = process.env.MONGO_URI ? `${process.env.MONGO_URI}/${process.env.MONGO_DB || 'calisthenics_tracker'}` : null;
const resolvedMongoUri = process.env.MONGODB_URI || legacyMongoUri || 'mongodb://127.0.0.1:27017/calisthenics-tracker';
const USE_MEMORY_DB = process.env.USE_MEMORY_DB === 'true' || (!process.env.MONGODB_URI && !process.env.MONGO_URI && process.env.NODE_ENV !== 'production');
const MONGODB_URI = resolvedMongoUri;
const MONGO_CONNECT_RETRIES = Number(process.env.MONGO_CONNECT_RETRIES || 12);
const MONGO_RETRY_DELAY_MS = Number(process.env.MONGO_RETRY_DELAY_MS || 2500);
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || '';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || '';
const AZURE_OPENAI_MODEL = process.env.AZURE_OPENAI_MODEL || AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-05-01-preview';
const AZURE_FOUNDRY_API_VERSION = process.env.AZURE_FOUNDRY_API_VERSION || '';
const AZURE_OPENAI_API_VERSIONS = (process.env.AZURE_OPENAI_API_VERSIONS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const AZURE_FOUNDRY_API_VERSIONS = [
  ...AZURE_OPENAI_API_VERSIONS,
  ...(process.env.AZURE_FOUNDRY_API_VERSIONS || '').split(',').map((value) => value.trim()).filter(Boolean),
  AZURE_OPENAI_API_VERSION,
  AZURE_FOUNDRY_API_VERSION,
  '2024-05-01-preview',
  '2024-08-01-preview',
  '2024-10-21',
  '2024-06-01',
].filter((value, index, all) => all.indexOf(value) === index);
const SPORTS_SYNC_PAGE_SIZE = Number(process.env.SPORTS_SYNC_PAGE_SIZE || 100);
const SPORTS_SYNC_MAX_ACTIVITIES = Number(process.env.SPORTS_SYNC_MAX_ACTIVITIES || 2000);
const SPORTS_UPLOAD_MAX_MB = Number(process.env.SPORTS_UPLOAD_MAX_MB || 25);
const SPORTS_CREDENTIALS_SECRET = process.env.SPORTS_CREDENTIALS_SECRET || JWT_SECRET;
const CORS_ALLOWED_HOSTS = (process.env.CORS_ALLOWED_HOSTS || 'localhost,127.0.0.1,libra')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const WEAK_SECRETS = new Set([
  '',
  'change-me-in-production',
  'change-me',
  'password',
  'secret',
  'changeme',
  'default',
  'change-me-sports-credentials-secret',
]);
const APP_SETTING_REGISTRATION_ENABLED = 'registration_enabled';
let mongoServer;

function normalizeHost(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch (error) {
    return value.split(':')[0].toLowerCase();
  }
}

function validateProductionConfiguration() {
  if (NODE_ENV !== 'production') return;

  const failures = [];
  if (WEAK_SECRETS.has(String(JWT_SECRET).trim().toLowerCase()) || String(JWT_SECRET).trim().length < 32) {
    failures.push('JWT_SECRET must be set to a strong value (min 32 chars) in production.');
  }
  if (
    WEAK_SECRETS.has(String(SPORTS_CREDENTIALS_SECRET).trim().toLowerCase())
    || String(SPORTS_CREDENTIALS_SECRET).trim().length < 32
  ) {
    failures.push('SPORTS_CREDENTIALS_SECRET must be set to a strong value (min 32 chars) in production.');
  }
  if (!CORS_ALLOWED_HOSTS.length || CORS_ALLOWED_HOSTS.includes('localhost') || CORS_ALLOWED_HOSTS.includes('127.0.0.1')) {
    failures.push('CORS_ALLOWED_HOSTS must be restricted to your public host names in production.');
  }

  if (failures.length) {
    throw new Error(`Production configuration invalid: ${failures.join(' ')}`);
  }
}

async function isRegistrationEnabled() {
  const userCount = await User.countDocuments({});
  if (userCount === 0) {
    return { enabled: true, userCount };
  }

  const setting = await AppSetting.findOne({ key: APP_SETTING_REGISTRATION_ENABLED }).lean();
  if (!setting || typeof setting.bool_value !== 'boolean') {
    return { enabled: true, userCount };
  }
  return { enabled: Boolean(setting.bool_value), userCount };
}

async function setRegistrationEnabled(enabled) {
  const setting = await AppSetting.findOneAndUpdate(
    { key: APP_SETTING_REGISTRATION_ENABLED },
    { $set: { bool_value: Boolean(enabled) } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return Boolean(setting?.bool_value);
}

async function appendAdminAuditLog({ actorUserId, action, targetUserId = null, details = null }) {
  try {
    if (!actorUserId || !action) return;
    await AdminAuditLog.create({
      actor_user_id: new mongoose.Types.ObjectId(actorUserId),
      action: String(action),
      target_user_id: targetUserId ? new mongoose.Types.ObjectId(targetUserId) : null,
      details: details || null,
    });
  } catch (error) {
    console.error(`Failed to persist admin audit log for action "${action}": ${error.message}`);
  }
}

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const requestHost = normalizeHost(origin);
      const isAllowed = CORS_ALLOWED_HOSTS.some((allowedHost) => {
        const normalizedAllowedHost = normalizeHost(allowedHost);
        return requestHost === normalizedAllowedHost || requestHost.endsWith(`.${normalizedAllowedHost}`);
      });

      if (!isAllowed) {
        callback(new Error(`Origin host "${requestHost}" is not allowed by CORS.`));
        return;
      }

      callback(null, true);
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});
app.use('/api/auth', authLimiter);

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    sets: { type: Number, default: 0 },
    reps: { type: Number, default: 0 },
    duration_minutes: { type: Number, default: 0 },
    bodyweight: { type: Boolean, default: true },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const workoutSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workout_name: { type: String, required: true },
    date: { type: String, required: true },
    focus: { type: String, default: '' },
    notes: { type: String, default: '' },
    exercises: [exerciseSchema],
    total_volume: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const exerciseLibrarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    category: { type: String, default: 'general' },
    bodyweight: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

const dogExerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    reps: { type: Number, default: 0 },
    duration_minutes: { type: Number, default: 0 },
    rewarded: { type: Boolean, default: false },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const dogTrainingSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dog_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Dog', required: true },
    session_name: { type: String, required: true },
    date: { type: String, required: true },
    notes: { type: String, default: '' },
    exercises: [dogExerciseSchema],
    total_minutes: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const dogSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    breed: { type: String, default: '' },
    birth_year: { type: Number, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

const dogExerciseLibrarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    category: { type: String, default: 'general' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true },
);

const journalSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Professional', 'Private'],
      default: 'Professional',
    },
    reported: { type: Boolean, default: false },
    reportedDate: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const taskSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    category: { type: String, default: 'General' },
    owner: { type: String, default: '@me' },
    deadline: { type: String, default: '' },
    status: { type: String, default: 'Next Action' },
    journal_label: { type: String, default: 'Journal' },
    journal_category: {
      type: String,
      enum: ['Professional', 'Private'],
      default: 'Professional',
    },
    background_query: { type: String, default: '' },
    background_url: { type: String, default: '' },
    subtasks: { type: [String], default: [] },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const adminAuditLogSchema = new mongoose.Schema(
  {
    actor_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    target_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

const sportsActivitySchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activity_id: { type: String, required: true },
    source: { type: String, enum: ['garmin'], default: 'garmin' },
    activity_name: { type: String, default: '' },
    activity_type: { type: String, default: '' },
    start_time: { type: Date, required: true, index: true },
    distance_km: { type: Number, default: 0 },
    duration_s: { type: Number, default: 0 },
    moving_duration_s: { type: Number, default: 0 },
    average_speed_mps: { type: Number, default: null },
    max_speed_mps: { type: Number, default: null },
    average_hr: { type: Number, default: null },
    max_hr: { type: Number, default: null },
    vo2max: { type: Number, default: null },
    lactate_threshold_hr: { type: Number, default: null },
    lactate_threshold_pace_min_per_km: { type: Number, default: null },
    elevation_gain_m: { type: Number, default: 0 },
    calories: { type: Number, default: 0 },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);
sportsActivitySchema.index({ user_id: 1, activity_id: 1 }, { unique: true });

const sportsSyncStateSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    last_sync_at: { type: Date, default: null },
    last_sync_mode: { type: String, enum: ['full', 'incremental'], default: null },
    last_error: { type: String, default: '' },
    total_synced: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const sportsAuthStateSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    oauth1_token: { type: mongoose.Schema.Types.Mixed, default: null },
    oauth2_token: { type: mongoose.Schema.Types.Mixed, default: null },
    garmin_max_hr: { type: Number, default: null },
    garmin_resting_hr: { type: Number, default: null },
    garmin_profile_updated_at: { type: Date, default: null },
    last_authenticated_at: { type: Date, default: null },
    token_source: { type: String, default: '' },
    last_error: { type: String, default: '' },
  },
  { timestamps: true },
);

const sportsSyncRunSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: ['full', 'incremental'], required: true },
    status: { type: String, enum: ['running', 'success', 'error'], required: true },
    started_at: { type: Date, required: true },
    completed_at: { type: Date, default: null },
    duration_ms: { type: Number, default: null },
    fetched: { type: Number, default: 0 },
    inserted: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    used_cached_session: { type: Boolean, default: false },
    credential_source: { type: String, default: '' },
    error_message: { type: String, default: '' },
  },
  { timestamps: true },
);

const sportsCustomWorkoutSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    activity_id: { type: String, required: true },
    file_name: { type: String, required: true },
    file_format: { type: String, enum: ['fit', 'tcx', 'gpx'], required: true },
    file_size: { type: Number, required: true },
    parsed_summary: { type: mongoose.Schema.Types.Mixed, required: true },
    uploaded_at: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
sportsCustomWorkoutSchema.index({ user_id: 1, activity_id: 1 }, { unique: true });

const sportsAiInsightSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    insight_text: { type: String, default: '' },
    error_text: { type: String, default: '' },
    source: { type: String, enum: ['on_demand', 'summary'], default: 'on_demand' },
    generated_at: { type: Date, default: Date.now, index: true },
    context_snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);
sportsAiInsightSchema.index({ user_id: 1, generated_at: -1 });

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password_hash: { type: String, required: true },
    first_name: { type: String, default: '' },
    last_name: { type: String, default: '' },
    email: { type: String, default: '' },
    goal: { type: String, default: '' },
    workouts_enabled: { type: Boolean, default: true },
    dog_training_enabled: { type: Boolean, default: false },
    journal_enabled: { type: Boolean, default: false },
    sports_enabled: { type: Boolean, default: false },
    garmin_email: { type: String, default: '' },
    garmin_password_enc: { type: String, default: '' },
    sports_target_event_name: { type: String, default: '' },
    sports_target_event_date: { type: String, default: '' },
    sports_target_event_distance_km: { type: Number, default: null },
    sports_target_event_target_time: { type: String, default: '' },
    sports_target_event_activity_types: { type: [String], default: () => ['running'] },
    is_admin: { type: Boolean, default: false },
    mfa_enabled: { type: Boolean, default: false },
    mfa_secret: { type: String, default: '' },
  },
  { timestamps: true },
);

const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    bool_value: { type: Boolean, default: null },
    text_value: { type: String, default: '' },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);
const AppSetting = mongoose.model('AppSetting', appSettingSchema);
const Workout = mongoose.model('Workout', workoutSchema);
const ExerciseLibrary = mongoose.model('ExerciseLibrary', exerciseLibrarySchema);
const Dog = mongoose.model('Dog', dogSchema);
const DogExerciseLibrary = mongoose.model('DogExerciseLibrary', dogExerciseLibrarySchema);
const DogTraining = mongoose.model('DogTraining', dogTrainingSchema);
const Journal = mongoose.model('Journal', journalSchema);
const Task = mongoose.model('Task', taskSchema);
const AdminAuditLog = mongoose.model('AdminAuditLog', adminAuditLogSchema);
const SportsActivity = mongoose.model('SportsActivity', sportsActivitySchema);
const SportsSyncState = mongoose.model('SportsSyncState', sportsSyncStateSchema);
const SportsAuthState = mongoose.model('SportsAuthState', sportsAuthStateSchema);
const SportsSyncRun = mongoose.model('SportsSyncRun', sportsSyncRunSchema);
const SportsCustomWorkout = mongoose.model('SportsCustomWorkout', sportsCustomWorkoutSchema);
const SportsAiInsight = mongoose.model('SportsAiInsight', sportsAiInsightSchema);

function serializeWorkout(workout) {
  return {
    id: workout._id.toString(),
    user_id: workout.user_id ? workout.user_id.toString() : null,
    workout_name: workout.workout_name,
    date: workout.date,
    focus: workout.focus,
    notes: workout.notes,
    exercises: workout.exercises || [],
    total_volume: workout.total_volume || 0,
    createdAt: workout.createdAt,
    updatedAt: workout.updatedAt,
  };
}

function serializeDog(dog) {
  return {
    id: dog._id.toString(),
    user_id: dog.user_id ? dog.user_id.toString() : null,
    name: dog.name,
    breed: dog.breed,
    birth_year: dog.birth_year,
    notes: dog.notes,
    createdAt: dog.createdAt,
    updatedAt: dog.updatedAt,
  };
}

function serializeDogTraining(session) {
  return {
    id: session._id.toString(),
    user_id: session.user_id ? session.user_id.toString() : null,
    dog_id: session.dog_id ? session.dog_id.toString() : null,
    session_name: session.session_name,
    date: session.date,
    notes: session.notes,
    exercises: session.exercises || [],
    total_minutes: session.total_minutes || 0,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function serializeJournal(entry) {
  return {
    id: entry._id.toString(),
    user_id: entry.user_id ? entry.user_id.toString() : null,
    title: entry.title,
    description: entry.description || '',
    category: entry.category || 'Professional',
    reported: Boolean(entry.reported),
    reportedDate: entry.reportedDate || null,
    deleted: Boolean(entry.deleted),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function serializeTask(task) {
  const taskId = task._id.toString();
  const query = task.background_query || buildFallbackTaskBackgroundQuery(task);
  const url = buildTaskBackgroundUrl(query, taskId);

  return {
    id: taskId,
    user_id: task.user_id ? task.user_id.toString() : null,
    title: task.title,
    category: task.category || 'General',
    owner: task.owner || '@me',
    deadline: task.deadline || '',
    status: task.status || 'Next Action',
    journal_label: task.journal_label || 'Journal',
    journal_category: task.journal_category || 'Professional',
    background_query: query,
    background_url: url,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    deleted: Boolean(task.deleted),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function buildFallbackTaskBackgroundQuery(taskLike = {}) {
  const titleWords = String(taskLike.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  const category = String(taskLike.category || 'general').toLowerCase().trim();
  const status = String(taskLike.status || 'next action').toLowerCase().trim();

  const terms = [category, status, ...titleWords].filter(Boolean).slice(0, 5);
  return terms.join(', ') || 'focus, productivity, planning';
}

function buildTaskBackgroundUrl(query, seed) {
  const compactQuery = String(query || 'focus, productivity')
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, ' ')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);

  const seedText = String(seed || Date.now());
  const hash = Array.from(`${seedText}|${compactQuery.join(',')}`).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

  const keywordSets = [
    {
      terms: ['focus', 'planning', 'deep work', 'professional', 'next action', 'scheduled', 'project'],
      palette: ['#d9f3e7', '#a8ddc6', '#5fb98c', '#2f7a59'],
    },
    {
      terms: ['waiting', 'support', 'review', 'analysis', 'research'],
      palette: ['#e3f0ff', '#b8d5ff', '#7ea8e7', '#3f5f99'],
    },
    {
      terms: ['health', 'workout', 'training', 'exercise', 'strength'],
      palette: ['#ffe8cf', '#ffc98a', '#f29b57', '#a45d2c'],
    },
    {
      terms: ['dog', 'obedience', 'habit', 'routine', 'private'],
      palette: ['#fbe9e0', '#f7c9b0', '#e48a6a', '#8b4e3d'],
    },
  ];

  const normalizedQuery = compactQuery.join(' ');
  let palette = keywordSets[hash % keywordSets.length].palette;
  for (const set of keywordSets) {
    if (set.terms.some((term) => normalizedQuery.includes(term))) {
      palette = set.palette;
      break;
    }
  }

  const [c1, c2, c3, c4] = palette;
  const pick = (shift, range, min) => (((hash >>> shift) % range) + min);
  const offsetA = pick(0, 70, 15);
  const offsetB = pick(4, 70, 15);
  const dotX = pick(8, 920, 120);
  const dotY = pick(12, 420, 100);
  const lineX = pick(16, 960, 100);
  const lineY = pick(20, 520, 80);

  const label = compactQuery.slice(0, 3).join(' · ') || 'focused action';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${c1}"/>
          <stop offset="45%" stop-color="${c2}"/>
          <stop offset="100%" stop-color="${c3}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.8">
          <stop offset="0%" stop-color="${c4}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${c4}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <circle cx="${dotX}" cy="${dotY}" r="280" fill="url(#glow)"/>
      <circle cx="${1600 - dotX}" cy="${900 - dotY}" r="220" fill="url(#glow)"/>
      <path d="M0 ${lineY} C420 ${lineY - offsetA}, 880 ${lineY + offsetB}, 1600 ${lineY - offsetA}" stroke="${c4}" stroke-opacity="0.24" stroke-width="28" fill="none"/>
      <path d="M0 ${lineY + 130} C460 ${lineY + 120}, 980 ${lineY + 180}, 1600 ${lineY + 90}" stroke="${c1}" stroke-opacity="0.22" stroke-width="18" fill="none"/>
      <g opacity="0.18" fill="${c4}">
        <rect x="${lineX}" y="120" width="180" height="180" rx="28"/>
        <rect x="${(lineX + 260) % 1350}" y="520" width="210" height="210" rx="36"/>
      </g>
      <text x="70" y="840" font-size="34" fill="${c4}" fill-opacity="0.45" font-family="Inter, Arial, sans-serif">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function parseAzureTextResponse(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (Array.isArray(payload.choices) && payload.choices[0]?.message?.content) {
    return String(payload.choices[0].message.content);
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const contentPart of item.content) {
        if (typeof contentPart?.text === 'string' && contentPart.text.trim()) {
          return contentPart.text;
        }
        if (typeof contentPart?.output_text === 'string' && contentPart.output_text.trim()) {
          return contentPart.output_text;
        }
      }
    }
  }

  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  return '';
}

function normalizeBackgroundQuery(raw, fallbackTask) {
  const fallback = buildFallbackTaskBackgroundQuery(fallbackTask);
  if (!raw || typeof raw !== 'string') return fallback;

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, ' ')
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join(', ');

  return cleaned || fallback;
}

async function generateTaskBackgroundQuery(taskLike) {
  const fallback = buildFallbackTaskBackgroundQuery(taskLike);
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    return fallback;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  const systemPrompt = 'You create short background image tags for productivity actions. Return only a comma-separated list of 3 to 5 visual keywords, no explanations.';
  const userPrompt = [
    `Task title: ${taskLike.title || ''}`,
    `Category: ${taskLike.category || 'General'}`,
    `Status: ${taskLike.status || 'Next Action'}`,
    `Subtasks: ${Array.isArray(taskLike.subtasks) ? taskLike.subtasks.join('; ') : ''}`,
  ].join('\n');

  try {
    const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
    let url = endpoint;
    let body;

    if (/\/responses(\?|$)/i.test(endpoint)) {
      body = {
        model: AZURE_OPENAI_MODEL,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
        ],
        temperature: 0.3,
        max_output_tokens: 40,
      };
    } else {
      url = `${endpoint}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`;
      body = {
        model: AZURE_OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 40,
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Azure background query request failed:', response.status, errorText.slice(0, 180));
      return fallback;
    }

    const payload = await response.json();
    const generated = parseAzureTextResponse(payload);
    return normalizeBackgroundQuery(generated, taskLike);
  } catch (error) {
    console.warn('Azure background query error:', error.message);
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function hydrateTaskBackground(taskDoc, taskLike = null) {
  const source = taskLike || taskDoc;
  const query = await generateTaskBackgroundQuery(source);
  const url = buildTaskBackgroundUrl(query, taskDoc?._id || source?._id || source?.id || Date.now());
  return { query, url };
}

function deriveSportsCredentialsKey() {
  return crypto.createHash('sha256').update(String(SPORTS_CREDENTIALS_SECRET || '')).digest();
}

function encryptSensitiveValue(value) {
  if (!value) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveSportsCredentialsKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSensitiveValue(payload) {
  if (!payload || typeof payload !== 'string') return '';
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  const [ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveSportsCredentialsKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    return '';
  }
}

function serializeUser(user) {
  const activityTypes = Array.isArray(user.sports_target_event_activity_types)
    ? user.sports_target_event_activity_types.map((item) => String(item || '').toLowerCase().trim()).filter(Boolean)
    : [];
  return {
    id: user._id.toString(),
    username: user.username,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
    goal: user.goal || '',
    garmin_email: user.garmin_email || '',
    garmin_credentials_configured: Boolean((user.garmin_email || '').trim() && (user.garmin_password_enc || '').trim()),
    sports_target_event: (
      String(user.sports_target_event_name || '').trim()
      && String(user.sports_target_event_date || '').trim()
      && Number.isFinite(Number(user.sports_target_event_distance_km))
      && Number(user.sports_target_event_distance_km) > 0
      && String(user.sports_target_event_target_time || '').trim()
    )
      ? {
          name: String(user.sports_target_event_name || '').trim(),
          date: String(user.sports_target_event_date || '').trim(),
          distance_km: Number(Number(user.sports_target_event_distance_km).toFixed(3)),
          target_time: String(user.sports_target_event_target_time || '').trim(),
          activity_types: activityTypes.length ? activityTypes : ['running'],
        }
      : null,
    workouts_enabled: user.workouts_enabled !== false,
    dog_training_enabled: Boolean(user.dog_training_enabled),
    journal_enabled: Boolean(user.journal_enabled),
    sports_enabled: Boolean(user.sports_enabled),
    is_admin: Boolean(user.is_admin),
    mfa_enabled: Boolean(user.mfa_enabled),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.user.sub).select('is_admin').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (!user.is_admin) {
      return res.status(403).json({ message: 'Administrator access required.' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: 'Failed to verify administrator access', error: error.message });
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Calisthenics tracker backend is running' });
});

app.get('/api/auth/bootstrap', async (req, res) => {
  try {
    const registration = await isRegistrationEnabled();
    res.json({
      hasUsers: registration.userCount > 0,
      userCount: registration.userCount,
      registration_enabled: registration.enabled,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to inspect auth bootstrap state', error: error.message });
  }
});

app.get('/api/admin/settings/registration', requireAuth, requireAdmin, async (req, res) => {
  try {
    const registration = await isRegistrationEnabled();
    res.json({
      registration_enabled: registration.enabled,
      user_count: registration.userCount,
      locked_open: registration.userCount === 0,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load registration setting.', error: error.message });
  }
});

app.patch('/api/admin/settings/registration', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userCount = await User.countDocuments({});
    if (userCount === 0) {
      return res.status(400).json({ message: 'Registration cannot be disabled until at least one account exists.' });
    }
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ message: 'Boolean "enabled" is required.' });
    }
    const previous = await isRegistrationEnabled();
    const enabled = await setRegistrationEnabled(req.body.enabled);
    await appendAdminAuditLog({
      actorUserId: req.user.sub,
      action: 'registration.setting.updated',
      details: {
        previous_enabled: previous.enabled,
        next_enabled: enabled,
      },
    });
    res.json({ registration_enabled: enabled, user_count: userCount, locked_open: false });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update registration setting.', error: error.message });
  }
});

app.get('/api/admin/audit-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await AdminAuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const userIds = Array.from(
      new Set(
        logs
          .flatMap((entry) => [entry.actor_user_id, entry.target_user_id])
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    );
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('username').lean()
      : [];
    const userMap = new Map(users.map((user) => [String(user._id), user.username || 'unknown']));
    res.json(
      logs.map((entry) => ({
        id: String(entry._id),
        action: entry.action,
        actor_user_id: entry.actor_user_id ? String(entry.actor_user_id) : null,
        actor_username: entry.actor_user_id ? (userMap.get(String(entry.actor_user_id)) || 'unknown') : 'unknown',
        target_user_id: entry.target_user_id ? String(entry.target_user_id) : null,
        target_username: entry.target_user_id ? (userMap.get(String(entry.target_user_id)) || 'unknown') : null,
        details: entry.details || null,
        created_at: entry.createdAt,
      })),
    );
  } catch (error) {
    res.status(500).json({ message: 'Failed to load admin audit logs.', error: error.message });
  }
});

function resolveSportsProjectRoot() {
  if (process.env.SPORTS_PROJECT_ROOT) {
    return path.resolve(process.env.SPORTS_PROJECT_ROOT);
  }
  const candidates = [
    path.resolve(__dirname, '../../sports'),
    path.resolve(__dirname, '../sports'),
    path.resolve(process.cwd(), 'sports'),
  ];
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || candidates[0];
}

function resolveSportsGoalsFilePath() {
  if (process.env.SPORTS_GOALS_FILE) {
    return path.resolve(process.env.SPORTS_GOALS_FILE);
  }
  const sportsRoot = resolveSportsProjectRoot();
  const preferred = path.join(sportsRoot, 'goals.yaml');
  if (fs.existsSync(preferred)) return preferred;
  return path.join(sportsRoot, 'goals.example.yaml');
}

function parseEventDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTargetMinutes(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const hhmmss = /^(\d{1,2}):(\d{2}):(\d{2})$/;
  const match = value.trim().match(hhmmss);
  if (!match) return null;
  const [, hh, mm, ss] = match;
  return (Number(hh) * 60) + Number(mm) + (Number(ss) / 60);
}

function normalizeEventActivityTypes(input) {
  if (!Array.isArray(input) || !input.length) return ['running'];
  const values = input
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean);
  return values.length ? values : ['running'];
}

function buildSportsTargetEventFromUser(user) {
  if (!user) return null;
  const name = String(user.sports_target_event_name || '').trim();
  const dateRaw = String(user.sports_target_event_date || '').trim();
  const distanceKm = Number(user.sports_target_event_distance_km);
  const targetTime = String(user.sports_target_event_target_time || '').trim();
  const eventDate = parseEventDate(dateRaw);
  const targetMinutes = parseTargetMinutes(targetTime);
  if (!name || !dateRaw || !eventDate || !Number.isFinite(distanceKm) || distanceKm <= 0 || !targetMinutes) {
    return null;
  }
  return {
    name,
    date: eventDate,
    distance_km: Number(distanceKm.toFixed(3)),
    target_time_minutes: targetMinutes,
    target_time: targetTime,
    activity_types: normalizeEventActivityTypes(user.sports_target_event_activity_types),
    source: 'profile',
  };
}

function serializeConfiguredEvent(event) {
  if (!event) return null;
  const date = event.date instanceof Date ? event.date : parseEventDate(event.date);
  return {
    name: String(event.name || 'event').trim() || 'event',
    date: date ? date.toISOString().slice(0, 10) : String(event.date || ''),
    distance_km: Number(Number(event.distance_km || 0).toFixed(3)),
    target_time: String(event.target_time || '').trim(),
    target_time_minutes: Number(Number(event.target_time_minutes || 0).toFixed(2)),
    activity_types: normalizeEventActivityTypes(event.activity_types),
    source: event.source || 'goals_file',
  };
}

function loadSportsGoalsAndEvents(user = null) {
  const goalsFilePath = resolveSportsGoalsFilePath();
  if (!fs.existsSync(goalsFilePath)) {
    const profileEvent = buildSportsTargetEventFromUser(user);
    return {
      goalsFilePath,
      goals: [],
      events: profileEvent ? [profileEvent] : [],
      selectedTargetEvent: profileEvent,
    };
  }

  const content = fs.readFileSync(goalsFilePath, 'utf-8');
  const payload = yaml.load(content) || {};
  const goals = Array.isArray(payload.goals) ? payload.goals : [];
  const events = Array.isArray(payload.events) ? payload.events : [];

  const normalizedEvents = events
    .map((event) => {
      const eventDate = parseEventDate(event.date);
      const targetMinutes = parseTargetMinutes(event.target_time);
      const distanceKm = Number(event.distance_km);
      if (!eventDate || !targetMinutes || !distanceKm) return null;
      return {
        name: String(event.name || 'event').trim() || 'event',
        date: eventDate,
        distance_km: distanceKm,
        target_time_minutes: targetMinutes,
        target_time: String(event.target_time || '').trim(),
        activity_types: Array.isArray(event.activity_types)
          ? event.activity_types.map((item) => String(item || '').toLowerCase()).filter(Boolean)
          : [],
        source: 'goals_file',
      };
    })
    .filter(Boolean);
  const selectedTargetEvent = buildSportsTargetEventFromUser(user);
  if (selectedTargetEvent) {
    normalizedEvents.unshift(selectedTargetEvent);
  }
  return { goalsFilePath, goals, events: normalizedEvents, selectedTargetEvent };
}

function ensureGarminCredentials(user, { allowMissingPassword = false } = {}) {
  const profileEmail = String(user?.garmin_email || '').trim();
  const profilePassword = decryptSensitiveValue(user?.garmin_password_enc || '');

  const envEmail = process.env.GARMIN_EMAIL || process.env.SPORTS_GARMIN_EMAIL || '';
  const envPassword = process.env.GARMIN_PASSWORD || process.env.SPORTS_GARMIN_PASSWORD || '';

  const email = profileEmail || envEmail;
  const password = profilePassword || envPassword;

  if (!email || (!allowMissingPassword && !password)) {
    throw new Error('Garmin credentials are missing. Set them in your profile or GARMIN_EMAIL/GARMIN_PASSWORD.');
  }

  return {
    email,
    password,
    source: profileEmail && profilePassword ? 'profile' : 'environment',
  };
}

async function connectGarminWithCachedSession(userId) {
  const user = await User.findById(userId).select('garmin_email garmin_password_enc').lean();
  if (!user) {
    throw new Error('User not found for Garmin sync.');
  }

  const authState = await SportsAuthState.findOne({ user_id: userId }).lean();
  const hasCachedSession = Boolean(authState?.oauth1_token && authState?.oauth2_token);
  const { email, password, source } = ensureGarminCredentials(user, { allowMissingPassword: hasCachedSession });
  const gc = new GarminConnect({
    username: email || undefined,
    password: password || undefined,
  });

  let usedCachedSession = false;
  let garminProfile = null;
  if (authState?.oauth1_token && authState?.oauth2_token && typeof gc.loadToken === 'function') {
    try {
      gc.loadToken(authState.oauth1_token, authState.oauth2_token);
      garminProfile = await gc.getUserProfile();
      usedCachedSession = true;
    } catch (error) {
      usedCachedSession = false;
      garminProfile = null;
    }
  }

  if (!usedCachedSession) {
    if (!password) {
      throw new Error('Cached Garmin session expired and no password is available. Update Garmin password in profile.');
    }
    await gc.login();
    try {
      garminProfile = await gc.getUserProfile();
    } catch (error) {
      garminProfile = null;
    }
  }

  const profileHr = extractGarminProfileHr(garminProfile);

  await SportsAuthState.findOneAndUpdate(
    { user_id: userId },
    {
      $set: {
        oauth1_token: gc?.client?.oauth1Token || null,
        oauth2_token: gc?.client?.oauth2Token || null,
        garmin_max_hr: profileHr.maxHr,
        garmin_resting_hr: profileHr.restingHr,
        garmin_profile_updated_at: garminProfile ? new Date() : null,
        last_authenticated_at: new Date(),
        token_source: usedCachedSession ? 'cached' : source,
        last_error: '',
      },
    },
    { upsert: true, new: true },
  );

  return {
    gc,
    usedCachedSession,
    credentialSource: source,
    garminProfileHr: profileHr,
  };
}

function sanitizeActivityType(value) {
  return String(value || '').toLowerCase().trim();
}

function normalizeGarminDuration(value) {
  const num = Number(value) || 0;
  if (num <= 0) return 0;
  if (num > 1000000) return Math.round(num / 1000);
  return Math.round(num);
}

function safeMean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function extractGarminProfileHr(profile) {
  const profileObj = profile && typeof profile === 'object' ? profile : {};
  const candidates = [
    profileObj?.userData?.maxHeartRate,
    profileObj?.userData?.maxHr,
    profileObj?.userData?.restingHeartRate,
    profileObj?.userData?.restingHr,
    profileObj?.maxHeartRate,
    profileObj?.maxHR,
    profileObj?.biometricProfile?.maxHeartRate,
    profileObj?.biometricProfile?.restingHeartRate,
    profileObj?.heartRateSettings?.maxHeartRate,
    profileObj?.heartRateSettings?.restingHeartRate,
  ];

  let maxHr = null;
  let restingHr = null;
  for (const value of candidates) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) continue;
    if (num >= 130 && num <= 235 && maxHr === null) maxHr = Math.round(num);
    if (num >= 30 && num <= 95 && restingHr === null) restingHr = Math.round(num);
  }
  return { maxHr, restingHr };
}

function normalizeGarminActivity(activity) {
  const distanceKm = Math.max(0, Number(activity.distance || 0) / 1000);
  const durationS = normalizeGarminDuration(activity.duration);
  const movingDurationS = normalizeGarminDuration(activity.movingDuration || activity.duration);
  const start = new Date(activity.startTimeGMT || activity.startTimeLocal || Date.now());

  return {
    activity_id: String(activity.activityId),
    source: 'garmin',
    activity_name: String(activity.activityName || '').trim(),
    activity_type: sanitizeActivityType(activity.activityType?.typeKey || ''),
    start_time: start,
    distance_km: distanceKm,
    duration_s: durationS,
    moving_duration_s: movingDurationS,
    average_speed_mps: Number.isFinite(Number(activity.averageSpeed)) ? Number(activity.averageSpeed) : null,
    max_speed_mps: Number.isFinite(Number(activity.maxSpeed)) ? Number(activity.maxSpeed) : null,
    average_hr: Number.isFinite(Number(activity.averageHR)) ? Number(activity.averageHR) : null,
    max_hr: Number.isFinite(Number(activity.maxHR)) ? Number(activity.maxHR) : null,
    vo2max: Number.isFinite(Number(activity.vO2MaxValue)) ? Number(activity.vO2MaxValue) : null,
    lactate_threshold_hr: Number.isFinite(Number(activity.lactateThresholdBpm)) ? Number(activity.lactateThresholdBpm) : null,
    lactate_threshold_pace_min_per_km: Number.isFinite(Number(activity.lactateThresholdSpeed)) && Number(activity.lactateThresholdSpeed) > 0
      ? 1000 / (Number(activity.lactateThresholdSpeed) * 60)
      : null,
    elevation_gain_m: Number(activity.elevationGain) || 0,
    calories: Number(activity.calories) || 0,
    raw: activity,
  };
}

function paceMinPerKmFromActivity(activity) {
  if (!activity || activity.distance_km <= 0) return null;
  const duration = activity.moving_duration_s > 0 ? activity.moving_duration_s : activity.duration_s;
  if (!duration) return null;
  return (duration / 60) / activity.distance_km;
}

function isRunningActivity(activity, acceptedTypes = []) {
  const normalized = sanitizeActivityType(activity.activity_type);
  if (!normalized) return false;
  if (acceptedTypes.length > 0) {
    return acceptedTypes.some((item) => normalized.includes(sanitizeActivityType(item)));
  }
  return normalized.includes('running') || normalized.includes('trail');
}

function filterByDateRange(activities, startInclusive, endInclusive) {
  return activities.filter((activity) => {
    const ts = new Date(activity.start_time).getTime();
    return ts >= startInclusive.getTime() && ts <= endInclusive.getTime();
  });
}

function summarizePerformance(activities) {
  const sorted = [...activities].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  const distanceKm = sorted.reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
  const movingHours = sorted.reduce((sum, item) => sum + ((Number(item.moving_duration_s) || 0) / 3600), 0);
  const longest = sorted.reduce((max, item) => Math.max(max, Number(item.distance_km) || 0), 0);
  const runPaces = sorted
    .filter((item) => isRunningActivity(item))
    .map((item) => paceMinPerKmFromActivity(item))
    .filter((value) => value && value > 0);

  const now = new Date();
  const summaryForDays = (days) => {
    const start = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    const inWindow = filterByDateRange(sorted, start, now);
    return {
      activities: inWindow.length,
      distance_km: inWindow.reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0),
      moving_hours: inWindow.reduce((sum, item) => sum + ((Number(item.moving_duration_s) || 0) / 3600), 0),
    };
  };

  const last7 = summaryForDays(7);
  const last30 = summaryForDays(30);
  const prev30WindowStart = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
  const prev30WindowEnd = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
  const prev30 = filterByDateRange(sorted, prev30WindowStart, prev30WindowEnd)
    .reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
  const trendPct = prev30 > 0 ? ((last30.distance_km - prev30) / prev30) * 100 : (last30.distance_km > 0 ? 100 : 0);

  return {
    total_activities: sorted.length,
    total_distance_km: Number(distanceKm.toFixed(2)),
    total_moving_hours: Number(movingHours.toFixed(2)),
    longest_activity_km: Number(longest.toFixed(2)),
    best_run_pace_min_per_km: runPaces.length ? Number(Math.min(...runPaces).toFixed(2)) : null,
    last_7_days: {
      activities: last7.activities,
      distance_km: Number(last7.distance_km.toFixed(2)),
      moving_hours: Number(last7.moving_hours.toFixed(2)),
    },
    last_30_days: {
      activities: last30.activities,
      distance_km: Number(last30.distance_km.toFixed(2)),
      moving_hours: Number(last30.moving_hours.toFixed(2)),
    },
    distance_trend_pct_30d_vs_prev_30d: Number(trendPct.toFixed(2)),
  };
}

function evaluateGoals(activities, goals) {
  const now = new Date();
  return goals.map((goal) => {
    const periodDays = Number(goal.period_days) || 7;
    const start = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
    const inWindow = filterByDateRange(activities, start, now).filter((item) => (
      !Array.isArray(goal.activity_types)
      || goal.activity_types.length === 0
      || isRunningActivity(item, goal.activity_types)
      || goal.activity_types.some((type) => sanitizeActivityType(item.activity_type).includes(sanitizeActivityType(type)))
    ));

    const metric = String(goal.metric || '');
    const target = Number(goal.target) || 0;
    let actual = 0;
    if (metric === 'distance_km_in_period_min') {
      actual = inWindow.reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
    } else if (metric === 'activities_count_in_period_min') {
      actual = inWindow.length;
    } else if (metric === 'moving_hours_in_period_min') {
      actual = inWindow.reduce((sum, item) => sum + ((Number(item.moving_duration_s) || 0) / 3600), 0);
    } else if (metric === 'average_pace_min_per_km_max') {
      const minDistance = Number(goal.min_distance_km) || 0;
      const paces = inWindow
        .filter((item) => Number(item.distance_km) >= minDistance)
        .map((item) => paceMinPerKmFromActivity(item))
        .filter((value) => value && value > 0);
      actual = paces.length ? safeMean(paces) : 0;
    } else if (metric === 'longest_activity_km_in_period_min') {
      actual = inWindow.reduce((max, item) => Math.max(max, Number(item.distance_km) || 0), 0);
    }

    const isMaxGoal = metric.endsWith('_max');
    const passed = isMaxGoal ? actual <= target : actual >= target;
    const progress = target > 0
      ? (isMaxGoal ? (target / Math.max(actual, 0.0001)) : (actual / target))
      : 0;

    return {
      name: String(goal.name || metric || 'goal'),
      metric,
      target,
      actual: Number(actual.toFixed(2)),
      period_days: periodDays,
      passed,
      progress_ratio: Number(Math.max(0, Math.min(progress, 2)).toFixed(3)),
    };
  });
}

function evaluateRunsTowardEvent(activities, targetPaceMinPerKm, maxItems = 25) {
  const runs = activities
    .filter((activity) => isRunningActivity(activity))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, maxItems);

  const assessed = [];
  const scores = [];

  for (const run of runs) {
    const pace = paceMinPerKmFromActivity(run);
    if (!pace || run.distance_km <= 0) continue;
    const paceScore = Math.max(0, Math.min(1, targetPaceMinPerKm / pace));
    const distanceScore = Math.max(0, Math.min(1, run.distance_km / 16.0));
    const quality = (0.7 * paceScore) + (0.3 * distanceScore);
    scores.push(quality);
    assessed.push({
      activity_id: run.activity_id,
      date: new Date(run.start_time).toISOString(),
      name: run.activity_name,
      distance_km: Number(run.distance_km.toFixed(2)),
      pace_min_per_km: Number(pace.toFixed(2)),
      target_pace_min_per_km: Number(targetPaceMinPerKm.toFixed(2)),
      score: Number((quality * 100).toFixed(1)),
      label: quality >= 0.85 ? 'excellent' : quality >= 0.7 ? 'good' : quality >= 0.55 ? 'fair' : 'needs work',
    });
  }

  let trend = 0;
  if (scores.length >= 8) {
    const first = safeMean(scores.slice(-4)) || 0;
    const last = safeMean(scores.slice(0, 4)) || 0;
    trend = (last - first) * 100;
  }

  return {
    runs_assessed: assessed.length,
    overall_score: Number(((safeMean(scores) || 0) * 100).toFixed(1)),
    trend_score_delta: Number(trend.toFixed(1)),
    recent_runs: assessed,
  };
}

function buildTrainingReview(activities, historyDays = 365) {
  const now = new Date();
  const start = new Date(now.getTime() - (historyDays * 24 * 60 * 60 * 1000));
  const history = filterByDateRange(activities, start, now);
  if (!history.length) {
    return {
      history_days: historyDays,
      rating_score: 0,
      rating_grade: 'E',
      metrics: {
        activities: 0,
        distance_km: 0,
        moving_hours: 0,
        avg_weekly_distance_km: 0,
        consistency_ratio: 0,
        distance_trend_pct_12w: 0,
        longest_activity_km: 0,
      },
      component_scores: {
        consistency: 0,
        volume: 0,
        progression: 0,
        long_run: 0,
      },
      highlights: ['No activities found in the selected history window.'],
      improvement_actions: [
        'Start with 3 sessions per week and build habit consistency first.',
        'Increase weekly distance gradually (5-10% per week).',
      ],
      conversational_report: 'There is not enough training data in the selected history window to rate readiness yet.',
    };
  }

  const distanceKm = history.reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
  const movingHours = history.reduce((sum, item) => sum + ((Number(item.moving_duration_s) || 0) / 3600), 0);
  const weeks = Math.max(1, historyDays / 7);
  const avgWeeklyDistance = distanceKm / weeks;
  const longest = history.reduce((max, item) => Math.max(max, Number(item.distance_km) || 0), 0);

  const weeklyDistance = new Map();
  for (const item of history) {
    const d = new Date(item.start_time);
    const key = `${d.getUTCFullYear()}-${Math.ceil((((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7)}`;
    weeklyDistance.set(key, (weeklyDistance.get(key) || 0) + (Number(item.distance_km) || 0));
  }
  const observedWeeks = Math.max(1, Math.ceil(historyDays / 7));
  const activeWeeks = [...weeklyDistance.values()].filter((value) => value >= 10).length;
  const consistencyRatio = activeWeeks / observedWeeks;

  const this12wStart = new Date(now.getTime() - (84 * 24 * 60 * 60 * 1000));
  const prev12wStart = new Date(now.getTime() - (168 * 24 * 60 * 60 * 1000));
  const this12wDistance = history
    .filter((item) => new Date(item.start_time) >= this12wStart)
    .reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
  const prev12wDistance = history
    .filter((item) => {
      const ts = new Date(item.start_time);
      return ts >= prev12wStart && ts < this12wStart;
    })
    .reduce((sum, item) => sum + (Number(item.distance_km) || 0), 0);
  const distanceTrendPct = prev12wDistance > 0
    ? ((this12wDistance - prev12wDistance) / prev12wDistance) * 100
    : (this12wDistance > 0 ? 100 : 0);

  const clamp100 = (value) => Math.max(0, Math.min(100, value));
  const consistencyScore = clamp100(consistencyRatio * 100);
  const volumeScore = clamp100((avgWeeklyDistance / 55) * 100);
  const progressionScore = clamp100(50 + Math.min(40, distanceTrendPct * 2));
  const longRunScore = clamp100((longest / 30) * 100);
  const overall = clamp100(
    (0.35 * consistencyScore)
    + (0.30 * volumeScore)
    + (0.20 * progressionScore)
    + (0.15 * longRunScore),
  );
  const grade = overall >= 85 ? 'A' : overall >= 75 ? 'B' : overall >= 65 ? 'C' : overall >= 50 ? 'D' : 'E';

  const actions = [];
  if (consistencyRatio < 0.7) actions.push('Aim for at least 4 active weeks out of every 5-week block.');
  if (avgWeeklyDistance < 45) actions.push('Increase weekly distance gradually toward 45-55 km/week.');
  if (longest < 24) actions.push('Add a progressive long run every 7-10 days and build toward 24-30 km.');
  if (distanceTrendPct <= 0) actions.push('Use a 3-week build + 1-week deload cycle to restore progression.');
  if (!actions.length) actions.push('Keep volume stable and focus on race-pace specificity for the next block.');

  return {
    history_days: historyDays,
    rating_score: Number(overall.toFixed(1)),
    rating_grade: grade,
    metrics: {
      activities: history.length,
      distance_km: Number(distanceKm.toFixed(1)),
      moving_hours: Number(movingHours.toFixed(1)),
      avg_weekly_distance_km: Number(avgWeeklyDistance.toFixed(1)),
      consistency_ratio: Number(consistencyRatio.toFixed(3)),
      distance_trend_pct_12w: Number(distanceTrendPct.toFixed(1)),
      longest_activity_km: Number(longest.toFixed(1)),
    },
    component_scores: {
      consistency: Number(consistencyScore.toFixed(1)),
      volume: Number(volumeScore.toFixed(1)),
      progression: Number(progressionScore.toFixed(1)),
      long_run: Number(longRunScore.toFixed(1)),
    },
    highlights: [
      consistencyRatio >= 0.75 ? 'Your training consistency is strong across the year.' : 'Consistency can improve with a stable weekly plan.',
      distanceTrendPct > 8 ? 'Your 12-week trend is positive.' : 'Trend suggests room for progressive overload.',
    ],
    improvement_actions: actions,
    conversational_report: `Over the last ${historyDays} days, your training scores ${grade} (${overall.toFixed(0)}/100). Focus next on: ${actions[0]}`,
  };
}

function summarizePhysiology(activities) {
  const vo2 = activities.map((item) => item.vo2max).filter((value) => Number.isFinite(value));
  const ltHr = activities.map((item) => item.lactate_threshold_hr).filter((value) => Number.isFinite(value));
  const ltPace = activities.map((item) => item.lactate_threshold_pace_min_per_km).filter((value) => Number.isFinite(value));
  const sorted = [...activities].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const latestByField = (field) => {
    const item = sorted.find((entry) => Number.isFinite(entry[field]));
    return item ? Number(item[field]) : null;
  };

  return {
    vo2max: { latest: latestByField('vo2max'), average: safeMean(vo2), samples: vo2.length },
    lactate_threshold_hr: { latest: latestByField('lactate_threshold_hr'), average: safeMean(ltHr), samples: ltHr.length },
    lactate_threshold_pace_min_per_km: { latest: latestByField('lactate_threshold_pace_min_per_km'), average: safeMean(ltPace), samples: ltPace.length },
  };
}

function evaluateEventProbability(event, activities) {
  const now = new Date();
  const end = event.date < now ? event.date : now;
  const start = new Date(end.getTime() - (120 * 24 * 60 * 60 * 1000));
  const windowActivities = filterByDateRange(activities, start, end).filter((item) => (
    event.activity_types.length === 0 || event.activity_types.some((type) => sanitizeActivityType(item.activity_type).includes(type))
  ));

  const runs = windowActivities.filter((item) => isRunningActivity(item));
  const weeklyDistance = runs.reduce((sum, item) => sum + item.distance_km, 0) / (120 / 7);
  const longest = runs.reduce((max, item) => Math.max(max, item.distance_km), 0);
  const targetPace = event.target_time_minutes / event.distance_km;
  const scored = evaluateRunsTowardEvent(runs, targetPace, 20);
  const paceScore = Math.max(0, Math.min(100, scored.overall_score));
  const volumeScore = Math.max(0, Math.min(100, (weeklyDistance / 55) * 100));
  const longRunScore = Math.max(0, Math.min(100, (longest / (event.distance_km * 0.8)) * 100));
  const probability = Math.max(0, Math.min(1, ((0.45 * paceScore) + (0.30 * volumeScore) + (0.25 * longRunScore)) / 100));

  return {
    name: event.name,
    date: event.date.toISOString().slice(0, 10),
    distance_km: event.distance_km,
    target_time_minutes: Number(event.target_time_minutes.toFixed(2)),
    probability,
    confidence: probability >= 0.67 ? 'high' : probability >= 0.45 ? 'medium' : 'low',
    context: {
      activities: windowActivities.length,
      avg_weekly_distance_km: Number(weeklyDistance.toFixed(1)),
      longest_activity_km: Number(longest.toFixed(1)),
      readiness_score: paceScore,
    },
  };
}

function summarizeHrAndIntervals(activities, options = {}) {
  const profileMaxHr = Number(options.profileMaxHr);
  const profileRestingHr = Number(options.profileRestingHr);
  const now = new Date();
  const recentWindowStart = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
  const hrSamples = activities
    .map((activity) => Number(activity.average_hr))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxHrSamples = activities
    .map((activity) => Number(activity.max_hr))
    .filter((value) => Number.isFinite(value) && value > 0);
  const recentMaxHrSamples = activities
    .filter((activity) => {
      const ts = new Date(activity.start_time);
      return ts >= recentWindowStart && ts <= now;
    })
    .map((activity) => Number(activity.max_hr))
    .filter((value) => Number.isFinite(value) && value > 0);

  const customSummaries = activities
    .map((activity) => activity.custom_workout?.summary)
    .filter(Boolean);

  const splitAvgHr = customSummaries
    .map((summary) => Number(summary.average_hr))
    .filter((value) => Number.isFinite(value) && value > 0);
  const splitMaxHr = customSummaries
    .map((summary) => Number(summary.max_hr))
    .filter((value) => Number.isFinite(value) && value > 0);
  const intervalCounts = customSummaries
    .map((summary) => Number(summary.interval_count) || 0)
    .filter((value) => value >= 0);

  const analysisMaxHr = Number.isFinite(profileMaxHr) && profileMaxHr > 0
    ? Math.round(profileMaxHr)
    : (recentMaxHrSamples.length ? Math.max(...recentMaxHrSamples) : (maxHrSamples.length ? Math.max(...maxHrSamples) : null));

  return {
    avg_hr: hrSamples.length ? Number((safeMean(hrSamples) || 0).toFixed(1)) : null,
    max_hr: analysisMaxHr,
    max_hr_source: Number.isFinite(profileMaxHr) && profileMaxHr > 0 ? 'garmin_profile' : (recentMaxHrSamples.length ? 'recent_365d' : 'activity_history'),
    resting_hr: Number.isFinite(profileRestingHr) && profileRestingHr > 0 ? Math.round(profileRestingHr) : null,
    split_avg_hr: splitAvgHr.length ? Number((safeMean(splitAvgHr) || 0).toFixed(1)) : null,
    split_max_hr: splitMaxHr.length ? Math.max(...splitMaxHr) : null,
    activities_with_intervals: intervalCounts.filter((value) => value > 0).length,
    total_intervals_detected: intervalCounts.reduce((sum, value) => sum + value, 0),
  };
}

function evaluateRecentMarathons(activities, count = 4) {
  const marathons = activities
    .filter((activity) => isRunningActivity(activity) && Number(activity.distance_km) >= 40)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, count);

  const rows = [];
  const scores = [];

  for (const activity of marathons) {
    const pace = paceMinPerKmFromActivity(activity);
    const hr = Number(activity.average_hr);
    const summary = activity.custom_workout?.summary || null;
    const splitStd = Number(summary?.split_pace_std);
    const paceDrift = Array.isArray(summary?.split_paces) && summary.split_paces.length >= 4
      ? (() => {
          const values = summary.split_paces.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
          if (values.length < 4) return 0;
          const half = Math.floor(values.length / 2);
          const first = safeMean(values.slice(0, half)) || 0;
          const second = safeMean(values.slice(half)) || 0;
          if (!first) return 0;
          return ((second - first) / first) * 100;
        })()
      : 0;

    const paceScore = pace ? Math.max(0, Math.min(1, 5.8 / pace)) : 0;
    const staminaScore = Math.max(0, Math.min(1, Number(activity.distance_km) / 42.195));
    const stabilityScore = Number.isFinite(splitStd)
      ? Math.max(0, Math.min(1, 1 - Math.min(1, splitStd / 0.9)))
      : 0.55;
    const hrControlScore = Number.isFinite(hr) ? Math.max(0, Math.min(1, 1 - Math.max(0, (hr - 160) / 35))) : 0.55;
    const score = ((0.35 * paceScore) + (0.30 * staminaScore) + (0.20 * stabilityScore) + (0.15 * hrControlScore)) * 100;
    scores.push(score);

    rows.push({
      activity_id: activity.activity_id,
      date: new Date(activity.start_time).toISOString(),
      name: activity.activity_name,
      distance_km: Number(Number(activity.distance_km || 0).toFixed(2)),
      pace_min_per_km: pace ? Number(pace.toFixed(2)) : null,
      avg_hr: Number.isFinite(hr) ? Number(hr.toFixed(1)) : null,
      split_stability: Number.isFinite(splitStd) ? Number(splitStd.toFixed(3)) : null,
      pace_drift_pct: Number(paceDrift.toFixed(2)),
      interval_count: Number(summary?.interval_count || 0),
      score: Number(score.toFixed(1)),
      custom_workout: activity.custom_workout || null,
    });
  }

  const overall = scores.length ? Number((safeMean(scores) || 0).toFixed(1)) : 0;
  const trend = scores.length >= 2 ? Number((scores[0] - scores[scores.length - 1]).toFixed(1)) : 0;
  const notes = [];
  if (overall >= 78) notes.push('Marathon execution quality is strong across recent races.');
  else if (overall >= 63) notes.push('Marathon outcomes are solid with room for pacing and stamina refinement.');
  else notes.push('Marathon outcomes suggest improving long-run durability and pacing control.');
  if (trend > 3) notes.push('Recent marathon trend is improving.');
  else if (trend < -3) notes.push('Recent marathon trend is declining; consider a reset block.');

  return {
    count: rows.length,
    overall_score: overall,
    trend_score_delta: trend,
    marathons: rows,
    notes,
  };
}

function campaignGradeFromScore(score) {
  const value = Number(score) || 0;
  if (value >= 90) return 'A';
  if (value >= 80) return 'B';
  if (value >= 70) return 'C';
  if (value >= 60) return 'D';
  return 'E';
}

function buildCampaignAnalytics({
  name,
  date,
  prepRuns,
  campaignDays,
  targetPaceMinPerKm = null,
  marathonScore = null,
  eventSummary = null,
  status = 'completed',
}) {
  const prepDistance = prepRuns.reduce((sum, activity) => sum + (Number(activity.distance_km) || 0), 0);
  const prepWeeks = Math.max(1, campaignDays / 7);
  const avgWeeklyDistance = prepDistance / prepWeeks;
  const longRun = prepRuns.reduce((max, activity) => Math.max(max, Number(activity.distance_km) || 0), 0);
  const benchmarkPace = (() => {
    const paces = prepRuns
      .filter((activity) => Number(activity.distance_km) >= 16)
      .map((activity) => paceMinPerKmFromActivity(activity))
      .filter((value) => value && value > 0);
    return paces.length ? safeMean(paces) : null;
  })();

  const weekMap = new Map();
  for (const activity of prepRuns) {
    const ts = new Date(activity.start_time);
    const dayBucket = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}-${String(ts.getUTCDate()).padStart(2, '0')}`;
    const weekKey = `${ts.getUTCFullYear()}-W${String(Math.floor(((ts.getUTCDate() - 1) / 7) + 1)).padStart(2, '0')}`;
    const existing = weekMap.get(weekKey) || { distance_km: 0, runs: 0, days: new Set() };
    existing.distance_km += Number(activity.distance_km) || 0;
    existing.runs += 1;
    existing.days.add(dayBucket);
    weekMap.set(weekKey, existing);
  }
  const weeklyRows = Array.from(weekMap.values());
  const peakWeekKm = weeklyRows.length ? Math.max(...weeklyRows.map((item) => item.distance_km)) : 0;
  const runsPerWeek = prepWeeks > 0 ? (prepRuns.length / prepWeeks) : 0;
  const consistencyRatio = prepWeeks > 0
    ? (weeklyRows.filter((item) => item.runs >= 2).length / prepWeeks)
    : 0;
  const consistencyPct = Math.max(0, Math.min(100, consistencyRatio * 100));

  const runs18 = prepRuns.filter((activity) => Number(activity.distance_km) >= 18).length;
  const runs24 = prepRuns.filter((activity) => Number(activity.distance_km) >= 24).length;
  const runs28 = prepRuns.filter((activity) => Number(activity.distance_km) >= 28).length;
  const buildRuns = prepRuns.filter((activity) => Number(activity.distance_km) >= 12).length;

  const customSummaries = prepRuns
    .map((activity) => activity.custom_workout?.summary || null)
    .filter(Boolean);
  const splitStds = customSummaries
    .map((summary) => Number(summary.split_pace_std))
    .filter((value) => Number.isFinite(value) && value > 0);
  const intervalsDetected = customSummaries
    .map((summary) => Number(summary.interval_count) || 0)
    .reduce((sum, value) => sum + value, 0);

  const volumeScore = Math.max(0, Math.min(100, (avgWeeklyDistance / 55) * 100));
  const longRunScore = Math.max(0, Math.min(100, (longRun / 32) * 100));
  const consistencyScore = Math.max(0, Math.min(100, consistencyPct));
  const paceAlignmentScore = (() => {
    if (!targetPaceMinPerKm || !benchmarkPace) return 60;
    const delta = Math.abs(targetPaceMinPerKm - benchmarkPace);
    return Math.max(35, Math.min(100, 100 - (delta * 22)));
  })();
  const intervalBonus = Math.min(10, intervalsDetected * 0.5);
  const splitBonus = splitStds.length
    ? Math.max(0, Math.min(12, 12 - ((safeMean(splitStds) || 0) * 15)))
    : 0;
  const specificityBase = Math.max(35, Math.min(100, (runs24 * 14) + (runs28 * 16)));
  const specificityScore = Math.max(0, Math.min(100, ((0.55 * specificityBase) + (0.45 * paceAlignmentScore)) + intervalBonus + splitBonus));

  const campaignScore = Math.max(0, Math.min(
    100,
    (0.32 * volumeScore) + (0.26 * longRunScore) + (0.20 * consistencyScore) + (0.22 * specificityScore),
  ));
  const trendLabel = campaignScore >= 75 ? 'strong' : campaignScore >= 60 ? 'developing' : 'weak';
  const colorCode = trendLabel === 'strong' ? 'green' : trendLabel === 'developing' ? 'amber' : 'red';
  const grade = campaignGradeFromScore(campaignScore);

  const coachActions = [];
  if (volumeScore < 70) coachActions.push('Increase average weekly distance toward the 45–60 km range if recovery allows.');
  if (longRunScore < 75) coachActions.push('Build long-run durability with progressive long runs and steady fueling practice.');
  if (consistencyScore < 75) coachActions.push('Protect week-to-week consistency and avoid missed key sessions in the final block.');
  if (specificityScore < 72) coachActions.push('Add marathon-specific work: race-pace blocks, long-run finishers, and controlled intervals.');
  if (!coachActions.length) coachActions.push('Campaign structure is strong; focus next on race execution, fueling, and taper discipline.');

  const longRunSnapshot = prepRuns
    .filter((activity) => Number(activity.distance_km) >= 18)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 6)
    .map((activity) => {
      const pace = paceMinPerKmFromActivity(activity);
      const summary = activity.custom_workout?.summary || null;
      return {
        date: new Date(activity.start_time).toISOString().slice(0, 10),
        distance_km: Number(Number(activity.distance_km || 0).toFixed(1)),
        pace_min_per_km: pace ? Number(pace.toFixed(2)) : null,
        avg_hr: Number.isFinite(Number(activity.average_hr)) ? Number(Number(activity.average_hr).toFixed(0)) : null,
        split_count: Array.isArray(summary?.split_paces) ? summary.split_paces.length : 0,
        interval_count: Number(summary?.interval_count || 0),
      };
    });

  const reviewHighlights = [];
  if (volumeScore >= 80) reviewHighlights.push('Weekly volume reached marathon-ready range.');
  else if (volumeScore >= 65) reviewHighlights.push('Weekly volume is acceptable but can still be built.');
  else reviewHighlights.push('Weekly volume is below ideal marathon campaign levels.');
  if (longRunScore >= 85) reviewHighlights.push('Long-run preparation was strong.');
  else if (longRunScore >= 70) reviewHighlights.push('Long-run preparation was moderate.');
  else reviewHighlights.push('Long-run development needs attention.');
  if (eventSummary) {
    reviewHighlights.push(`Event file detail used: split std ${Number(eventSummary.split_pace_std || 0).toFixed(3)}, intervals ${Number(eventSummary.interval_count || 0)}.`);
  }

  return {
    marathon_name: name,
    marathon_date: date,
    status,
    prep_days: campaignDays,
    prep_runs: prepRuns.length,
    prep_distance_km: Number(prepDistance.toFixed(1)),
    avg_weekly_distance_km: Number(avgWeeklyDistance.toFixed(1)),
    peak_week_km: Number(peakWeekKm.toFixed(1)),
    runs_per_week: Number(runsPerWeek.toFixed(2)),
    longest_prep_run_km: Number(longRun.toFixed(1)),
    runs_18k_plus: runs18,
    runs_24k_plus: runs24,
    runs_28k_plus: runs28,
    consistency_pct: Number(consistencyPct.toFixed(1)),
    benchmark_pace_min_per_km: benchmarkPace ? Number(benchmarkPace.toFixed(2)) : null,
    build_runs: buildRuns,
    component_scores: {
      volume: Number(volumeScore.toFixed(1)),
      long_run: Number(longRunScore.toFixed(1)),
      consistency: Number(consistencyScore.toFixed(1)),
      specificity: Number(specificityScore.toFixed(1)),
    },
    campaign_score: Number(campaignScore.toFixed(1)),
    grade,
    marathon_score: Number(marathonScore || 0),
    trend_label: trendLabel,
    color_code: colorCode,
    review_summary: `Grade ${grade} (${Number(campaignScore.toFixed(1))}/100)`,
    review_highlights: reviewHighlights,
    coach_actions: coachActions,
    long_run_snapshot: longRunSnapshot,
    event_detail_used: Boolean(eventSummary),
  };
}

function buildRaceOutcomeReview(activity, options = {}) {
  const profileMaxHr = Number(options.profileMaxHr);
  const pace = paceMinPerKmFromActivity(activity);
  const summary = activity.custom_workout?.summary || null;
  const splitStd = Number(summary?.split_pace_std);
  const splitPaces = Array.isArray(summary?.split_paces)
    ? summary.split_paces.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const paceDrift = splitPaces.length >= 4
    ? (() => {
      const half = Math.floor(splitPaces.length / 2);
      const first = safeMean(splitPaces.slice(0, half)) || 0;
      const second = safeMean(splitPaces.slice(half)) || 0;
      if (!first) return 0;
      return ((second - first) / first) * 100;
    })()
    : 0;
  const avgHr = Number(activity.average_hr);
  const maxHr = Number(activity.max_hr);
  const hrRef = Number.isFinite(profileMaxHr) && profileMaxHr > 0
    ? profileMaxHr
    : (Number.isFinite(maxHr) && maxHr > 0 ? maxHr : null);

  const paceScore = pace ? Math.max(0, Math.min(100, (6.2 / pace) * 100)) : 40;
  const splitScore = Number.isFinite(splitStd)
    ? Math.max(0, Math.min(100, 100 - (splitStd * 120)))
    : 58;
  const driftScore = splitPaces.length >= 4
    ? Math.max(0, Math.min(100, 100 - (Math.abs(paceDrift) * 7)))
    : 58;
  const hrControlScore = hrRef && Number.isFinite(avgHr) && avgHr > 0
    ? (() => {
      const ratio = avgHr / hrRef;
      if (ratio < 0.75) return 72;
      if (ratio > 1.02) return 35;
      return Math.max(40, Math.min(100, 100 - (Math.abs(0.89 - ratio) * 180)));
    })()
    : 60;
  const executionScore = Number((0.32 * paceScore + 0.28 * splitScore + 0.20 * driftScore + 0.20 * hrControlScore).toFixed(1));
  const grade = campaignGradeFromScore(executionScore);

  const strengths = [];
  const improvements = [];
  if (splitScore >= 78) strengths.push('Pacing stayed stable across the race file.');
  else improvements.push('Pacing stability dropped; practice steadier blocks and negative-split control.');
  if (driftScore >= 75) strengths.push('Late-race fade was limited, indicating good endurance control.');
  else improvements.push('Late-race pace fade was noticeable; add endurance-specific long-run finishers.');
  if (hrControlScore >= 75) strengths.push('Heart-rate control was appropriate for race intensity.');
  else improvements.push('Heart-rate effort drifted from optimal zone; rehearse fueling and effort caps earlier.');
  if (paceScore >= 78) strengths.push('Race pace execution aligns well with marathon demands.');
  else improvements.push('Race pace trended conservative or inconsistent; add marathon-pace segments in build.');

  return {
    race_score: executionScore,
    grade,
    component_scores: {
      pace: Number(paceScore.toFixed(1)),
      split_stability: Number(splitScore.toFixed(1)),
      fade_control: Number(driftScore.toFixed(1)),
      hr_control: Number(hrControlScore.toFixed(1)),
    },
    race_metrics: {
      pace_min_per_km: pace ? Number(pace.toFixed(2)) : null,
      avg_hr: Number.isFinite(avgHr) ? Number(avgHr.toFixed(1)) : null,
      hr_reference_max: hrRef ? Number(hrRef) : null,
      split_pace_std: Number.isFinite(splitStd) ? Number(splitStd.toFixed(3)) : null,
      pace_drift_pct: Number(paceDrift.toFixed(2)),
      intervals_detected: Number(summary?.interval_count || 0),
    },
    strengths,
    improvements,
    detail_used: Boolean(summary),
  };
}

function evaluateMarathonCampaigns(activities, marathonReview, campaignDays = 84) {
  const campaigns = [];
  const runningActivities = activities
    .filter((activity) => isRunningActivity(activity))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  for (const marathon of (marathonReview?.marathons || []).slice(0, 4)) {
    const marathonDate = new Date(marathon.date);
    const start = new Date(marathonDate.getTime() - (campaignDays * 24 * 60 * 60 * 1000));
    const prepRuns = runningActivities.filter((activity) => {
      const ts = new Date(activity.start_time);
      return ts >= start && ts <= marathonDate;
    });
    const targetPace = marathon.pace_min_per_km ? Number(marathon.pace_min_per_km) : null;
    const eventSummary = marathon.custom_workout?.summary || null;
    const campaign = buildCampaignAnalytics({
      name: marathon.name,
      date: marathon.date,
      prepRuns,
      campaignDays,
      targetPaceMinPerKm: targetPace,
      marathonScore: marathon.score,
      eventSummary,
      status: 'completed',
    });
    campaigns.push({
      marathon_activity_id: marathon.activity_id,
      ...campaign,
    });
  }

  const scoreValues = campaigns.map((campaign) => Number(campaign.campaign_score) || 0);
  const trendValues = campaigns.map((campaign) => Number(campaign.marathon_score) || 0);
  return {
    campaigns,
    average_campaign_score: scoreValues.length ? Number((safeMean(scoreValues) || 0).toFixed(1)) : 0,
    trend_delta: trendValues.length >= 2 ? Number((trendValues[0] - trendValues[trendValues.length - 1]).toFixed(1)) : 0,
  };
}

function evaluateUpcomingEventCampaign(event, activities, marathonCampaigns, campaignDays = 84) {
  if (!event) return null;
  const eventDate = event.date instanceof Date ? event.date : parseEventDate(event.date);
  if (!eventDate) return null;

  const runningActivities = activities
    .filter((activity) => isRunningActivity(activity))
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  const now = new Date();
  const campaignEnd = eventDate < now ? eventDate : now;
  const campaignStart = new Date(campaignEnd.getTime() - (campaignDays * 24 * 60 * 60 * 1000));
  const prepRuns = runningActivities.filter((activity) => {
    const ts = new Date(activity.start_time);
    return ts >= campaignStart && ts <= campaignEnd;
  });
  const targetPace = Number(event.target_time_minutes || 0) > 0 && Number(event.distance_km || 0) > 0
    ? Number(event.target_time_minutes) / Number(event.distance_km)
    : null;
  const campaign = buildCampaignAnalytics({
    name: event.name,
    date: event.date.toISOString().slice(0, 10),
    prepRuns,
    campaignDays,
    targetPaceMinPerKm: targetPace,
    marathonScore: null,
    eventSummary: null,
    status: 'current',
  });

  const historicalCampaigns = Array.isArray(marathonCampaigns?.campaigns) ? marathonCampaigns.campaigns : [];
  let matchedCampaign = null;
  if (historicalCampaigns.length) {
    matchedCampaign = historicalCampaigns
      .map((historical) => ({
          ...historical,
          score_delta: Math.abs((Number(historical.campaign_score) || 0) - Number(campaign.campaign_score || 0)),
      }))
      .sort((a, b) => a.score_delta - b.score_delta)[0] || null;
  }

  return {
    event: serializeConfiguredEvent(event),
    campaign_start: campaignStart.toISOString().slice(0, 10),
    campaign_end: campaignEnd.toISOString().slice(0, 10),
    ...campaign,
    target_pace_min_per_km: targetPace ? Number(targetPace.toFixed(2)) : null,
    matched_campaign: matchedCampaign
      ? {
          marathon_name: matchedCampaign.marathon_name,
          marathon_date: matchedCampaign.marathon_date,
          campaign_score: Number(matchedCampaign.campaign_score || 0),
          marathon_score: Number(matchedCampaign.marathon_score || 0),
          score_delta: Number((matchedCampaign.score_delta || 0).toFixed(1)),
        }
      : null,
  };
}

async function generateSportsAiInsight(payload) {
  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
    return { ai_insight: null, ai_error: 'Azure OpenAI is not configured for sports AI advice.' };
  }

  const summary = payload.summary || {};
  const review = payload.training_review || {};
  const hr = payload.hr_intervals || {};
  const marathon = payload.marathon_review || {};
  const campaigns = payload.marathon_campaigns || {};
  const nextEvent = payload.next_event_run_review || {};

  const prompt = [
    'You are a pragmatic endurance coach. Provide concise, actionable advice.',
    'Use plain language and avoid hype. Include 4-6 bullet points and one risk warning.',
    `Activities: ${summary.total_activities || 0}, distance: ${summary.total_distance_km || 0} km, moving: ${summary.total_moving_hours || 0} h.`,
    `Training review: ${review.rating_grade || 'N/A'} (${review.rating_score || 0}/100), consistency ${(Number(review.metrics?.consistency_ratio || 0) * 100).toFixed(0)}%.`,
    `HR/Intervals: avg HR ${hr.avg_hr ?? 'n/a'}, max HR ${hr.max_hr ?? 'n/a'}, interval sessions ${hr.activities_with_intervals || 0}.`,
    `Marathon review: overall ${marathon.overall_score || 0}/100, trend ${marathon.trend_score_delta || 0}.`,
    `Campaign avg score: ${campaigns.average_campaign_score || 0}, trend delta: ${campaigns.trend_delta || 0}.`,
    `Next-event run score: ${nextEvent.overall_score || 0}, trend: ${nextEvent.trend_score_delta || 0}.`,
    `Goals pass count: ${(payload.goal_results || []).filter((item) => item.passed).length}/${(payload.goal_results || []).length}.`,
    'Return only coaching text, no markdown headings.',
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
    const isResponsesEndpoint = /\/responses(\?|$)/i.test(endpoint);
    const isServicesAiEndpoint = endpoint.includes('services.ai.azure.com');
    const isAzureOpenAiEndpoint = endpoint.includes('openai.azure.com');
    const baseBody = isResponsesEndpoint
      ? {
        model: AZURE_OPENAI_MODEL,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: 'You are a running and marathon coaching assistant.' }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
        temperature: 0.35,
        max_output_tokens: 900,
      }
      : {
        messages: [
          { role: 'system', content: 'You are a running and marathon coaching assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.35,
      };

    const versionsToTry = isResponsesEndpoint ? ['responses-endpoint'] : AZURE_FOUNDRY_API_VERSIONS;
    let lastError = '';

    for (const apiVersion of versionsToTry) {
      let url = endpoint;
      if (!isResponsesEndpoint) {
        if (isServicesAiEndpoint) {
          try {
            const parsed = new URL(endpoint);
            const root = `${parsed.protocol}//${parsed.host}`;
            url = `${root}/openai/deployments/${encodeURIComponent(AZURE_OPENAI_MODEL)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
          } catch (error) {
            return { ai_insight: null, ai_error: `AI endpoint is invalid: ${error.message}` };
          }
        } else if (isAzureOpenAiEndpoint) {
          url = `${endpoint}/openai/deployments/${encodeURIComponent(AZURE_OPENAI_MODEL)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
        } else {
          url = `${endpoint}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
        }
      }

      const requestBody = (!isResponsesEndpoint && !isServicesAiEndpoint && !isAzureOpenAiEndpoint)
        ? { ...baseBody, model: AZURE_OPENAI_MODEL }
        : baseBody;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = `AI request failed (${response.status}): ${errorText.slice(0, 220)}`;
        if (
          !isResponsesEndpoint
          && (
            (response.status === 400 && /api version/i.test(errorText) && /not supported/i.test(errorText))
            || response.status === 404
          )
        ) {
          continue;
        }
        return { ai_insight: null, ai_error: lastError };
      }

      const data = await response.json();
      const aiText = parseAzureTextResponse(data).trim();
      if (!aiText) {
        return { ai_insight: null, ai_error: 'AI response was empty.' };
      }
      return { ai_insight: aiText, ai_error: null };
    }

    return { ai_insight: null, ai_error: lastError || 'AI request failed: no compatible Azure API version found.' };
  } catch (error) {
    return { ai_insight: null, ai_error: `AI request error: ${error.message}` };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistSportsAiInsight(userId, payload, aiResult, source = 'on_demand') {
  if (!aiResult || (!aiResult.ai_insight && !aiResult.ai_error)) return;
  const summary = payload?.summary || {};
  const trainingReview = payload?.training_review || {};
  const upcomingCampaign = payload?.upcoming_event_campaign || null;
  await SportsAiInsight.create({
    user_id: userId,
    insight_text: aiResult.ai_insight || '',
    error_text: aiResult.ai_error || '',
    source: source === 'summary' ? 'summary' : 'on_demand',
    generated_at: new Date(),
    context_snapshot: {
      total_activities: Number(summary.total_activities || 0),
      total_distance_km: Number(summary.total_distance_km || 0),
      rating_score: Number(trainingReview.rating_score || 0),
      upcoming_event_name: upcomingCampaign?.event?.name || '',
      upcoming_event_score: Number(upcomingCampaign?.campaign_score || 0),
    },
  });
}

function mergeWithCustomWorkout(activity, customWorkout) {
  if (!customWorkout || !customWorkout.parsed_summary) return { ...activity.toObject(), custom_workout: null };
  const summary = customWorkout.parsed_summary;
  const merged = { ...activity.toObject() };
  if (Number.isFinite(summary.distance_km)) merged.distance_km = Number(summary.distance_km);
  if (Number.isFinite(summary.duration_s)) merged.duration_s = Number(summary.duration_s);
  if (Number.isFinite(summary.moving_duration_s)) merged.moving_duration_s = Number(summary.moving_duration_s);
  if (Number.isFinite(summary.average_hr)) merged.average_hr = Number(summary.average_hr);
  if (Number.isFinite(summary.max_hr)) merged.max_hr = Number(summary.max_hr);
  merged.custom_workout = {
    file_name: customWorkout.file_name,
    file_format: customWorkout.file_format,
    uploaded_at: customWorkout.uploaded_at,
    summary,
  };
  return merged;
}

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const aa = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

function summarizeTrackPoints(points = []) {
  if (!points.length) {
    return {
      points: 0,
      distance_km: null,
      duration_s: null,
      moving_duration_s: null,
      average_hr: null,
      max_hr: null,
      split_paces: [],
      split_avg_hrs: [],
      split_pace_std: null,
      interval_count: 0,
    };
  }

  let distanceMeters = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const next = points[index];
    if (Number.isFinite(prev.lat) && Number.isFinite(prev.lon) && Number.isFinite(next.lat) && Number.isFinite(next.lon)) {
      distanceMeters += haversineMeters(prev, next);
    }
  }

  const times = points.map((point) => point.time).filter((value) => value instanceof Date && !Number.isNaN(value.getTime()));
  const hrValues = points.map((point) => point.hr).filter((value) => Number.isFinite(value));
  const start = times.length ? times[0] : null;
  const end = times.length ? times[times.length - 1] : null;
  const durationS = start && end ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000)) : null;

  const splitPaces = [];
  const splitHrs = [];
  let splitStartIndex = 0;
  let splitDistance = 0;
  while (splitStartIndex < points.length - 1) {
    let segmentDistance = 0;
    let endIndex = splitStartIndex;
    for (let idx = splitStartIndex + 1; idx < points.length; idx += 1) {
      const prev = points[idx - 1];
      const curr = points[idx];
      if (Number.isFinite(prev.lat) && Number.isFinite(prev.lon) && Number.isFinite(curr.lat) && Number.isFinite(curr.lon)) {
        segmentDistance += haversineMeters(prev, curr);
      }
      if (segmentDistance >= 1000) {
        endIndex = idx;
        break;
      }
    }
    if (endIndex <= splitStartIndex) break;
    splitDistance += segmentDistance;
    const s = points[splitStartIndex];
    const e = points[endIndex];
    if (s.time && e.time && e.time > s.time) {
      const segmentMinutes = (e.time.getTime() - s.time.getTime()) / 60000;
      const segmentKm = segmentDistance / 1000;
      if (segmentKm > 0) splitPaces.push(segmentMinutes / segmentKm);
      const segmentHr = points
        .slice(splitStartIndex, endIndex + 1)
        .map((point) => point.hr)
        .filter((value) => Number.isFinite(value));
      if (segmentHr.length) splitHrs.push(safeMean(segmentHr));
    }
    splitStartIndex = endIndex;
  }

  const splitMean = safeMean(splitPaces);
  const splitVar = splitMean === null
    ? null
    : safeMean(splitPaces.map((value) => (value - splitMean) ** 2));

  return {
    points: points.length,
    distance_km: Number((distanceMeters / 1000).toFixed(3)),
    duration_s: durationS,
    moving_duration_s: durationS,
    average_hr: hrValues.length ? Number(safeMean(hrValues).toFixed(1)) : null,
    max_hr: hrValues.length ? Math.max(...hrValues) : null,
    split_paces: splitPaces.map((value) => Number(value.toFixed(3))),
    split_avg_hrs: splitHrs.map((value) => Number(value.toFixed(1))),
    split_pace_std: splitVar === null ? null : Number(Math.sqrt(splitVar).toFixed(3)),
    interval_count: splitPaces.length,
  };
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function parseDateOrNull(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseGpxBuffer(buffer) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const payload = parser.parse(buffer.toString('utf-8'));
  const trks = ensureArray(payload?.gpx?.trk);
  const points = [];
  for (const trk of trks) {
    const segments = ensureArray(trk?.trkseg);
    for (const seg of segments) {
      const trkpts = ensureArray(seg?.trkpt);
      for (const trkpt of trkpts) {
        const hrValue = trkpt?.extensions?.['gpxtpx:TrackPointExtension']?.['gpxtpx:hr']
          ?? trkpt?.extensions?.TrackPointExtension?.hr
          ?? trkpt?.extensions?.hr;
        points.push({
          lat: Number(trkpt?.['@_lat']),
          lon: Number(trkpt?.['@_lon']),
          time: parseDateOrNull(trkpt?.time),
          hr: Number.isFinite(Number(hrValue)) ? Number(hrValue) : null,
        });
      }
    }
  }
  return summarizeTrackPoints(points);
}

function parseTcxBuffer(buffer) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const payload = parser.parse(buffer.toString('utf-8'));
  const activities = ensureArray(payload?.TrainingCenterDatabase?.Activities?.Activity);
  const points = [];
  for (const activity of activities) {
    const laps = ensureArray(activity?.Lap);
    for (const lap of laps) {
      const tracks = ensureArray(lap?.Track);
      for (const track of tracks) {
        const trackpoints = ensureArray(track?.Trackpoint);
        for (const point of trackpoints) {
          points.push({
            lat: Number(point?.Position?.LatitudeDegrees),
            lon: Number(point?.Position?.LongitudeDegrees),
            time: parseDateOrNull(point?.Time),
            hr: Number.isFinite(Number(point?.HeartRateBpm?.Value)) ? Number(point.HeartRateBpm.Value) : null,
          });
        }
      }
    }
  }
  return summarizeTrackPoints(points);
}

async function parseFitBuffer(buffer) {
  const parser = new FitParser({ mode: 'list', force: true, speedUnit: 'm/s', lengthUnit: 'm' });
  const data = await parser.parseAsync(buffer);
  const records = Array.isArray(data?.records) ? data.records : [];
  if (!records.length) {
    const session = Array.isArray(data?.sessions) && data.sessions[0] ? data.sessions[0] : {};
    const distanceKm = Number(session.total_distance || 0) / 1000;
    const durationS = Number(session.total_elapsed_time || session.total_timer_time || 0);
    return {
      points: 0,
      distance_km: Number(distanceKm.toFixed(3)),
      duration_s: Number.isFinite(durationS) ? Math.round(durationS) : null,
      moving_duration_s: Number.isFinite(Number(session.total_timer_time)) ? Math.round(Number(session.total_timer_time)) : null,
      average_hr: Number.isFinite(Number(session.avg_heart_rate)) ? Number(session.avg_heart_rate) : null,
      max_hr: Number.isFinite(Number(session.max_heart_rate)) ? Number(session.max_heart_rate) : null,
      split_paces: [],
      split_avg_hrs: [],
      split_pace_std: null,
      interval_count: 0,
    };
  }

  const semicircleToDegrees = (value) => (Number(value) * 180) / 2147483648;
  const points = records.map((record) => ({
    lat: Number.isFinite(Number(record.position_lat)) ? semicircleToDegrees(record.position_lat) : null,
    lon: Number.isFinite(Number(record.position_long)) ? semicircleToDegrees(record.position_long) : null,
    time: parseDateOrNull(record.timestamp),
    hr: Number.isFinite(Number(record.heart_rate)) ? Number(record.heart_rate) : null,
  }));
  return summarizeTrackPoints(points);
}

async function parseCustomWorkoutFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase().replace('.', '');
  if (!['fit', 'tcx', 'gpx'].includes(ext)) {
    throw new Error('Unsupported file format. Allowed formats: FIT, TCX, GPX.');
  }
  if (ext === 'gpx') return { format: 'gpx', summary: parseGpxBuffer(file.buffer) };
  if (ext === 'tcx') return { format: 'tcx', summary: parseTcxBuffer(file.buffer) };
  return { format: 'fit', summary: await parseFitBuffer(file.buffer) };
}

async function syncSportsActivities(userId, mode = 'incremental') {
  const normalizedMode = mode === 'full' ? 'full' : 'incremental';
  const run = await SportsSyncRun.create({
    user_id: userId,
    mode: normalizedMode,
    status: 'running',
    started_at: new Date(),
  });

  let usedCachedSession = false;
  let credentialSource = '';

  const credentialHintUser = await User.findById(userId).select('garmin_email garmin_password_enc').lean();
  const hasProfileCredentials = Boolean(
    String(credentialHintUser?.garmin_email || '').trim()
    && decryptSensitiveValue(credentialHintUser?.garmin_password_enc || ''),
  );
  if (hasProfileCredentials) {
    credentialSource = 'profile';
  } else if ((process.env.GARMIN_EMAIL || process.env.SPORTS_GARMIN_EMAIL) && (process.env.GARMIN_PASSWORD || process.env.SPORTS_GARMIN_PASSWORD)) {
    credentialSource = 'environment';
  }

  try {
    const connection = await connectGarminWithCachedSession(userId);
    const gc = connection.gc;
    usedCachedSession = connection.usedCachedSession;
    credentialSource = connection.credentialSource;
    const pageSize = Math.max(20, Math.min(200, SPORTS_SYNC_PAGE_SIZE));
    const maxActivities = Math.max(pageSize, SPORTS_SYNC_MAX_ACTIVITIES);
    const latestStored = await SportsActivity.findOne({ user_id: userId }).sort({ start_time: -1 }).select('start_time').lean();
    const latestTs = latestStored?.start_time ? new Date(latestStored.start_time).getTime() : null;

    let offset = 0;
    let fetched = 0;
    let inserted = 0;
    let updated = 0;
    let stalePages = 0;

    while (offset < maxActivities) {
      const batch = await gc.getActivities(offset, pageSize);
      if (!Array.isArray(batch) || batch.length === 0) break;
      fetched += batch.length;

      const normalized = batch
        .map((activity) => normalizeGarminActivity(activity))
        .filter((activity) => activity.activity_id && activity.start_time instanceof Date && !Number.isNaN(activity.start_time.getTime()));
      if (!normalized.length) break;

      const existing = await SportsActivity.find(
        { user_id: userId, activity_id: { $in: normalized.map((item) => item.activity_id) } },
        { activity_id: 1 },
      ).lean();
      const existingSet = new Set(existing.map((item) => item.activity_id));

      const operations = normalized.map((activity) => ({
        updateOne: {
          filter: { user_id: userId, activity_id: activity.activity_id },
          update: { $set: { ...activity, user_id: userId } },
          upsert: true,
        },
      }));
      const result = await SportsActivity.bulkWrite(operations, { ordered: false });
      inserted += Number(result.upsertedCount || 0);
      updated += Number(result.modifiedCount || 0);

      const hasFresh = normalized.some((activity) => (
        !existingSet.has(activity.activity_id)
        || (latestTs !== null && new Date(activity.start_time).getTime() > latestTs)
      ));
      if (normalizedMode === 'incremental' && latestTs !== null && !hasFresh) {
        stalePages += 1;
        if (stalePages >= 2) break;
      } else {
        stalePages = 0;
      }

      offset += pageSize;
      if (normalizedMode === 'incremental' && latestTs === null && fetched >= 800) {
        break;
      }
    }

    const finishedAt = new Date();
    await SportsSyncState.findOneAndUpdate(
      { user_id: userId },
      {
        $set: {
          last_sync_at: finishedAt,
          last_sync_mode: normalizedMode,
          last_error: '',
        },
        $inc: { total_synced: fetched },
      },
      { upsert: true, new: true },
    );

    await SportsSyncRun.findByIdAndUpdate(run._id, {
      $set: {
        status: 'success',
        completed_at: finishedAt,
        duration_ms: finishedAt.getTime() - new Date(run.started_at).getTime(),
        fetched,
        inserted,
        updated,
        used_cached_session: usedCachedSession,
        credential_source: credentialSource,
        error_message: '',
      },
    });

    return { mode: normalizedMode, fetched, inserted, updated, used_cached_session: usedCachedSession, credential_source: credentialSource };
  } catch (error) {
    const finishedAt = new Date();
    await SportsSyncRun.findByIdAndUpdate(run._id, {
      $set: {
        status: 'error',
        completed_at: finishedAt,
        duration_ms: finishedAt.getTime() - new Date(run.started_at).getTime(),
        used_cached_session: usedCachedSession,
        credential_source: credentialSource,
        error_message: error.message || 'Unknown sync error',
      },
    });
    await SportsSyncState.findOneAndUpdate(
      { user_id: userId },
      { $set: { last_error: error.message || 'Unknown sync error' } },
      { upsert: true, new: true },
    );
    await SportsAuthState.findOneAndUpdate(
      { user_id: userId },
      { $set: { last_error: error.message || 'Unknown sync error' } },
      { upsert: true, new: true },
    );
    throw error;
  }
}

async function buildSportsSummaryPayload(userId, options = {}) {
  const includeAi = Boolean(options.includeAi);
  const userProfile = await User.findById(userId)
    .select('sports_target_event_name sports_target_event_date sports_target_event_distance_km sports_target_event_target_time sports_target_event_activity_types')
    .lean();
  const { goalsFilePath, goals, events, selectedTargetEvent } = loadSportsGoalsAndEvents(userProfile);
  const activitiesDocs = await SportsActivity.find({ user_id: userId }).sort({ start_time: -1 }).lean();
  const customDocs = await SportsCustomWorkout.find({ user_id: userId }).lean();
  const syncState = await SportsSyncState.findOne({ user_id: userId }).lean();
  const syncHistory = await SportsSyncRun.find({ user_id: userId }).sort({ started_at: -1 }).limit(10).lean();
  const authState = await SportsAuthState.findOne({ user_id: userId }).lean();
  const aiHistory = await SportsAiInsight.find({ user_id: userId }).sort({ generated_at: -1 }).limit(12).lean();
  const customMap = new Map(customDocs.map((item) => [item.activity_id, item]));
  const merged = activitiesDocs.map((activity) => {
    const custom = customMap.get(activity.activity_id);
    return custom ? mergeWithCustomWorkout({ toObject: () => activity }, custom) : activity;
  });

  const summary = summarizePerformance(merged);
  const goalResults = evaluateGoals(merged, goals);
  const eventResults = events.map((event) => evaluateEventProbability(event, merged));
  const trainingReview = buildTrainingReview(merged, 365);
  const physiology = summarizePhysiology(merged);
  const hrIntervals = summarizeHrAndIntervals(merged, {
    profileMaxHr: authState?.garmin_max_hr,
    profileRestingHr: authState?.garmin_resting_hr,
  });
  const marathonReview = evaluateRecentMarathons(merged, 4);
  const marathonCampaigns = evaluateMarathonCampaigns(merged, marathonReview, 84);

  const futureEvents = events.filter((event) => event.date >= new Date());
  const nextEvent = selectedTargetEvent || futureEvents.sort((a, b) => a.date - b.date)[0] || null;
  const nextEventRunReview = nextEvent
    ? evaluateRunsTowardEvent(merged, nextEvent.target_time_minutes / nextEvent.distance_km, 25)
    : null;
  const upcomingEventCampaign = nextEvent
    ? evaluateUpcomingEventCampaign(nextEvent, merged, marathonCampaigns, 84)
    : null;
  const combinedCampaigns = upcomingEventCampaign
    ? [upcomingEventCampaign, ...(marathonCampaigns.campaigns || [])]
    : [...(marathonCampaigns.campaigns || [])];

  const marathons = merged
    .filter((activity) => isRunningActivity(activity) && Number(activity.distance_km) >= 40)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 8)
    .map((activity) => ({
      activity_id: activity.activity_id,
      date: new Date(activity.start_time).toISOString(),
      name: activity.activity_name,
      distance_km: Number(Number(activity.distance_km || 0).toFixed(2)),
      pace_min_per_km: (() => {
        const pace = paceMinPerKmFromActivity(activity);
        return pace ? Number(pace.toFixed(2)) : null;
      })(),
      average_hr: Number.isFinite(Number(activity.average_hr)) ? Number(activity.average_hr) : null,
      custom_workout: activity.custom_workout || null,
    }));

  const payload = {
    status: merged.length ? 'ready' : 'not-configured',
    generatedAt: new Date().toISOString(),
    message: merged.length
      ? 'Sports summary loaded successfully.'
      : 'No sports activities synced yet. Use sync to import Garmin history.',
    goals_file: goalsFilePath,
    summary,
    goal_results: goalResults,
    event_results: eventResults,
    selected_target_event: serializeConfiguredEvent(selectedTargetEvent),
    training_review: trainingReview,
    physiology,
    hr_intervals: hrIntervals,
    marathon_review: marathonReview,
    marathon_campaigns: {
      ...marathonCampaigns,
      campaigns_with_current: combinedCampaigns,
    },
    next_event_run_review: nextEventRunReview,
    upcoming_event_campaign: upcomingEventCampaign,
    marathon_candidates: marathons,
    sync_state: {
      last_sync_at: syncState?.last_sync_at || null,
      last_sync_mode: syncState?.last_sync_mode || null,
      last_error: syncState?.last_error || '',
      total_synced: Number(syncState?.total_synced || 0),
      has_cached_session: Boolean(authState?.oauth1_token && authState?.oauth2_token),
      last_authenticated_at: authState?.last_authenticated_at || null,
      token_source: authState?.token_source || '',
      garmin_max_hr: Number(authState?.garmin_max_hr) > 0 ? Number(authState.garmin_max_hr) : null,
      garmin_resting_hr: Number(authState?.garmin_resting_hr) > 0 ? Number(authState.garmin_resting_hr) : null,
      garmin_profile_updated_at: authState?.garmin_profile_updated_at || null,
    },
    sync_history: syncHistory.map((run) => ({
      mode: run.mode,
      status: run.status,
      started_at: run.started_at,
      completed_at: run.completed_at,
      duration_ms: run.duration_ms,
      fetched: run.fetched,
      inserted: run.inserted,
      updated: run.updated,
      used_cached_session: Boolean(run.used_cached_session),
      credential_source: run.credential_source || '',
      error_message: run.error_message || '',
    })),
    storage: {
      activities_count: activitiesDocs.length,
      custom_workouts_count: customDocs.length,
      goals_loaded_count: goals.length,
      events_loaded_count: events.length,
    },
    recent_memory: [],
    ai_insight: aiHistory[0]?.insight_text || null,
    ai_error: aiHistory[0]?.error_text || null,
    ai_history: aiHistory.map((item) => ({
      insight_text: item.insight_text || '',
      error_text: item.error_text || '',
      source: item.source || 'on_demand',
      generated_at: item.generated_at || item.createdAt || null,
      context_snapshot: item.context_snapshot || null,
    })),
  };
  if (includeAi) {
    const ai = await generateSportsAiInsight(payload);
    await persistSportsAiInsight(userId, payload, ai, 'summary');
    payload.ai_insight = ai.ai_insight;
    payload.ai_error = ai.ai_error;
    if (ai.ai_insight && !payload.message.includes('AI')) {
      payload.message = `${payload.message} AI coaching advice generated.`;
    }
  }
  return payload;
}

async function buildSportsConnectionStatus(userId) {
  const [syncState, authState, lastRun, activitiesCount, customWorkoutsCount] = await Promise.all([
    SportsSyncState.findOne({ user_id: userId }).lean(),
    SportsAuthState.findOne({ user_id: userId }).lean(),
    SportsSyncRun.findOne({ user_id: userId }).sort({ started_at: -1 }).lean(),
    SportsActivity.countDocuments({ user_id: userId }),
    SportsCustomWorkout.countDocuments({ user_id: userId }),
  ]);

  return {
    has_cached_session: Boolean(authState?.oauth1_token && authState?.oauth2_token),
    last_authenticated_at: authState?.last_authenticated_at || null,
    token_source: authState?.token_source || '',
    garmin_max_hr: Number(authState?.garmin_max_hr) > 0 ? Number(authState.garmin_max_hr) : null,
    garmin_resting_hr: Number(authState?.garmin_resting_hr) > 0 ? Number(authState.garmin_resting_hr) : null,
    garmin_profile_updated_at: authState?.garmin_profile_updated_at || null,
    last_sync_at: syncState?.last_sync_at || null,
    last_sync_mode: syncState?.last_sync_mode || null,
    last_sync_error: syncState?.last_error || '',
    total_synced: Number(syncState?.total_synced || 0),
    last_run: lastRun
      ? {
          status: lastRun.status,
          mode: lastRun.mode,
          started_at: lastRun.started_at,
          completed_at: lastRun.completed_at,
          duration_ms: lastRun.duration_ms,
          fetched: Number(lastRun.fetched || 0),
          inserted: Number(lastRun.inserted || 0),
          updated: Number(lastRun.updated || 0),
          used_cached_session: Boolean(lastRun.used_cached_session),
          credential_source: lastRun.credential_source || '',
          error_message: lastRun.error_message || '',
        }
      : null,
    storage: {
      activities_count: activitiesCount,
      custom_workouts_count: customWorkoutsCount,
    },
  };
}

const sportsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(5, SPORTS_UPLOAD_MAX_MB) * 1024 * 1024 },
});

app.get('/api/sports/target-event', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub)
      .select('sports_target_event_name sports_target_event_date sports_target_event_distance_km sports_target_event_target_time sports_target_event_activity_types')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({ target_event: serializeUser(user).sports_target_event });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to load target event.' });
  }
});

app.put('/api/sports/target-event', requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const dateRaw = String(req.body?.date || '').trim();
    const targetTime = String(req.body?.target_time || '').trim();
    const distanceKm = Number(req.body?.distance_km);
    const activityTypes = normalizeEventActivityTypes(req.body?.activity_types);

    if (!name) {
      return res.status(400).json({ message: 'Event name is required.' });
    }
    if (!parseEventDate(dateRaw)) {
      return res.status(400).json({ message: 'Event date must be a valid YYYY-MM-DD value.' });
    }
    if (!parseTargetMinutes(targetTime)) {
      return res.status(400).json({ message: 'Target time must use HH:MM:SS format.' });
    }
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      return res.status(400).json({ message: 'Distance must be a positive number in km.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.sub,
      {
        $set: {
          sports_target_event_name: name,
          sports_target_event_date: dateRaw,
          sports_target_event_distance_km: distanceKm,
          sports_target_event_target_time: targetTime,
          sports_target_event_activity_types: activityTypes,
        },
      },
      { new: true },
    ).lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json({ target_event: serializeUser(user).sports_target_event });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to save target event.' });
  }
});

app.delete('/api/sports/target-event', requireAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.sub,
      {
        $set: {
          sports_target_event_name: '',
          sports_target_event_date: '',
          sports_target_event_distance_km: null,
          sports_target_event_target_time: '',
          sports_target_event_activity_types: ['running'],
        },
      },
      { new: true },
    ).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json({ target_event: null, message: 'Target event cleared.' });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Failed to clear target event.' });
  }
});

app.post('/api/sports/sync', requireAuth, async (req, res) => {
  try {
    const mode = String(req.body?.mode || 'incremental').toLowerCase() === 'full' ? 'full' : 'incremental';
    const sync = await syncSportsActivities(new mongoose.Types.ObjectId(req.user.sub), mode);
    res.json({
      status: 'ready',
      message: `Sports ${mode} sync completed.`,
      sync,
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message || 'Sports sync failed.' });
  }
});

app.get('/api/sports/marathons', requireAuth, async (req, res) => {
  try {
    const payload = await buildSportsSummaryPayload(new mongoose.Types.ObjectId(req.user.sub));
    res.json({ marathons: payload.marathon_candidates || [] });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load marathons.' });
  }
});

app.get('/api/sports/race-reviews', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.sub);
    const [activitiesDocs, customDocs, authState] = await Promise.all([
      SportsActivity.find({ user_id: userId }).sort({ start_time: -1 }).lean(),
      SportsCustomWorkout.find({ user_id: userId }).lean(),
      SportsAuthState.findOne({ user_id: userId }).lean(),
    ]);
    const customMap = new Map(customDocs.map((item) => [item.activity_id, item]));
    const merged = activitiesDocs.map((activity) => {
      const custom = customMap.get(activity.activity_id);
      return custom ? mergeWithCustomWorkout({ toObject: () => activity }, custom) : activity;
    });
    const runningActivities = merged
      .filter((activity) => isRunningActivity(activity))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const marathons = merged
      .filter((activity) => isRunningActivity(activity) && Number(activity.distance_km) >= 40)
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

    const reviews = marathons.map((marathon) => {
      const marathonDate = new Date(marathon.start_time);
      const campaignDays = 84;
      const start = new Date(marathonDate.getTime() - (campaignDays * 24 * 60 * 60 * 1000));
      const prepRuns = runningActivities.filter((activity) => {
        const ts = new Date(activity.start_time);
        return ts >= start && ts <= marathonDate;
      });
      const targetPace = paceMinPerKmFromActivity(marathon);
      const campaign = buildCampaignAnalytics({
        name: marathon.activity_name,
        date: marathonDate.toISOString().slice(0, 10),
        prepRuns,
        campaignDays,
        targetPaceMinPerKm: targetPace,
        marathonScore: null,
        eventSummary: marathon.custom_workout?.summary || null,
        status: 'completed',
      });
      const raceReview = buildRaceOutcomeReview(marathon, {
        profileMaxHr: Number(authState?.garmin_max_hr),
      });
      return {
        activity_id: marathon.activity_id,
        name: marathon.activity_name,
        date: marathonDate.toISOString(),
        distance_km: Number(Number(marathon.distance_km || 0).toFixed(2)),
        custom_workout: marathon.custom_workout || null,
        campaign,
        race_review: raceReview,
      };
    });

    res.json({
      status: 'ready',
      generatedAt: new Date().toISOString(),
      reviews,
      profile_max_hr: Number(authState?.garmin_max_hr) > 0 ? Number(authState.garmin_max_hr) : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load race reviews.' });
  }
});

app.post('/api/sports/marathons/:activityId/workout-file', requireAuth, sportsUpload.single('file'), async (req, res) => {
  try {
    const { activityId } = req.params;
    if (!req.file) {
      return res.status(400).json({ message: 'Workout file is required.' });
    }

    const activity = await SportsActivity.findOne({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      activity_id: String(activityId),
    }).lean();
    if (!activity) {
      return res.status(404).json({ message: 'Marathon activity not found for this user.' });
    }

    const parsed = await parseCustomWorkoutFile(req.file);
    const customWorkout = await SportsCustomWorkout.findOneAndUpdate(
      {
        user_id: new mongoose.Types.ObjectId(req.user.sub),
        activity_id: String(activityId),
      },
      {
        $set: {
          file_name: req.file.originalname,
          file_format: parsed.format,
          file_size: req.file.size,
          parsed_summary: parsed.summary,
          uploaded_at: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    res.status(201).json({
      message: 'Custom workout uploaded and merged.',
      activity_id: activityId,
      custom_workout: {
        file_name: customWorkout.file_name,
        file_format: customWorkout.file_format,
        uploaded_at: customWorkout.uploaded_at,
        summary: customWorkout.parsed_summary,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to upload workout file.' });
  }
});

app.get('/api/sports/summary', requireAuth, async (req, res) => {
  try {
    const syncMode = String(req.query.sync || '').toLowerCase();
    const includeAi = ['1', 'true', 'yes', 'on'].includes(String(req.query.ai || '').toLowerCase());
    if (syncMode === 'incremental' || syncMode === 'full') {
      await syncSportsActivities(new mongoose.Types.ObjectId(req.user.sub), syncMode);
    }

    const payload = await buildSportsSummaryPayload(new mongoose.Types.ObjectId(req.user.sub), { includeAi });
    res.json(payload);
  } catch (error) {
    console.error('Sports summary failed:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate the sports summary.',
    });
  }
});

app.post('/api/sports/ai-advice', requireAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.sub);
    const payload = await buildSportsSummaryPayload(userId, { includeAi: false });
    const ai = await generateSportsAiInsight(payload);
    await persistSportsAiInsight(userId, payload, ai, 'on_demand');
    res.json({
      status: ai.ai_insight ? 'ready' : 'error',
      ai_insight: ai.ai_insight,
      ai_error: ai.ai_error,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate AI advice.',
    });
  }
});

app.get('/api/sports/status', requireAuth, async (req, res) => {
  try {
    const status = await buildSportsConnectionStatus(new mongoose.Types.ObjectId(req.user.sub));
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load sports connection status.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const registration = await isRegistrationEnabled();
    if (!registration.enabled) {
      return res.status(403).json({ message: 'Registration is currently disabled. Please contact an administrator.' });
    }

    const {
      username,
      password,
      first_name,
      last_name,
      email,
      goal,
      workouts_enabled,
      dog_training_enabled,
      journal_enabled,
      sports_enabled,
      garmin_email,
      garmin_password,
    } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const existingUser = await User.findOne({ username: String(username).trim() });
    if (existingUser) {
      return res.status(409).json({ message: 'That username is already taken.' });
    }

    const hasAdminUser = await User.exists({ is_admin: true });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      username: String(username).trim(),
      password_hash: passwordHash,
      first_name: first_name || '',
      last_name: last_name || '',
      email: email || '',
      goal: goal || '',
      workouts_enabled: workouts_enabled === undefined ? true : Boolean(workouts_enabled),
      dog_training_enabled: Boolean(dog_training_enabled),
      journal_enabled: Boolean(journal_enabled),
      sports_enabled: Boolean(sports_enabled),
      garmin_email: String(garmin_email || '').trim(),
      garmin_password_enc: garmin_password ? encryptSensitiveValue(garmin_password) : '',
      is_admin: !hasAdminUser,
    });

    const token = createToken(user);
    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to register user', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, otp } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: String(username).trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const validPassword = await bcrypt.compare(String(password), user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    if (user.mfa_enabled) {
      if (!user.mfa_secret) {
        return res.status(400).json({ message: 'Multi-factor authentication is enabled but no secret is configured.' });
      }
      const validMfa = await verify({ secret: user.mfa_secret, token: String(otp || '').trim(), window: 1 });
      if (!validMfa) {
        return res.status(401).json({ message: 'Invalid MFA code.' });
      }
    }

    const token = createToken(user);
    res.json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

app.post('/api/auth/mfa/setup', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.mfa_secret) {
      return res.status(409).json({ message: 'MFA is already enabled for this account.' });
    }

    const secret = generateSecret();
    const otpauth = `otpauth://totp/Day%20Tracker:${encodeURIComponent(user.username)}?secret=${secret}&issuer=Day%20Tracker`;
    user.mfa_secret = secret;
    await user.save();

    res.json({
      secret,
      otpauth,
      qrCode: otpauth,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to set up MFA', error: error.message });
  }
});

app.post('/api/auth/mfa/verify', requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user.sub);
    if (!user || !user.mfa_secret) {
      return res.status(400).json({ message: 'MFA is not configured for this account.' });
    }

    const validMfa = await verify({ secret: user.mfa_secret, token: String(otp || '').trim(), window: 1 });
    if (!validMfa) {
      return res.status(401).json({ message: 'Invalid MFA code.' });
    }

    user.mfa_enabled = true;
    await user.save();
    res.json({ message: 'MFA enabled successfully.', user: serializeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to verify MFA', error: error.message });
  }
});

app.post('/api/auth/mfa/disable', requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.user.sub);
    if (!user || !user.mfa_secret) {
      return res.status(400).json({ message: 'MFA is not configured for this account.' });
    }

    const validMfa = await verify({ secret: user.mfa_secret, token: String(otp || '').trim(), window: 1 });
    if (!validMfa) {
      return res.status(401).json({ message: 'Invalid MFA code.' });
    }

    user.mfa_enabled = false;
    user.mfa_secret = '';
    await user.save();
    res.json({ message: 'MFA disabled successfully.', user: serializeUser(user) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to disable MFA', error: error.message });
  }
});

app.get('/api/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const sportsConnectionStatus = await buildSportsConnectionStatus(new mongoose.Types.ObjectId(req.user.sub));
    res.json({
      ...serializeUser(user),
      sports_connection_status: sportsConnectionStatus,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load profile', error: error.message });
  }
});

app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      goal,
      workouts_enabled,
      dog_training_enabled,
      journal_enabled,
      sports_enabled,
      garmin_email,
      garmin_password,
      clear_garmin_password,
    } = req.body;

    const existing = await User.findById(req.user.sub).select('garmin_email');
    if (!existing) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const nextGarminEmail = garmin_email === undefined ? undefined : String(garmin_email || '').trim();
    const garminEmailChanged = nextGarminEmail !== undefined && nextGarminEmail !== String(existing.garmin_email || '');

    const update = {
      first_name: first_name ?? '',
      last_name: last_name ?? '',
      email: email ?? '',
      goal: goal ?? '',
      workouts_enabled: workouts_enabled === undefined ? undefined : Boolean(workouts_enabled),
      dog_training_enabled: dog_training_enabled === undefined ? undefined : Boolean(dog_training_enabled),
      journal_enabled: journal_enabled === undefined ? undefined : Boolean(journal_enabled),
      sports_enabled: sports_enabled === undefined ? undefined : Boolean(sports_enabled),
      garmin_email: nextGarminEmail,
    };

    const hasNewGarminPassword = typeof garmin_password === 'string' && garmin_password.trim();
    if (Boolean(clear_garmin_password) || (garminEmailChanged && !hasNewGarminPassword)) {
      update.garmin_password_enc = '';
      await SportsAuthState.findOneAndDelete({ user_id: req.user.sub });
    } else if (hasNewGarminPassword) {
      update.garmin_password_enc = encryptSensitiveValue(garmin_password.trim());
      await SportsAuthState.findOneAndDelete({ user_id: req.user.sub });
    }

    const user = await User.findByIdAndUpdate(req.user.sub, update, { new: true });
    const sportsConnectionStatus = await buildSportsConnectionStatus(new mongoose.Types.ObjectId(req.user.sub));
    res.json({
      ...serializeUser(user),
      sports_connection_status: sportsConnectionStatus,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
});

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).sort({ username: 1 }).lean();
    res.json(users.map(serializeUser));
  } catch (error) {
    res.status(500).json({ message: 'Failed to load users', error: error.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, first_name, last_name, email, goal, workouts_enabled, dog_training_enabled, journal_enabled, sports_enabled, is_admin } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const normalizedUsername = String(username).trim();
    const existingUser = await User.findOne({ username: normalizedUsername });
    if (existingUser) {
      return res.status(409).json({ message: 'That username is already taken.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      username: normalizedUsername,
      password_hash: passwordHash,
      first_name: first_name || '',
      last_name: last_name || '',
      email: email || '',
      goal: goal || '',
      workouts_enabled: workouts_enabled === undefined ? true : Boolean(workouts_enabled),
      dog_training_enabled: Boolean(dog_training_enabled),
      journal_enabled: Boolean(journal_enabled),
      sports_enabled: Boolean(sports_enabled),
      is_admin: Boolean(is_admin),
    });

    res.status(201).json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Failed to create user', error: error.message });
  }
});

app.patch('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { username, first_name, last_name, email, goal, workouts_enabled, dog_training_enabled, journal_enabled, sports_enabled, is_admin } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (username && String(username).trim() !== user.username) {
      const duplicate = await User.findOne({ username: String(username).trim() });
      if (duplicate) {
        return res.status(409).json({ message: 'That username is already taken.' });
      }
      user.username = String(username).trim();
    }

    if (first_name !== undefined) user.first_name = first_name || '';
    if (last_name !== undefined) user.last_name = last_name || '';
    if (email !== undefined) user.email = email || '';
    if (goal !== undefined) user.goal = goal || '';
    if (workouts_enabled !== undefined) user.workouts_enabled = Boolean(workouts_enabled);
    if (dog_training_enabled !== undefined) user.dog_training_enabled = Boolean(dog_training_enabled);
    if (journal_enabled !== undefined) user.journal_enabled = Boolean(journal_enabled);
    if (sports_enabled !== undefined) user.sports_enabled = Boolean(sports_enabled);
    if (is_admin !== undefined) {
      const nextIsAdmin = Boolean(is_admin);
      if (user.is_admin && !nextIsAdmin) {
        const adminCount = await User.countDocuments({ is_admin: true });
        if (adminCount <= 1) {
          return res.status(400).json({ message: 'Cannot remove administrator role from the last administrator account.' });
        }
      }
      user.is_admin = nextIsAdmin;
    }

    await user.save();
    res.json(serializeUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user', error: error.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id.' });
    }
    if (String(req.user.sub) === String(id)) {
      return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    const user = await User.findById(id).lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.is_admin) {
      const adminCount = await User.countDocuments({ is_admin: true });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last administrator account.' });
      }
    }

    const userObjectId = new mongoose.Types.ObjectId(id);
    await Promise.all([
      Workout.deleteMany({ user_id: userObjectId }),
      Dog.deleteMany({ user_id: userObjectId }),
      DogTraining.deleteMany({ user_id: userObjectId }),
      Journal.deleteMany({ user_id: userObjectId }),
      Task.deleteMany({ user_id: userObjectId }),
      SportsActivity.deleteMany({ user_id: userObjectId }),
      SportsSyncState.deleteMany({ user_id: userObjectId }),
      SportsAuthState.deleteMany({ user_id: userObjectId }),
      SportsSyncRun.deleteMany({ user_id: userObjectId }),
      SportsCustomWorkout.deleteMany({ user_id: userObjectId }),
      SportsAiInsight.deleteMany({ user_id: userObjectId }),
      User.deleteOne({ _id: userObjectId }),
    ]);

    await appendAdminAuditLog({
      actorUserId: req.user.sub,
      action: 'user.deleted',
      targetUserId: id,
      details: {
        username: user.username || '',
        was_admin: Boolean(user.is_admin),
      },
    });

    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

app.get('/api/dogs', requireAuth, async (req, res) => {
  try {
    const dogs = await Dog.find({ user_id: new mongoose.Types.ObjectId(req.user.sub) }).sort({ name: 1 });
    res.json(dogs.map(serializeDog));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dogs', error: error.message });
  }
});

app.post('/api/dogs', requireAuth, async (req, res) => {
  try {
    const { name, breed, birth_year, notes } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Dog name is required.' });
    }

    const dog = await Dog.create({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      name: name.trim(),
      breed: String(breed || '').trim(),
      birth_year: birth_year ? Number(birth_year) : null,
      notes: String(notes || '').trim(),
    });

    res.status(201).json(serializeDog(dog));
  } catch (error) {
    res.status(500).json({ message: 'Failed to add dog', error: error.message });
  }
});

app.put('/api/dogs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, breed, birth_year, notes } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Dog name is required.' });
    }

    const dog = await Dog.findOneAndUpdate(
      { _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) },
      {
        name: name.trim(),
        breed: String(breed || '').trim(),
        birth_year: birth_year ? Number(birth_year) : null,
        notes: String(notes || '').trim(),
      },
      { new: true },
    );

    if (!dog) {
      return res.status(404).json({ message: 'Dog not found.' });
    }

    res.json(serializeDog(dog));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update dog', error: error.message });
  }
});

app.delete('/api/dogs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dog = await Dog.findOneAndDelete({ _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) });
    if (!dog) {
      return res.status(404).json({ message: 'Dog not found.' });
    }

    await DogTraining.deleteMany({ dog_id: dog._id, user_id: new mongoose.Types.ObjectId(req.user.sub) });
    res.json({ message: 'Dog deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete dog', error: error.message });
  }
});

app.get('/api/dog-exercises', requireAuth, async (req, res) => {
  try {
    const exercises = await DogExerciseLibrary.find({}).sort({ name: 1 });
    res.json(exercises.map((exercise) => ({ id: exercise._id.toString(), name: exercise.name, category: exercise.category })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dog exercise list', error: error.message });
  }
});

app.post('/api/dog-exercises', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category = 'general' } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Dog exercise name is required.' });
    }

    const cleanName = name.trim();
    const exercise = await DogExerciseLibrary.findOneAndUpdate(
      { name: cleanName },
      { $set: { category, created_by: req.user.sub } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ id: exercise._id.toString(), name: exercise.name, category: exercise.category });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save dog exercise', error: error.message });
  }
});

app.put('/api/dog-exercises/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category = 'general' } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Dog exercise name is required.' });
    }

    const exercise = await DogExerciseLibrary.findById(id);
    if (!exercise) {
      return res.status(404).json({ message: 'Dog exercise not found.' });
    }

    exercise.name = String(name).trim();
    exercise.category = String(category || 'general').trim() || 'general';
    exercise.created_by = req.user.sub;
    await exercise.save();

    res.json({ id: exercise._id.toString(), name: exercise.name, category: exercise.category });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'A dog exercise with that name already exists.' });
    }
    res.status(500).json({ message: 'Failed to update dog exercise', error: error.message });
  }
});

app.get('/api/dog-workouts', requireAuth, async (req, res) => {
  try {
    const { date, dog_id } = req.query;
    const query = { user_id: new mongoose.Types.ObjectId(req.user.sub) };
    if (date) query.date = date;
    if (dog_id) query.dog_id = new mongoose.Types.ObjectId(dog_id);
    const sessions = await DogTraining.find(query).sort({ date: -1, createdAt: -1 });
    res.json(sessions.map(serializeDogTraining));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch dog training sessions', error: error.message });
  }
});

app.post('/api/dog-workouts', requireAuth, async (req, res) => {
  try {
    const { dog_id, session_name, date, notes, exercises = [] } = req.body;

    if (!dog_id || !session_name || !date || !Array.isArray(exercises) || exercises.length === 0) {
      return res.status(400).json({ message: 'Dog, session name, date, and at least one exercise are required.' });
    }

    const dog = await Dog.findOne({ _id: dog_id, user_id: new mongoose.Types.ObjectId(req.user.sub) });
    if (!dog) {
      return res.status(404).json({ message: 'Dog not found for this user.' });
    }

    const sanitizedExercises = exercises.map((exercise) => ({
      name: String(exercise.name || '').trim(),
      reps: Number(exercise.reps) || 0,
      duration_minutes: Number(exercise.duration_minutes) || 0,
      rewarded: Boolean(exercise.rewarded),
      notes: String(exercise.notes || '').trim(),
    })).filter((exercise) => exercise.name);

    if (!sanitizedExercises.length) {
      return res.status(400).json({ message: 'At least one valid dog exercise is required.' });
    }

    const total_minutes = sanitizedExercises.reduce((sum, exercise) => sum + exercise.duration_minutes, 0);

    const session = await DogTraining.create({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      dog_id: dog._id,
      session_name: String(session_name).trim(),
      date,
      notes: notes || '',
      exercises: sanitizedExercises,
      total_minutes,
    });

    res.status(201).json(serializeDogTraining(session));
  } catch (error) {
    res.status(500).json({ message: 'Failed to save dog training session', error: error.message });
  }
});

app.put('/api/dog-workouts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { dog_id, session_name, date, notes, exercises } = req.body;

    const session = await DogTraining.findOne({ _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) });
    if (!session) {
      return res.status(404).json({ message: 'Dog training session not found.' });
    }

    if (dog_id) {
      const dog = await Dog.findOne({ _id: dog_id, user_id: new mongoose.Types.ObjectId(req.user.sub) });
      if (!dog) {
        return res.status(404).json({ message: 'Dog not found for this user.' });
      }
      session.dog_id = dog._id;
    }

    if (session_name !== undefined) {
      const cleanName = String(session_name || '').trim();
      if (!cleanName) {
        return res.status(400).json({ message: 'Session name is required.' });
      }
      session.session_name = cleanName;
    }

    if (date !== undefined) {
      const cleanDate = String(date || '').trim();
      if (!cleanDate) {
        return res.status(400).json({ message: 'Session date is required.' });
      }
      session.date = cleanDate;
    }

    if (notes !== undefined) {
      session.notes = String(notes || '').trim();
    }

    if (Array.isArray(exercises)) {
      const sanitizedExercises = exercises.map((exercise) => ({
        name: String(exercise.name || '').trim(),
        reps: Number(exercise.reps) || 0,
        duration_minutes: Number(exercise.duration_minutes) || 0,
        rewarded: Boolean(exercise.rewarded),
        notes: String(exercise.notes || '').trim(),
      })).filter((exercise) => exercise.name);

      if (!sanitizedExercises.length) {
        return res.status(400).json({ message: 'At least one valid dog exercise is required.' });
      }

      session.exercises = sanitizedExercises;
      session.total_minutes = sanitizedExercises.reduce((sum, exercise) => sum + exercise.duration_minutes, 0);
    }

    await session.save();
    res.json(serializeDogTraining(session));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update dog training session', error: error.message });
  }
});

app.delete('/api/dog-workouts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await DogTraining.findOneAndDelete({ _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) });

    if (!result) {
      return res.status(404).json({ message: 'Dog training session not found.' });
    }

    res.json({ message: 'Dog training session deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete dog training session', error: error.message });
  }
});

app.get('/api/journals', requireAuth, async (req, res) => {
  try {
    const entries = await Journal.find({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
    }).sort({ createdAt: -1 });
    res.json(entries.map(serializeJournal));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch journal entries', error: error.message });
  }
});

app.get('/api/journals/unreported', requireAuth, async (req, res) => {
  try {
    const entries = await Journal.find({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
      reported: false,
    }).sort({ createdAt: -1 });
    res.json(entries.map(serializeJournal));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch unreported journal entries', error: error.message });
  }
});

app.get('/api/journals/reported', requireAuth, async (req, res) => {
  try {
    const entries = await Journal.find({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
      reported: true,
    }).sort({ reportedDate: -1, createdAt: -1 });
    res.json(entries.map(serializeJournal));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reported journal entries', error: error.message });
  }
});

app.post('/api/journals', requireAuth, async (req, res) => {
  try {
    const { title, description, category } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }

    const normalizedCategory = ['Professional', 'Private'].includes(category) ? category : 'Professional';

    const entry = await Journal.create({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      title: title.trim(),
      description: String(description || '').trim(),
      category: normalizedCategory,
    });

    res.status(201).json(serializeJournal(entry));
  } catch (error) {
    res.status(500).json({ message: 'Failed to create journal entry', error: error.message });
  }
});

app.get('/api/journals/:id', requireAuth, async (req, res) => {
  try {
    const entry = await Journal.findOne({
      _id: req.params.id,
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
    });

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found.' });
    }

    res.json(serializeJournal(entry));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch journal entry', error: error.message });
  }
});

app.put('/api/journals/:id', requireAuth, async (req, res) => {
  try {
    const update = {};
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
        return res.status(400).json({ message: 'Title is required.' });
      }
      update.title = req.body.title.trim();
    }
    if (req.body.description !== undefined) {
      update.description = String(req.body.description || '').trim();
    }
    if (req.body.reported !== undefined) {
      update.reported = Boolean(req.body.reported);
      update.reportedDate = update.reported ? new Date() : null;
    }

    const entry = await Journal.findOneAndUpdate(
      { _id: req.params.id, user_id: new mongoose.Types.ObjectId(req.user.sub), deleted: false },
      update,
      { new: true, runValidators: true },
    );

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found.' });
    }

    res.json(serializeJournal(entry));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update journal entry', error: error.message });
  }
});

app.patch('/api/journals/:id', requireAuth, async (req, res) => {
  try {
    const update = {};
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
        return res.status(400).json({ message: 'Title is required.' });
      }
      update.title = req.body.title.trim();
    }
    if (req.body.description !== undefined) {
      update.description = String(req.body.description || '').trim();
    }
    if (req.body.reported !== undefined) {
      update.reported = Boolean(req.body.reported);
      update.reportedDate = update.reported ? new Date() : null;
    }

    const entry = await Journal.findOneAndUpdate(
      { _id: req.params.id, user_id: new mongoose.Types.ObjectId(req.user.sub), deleted: false },
      update,
      { new: true, runValidators: true },
    );

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found.' });
    }

    res.json(serializeJournal(entry));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update journal entry', error: error.message });
  }
});

app.patch('/api/journals/:id/toggle-reported', requireAuth, async (req, res) => {
  try {
    const entry = await Journal.findOne({
      _id: req.params.id,
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
    });

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found.' });
    }

    entry.reported = !entry.reported;
    entry.reportedDate = entry.reported ? (entry.reportedDate || new Date()) : null;
    const saved = await entry.save();

    res.json(serializeJournal(saved));
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle journal report state', error: error.message });
  }
});

app.delete('/api/journals/:id', requireAuth, async (req, res) => {
  try {
    const entry = await Journal.findOneAndUpdate(
      { _id: req.params.id, user_id: new mongoose.Types.ObjectId(req.user.sub), deleted: false },
      { deleted: true },
      { new: true },
    );

    if (!entry) {
      return res.status(404).json({ message: 'Journal entry not found.' });
    }

    res.json(serializeJournal(entry));
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete journal entry', error: error.message });
  }
});

app.get('/api/tasks', requireAuth, async (req, res) => {
  try {
    const tasks = await Task.find({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
    }).sort({ createdAt: -1 });

    for (const task of tasks) {
      if (task.background_query && task.background_url) continue;
      const generated = await hydrateTaskBackground(task);
      task.background_query = generated.query;
      task.background_url = generated.url;
      await task.save();
    }

    res.json(tasks.map(serializeTask));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch tasks', error: error.message });
  }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  try {
    const { title, category, owner, deadline, status, journal_label, journal_category, subtasks = [] } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Task title is required.' });
    }

    const safeSubtasks = Array.isArray(subtasks)
      ? subtasks.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    const defaultDeadline = () => {
      const next = new Date();
      next.setDate(next.getDate() + 7);
      return next.toISOString().slice(0, 10);
    };

    const generated = await hydrateTaskBackground(null, {
      title: title.trim(),
      category: category || 'General',
      status: status || 'Next Action',
      subtasks: safeSubtasks,
    });

    const task = await Task.create({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      title: title.trim(),
      category: category || 'General',
      owner: owner || '@me',
      deadline: deadline || defaultDeadline(),
      status: status || 'Next Action',
      journal_label: journal_label || 'Journal',
      journal_category: ['Professional', 'Private'].includes(journal_category) ? journal_category : 'Professional',
      background_query: generated.query,
      background_url: generated.url,
      subtasks: safeSubtasks,
    });

    res.status(201).json(serializeTask(task));
  } catch (error) {
    res.status(500).json({ message: 'Failed to create task', error: error.message });
  }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { title, category, owner, deadline, status, journal_label, journal_category, subtasks } = req.body;

    const existingTask = await Task.findOne({
      _id: req.params.id,
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      deleted: false,
    });

    if (!existingTask) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const update = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: 'Task title is required.' });
      }
      update.title = title.trim();
    }
    if (category !== undefined) update.category = category || 'General';
    if (owner !== undefined) update.owner = owner || '@me';
    if (deadline !== undefined) update.deadline = deadline || '';
    if (status !== undefined) update.status = status || 'Next Action';
    if (journal_label !== undefined) update.journal_label = journal_label || 'Journal';
    if (journal_category !== undefined) {
      update.journal_category = ['Professional', 'Private'].includes(journal_category) ? journal_category : 'Professional';
    }
    if (Array.isArray(subtasks)) {
      update.subtasks = subtasks.map((item) => String(item || '').trim()).filter(Boolean);
    }

    const shouldRefreshBackground = ['title', 'category', 'status', 'subtasks'].some((field) => field in update)
      || !existingTask.background_query
      || !existingTask.background_url;

    if (shouldRefreshBackground) {
      const generated = await hydrateTaskBackground(existingTask, {
        title: update.title ?? existingTask.title,
        category: update.category ?? existingTask.category,
        status: update.status ?? existingTask.status,
        subtasks: update.subtasks ?? existingTask.subtasks,
      });

      update.background_query = generated.query;
      update.background_url = generated.url;
    }

    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user_id: new mongoose.Types.ObjectId(req.user.sub), deleted: false },
      update,
      { new: true },
    );

    res.json(serializeTask(task));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update task', error: error.message });
  }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, user_id: new mongoose.Types.ObjectId(req.user.sub), deleted: false },
      { deleted: true },
      { new: true },
    );

    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    res.json(serializeTask(task));
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete task', error: error.message });
  }
});

app.get('/api/exercises', requireAuth, async (req, res) => {
  try {
    const exercises = await ExerciseLibrary.find({}).sort({ name: 1 });
    res.json(exercises.map((exercise) => ({ id: exercise._id.toString(), name: exercise.name, category: exercise.category, bodyweight: exercise.bodyweight })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch exercise list', error: error.message });
  }
});

app.post('/api/exercises', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, category = 'general', bodyweight = true } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Exercise name is required.' });
    }

    const cleanName = name.trim();
    const exercise = await ExerciseLibrary.findOneAndUpdate(
      { name: cleanName },
      { $set: { category, bodyweight, created_by: req.user.sub } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(201).json({ id: exercise._id.toString(), name: exercise.name, category: exercise.category, bodyweight: exercise.bodyweight });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save exercise', error: error.message });
  }
});

app.put('/api/exercises/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category = 'general', bodyweight = true } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Exercise name is required.' });
    }

    const exercise = await ExerciseLibrary.findById(id);
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found.' });
    }

    exercise.name = String(name).trim();
    exercise.category = String(category || 'general').trim() || 'general';
    exercise.bodyweight = Boolean(bodyweight);
    exercise.created_by = req.user.sub;
    await exercise.save();

    res.json({ id: exercise._id.toString(), name: exercise.name, category: exercise.category, bodyweight: exercise.bodyweight });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: 'An exercise with that name already exists.' });
    }
    res.status(500).json({ message: 'Failed to update exercise', error: error.message });
  }
});

app.get('/api/workouts', requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const query = { user_id: new mongoose.Types.ObjectId(req.user.sub) };
    if (date) query.date = date;
    const workouts = await Workout.find(query).sort({ date: -1, createdAt: -1 });
    res.json(workouts.map(serializeWorkout));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch workouts', error: error.message });
  }
});

app.post('/api/workouts', requireAuth, async (req, res) => {
  try {
    const { workout_name, date, focus, notes, exercises = [] } = req.body;

    if (!workout_name || !date || !Array.isArray(exercises) || exercises.length === 0) {
      return res.status(400).json({ message: 'Workout name, date, and at least one exercise are required.' });
    }

    const sanitizedExercises = exercises.map((exercise) => ({
      name: String(exercise.name || '').trim(),
      sets: Number(exercise.sets) || 0,
      reps: Number(exercise.reps) || 0,
      duration_minutes: Number(exercise.duration_minutes) || 0,
      bodyweight: Boolean(exercise.bodyweight),
      notes: String(exercise.notes || '').trim(),
    })).filter((exercise) => exercise.name);

    if (!sanitizedExercises.length) {
      return res.status(400).json({ message: 'At least one valid exercise is required.' });
    }

    const total_volume = sanitizedExercises.reduce((sum, exercise) => sum + exercise.sets * exercise.reps, 0);

    const workout = await Workout.create({
      user_id: new mongoose.Types.ObjectId(req.user.sub),
      workout_name,
      date,
      focus: focus || '',
      notes: notes || '',
      exercises: sanitizedExercises,
      total_volume,
    });

    res.status(201).json(serializeWorkout(workout));
  } catch (error) {
    res.status(500).json({ message: 'Failed to save workout', error: error.message });
  }
});

app.put('/api/workouts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { workout_name, date, focus, notes, exercises } = req.body;

    const update = {};
    if (workout_name) update.workout_name = workout_name;
    if (date) update.date = date;
    if (focus !== undefined) update.focus = focus;
    if (notes !== undefined) update.notes = notes;

    if (Array.isArray(exercises)) {
      const sanitizedExercises = exercises.map((exercise) => ({
        name: String(exercise.name || '').trim(),
        sets: Number(exercise.sets) || 0,
        reps: Number(exercise.reps) || 0,
        duration_minutes: Number(exercise.duration_minutes) || 0,
        bodyweight: Boolean(exercise.bodyweight),
        notes: String(exercise.notes || '').trim(),
      })).filter((exercise) => exercise.name);

      update.exercises = sanitizedExercises;
      update.total_volume = sanitizedExercises.reduce((sum, exercise) => sum + exercise.sets * exercise.reps, 0);
    }

    const workout = await Workout.findOneAndUpdate(
      { _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) },
      update,
      { new: true },
    );
    if (!workout) {
      return res.status(404).json({ message: 'Workout not found.' });
    }

    res.json(serializeWorkout(workout));
  } catch (error) {
    res.status(500).json({ message: 'Failed to update workout', error: error.message });
  }
});

app.delete('/api/workouts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Workout.findOneAndDelete({ _id: id, user_id: new mongoose.Types.ObjectId(req.user.sub) });

    if (!result) {
      return res.status(404).json({ message: 'Workout not found.' });
    }

    res.json({ message: 'Workout deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete workout', error: error.message });
  }
});

async function seedExerciseLibrary() {
  const defaults = [
    'Push-up',
    'Pull-up',
    'Dip',
    'Squat',
    'Lunge',
    'Burpee',
    'Plank',
    'Leg Raise',
    'Hollow Hold',
    'Mountain Climber',
    'Chin-up',
    'Pike Push-up',
    'Row',
    'Bodyweight Deadlift',
  ];

  for (const name of defaults) {
    await ExerciseLibrary.findOneAndUpdate(
      { name },
      { $setOnInsert: { category: 'general', bodyweight: true } },
      { upsert: true, new: true },
    );
  }
}

async function seedDogExerciseLibrary() {
  const defaults = ['Sit', 'Stay', 'Come', 'Heel', 'Leave it', 'Place', 'Down', 'Touch'];

  for (const name of defaults) {
    await DogExerciseLibrary.findOneAndUpdate(
      { name },
      { $setOnInsert: { category: 'obedience' } },
      { upsert: true, new: true },
    );
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectMongoWithRetry(uri) {
  let attempt = 0;

  while (attempt < MONGO_CONNECT_RETRIES) {
    attempt += 1;
    try {
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      return;
    } catch (error) {
      const isLast = attempt >= MONGO_CONNECT_RETRIES;
      console.error(`MongoDB connection attempt ${attempt}/${MONGO_CONNECT_RETRIES} failed: ${error.message}`);
      if (isLast) {
        throw error;
      }
      await wait(MONGO_RETRY_DELAY_MS);
    }
  }
}

app.use((error, req, res, next) => {
  if (!error) {
    next();
    return;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      message: `Upload file is too large. Maximum supported size is ${Math.max(5, SPORTS_UPLOAD_MAX_MB)} MB.`,
    });
    return;
  }

  next(error);
});

async function startServer() {
  try {
    validateProductionConfiguration();
    let mongoUri = MONGODB_URI;

    if (USE_MEMORY_DB) {
      mongoServer = await MongoMemoryServer.create({
        binary: { version: '7.0.14' },
      });
      mongoUri = mongoServer.getUri('calisthenics-tracker');
      console.log(`Using in-memory MongoDB at ${mongoUri}`);
    }

    await connectMongoWithRetry(mongoUri);
    await seedExerciseLibrary();
    await seedDogExerciseLibrary();
    console.log(`Connected to MongoDB at ${mongoUri}`);

    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
  process.exit(0);
});

startServer();
