'use strict';
// Approved on 2026-11-11 after audition: original female and male v3.
// Voice IDs are project metadata. Only the signed test-app actor selects them.
const FEMALE={
 "voice": {
  "id": "voice_6af3fd211ea081918dc2e8e94f946587"
 },
 "description": "An original fictional adult Korean voice with a mature feminine presentation and a perceived age of 47 to 49. Speak natural standard Korean with a neutral Seoul accent. A comfortable mid-to-low register, rounded warm timbre, subtle natural vocal texture, and clear precise consonants. Steady measured rhythm, comfortable pauses and restrained neutral intonation. The composed, experienced delivery of a professional interview examiner. Keep the voice natural and healthy rather than exaggerated or theatrical."
};
const MALE={
 "voice": {
  "id": "voice_6af4003787988191b9708350269ed872"
 },
 "description": "An original fictional Korean man with an unmistakably middle-aged natural speaking voice, perceived age 53. The defining feature is a clearly audible, lived-in, dry husky texture: woody chest resonance, a gently weathered rasp carried naturally through ordinary words, and relaxed mature vocal weight. Use a comfortable low-to-middle pitch; the age should be heard in the textured timbre and seasoned phrasing, not through an artificially deep sub-bass. Speak natural standard Korean with a neutral Seoul accent. Sound like an experienced middle-aged interview examiner talking calmly across a desk at everyday volume. Use measured, slightly unhurried phrasing, comfortable short pauses and firm downward-settling sentence endings. Keep consonants clear, the breath natural and the overall voice healthy. Retain the distinctly middle-aged huskiness throughout the whole passage. Avoid a smooth youthful announcer or singer quality, bright ringing vowels, a polished youthful tenor, exaggerated vocal fry, theatrical old-man acting or a frail elderly sound."
};
for(const profile of [FEMALE,MALE]){Object.freeze(profile.voice);Object.freeze(profile);}
const TEST_INTERVIEWERS=Object.freeze({
 'interviewer-woman':FEMALE.voice,
 'interviewer-man-1':MALE.voice,
 'interviewer-man-2':MALE.voice
});
function testVoiceProfile(voice){
 if(!voice||typeof voice!=='object'||Array.isArray(voice)||Object.keys(voice).length!==1||!Object.hasOwn(voice,'id'))throw Error('invalid_request');
 const profile=[FEMALE,MALE].find(profile=>profile.voice.id===voice.id);
 if(!profile)throw Error('invalid_request');
 return profile;
}
module.exports={TEST_INTERVIEWERS,testVoiceProfile};
