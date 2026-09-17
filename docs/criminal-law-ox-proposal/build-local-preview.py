"""Build local-only OX interactions; the host app owns all styling and chrome."""
import json
from pathlib import Path
import re


root = Path(__file__).resolve().parent
source = (root / "criminal-law-ox-preview.html").read_text(encoding="utf-8")
# Include one complete real chapter so completion is never inferred from a sample.
data_match = re.search(r'(<script type="application/json" id="criminal-ox-data">)(.*?)(</script>)', source, re.S)
preview_data = json.loads(data_match.group(2))
full_chapter = json.loads((root / 'complete-chapter-questions.json').read_text(encoding='utf-8'))
chapter_id = 'criminal-law-01-basic-concepts'
expected_count = next(c['question_count'] for c in preview_data['chapters'] if c['id'] == chapter_id)
if len(full_chapter) != expected_count or len({q['id'] for q in full_chapter}) != expected_count or any(q['chapter_id'] != chapter_id for q in full_chapter):
    raise RuntimeError('Full chapter records must match the chapter count')
preview_data['questions'] = full_chapter + [q for q in preview_data['questions'] if q['chapter_id'] != chapter_id]
source = source[:data_match.start(2)] + json.dumps(preview_data, ensure_ascii=False, separators=(',', ':')) + source[data_match.end(2):]
runtime = re.search(r"<script>([\s\S]*?)</script>", source).group(1)
markup = re.sub(r"<style>[\s\S]*?</style>", "", source)
markup = re.sub(r"<script>[\s\S]*?</script>", "", markup)
runtime = runtime.replace("document.getElementById('criminal-ox-preview')", "host.querySelector('#criminal-ox-preview')")
runtime = runtime.replace("let route='entry', collection=", "let route='home', collection=")
# Inner navigation must not trigger the parent app's data-route delegation.
runtime = runtime.replace('data-route=', 'data-ox-route=').replace('b.dataset.route', 'b.dataset.oxRoute')
runtime = re.sub(r"function render\(\)\{const palette=.*?\(\{entry,home", "function render(){ ({entry,home", runtime)
runtime = re.sub(r"    if\(globalThis.Tweak\).*?\n", "", runtime)
runtime = runtime.replace('오늘의 한 걸음,<br>확실한 정답으로.', '오늘 학습')
runtime = runtime.replace('틀린 지문이,<br>확실한 정답이 되도록.', '오답 복습')
runtime = runtime.replace('다음 공부할 곳이<br>선명해져요.', '취약단원')
runtime = runtime.replace('어디부터 풀까요?', '단원 학습')
runtime = runtime.replace('한 걸음 더 단단해졌어요.', '학습 결과')
# Today focuses on starting study and opening pending mistakes.
home_view = (root / 'home-view.js').read_text(encoding='utf-8')
runtime, home_replacements = re.subn(r'    function home\(\).*?(?=    function chapterView\()', lambda _: home_view + '\n', runtime, flags=re.S)
if home_replacements != 1:
    raise RuntimeError('Expected one home view to replace')
runtime = runtime.replace("reviews().filter(s=>s.label!=='복습 완료').slice(0,5)", 'pendingReviewItems().slice(0,5)')
runtime = runtime.replace("else if(action==='daily'){daily();return;}", "else if(action==='review-needed'){filter='복습 필요';route='review';}\n      else if(action==='daily'){daily();return;}")
runtime = runtime.replace("else if(action==='resume')route='quiz';", "else if(action==='resume')route='quiz';\n      else if(action==='session-result'){showSessionResult();return;}")
# Keep the native chapter layout independently editable from the early mockup.
chapter_view = (root / 'chapter-view.js').read_text(encoding='utf-8')
runtime, chapter_replacements = re.subn(r'    function chapterView\(\).*?(?=    function start\()', lambda _: chapter_view + '\n', runtime, flags=re.S)
if chapter_replacements != 1:
    raise RuntimeError('Expected one chapter view to replace')
session_start = (root / 'session-start.js').read_text(encoding='utf-8')
runtime, start_replacements = re.subn(r'    function start\(.*?(?=    function daily\()', lambda _: session_start + '\n', runtime, flags=re.S)
if start_replacements != 1:
    raise RuntimeError('Expected one session start to replace')
# Today starts with the existing chapter picker; choosing a scope does not discard a session.
runtime, daily_replacements = re.subn(r'    function daily\(\)\{[^\n]*\}', "    function daily(){ route='chapters'; render(); }", runtime)
if daily_replacements != 1:
    raise RuntimeError('Expected one daily start to replace')
chapter_action = "else if(action==='chapter'){start(data.questions.filter(q=>q.chapter_id===id).map(q=>q.id),chapters.get(id).display_name+' · 대표 문항');return;}"
if runtime.count(chapter_action) != 1:
    raise RuntimeError('Expected one chapter action')
runtime = runtime.replace(chapter_action, "else if(action==='chapter'||action==='chapter-next'){startChapter(id);return;}\n      else if(action==='chapter-wrong'){startChapter(id,'wrong');return;}\n      else if(action==='chapter-restart'){startChapter(id,'all');return;}")
result_start = '    function result(){'
if runtime.count(result_start) != 1:
    raise RuntimeError('Expected one result view')
