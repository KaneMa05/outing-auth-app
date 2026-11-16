'use strict';
const {VERSION}=require('./preassignment-diagnosis.cjs');
const MODEL='gpt-6.1-sol', EFFORT='medium';
const QUESTION_MODEL='gpt-6-luna', QUESTION_EFFORT='low';
// Mock interview analysis has a separate rollout; do not inherit a diagnosis change.
const MOCK_MODEL='gpt-6-astra';
// Preserve the deployed queue/cache identity on model-only switches. The rubric,
// instructions and output contract are unchanged. This legacy key is not a record
// of the model used for a new call; workers log the actual model/effort separately.
const ENGINE_VERSION=VERSION+':pc-v1:gpt-6-astra:high';
module.exports={MODEL,EFFORT,QUESTION_MODEL,QUESTION_EFFORT,MOCK_MODEL,ENGINE_VERSION};
