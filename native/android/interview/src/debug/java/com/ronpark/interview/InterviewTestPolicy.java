package com.ronpark.interview;

import java.net.URI;
import java.util.Arrays;

/** Shared iPhone/Android test contract. No production actor is inferred from a URL. */
final class InterviewTestPolicy {
    static final String ORIGIN="https://outing-auth-app.vercel.app";
    static boolean trusted(String url){
        try{URI u=new URI(url);return "https".equals(u.getScheme())&&"outing-auth-app.vercel.app".equals(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getRawUserInfo()==null;}catch(Exception e){return false;}
    }
    static boolean code(String code){return code!=null&&code.matches("[A-Za-z0-9_-]{43}");}
    static boolean navigationAllowed(String url){
        if(trusted(url))return true;
        try{URI u=new URI(url);return "https".equals(u.getScheme())&&Arrays.asList("kauth.kakao.com","accounts.kakao.com").contains(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getRawUserInfo()==null;}catch(Exception e){return false;}
    }
    static boolean mode(String mode){return Arrays.asList("job","personality").contains(mode);}
    static boolean fieldAllowed(String field,String track){
        if("기타".equals(track))return true;
        if(Arrays.asList("coast_guard","domestic_maritime_law","criminal_law_investigation","international_maritime_law").contains(field))return InterviewQuestionPolicy.validTrack(track);
        if(Arrays.asList("항해","관제").contains(track))return Arrays.asList("navigation","vts_communications").contains(field);
        if("기관".equals(track))return "engineering_maintenance".equals(field);
        return "방제".equals(track)&&Arrays.asList("marine_environment","engineering_maintenance").contains(field);
    }
    static String progress(int n){int number=Math.max(1,n);int main=(number-1)/3+1,follow=(number-1)%3;return follow==0?"메인 질문 "+main+"/2":"메인 "+main+"/2 · 꼬리질문 "+follow+"/2";}
    static String failure(String code){
        if("daily_limit".equals(code))return "오늘 실전 모의면접 이용 횟수(3회)를 모두 사용했습니다. 내일 다시 이용해주세요.";
        if("admission_busy".equals(code))return "이전 면접이 진행 중이거나 종료 확인 중입니다. 내 면접 기록을 확인한 뒤 다시 시도해주세요.";
        if("queue_full".equals(code))return "현재 면접 연결이 많습니다. 잠시 후 다시 시도해주세요.";
        if("not_enrolled".equals(code)||"forbidden".equals(code))return "실전 모의면접 수강 등록과 이용 권한을 확인해주세요.";
        if("unauthorized".equals(code)||"session_expired".equals(code))return "연결이 만료되었습니다. 돌아간 뒤 실전 모의면접을 다시 열어주세요.";
        return "면접을 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해주세요.";
    }
    static boolean retryable(String code){return !Arrays.asList("daily_limit","admission_busy","unauthorized","session_expired").contains(code);}
}
