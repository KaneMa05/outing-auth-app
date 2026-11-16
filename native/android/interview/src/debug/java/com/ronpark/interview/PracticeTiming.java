package com.ronpark.interview;

/** Local microphone time only: ASR latency never changes a turn deadline. */
final class PracticeTiming {
    static final long SILENCE_MS=4000;
    static final int WAITING=0,SPEAKING=1,PAUSE=2,COMPLETE=3;
    private final long started;
    private long lastVoice=-1;
    private boolean complete;
    PracticeTiming(long now){started=now;}
    int sample(long now,boolean speaking){
        if(complete)return COMPLETE;
        if(speaking){lastVoice=now;return SPEAKING;}
        if(remaining(now)==0){complete=true;return COMPLETE;}
        if(lastVoice<0&&now-started<600)return WAITING;
        return lastVoice>=0&&now-lastVoice<1200?SPEAKING:PAUSE;
    }
    long remaining(long now){return Math.max(0,SILENCE_MS-(now-(lastVoice<0?started:lastVoice)));}
}
