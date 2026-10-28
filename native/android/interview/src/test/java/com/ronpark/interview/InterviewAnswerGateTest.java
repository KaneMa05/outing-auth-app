package com.ronpark.interview;

import org.junit.Test;
import static org.junit.Assert.*;

public class InterviewAnswerGateTest {
    @Test public void initialSilenceShowsSevenSecondsBeforeAdvancing(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);
        for(int t=0;t<600;t+=100)assertEquals(InterviewAnswerGate.WAITING,gate.sample(t,false));
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(600,false));assertEquals(7000,gate.remaining(600));
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(6600,false));assertEquals(1000,gate.remaining(6600));
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(7600,false));
    }
    @Test public void speakingResetsTheCountdown(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);
        for(int t=0;t<600;t+=100)gate.sample(t,false);
        gate.sample(600,false);assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(2000,true));
        assertEquals(7000,gate.remaining(2000));assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(2100,false));
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(8900,false));
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(9000,false));
    }
    @Test public void pauseAllowsSpeechToResumeBeforeCompletion(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);
        for(int t=0;t<600;t+=100)gate.sample(t,false);
        for(int t=600;t<=1300;t+=100)gate.sample(t,true);
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(8000,false));
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(8100,true));
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(15000,false));
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(15100,false));
    }
    @Test public void confirmedSpeechAndShortWordGapsDoNotStartACountdown(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);for(int t=0;t<600;t+=100)gate.sample(t,false);
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(600,true));
        for(int t=700;t<1600;t+=100)assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(t,false));
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(1600,true));
    }
    @Test public void speechImmediatelyAfterTheCueIsNotIgnored(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(128,true));
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(300,false));
        assertEquals(InterviewAnswerGate.PAUSE,gate.sample(1400,false));
    }
    @Test public void backgroundSoundsDoNotRestartTheSevenSecondTimer(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);gate.sample(600,false,false);
        for(int t=1000;t<=7000;t+=100){assertEquals(InterviewAnswerGate.PAUSE,gate.sample(t,false,true));assertEquals(7600-t,gate.remaining(t));}
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(7600,false,false));
    }
    @Test public void persistentNoiseCannotExtendRecognitionGraceIndefinitely(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);gate.sample(600,false,false);
        assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(7600,false,true));
        assertEquals(0,gate.remaining(7600));
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(9100,false,true));
    }
    @Test public void speechAtTheDeadlineHasTimeToBeRecognized(){
        InterviewAnswerGate gate=new InterviewAnswerGate(0);gate.sample(600,false,false);
        gate.sample(7600,false,true);assertEquals(InterviewAnswerGate.SPEAKING,gate.sample(8200,true,true));
        assertEquals(7000,gate.remaining(8200));
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(15200,false,false));
    }
}
