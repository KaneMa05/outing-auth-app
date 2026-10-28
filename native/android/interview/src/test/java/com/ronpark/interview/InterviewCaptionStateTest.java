package com.ronpark.interview;

import org.junit.Test;
import static org.junit.Assert.*;

public class InterviewCaptionStateTest {
    @Test public void finalCorrectionReplacesThePreviewWithoutCountingAsSpeech(){
        InterviewCaptionState state=new InterviewCaptionState();
        assertTrue(state.update("해양 경창",true));
        assertFalse(state.update("해양경찰",false));
        assertEquals("해양경찰",state.text());
        assertTrue(state.update("해양경찰 업무를 설명하겠습니다",true));
    }
    @Test public void punctuationAndDuplicateMessagesDoNotRestartSilence(){
        InterviewCaptionState state=new InterviewCaptionState();
        assertTrue(state.update("협업했습니다",true));
        assertFalse(state.update("협업했습니다",true));
        assertFalse(state.update("협업 했습니다.",true));
    }
    @Test public void noiseAnnotationsAreNotSpeech(){
        InterviewCaptionState state=new InterviewCaptionState();
        assertFalse(state.update("[잡음]",true));assertFalse(state.update("(소음)",true));
        assertFalse(state.update("[Background noise]",true));assertFalse(state.update("...",true));
        assertTrue(state.update("소음이 심한 현장에서 근무했습니다",true));
    }
}
