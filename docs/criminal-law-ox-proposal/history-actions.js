      else if(action==='history-chapter'){openReview('history',id);}
      else if(action==='history-chapter-start'){
        if(!chapters.has(id))return;
        start(reviews().filter(s=>s.q.chapter_id===id).map(s=>s.q.id),chapters.get(id).display_name+' · 이전 오답');return;
      }
      else if(action==='review-mode'){openReview(b.dataset.mode);}
      else if(action==='history-status'){if(['all','wrong','regained'].includes(b.dataset.status))reviewStatus=b.dataset.status;}
      else if(action==='history-repeat'){reviewRepeated=!reviewRepeated;}