runtime = runtime.replace(result_start, result_start + "if(session.chapterId){chapterSessionResult();return;}")
runtime = runtime.replace("else if(action==='chapter-restart')", "else if(action==='chapter-continue'){continueChapterSet();return;}\n      else if(action==='chapter-restart')")
collection_action = "else if(action==='collection'){collection=id;allChapters=false;}"
if runtime.count(collection_action) != 1:
    raise RuntimeError('Expected one collection navigation handler')
runtime = runtime.replace(collection_action, collection_action + "\n      else if(action==='law-part'){if(!['general','specific'].includes(b.dataset.part))return;criminalLawPart=b.dataset.part;allChapters=false;}")
review_view = (root / 'review-view.js').read_text(encoding='utf-8')
runtime, review_replacements = re.subn(r'    function review\(\).*?(?=    function weakness\()', lambda _: review_view + '\n', runtime, flags=re.S)
if review_replacements != 1:
    raise RuntimeError('Expected one review view to replace')
weakness_view = (root / 'weakness-view.js').read_text(encoding='utf-8')
runtime, weakness_replacements = re.subn(r'    function weakness\(\).*?(?=    function render\()', lambda _: weakness_view + '\n', runtime, flags=re.S)
if weakness_replacements != 1:
    raise RuntimeError('Expected one weakness view to replace')
runtime = runtime.replace("filter='미완료'", "filter='복습 필요'")
review_selection = "reviews().filter(s=>filter==='미완료'?s.label!=='복습 완료':s.label===filter)"
if runtime.count(review_selection) != 1:
    raise RuntimeError('Expected one review session selection')
runtime = runtime.replace(review_selection, 'reviewItemsForFilter()')
bookmark_view = (root / 'bookmark-view.js').read_text(encoding='utf-8')
chapter_flow = (root / 'chapter-flow.js').read_text(encoding='utf-8')
runtime = runtime.replace('chapters:chapterView,quiz,result,review,weak:weakness', "chapters:chapterView,bookmarks:bookmarkView,'chapter-complete':chapterCompletionView,quiz,result,review,weak:weakness")
runtime = runtime.replace("['home','chapters','review','weak'].includes(route)", "['home','chapters','bookmarks','review','weak'].includes(route)")
runtime = runtime.replace("${route===id?'aria-current=", "${(route===id||(['bookmarks','chapter-complete'].includes(route)&&id==='chapters')||(route==='result'&&session?.chapterId&&id==='chapters'))?'aria-current=")
runtime = runtime.replace("else if(action==='one'){start([id],'오답 다시 풀기');return;}", "else if(action==='one'){start([id],route==='bookmarks'?'북마크 문제':'오답 다시 풀기');return;}\n      else if(action==='bookmarks-all'){start(bookmarkedQuestions().map(q=>q.id),'북마크 모아 풀기');return;}")
# Statistics appear only after submission or inside the review explanation.
stats_view = (root / 'question-stats-view.js').read_text(encoding='utf-8')
question_display = (root / 'question-display.js').read_text(encoding='utf-8')
quiz_view = (root / 'quiz-view.js').read_text(encoding='utf-8')
runtime, quiz_replacements = re.subn(r'    function quiz\(\).*?(?=    function result\()', lambda _: chapter_flow + '\n' + question_display + '\n' + bookmark_view + '\n' + stats_view + '\n' + quiz_view + '\n', runtime, flags=re.S)
if quiz_replacements != 1:
    raise RuntimeError('Expected one quiz view to replace')
# Reuse actual app buttons, including its font and shared focus/disabled styles.
runtime = runtime.replace("['review','rotate-ccw','오답']", "['review','rotate-ccw','오답노트']")
runtime = runtime.replace('다시 맞힌 오답은 오답노트에서 복습 완료로 표시할 수 있어요.', '확인한 오답은 오답노트에서 삭제할 수 있어요.')
runtime = runtime.replace('class="ox-button ', 'class="btn secondary ox-button ')
runtime = runtime.replace('class="ox-filter"', 'class="mini-btn ox-filter"')
runtime = runtime.replace('class="ox-plain"', 'class="mini-btn ox-plain"')
runtime = runtime.replace('class="ox-answer ', 'class="btn secondary ox-answer ')
# Let the existing app header open the list without remounting learning state.
controller_end = '    render();\n  })();'
if runtime.count(controller_end) != 1 or runtime.count('  (() => {') != 1:
    raise RuntimeError('Expected one preview controller boundary')
runtime = runtime.replace('  (() => {', '  return (() => {', 1)
runtime = runtime.replace(controller_end, "    seedChapterCompletionPreview();\n    render();\n    return { openBookmarks() { route='bookmarks'; render(); } };\n  })();")
target = root / 'local-app-preview.js'
target.write_text('export function mount(host) {\n  host.innerHTML = ' + json.dumps(markup, ensure_ascii=False) + ';\n' + runtime + '\n}\n', encoding='utf-8')
print(f'Built {target.name}: {target.stat().st_size} bytes')
