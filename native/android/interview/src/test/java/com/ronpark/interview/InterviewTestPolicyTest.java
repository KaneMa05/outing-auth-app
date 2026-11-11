package com.ronpark.interview;
import org.junit.Test;
import static org.junit.Assert.*;

public class InterviewTestPolicyTest {
    @Test public void nativeCapabilitiesRequireTheExactHttpsOrigin(){
        assertTrue(InterviewTestPolicy.trusted("https://outing-auth-app.vercel.app/interview?app=1"));
        assertTrue(InterviewTestPolicy.trusted("https://outing-auth-app.vercel.app:443/"));
        for(String url:new String[]{"http://outing-auth-app.vercel.app/","https://outing-auth-app.vercel.app.evil.test/","https://evil.test@outing-auth-app.vercel.app/","https://outing-auth-app.vercel.app:8443/","file:///interview","intent://interview/start","https://app.ronparkpass.com/"})assertFalse(url,InterviewTestPolicy.trusted(url));
    }
    @Test public void allSixQuestionsHaveTheSameProgressAsIphone(){
        String[] expected={"메인 질문 1/2","메인 1/2 · 꼬리질문 1/2","메인 1/2 · 꼬리질문 2/2","메인 질문 2/2","메인 2/2 · 꼬리질문 1/2","메인 2/2 · 꼬리질문 2/2"};
        for(int i=0;i<6;i++)assertEquals(expected[i],InterviewTestPolicy.progress(i+1));
    }
    @Test public void startupErrorsPreserveSafeRetryBehavior(){
        assertFalse(InterviewTestPolicy.retryable("admission_busy"));assertFalse(InterviewTestPolicy.retryable("daily_limit"));assertFalse(InterviewTestPolicy.retryable("unauthorized"));assertTrue(InterviewTestPolicy.retryable("queue_full"));
        assertTrue(InterviewTestPolicy.failure("queue_full").contains("잠시 후"));assertTrue(InterviewTestPolicy.failure("session_expired").contains("다시 열어"));
    }
    @Test public void bridgeAcceptsOnlyPracticeModesAndOneTimeCodes(){
        assertTrue(InterviewTestPolicy.mode("job"));assertTrue(InterviewTestPolicy.mode("personality"));assertFalse(InterviewTestPolicy.mode("ai"));assertTrue(InterviewTestPolicy.code(new String(new char[43]).replace('\0','a')));assertFalse(InterviewTestPolicy.code("secret"));assertFalse(InterviewTestPolicy.code(null));
    }
    @Test public void jobFieldsRespectTheIphoneTrackPolicy(){
        assertTrue(InterviewTestPolicy.fieldAllowed("criminal_law_investigation","공채"));assertFalse(InterviewTestPolicy.fieldAllowed("navigation","공채"));assertTrue(InterviewTestPolicy.fieldAllowed("navigation","항해"));assertTrue(InterviewTestPolicy.fieldAllowed("engineering_maintenance","기관"));assertFalse(InterviewTestPolicy.fieldAllowed("marine_environment","기관"));assertTrue(InterviewTestPolicy.fieldAllowed("marine_environment","방제"));
    }
    @Test public void kakaoLoginKeepsItsCookieJarWithoutGainingNativeCapabilities(){
        for(String url:new String[]{"https://kauth.kakao.com/oauth/authorize","https://accounts.kakao.com/login"}){assertTrue(InterviewTestPolicy.navigationAllowed(url));assertFalse(InterviewTestPolicy.trusted(url));}
        for(String url:new String[]{"http://accounts.kakao.com/","https://accounts.kakao.com.evil.test/","https://evil.test@accounts.kakao.com/","https://kauth.kakao.com:8443/"})assertFalse(InterviewTestPolicy.navigationAllowed(url));
    }
}
