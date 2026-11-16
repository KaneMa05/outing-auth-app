package com.ronpark.interview;

import org.junit.Test;
import java.io.File;
import java.io.IOException;
import static org.junit.Assert.*;

public final class InterviewPracticeUploadTest {
    @Test public void refusesUnsafeOrMismatchedStorageUrlsBeforeOpeningFileOrNetwork() {
        InterviewPracticeApi api=new InterviewPracticeApi();
        String run="c70e09d2-1020-4015-9899-d7a909ca773d",hash=String.join("",java.util.Collections.nCopies(64,"a"));
        String path="/storage/v1/object/upload/sign/interview-practice/"+run+"/1-"+hash+".m4a";
        String[] urls={"http://test.supabase.co"+path+"?token=x",
            "https://test.supabase.co.evil.example"+path+"?token=x",
            "https://user:password@test.supabase.co"+path+"?token=x",
            "https://test.supabase.co:444"+path+"?token=x",
            "https://test.supabase.co"+path.replace("/1-","/2-")+"?token=x",
            "https://test.supabase.co"+path};
        for(String url:urls) {
            IOException error=assertThrows(IOException.class,()->api.upload(url,run,1,hash,new File("missing-answer.m4a")));
            assertEquals("invalid_upload",error.getMessage());
        }
    }
}
