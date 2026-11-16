package com.ronpark.interview;
import org.junit.Test;
import static org.junit.Assert.*;
public class PracticeTimingTest {
    @Test public void noAnswerEndsExactlyFourSecondsAfterReady(){PracticeTiming g=new PracticeTiming(20000);assertEquals(4000,g.remaining(20000));assertEquals(PracticeTiming.WAITING,g.sample(20200,false));assertEquals(PracticeTiming.PAUSE,g.sample(23999,false));assertEquals(PracticeTiming.COMPLETE,g.sample(24000,false));}
    @Test public void lastSecondSpeechResetsDeadline(){PracticeTiming g=new PracticeTiming(0);assertEquals(PracticeTiming.SPEAKING,g.sample(3900,true));assertEquals(3900,g.remaining(4000));assertEquals(PracticeTiming.PAUSE,g.sample(7899,false));assertEquals(PracticeTiming.COMPLETE,g.sample(7900,false));}
    @Test public void completionIsOneWayEvenIfSpeechArrivesLater(){PracticeTiming g=new PracticeTiming(0);g.sample(4000,false);assertEquals(PracticeTiming.COMPLETE,g.sample(4100,true));}
    @Test public void wordGapsRemainSpeakingButDoNotExtendSilence(){PracticeTiming g=new PracticeTiming(10000);g.sample(11000,true);assertEquals(PracticeTiming.SPEAKING,g.sample(11800,false));assertEquals(PracticeTiming.PAUSE,g.sample(12300,false));assertEquals(2700,g.remaining(12300));assertEquals(PracticeTiming.COMPLETE,g.sample(15000,false));}
}
