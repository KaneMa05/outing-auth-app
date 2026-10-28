package com.ronpark.interview;

import java.util.Arrays;

/** Shared microphone meter and speech detection. Never changes the recorded PCM. */
final class InterviewMicLevel {
    static final double DEFAULT_NOISE_DB=-60;
    private static final int RATE=16000,ONSET_SAMPLES=1920;
    private final double[] calibration=new double[64];
    private int calibrationCount,calibrationSamples,loudSamples;
    private boolean calibrating,speaking;
    private double noiseDb;
    private float level;

    InterviewMicLevel(){this(DEFAULT_NOISE_DB);}
    InterviewMicLevel(double noiseDb){this.noiseDb=Math.max(-90,Math.min(-20,noiseDb));}
    void calibrate(){calibrating=true;calibrationCount=calibrationSamples=loudSamples=0;speaking=false;level=0;}
    boolean calibrating(){return calibrating;}
    double noiseDb(){return noiseDb;}
    boolean speaking(){return speaking;}
    float level(){return level;}

    void sample(short[] samples,int count){
        if(count<=0)return;
        double sum=0,squares=0;
        for(int i=0;i<count;i++){sum+=samples[i];squares+=(double)samples[i]*samples[i];}
        // Ignore DC offset, which can otherwise look like a constant microphone signal.
        double rms=Math.sqrt(Math.max(0,squares/count-Math.pow(sum/count,2)))/32768;
        double db=20*Math.log10(Math.max(0.000001,rms));
        if(calibrating){
            if(calibrationCount<calibration.length)calibration[calibrationCount++]=db;
            calibrationSamples+=count;
            if(calibrationSamples>=RATE){
                Arrays.sort(calibration,0,calibrationCount);
                // A low percentile keeps a brief tap during setup from setting the noise floor.
                noiseDb=Math.max(-90,Math.min(-20,calibration[(calibrationCount-1)/3]));
                calibrating=false;
            }
            return;
        }
        double onset=Math.max(-52,noiseDb+8),release=onset-3;
        if(speaking){
            if(db<release){speaking=false;loudSamples=0;}
        }else{
            loudSamples=db>=onset?loudSamples+count:0;
            if(loudSamples>=ONSET_SAMPLES)speaking=true;
        }
        double target=speaking?Math.max(0,Math.min(1,(db-release)/Math.max(18,-12-release))):0;
        double smoothing=1-Math.exp(-1000.0*count/RATE/(target>level?80:180));
        level+=(target-level)*smoothing;
        if(level<0.005f)level=0;
    }
}
