package com.ronpark.interview;
import org.junit.Test;
import static org.junit.Assert.*;
public class PracticeBridgePolicyTest {
    @Test public void acceptsOnlyLoopbackUsbOrPrivatePinnedTls(){for(String u:new String[]{"http://127.0.0.1:8787","https://10.0.0.5:8788","https://172.16.0.5:8788","https://172.31.255.1:8788","https://192.168.0.5:8788"})assertTrue(u,PracticeBridgePolicy.accepts(u));}
    @Test public void rejectsPublicHostsAndCleartextLan(){for(String u:new String[]{"http://192.168.0.5:8787","http://10.0.0.5:8788","https://example.com:8788","https://8.8.8.8:8788","https://172.32.0.5:8788","https://192.168.0.5:443","https://192.168.999.5:8788"})assertFalse(u,PracticeBridgePolicy.accepts(u));}
    @Test public void rejectsUrlCredentialsPathsQueriesAndFragments(){for(String u:new String[]{"https://user@192.168.0.5:8788","https://192.168.0.5:8788/other","https://192.168.0.5:8788?token=x","https://192.168.0.5:8788#other","file:///private","not a uri"})assertFalse(u,PracticeBridgePolicy.accepts(u));}
}
