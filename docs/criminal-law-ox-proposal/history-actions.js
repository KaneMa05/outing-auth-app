      else if(action==='history-chapter'){openReview('history',id,true);}
      else if(action==='history-chapter-start'){
        if(!chapters.has(id))return;
        start(reviews().filter(s=>s.q.chapter_id===id).map(s=>s.q.id),chapters.get(id).display_name+' · 이전 오답');return;
      }
      else if(action==='review-mode'){reviewMode=b.dataset.mode==='history'?'history':'pending';reviewStatus='all';reviewRepeated=false;reviewFiltersOpen=false;}
      else if(action==='history-status'){if(['all','wrong','regained'].includes(b.dataset.status))reviewStatus=b.dataset.status;}
      else if(action==='history-repeat'){reviewRepeated=!reviewRepeated;}
      else if(action==='review-filters-toggle'){reviewFiltersOpen=!reviewFiltersOpen;}
      else if(action==='review-filters-close'){reviewFiltersOpen=false;}
      else if(action==='review-filters-reset'){reviewChapterIds=null;reviewSort='recent';reviewStatus='all';reviewRepeated=false;}
