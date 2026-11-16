package com.ronpark.interview;

import java.net.URI;

final class PracticeBridgePolicy {
    static boolean accepts(String raw){
        try{
            URI u=new URI(raw);
            if(u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||u.getHost()==null||!(u.getPath().isEmpty()||u.getPath().equals("/")))return false;
            if("http".equals(u.getScheme()))return u.getHost().equals("127.0.0.1")&&u.getPort()==8787;
            if(!"https".equals(u.getScheme())||u.getPort()!=8788)return false;
            String[] parts=u.getHost().split("\\.",-1);if(parts.length!=4)return false;
            int[] values=new int[4];for(int i=0;i<4;i++){if(!parts[i].matches("[0-9]{1,3}"))return false;values[i]=Integer.parseInt(parts[i]);if(values[i]>255)return false;}
            return values[0]==10||(values[0]==192&&values[1]==168)||(values[0]==172&&values[1]>=16&&values[1]<=31);
        }catch(Exception e){return false;}
    }
}
