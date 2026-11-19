package com.ronpark.interview;

/** Input activity only; no speech content or network dependency. */
final class NativePracticeInput {
    final long started;long previous,lastInput,continuous;boolean confirmed;
    NativePracticeInput(long now){started=previous=lastInput=now;}
    boolean sample(long now,boolean speaking){long delta=Math.max(0,Math.min(200,now-previous));previous=now;if(speaking){continuous+=delta;lastInput=now;if(continuous>=300)confirmed=true;}else continuous=0;return confirmed&&now-lastInput>=4000;}
    void resume(long now){previous=now;continuous=0;if(confirmed)lastInput=now;}
    boolean limitReached(long now,long bytes){return now-started>=120000||bytes>=44L+120L*32000L;}
    long remaining(long now){return confirmed?Math.max(0,4000-(now-lastInput)):4000;}
}
