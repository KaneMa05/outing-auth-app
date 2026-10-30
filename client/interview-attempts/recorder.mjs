// Caller explicitly supplies an already-authorized microphone stream.
export function recordAttempt({attempts, accountId, id, stream, MediaRecorder = globalThis.MediaRecorder, onError = () => {}}) {
  const release = () => stream.getTracks().forEach(track => track.stop());
  if (!MediaRecorder) { release(); throw Error('recording_unsupported'); }
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType) { release(); throw Error('recording_unsupported'); }
  let recorder;
  try { recorder = new MediaRecorder(stream, {mimeType}); } catch (error) { release(); throw error; }
  let pending = Promise.resolve(), failure, stopping, savedBytes = 0;
  recorder.ondataavailable = event => {
    if (!event.data.size) return;
    pending = pending.then(async () => { if (!failure) { await attempts.append(accountId, id, event.data); savedBytes += event.data.size; } }).catch(error => {
      if (!failure) { failure = error; try { onError(error); } catch {} }
      if (recorder.state !== 'inactive') recorder.stop();
    });
  };
  recorder.onerror = event => { failure = event.error || Error('recording_failed'); void stop(true).catch(() => {}); };
  function stop(interrupted = false) {
    if (stopping) return stopping;
    stopping = new Promise((resolve, reject) => {
      recorder.onstop = async () => {
        release();
        try { await pending; if (!failure && !savedBytes) failure = Error('empty_recording'); const result = await attempts.finish(accountId, id, {interrupted: interrupted || !!failure}); if (failure) reject(failure); else resolve(result); } catch (error) { reject(error); }
      };
      if (recorder.state === 'inactive') void recorder.onstop(); else recorder.stop();
    });
    return stopping;
  }
  // Handles automatic stop from device disconnection as an interruption.
  recorder.onstop = () => { void stop(true).catch(() => {}); };
  try { recorder.start(1000); } catch (error) { release(); throw error; }
  return {stop, interrupt: () => stop(true)};
}
