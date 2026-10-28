package com.ronpark.interview;

/** Seven seconds without recognized speech ends the current turn. */
final class InterviewAnswerGate {
    static final int SILENCE_MS=7000;
    static final int WAITING=0,SPEAKING=1,PAUSE=2,COMPLETE=3;
    private final long started;
    private long lastVoice=-1,silenceStart=-1;
    private boolean complete;
    private long recognitionGraceUntil=-1;
    InterviewAnswerGate(long now){started=now;}
    int sample(long now,boolean speaking){
        return sample(now,speaking,false);
    }
    int sample(long now,boolean speaking,boolean pendingRecognition){
        if(complete)return COMPLETE;
        if(speaking){
            recognitionGraceUntil=-1;silenceStart=-1;lastVoice=now;return SPEAKING;
        }
        if(now-started<600&&lastVoice<0)return WAITING;
        // Keep one stable speaking state through gaps between words and syllables.
        if(lastVoice>=0&&now-lastVoice<1200)return SPEAKING;
        if(silenceStart<0)silenceStart=lastVoice>=0?lastVoice:started+600;
        if(now-silenceStart>=SILENCE_MS){
            // Allow one bounded recognition delay if a new utterance starts at the deadline.
            // Noise cannot reset the seven-second countdown or extend this grace repeatedly.
            if(pendingRecognition&&recognitionGraceUntil<0)recognitionGraceUntil=now+1500;
            if(pendingRecognition&&now<recognitionGraceUntil)return SPEAKING;
            complete=true;return COMPLETE;
        }
        return PAUSE;
    }
    long remaining(long now){return silenceStart<0?SILENCE_MS:Math.max(0,SILENCE_MS-(now-silenceStart));}
}
