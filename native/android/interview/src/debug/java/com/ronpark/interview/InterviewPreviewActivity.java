package com.ronpark.interview;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Installed Debug app: same authenticated portal and native routes as the iPhone Debug app. */
public final class InterviewPreviewActivity extends Activity {
    private WebView web;
    private PermissionRequest pendingMedia;
    private ValueCallback<Uri[]> picker;
    private boolean openingNative;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::onBackPressed);
        getWindow().setStatusBarColor(0xfff6f8fa);getWindow().setNavigationBarColor(0xfff6f8fa);
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        web=new WebView(this);setContentView(web);
        web.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            TextView message=new TextView(this);message.setText("Android System WebView 또는 Chrome을 최신 버전으로 업데이트한 뒤 테스트앱을 다시 열어주세요.");message.setPadding(40,80,40,40);setContentView(message);return;
        }
        Set<String> origins=Collections.singleton(InterviewTestPolicy.ORIGIN);
        WebViewCompat.addWebMessageListener(web,"ronparkTestBridge",origins,(view,message,origin,mainFrame,reply)->{
            if(!mainFrame||!InterviewTestPolicy.trusted(origin.toString())||!InterviewTestPolicy.trusted(view.getUrl())||openingNative)return;
            try{
                JSONObject envelope=new JSONObject(message.getData()),body=envelope.getJSONObject("body");String kind=envelope.getString("kind");
                if(envelope.length()!=2||body.length()!=1)return;
                if("live".equals(kind)&&InterviewTestPolicy.code(body.optString("code"))){
                    openingNative=true;startActivity(new Intent(this,InterviewTestLiveActivity.class).putExtra("launchCode",body.getString("code")));
                }else if("practice".equals(kind)&&InterviewTestPolicy.mode(body.optString("mode"))){
                    openingNative=true;String id=InterviewPortalSession.create(body.getString("mode"));
                    startActivity(new Intent(this,InterviewPortalPracticeActivity.class).putExtra("portalSession",id));
                }
            }catch(Exception ignored){}
        });
        try{WebViewCompat.addDocumentStartJavaScript(web,asset("interview-test-portal.js"),origins);}catch(Exception error){finish();return;}
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri url=request.getUrl();if(InterviewTestPolicy.trusted(url.toString()))return false;
                if(request.isForMainFrame()&&request.hasGesture()&&Arrays.asList("https","http","tel","mailto").contains(url.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,url));}catch(Exception ignored){}
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){denyMedia();if(!InterviewTestPolicy.trusted(url))view.stopLoading();}
            @Override public void onReceivedSslError(WebView view,android.webkit.SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->requestMedia(request));}
            @Override public void onPermissionRequestCanceled(PermissionRequest request){if(pendingMedia==request)pendingMedia=null;}
            @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(InterviewPreviewActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(InterviewPreviewActivity.this).setMessage(message).setPositiveButton("확인",(d,w)->result.confirm()).setNegativeButton("취소",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(!InterviewTestPolicy.trusted(view.getUrl()))return false;if(picker!=null)picker.onReceiveValue(null);picker=callback;try{startActivityForResult(params.createIntent(),72);return true;}catch(Exception e){picker=null;callback.onReceiveValue(null);return true;}}
        });
        web.loadUrl(InterviewTestPolicy.ORIGIN+"/interview?app=1");
    }
    private String asset(String name)throws IOException{try(InputStream in=getAssets().open(name);ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);return new String(out.toByteArray(),StandardCharsets.UTF_8);}}
    private void requestMedia(PermissionRequest request){
        denyMedia();if(!InterviewTestPolicy.trusted(request.getOrigin().toString())||!InterviewTestPolicy.trusted(web.getUrl())){request.deny();return;}
        ArrayList<String> permissions=new ArrayList<>();
        for(String resource:request.getResources()){
            String permission=PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)?Manifest.permission.RECORD_AUDIO:PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)?Manifest.permission.CAMERA:null;
            if(permission==null){request.deny();return;}if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED)permissions.add(permission);
        }
        pendingMedia=request;if(!permissions.isEmpty())requestPermissions(permissions.toArray(new String[0]),71);
        else new AlertDialog.Builder(this).setMessage("카메라·마이크를 모의면접 준비와 답변 녹음에 사용하도록 허용할까요?").setPositiveButton("허용",(d,w)->grantMedia()).setNegativeButton("허용 안 함",(d,w)->denyMedia()).setOnCancelListener(d->denyMedia()).show();
    }
    private void grantMedia(){PermissionRequest request=pendingMedia;pendingMedia=null;if(request==null)return;if(!InterviewTestPolicy.trusted(web.getUrl())){request.deny();return;}ArrayList<String> allowed=new ArrayList<>();for(String resource:request.getResources()){String permission=PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)?Manifest.permission.RECORD_AUDIO:PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)?Manifest.permission.CAMERA:null;if(permission==null||checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED){request.deny();return;}allowed.add(resource);}request.grant(allowed.toArray(new String[0]));}
    private void denyMedia(){if(pendingMedia!=null){pendingMedia.deny();pendingMedia=null;}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==71)grantMedia();}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==72&&picker!=null){picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));picker=null;}}
    @Override protected void onResume(){super.onResume();openingNative=false;if(web!=null)web.onResume();}
    @Override protected void onPause(){denyMedia();if(web!=null)web.onPause();CookieManager.getInstance().flush();super.onPause();}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){denyMedia();if(picker!=null)picker.onReceiveValue(null);if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
}
