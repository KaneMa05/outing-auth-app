package com.ronpark.interview;
import java.net.URI;
import java.util.*;

final class NativePracticePolicy {
    static final Set<String> ORIGINS=new HashSet<>(Arrays.asList("https://outing-auth-app.vercel.app","https://app.ronparkpass.com"));
    static boolean trusted(String raw){try{URI u=new URI(raw);return "https".equals(u.getScheme())&&Arrays.asList("outing-auth-app.vercel.app","app.ronparkpass.com").contains(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getRawUserInfo()==null;}catch(Exception e){return false;}}
    static boolean navigation(String raw){if(trusted(raw))return true;try{URI u=new URI(raw);return "https".equals(u.getScheme())&&Arrays.asList("kauth.kakao.com","accounts.kakao.com","appleid.apple.com").contains(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&u.getRawUserInfo()==null;}catch(Exception e){return false;}}
    static boolean handoff(String mode,String id){return Arrays.asList("job","personality").contains(mode)&&id!=null&&id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}");}
    static boolean launch(String raw){try{URI u=new URI(raw);return "ronpark-study".equals(u.getScheme())&&"interview".equals(u.getRawAuthority())&&"/practice".equals(u.getRawPath())&&u.getRawFragment()==null&&u.getRawQuery()!=null&&u.getRawQuery().matches("(?:code=[A-Za-z0-9_-]{43}&mode=(job|personality)|mode=(job|personality)&code=[A-Za-z0-9_-]{43})");}catch(Exception e){return false;}}
}
