package com.ronpark.interview;

import org.junit.Test;
import static org.junit.Assert.*;

public class InterviewMicLevelTest {
    private short[] tone(double db){
        short[] samples=new short[1024];double amplitude=32768*Math.sqrt(2)*Math.pow(10,db/20);
        for(int i=0;i<samples.length;i++)samples[i]=(short)Math.round(amplitude*Math.sin(2*Math.PI*500*i/16000));
        return samples;
    }
    private void feed(InterviewMicLevel signal,double db,int frames){
        short[] samples=tone(db);for(int i=0;i<frames;i++)signal.sample(samples,samples.length);
    }
    private InterviewMicLevel calibrated(double db){
        InterviewMicLevel signal=new InterviewMicLevel();signal.calibrate();feed(signal,db,16);
        assertFalse(signal.calibrating());return signal;
    }
    @Test public void steadyRoomNoiseDoesNotMoveTheMeterOrHoldTheAnswerOpen(){
        InterviewMicLevel signal=calibrated(-43);InterviewAnswerGate gate=new InterviewAnswerGate(0);
        for(int t=0;t<7600;t+=100){
            feed(signal,-41,2);assertFalse(signal.speaking());assertEquals(0,signal.level(),0.001);
            assertNotEquals(InterviewAnswerGate.SPEAKING,gate.sample(t,signal.speaking()));
        }
        assertEquals(InterviewAnswerGate.COMPLETE,gate.sample(7600,signal.speaking()));
    }
    @Test public void softVoiceInAQuietRoomIsStillDetected(){
        InterviewMicLevel signal=calibrated(-65);feed(signal,-47,3);
        assertTrue(signal.speaking());assertTrue(signal.level()>0);
    }
    @Test public void normalVoiceAboveRoomNoiseMovesTheMeterWithoutMaxingItOut(){
        InterviewMicLevel signal=calibrated(-43);feed(signal,-27,5);
        assertTrue(signal.speaking());assertTrue(signal.level()>0.2);assertTrue(signal.level()<0.9);
    }
    @Test public void aBriefTapDoesNotCountAsSpeech(){
        InterviewMicLevel signal=calibrated(-60);feed(signal,-15,1);
        assertFalse(signal.speaking());assertEquals(0,signal.level(),0.001);
        feed(signal,-60,4);assertFalse(signal.speaking());
    }
    @Test public void aTapDuringCalibrationDoesNotMakeSoftSpeechDisappear(){
        InterviewMicLevel signal=new InterviewMicLevel();signal.calibrate();
        feed(signal,-60,6);feed(signal,-15,2);feed(signal,-60,8);feed(signal,-46,3);
        assertTrue(signal.speaking());assertEquals(-60,signal.noiseDb(),0.5);
    }
    @Test public void dcOffsetIsNotSpeechAndPcmIsUnchanged(){
        InterviewMicLevel signal=new InterviewMicLevel();short[] samples=new short[1024];
        java.util.Arrays.fill(samples,(short)2500);short[] before=samples.clone();
        for(int i=0;i<20;i++)signal.sample(samples,samples.length);
        assertFalse(signal.speaking());assertEquals(0,signal.level(),0.001);assertArrayEquals(before,samples);
    }
    @Test public void smallLevelChangesWithinAWordDoNotFlicker(){
        InterviewMicLevel signal=calibrated(-60);feed(signal,-48,2);assertTrue(signal.speaking());
        for(int i=0;i<8;i++){feed(signal,-54,1);assertTrue(signal.speaking());feed(signal,-50,1);assertTrue(signal.speaking());}
        feed(signal,-60,12);assertFalse(signal.speaking());assertTrue(signal.level()<0.01);
    }
    @Test public void savedCalibrationAppliesToAnswerRecording(){
        InterviewMicLevel check=calibrated(-43),answer=new InterviewMicLevel(check.noiseDb());
        feed(answer,-41,20);assertFalse(answer.speaking());
        feed(answer,-29,3);assertTrue(answer.speaking());
    }
}
