package com.ronpark.interview;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/** Same five capsule weights and dimensions as iOS PracticeVoiceIndicator. */
final class PracticeVoiceBars extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float[] weights={.45f,.75f,1f,.65f,.4f};
    private float value;
    PracticeVoiceBars(Context context){super(context);paint.setColor(0xff087d72);}
    void level(float next){value=Math.max(0,Math.min(1,next));invalidate();}
    @Override protected void onDraw(Canvas canvas){float density=getResources().getDisplayMetrics().density;for(int i=0;i<5;i++){float h=(4+value*19*weights[i])*density,x=i*6*density;canvas.drawRoundRect(x,(getHeight()-h)/2,x+3*density,(getHeight()+h)/2,1.5f*density,1.5f*density,paint);}}
}
