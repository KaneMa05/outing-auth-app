package com.ronpark.interview;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.graphics.SurfaceTexture;
import android.media.MediaPlayer;
import android.os.*;
import android.view.*;
import android.widget.FrameLayout;

/** Two muted local players overlap at loop boundaries; the assigned clip stays fixed per run. */
final class PracticeAvatar extends FrameLayout {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final MediaPlayer[] players=new MediaPlayer[2];
    private final TextureView[] views=new TextureView[2];
    private final boolean[] prepared=new boolean[2];
    private int active;
    private boolean closed,paused,transitioning;
    PracticeAvatar(Context context,String asset){
        super(context);setBackgroundColor(0xff182c3e);setContentDescription("AI 면접관 동작 영상");
        for(int i=0;i<2;i++){
            final int index=i;TextureView view=views[i]=new TextureView(context);addView(view,new LayoutParams(-1,-1));view.setAlpha(i==0?1:0);
            view.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
                public void onSurfaceTextureAvailable(SurfaceTexture texture,int w,int h){
                    if(closed)return;
                    try(AssetFileDescriptor file=context.getAssets().openFd("interview-avatar/"+asset)){
                        MediaPlayer player=players[index]=new MediaPlayer();Surface surface=new Surface(texture);player.setSurface(surface);surface.release();
                        player.setVolume(0,0);player.setDataSource(file.getFileDescriptor(),file.getStartOffset(),file.getLength());
                        player.setOnPreparedListener(p->{if(closed)return;prepared[index]=true;p.seekTo(0);if(index==active&&!paused)p.start();});
                        player.setOnCompletionListener(p->{if(!closed&&index==active&&!transitioning){p.seekTo(0);if(!paused)p.start();}});
                        player.setOnErrorListener((p,a,b)->true);player.prepareAsync();
                    }catch(Exception ignored){}
                }
                public void onSurfaceTextureSizeChanged(SurfaceTexture t,int w,int h){}
                public void onSurfaceTextureUpdated(SurfaceTexture t){}
                public boolean onSurfaceTextureDestroyed(SurfaceTexture t){if(players[index]!=null){players[index].release();players[index]=null;}prepared[index]=false;return true;}
            });
        }
        handler.post(tick);
    }
    private final Runnable tick=new Runnable(){public void run(){
        if(closed)return;
        try{
            MediaPlayer player=players[active];int next=1-active;
            if(!paused&&!transitioning&&prepared[active]&&prepared[next]&&player.isPlaying()&&player.getDuration()-player.getCurrentPosition()<=400){
                transitioning=true;MediaPlayer incoming=players[next];incoming.setOnSeekCompleteListener(p->{
                    if(closed||paused){transitioning=false;return;}p.start();views[next].bringToFront();views[next].setAlpha(0);
                    views[next].animate().alpha(1).setDuration(300).withEndAction(()->{
                        if(closed)return;MediaPlayer old=players[active];if(old!=null){old.pause();old.seekTo(0);}views[active].setAlpha(0);active=next;transitioning=false;if(paused&&players[active]!=null)players[active].pause();
                    }).start();
                });incoming.seekTo(0);
            }
        }catch(Exception ignored){}
        handler.postDelayed(this,40);
    }};
    void paused(boolean value){paused=value;for(int i=0;i<2;i++)if(prepared[i]&&players[i]!=null)try{if(value)players[i].pause();else if(i==active)players[i].start();}catch(Exception ignored){}}
    void close(){closed=true;handler.removeCallbacksAndMessages(null);for(int i=0;i<2;i++){views[i].animate().cancel();if(players[i]!=null){players[i].release();players[i]=null;}}}
}
